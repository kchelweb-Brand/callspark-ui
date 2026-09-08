// Idempotent schema setup for the auth backend, matching the tables that
// already exist in the shared Neon database (tenants, users, otp_codes,
// signup_requests, contacts, contact_lists). Safe to re-run.
// Run with: node scripts/migrate.mjs
import "dotenv/config";
import { neon } from "@neondatabase/serverless";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set (check your .env file).");
  process.exit(1);
}

const sql = neon(url);

async function main() {
  await sql`create extension if not exists pgcrypto`;

  await sql`
    create table if not exists tenants (
      id uuid primary key default gen_random_uuid(),
      name text not null,
      workspace_slug text unique not null,
      status text not null default 'active' check (status in ('pending','active','suspended')),
      created_at timestamptz not null default now()
    )
  `;

  await sql`
    create table if not exists users (
      id uuid primary key default gen_random_uuid(),
      tenant_id uuid references tenants(id) on delete cascade,
      email text not null,
      role text not null default 'agent',
      is_super_admin boolean not null default false,
      created_at timestamptz not null default now(),
      unique (tenant_id, email)
    )
  `;

  await sql`
    create table if not exists otp_codes (
      id uuid primary key default gen_random_uuid(),
      email text not null,
      code_hash text not null,
      purpose text not null default 'login',
      expires_at timestamptz not null,
      consumed_at timestamptz,
      attempt_count int not null default 0,
      created_at timestamptz not null default now()
    )
  `;
  await sql`create index if not exists idx_otp_codes_email_purpose on otp_codes (email, purpose)`;

  await sql`
    create table if not exists signup_requests (
      id uuid primary key default gen_random_uuid(),
      email text not null,
      full_name text not null,
      account_type text not null default 'business',
      company_name text,
      workspace_slug text not null,
      verified_at timestamptz,
      created_at timestamptz not null default now()
    )
  `;
  await sql`create index if not exists idx_signup_requests_email on signup_requests (email)`;
  await sql`create index if not exists idx_signup_requests_slug on signup_requests (workspace_slug)`;

  await sql`
    create table if not exists contact_lists (
      id uuid primary key default gen_random_uuid(),
      tenant_id uuid not null references tenants(id) on delete cascade,
      name text not null,
      created_at timestamptz not null default now()
    )
  `;

  await sql`
    create table if not exists contacts (
      id uuid primary key default gen_random_uuid(),
      tenant_id uuid not null references tenants(id) on delete cascade,
      list_id uuid references contact_lists(id) on delete set null,
      company text,
      person text,
      phone text not null,
      email text,
      tags text[] not null default '{}',
      do_not_call boolean not null default false,
      do_not_sms boolean not null default false,
      last_touched_at timestamptz,
      created_at timestamptz not null default now()
    )
  `;

  // How a tenant's calls actually reach the phone network. Either 'managed'
  // (we provision a Telnyx credential connection and resell the minutes) or
  // 'byo' (they bring credentials from their own carrier and we only sell
  // the dialer software). One connection per tenant for now.
  await sql`
    create table if not exists sip_connections (
      id uuid primary key default gen_random_uuid(),
      tenant_id uuid not null references tenants(id) on delete cascade,
      mode text not null check (mode in ('managed','byo')),
      label text not null,
      status text not null default 'pending'
        check (status in ('pending','active','failed','disabled')),

      -- managed mode: what we provisioned on Telnyx
      telnyx_connection_id text,
      telnyx_managed_account_id text,

      -- byo mode: the tenant's own carrier. sip_password_enc is AES-GCM
      -- encrypted (see src/backend/crypto.ts) and never leaves the server.
      sip_host text,
      sip_port int,
      sip_username text,
      sip_password_enc text,
      sip_realm text,
      sip_wss_url text,

      last_registered_at timestamptz,
      last_error text,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      unique (tenant_id)
    )
  `;

  // Prepaid balance for managed-mode tenants. Storing money as integer cents
  // avoids float rounding entirely.
  await sql`
    create table if not exists tenant_wallets (
      tenant_id uuid primary key references tenants(id) on delete cascade,
      balance_cents bigint not null default 0,
      currency text not null default 'USD',
      spend_cap_cents bigint,
      updated_at timestamptz not null default now()
    )
  `;

  await sql`
    create table if not exists wallet_transactions (
      id uuid primary key default gen_random_uuid(),
      tenant_id uuid not null references tenants(id) on delete cascade,
      amount_cents bigint not null,
      kind text not null check (kind in ('topup','usage','adjustment','refund')),
      description text,
      reference text,
      created_at timestamptz not null default now()
    )
  `;
  await sql`
    create index if not exists idx_wallet_tx_tenant on wallet_transactions (tenant_id, created_at desc)
  `;

  // ---------- phone system config ----------
  // Menu keypress options travel with the menu and are never queried
  // individually, so they live as JSONB rather than their own table.
  await sql`
    create table if not exists ivr_menus (
      id uuid primary key default gen_random_uuid(),
      tenant_id uuid not null references tenants(id) on delete cascade,
      name text not null,
      greeting_mode text not null default 'tts' check (greeting_mode in ('tts','upload')),
      greeting_text text not null default '',
      greeting_file_name text,
      timeout_seconds int not null default 8,
      repeat_count int not null default 2,
      options jsonb not null default '[]'::jsonb,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    )
  `;
  await sql`create index if not exists idx_ivr_menus_tenant on ivr_menus (tenant_id)`;

  await sql`
    create table if not exists phone_extensions (
      id uuid primary key default gen_random_uuid(),
      tenant_id uuid not null references tenants(id) on delete cascade,
      number text not null,
      label text not null,
      type text not null default 'User',
      forwards_to text,
      created_at timestamptz not null default now(),
      unique (tenant_id, number)
    )
  `;

  await sql`
    create table if not exists phone_numbers (
      id uuid primary key default gen_random_uuid(),
      tenant_id uuid not null references tenants(id) on delete cascade,
      number text not null,
      label text,
      type text default 'Local',
      region text,
      status text not null default 'Pending',
      ivr_menu_id uuid references ivr_menus(id) on delete set null,
      sms_enabled boolean not null default false,
      created_at timestamptz not null default now(),
      unique (tenant_id, number)
    )
  `;

  // One config document per tenant. Menus/extensions live here as JSONB rather
  // than their own tables because they're always loaded and saved as a whole —
  // including by the inbound-call handler, which needs the full flow at once.
  // phone_numbers stays a real table since inbound routing must look up
  // "which tenant owns this number?" by number.
  await sql`
    create table if not exists phone_system_settings (
      tenant_id uuid primary key references tenants(id) on delete cascade,
      routing jsonb not null default '{}'::jsonb,
      business_hours jsonb not null default '{}'::jsonb,
      voicemail jsonb not null default '{}'::jsonb,
      menus jsonb not null default '[]'::jsonb,
      extensions jsonb not null default '[]'::jsonb,
      updated_at timestamptz not null default now()
    )
  `;
  // Additive for databases created before menus/extensions moved in here.
  await sql`alter table phone_system_settings add column if not exists menus jsonb not null default '[]'::jsonb`;
  await sql`alter table phone_system_settings add column if not exists extensions jsonb not null default '[]'::jsonb`;

  // ---------- call records ----------
  await sql`
    create table if not exists calls (
      id uuid primary key default gen_random_uuid(),
      tenant_id uuid not null references tenants(id) on delete cascade,
      direction text not null check (direction in ('outbound','inbound')),
      from_number text,
      to_number text,
      contact_id uuid references contacts(id) on delete set null,
      agent_email text,
      status text not null default 'ringing'
        check (status in ('ringing','active','completed','failed','no_answer','busy','canceled')),
      outcome text,
      started_at timestamptz not null default now(),
      answered_at timestamptz,
      ended_at timestamptz,
      duration_seconds int,
      error text,
      created_at timestamptz not null default now()
    )
  `;
  await sql`create index if not exists idx_calls_tenant_started on calls (tenant_id, started_at desc)`;
  await sql`create index if not exists idx_calls_contact on calls (contact_id)`;

  // ---------- campaigns ----------
  await sql`
    create table if not exists campaigns (
      id uuid primary key default gen_random_uuid(),
      tenant_id uuid not null references tenants(id) on delete cascade,
      name text not null,
      status text not null default 'Draft',
      list_name text,
      owner text,
      script text,
      contacts_loaded int not null default 0,
      calls_made int not null default 0,
      connect_rate real not null default 0,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    )
  `;
  await sql`create index if not exists idx_campaigns_tenant on campaigns (tenant_id, created_at desc)`;

  // ---------- agents ----------
  await sql`
    create table if not exists agents (
      id uuid primary key default gen_random_uuid(),
      tenant_id uuid not null references tenants(id) on delete cascade,
      name text not null,
      email text,
      extension text not null,
      role text not null default 'Agent',
      status text not null default 'Offline',
      calls_today int not null default 0,
      talk_seconds int not null default 0,
      connect_rate real not null default 0,
      csat real not null default 0,
      created_at timestamptz not null default now(),
      unique (tenant_id, extension)
    )
  `;

  // ---------- sms ----------
  await sql`
    create table if not exists sms_campaigns (
      id uuid primary key default gen_random_uuid(),
      tenant_id uuid not null references tenants(id) on delete cascade,
      name text not null,
      status text not null default 'Draft',
      list_name text,
      body text,
      sending_number text,
      sent int not null default 0,
      delivered int not null default 0,
      replies int not null default 0,
      created_at timestamptz not null default now()
    )
  `;
  await sql`
    create table if not exists sms_drafts (
      id uuid primary key default gen_random_uuid(),
      tenant_id uuid not null references tenants(id) on delete cascade,
      list_name text,
      body text not null,
      created_at timestamptz not null default now()
    )
  `;

  // ---------- workspace settings ----------
  // Profile, call preferences and billing choices, one document per tenant.
  await sql`
    create table if not exists tenant_settings (
      tenant_id uuid primary key references tenants(id) on delete cascade,
      workspace jsonb not null default '{}'::jsonb,
      preferences jsonb not null default '{}'::jsonb,
      billing jsonb not null default '{}'::jsonb,
      updated_at timestamptz not null default now()
    )
  `;

  // ---------- support ----------
  // Tickets raised by tenants and worked by the platform owner. The sequence
  // gives short human-quotable refs (TK-1001) instead of surfacing a UUID.
  await sql`create sequence if not exists support_ticket_ref_seq start 1000`;
  await sql`
    create table if not exists support_tickets (
      id uuid primary key default gen_random_uuid(),
      ticket_ref text unique not null default 'TK-' || nextval('support_ticket_ref_seq'),
      tenant_id uuid references tenants(id) on delete set null,
      subject text not null,
      body text,
      priority text not null default 'Medium' check (priority in ('Low','Medium','High')),
      status text not null default 'Open',
      created_by_email text,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    )
  `;
  await sql`create index if not exists idx_tickets_status on support_tickets (status, updated_at desc)`;

  // Internal tenants (QA sandboxes, demos) are real rows but must not pollute
  // platform metrics — they'd inflate tenant counts, users and revenue.
  await sql`alter table tenants add column if not exists is_internal boolean not null default false`;
  await sql`update tenants set is_internal = true where workspace_slug = 'qa-sandbox' and is_internal = false`;

  // Recording location for a completed call. Null until call recording is
  // wired to the carrier — the Recordings page reads from this, so it fills
  // in automatically once capture exists rather than needing a rewrite.
  await sql`alter table calls add column if not exists recording_url text`;
  await sql`alter table calls add column if not exists recording_seconds int`;

  // ---------- inbound calling ----------
  // Menus live in phone_system_settings.menus as JSONB with client-generated
  // string ids ("ivr_1001"), but this column was created as a uuid FK to the
  // old ivr_menus table, so no assignment could ever be stored. Widen it to
  // text and drop the constraint that no longer describes reality.
  await sql`alter table phone_numbers drop constraint if exists phone_numbers_ivr_menu_id_fkey`;
  await sql`alter table phone_numbers alter column ivr_menu_id type text using ivr_menu_id::text`;

  // The carrier's id for a live call leg. Inbound webhooks arrive with no
  // session, so this is how a retry finds the row it already created.
  await sql`alter table calls add column if not exists provider_call_id text`;
  await sql`
    create unique index if not exists idx_calls_provider_call_id
    on calls (provider_call_id) where provider_call_id is not null
  `;
  // Inbound routing looks up "who owns this number?" on every single call.
  await sql`create index if not exists idx_phone_numbers_number on phone_numbers (number)`;

  // Which SIP transport the tenant's trunk speaks. Only 'wss' can be reached
  // by a browser (see src/backend/webrtc.server.ts); the others are still
  // dialable as call destinations by the carrier, so they're worth storing.
  await sql`alter table sip_connections add column if not exists sip_transport text not null default 'wss'`;

  // ---------- plans / entitlements ----------
  // Which plan a tenant is on and, for trials, when it lapses. Limits
  // themselves live in code (src/backend/plans.ts) rather than the database:
  // they are product pricing, they change together, and a per-row copy would
  // drift from what the marketing page promises.
  await sql`alter table tenants add column if not exists plan text not null default 'trial'`;
  await sql`alter table tenants add column if not exists trial_ends_at timestamptz`;

  // Existing tenants predate plans entirely. Giving them a fresh 14-day trial
  // rather than an already-expired one avoids locking out real accounts the
  // moment this ships.
  await sql`
    update tenants set trial_ends_at = now() + interval '14 days'
    where plan = 'trial' and trial_ends_at is null
  `;
  // The QA sandbox must never hit a limit mid-test.
  await sql`update tenants set plan = 'managed' where workspace_slug = 'qa-sandbox'`;

  console.log("Schema is up to date.");
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
