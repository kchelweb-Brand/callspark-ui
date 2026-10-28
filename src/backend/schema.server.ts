// Additive schema for features added after the original migration script.
//
// There is no deploy-time migration step for this app, so these statements are
// idempotent and run once per worker isolate, the first time a feature that
// needs them is used. Everything is `if not exists` — safe to run any number of
// times, in parallel, against a database that already has it.
//
// Cloudflare caps how many outside requests one Worker invocation may make (50
// on the free plan), and every database statement is one request. So the
// statements below are not sent one by one: they are collected and sent as ONE
// block, which also makes the whole upgrade all-or-nothing. Adding a table here
// costs nothing against that limit; only a statement that needs a value does not
// belong here.

import { sqlQuery } from "./db";

let ready: Promise<void> | null = null;

export function ensureSchema(): Promise<void> {
  if (!ready) {
    ready = apply().catch((err) => {
      // Let the next call retry instead of caching a failure forever.
      ready = null;
      throw err;
    });
  }
  return ready;
}

async function apply(): Promise<void> {
  const statements: string[] = [];
  // Inside this function, `sql` collects a statement instead of running it.
  const sql = (strings: TemplateStringsArray, ...values: unknown[]): Promise<Record<string, unknown>[]> => {
    if (values.length > 0) throw new Error("Schema statements cannot take values.");
    statements.push(strings.join("").trim().replace(/;+\s*$/, ""));
    return Promise.resolve([]);
  };

  // ---------- support conversations ----------
  await sql`
    create table if not exists support_messages (
      id uuid primary key default gen_random_uuid(),
      ticket_id uuid not null references support_tickets(id) on delete cascade,
      sender_role text not null check (sender_role in ('customer','support')),
      sender_email text,
      body text not null,
      created_at timestamptz not null default now()
    )
  `;
  await sql`create index if not exists idx_support_messages_ticket on support_messages (ticket_id, created_at)`;
  await sql`alter table support_tickets add column if not exists admin_unread boolean not null default false`;
  await sql`alter table support_tickets add column if not exists customer_unread boolean not null default false`;

  // ---------- team: invited agents, tasks, messages, notifications ----------
  // 'invited' until the agent first signs in, 'disabled' when the owner turns
  // their access off. Owners are always 'active'.
  await sql`alter table users add column if not exists status text not null default 'active'`;
  await sql`alter table users add column if not exists permissions jsonb`;
  await sql`alter table users add column if not exists invited_at timestamptz`;
  await sql`alter table users add column if not exists accepted_at timestamptz`;
  await sql`alter table users add column if not exists last_seen_at timestamptz`;

  await sql`
    create table if not exists agent_tasks (
      id uuid primary key default gen_random_uuid(),
      tenant_id uuid not null references tenants(id) on delete cascade,
      assignee_id uuid not null references users(id) on delete cascade,
      created_by uuid references users(id) on delete set null,
      title text not null,
      details text,
      priority text not null default 'Medium' check (priority in ('Low','Medium','High')),
      status text not null default 'To do' check (status in ('To do','In progress','Done')),
      due_at timestamptz,
      contact_id uuid references contacts(id) on delete set null,
      completion_note text,
      completed_at timestamptz,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    )
  `;
  await sql`create index if not exists idx_agent_tasks_assignee on agent_tasks (assignee_id, status, due_at)`;
  await sql`create index if not exists idx_agent_tasks_tenant on agent_tasks (tenant_id, status)`;

  // One conversation per agent, keyed by the agent's user id; every owner of the
  // workspace is on the other side of it.
  await sql`
    create table if not exists team_messages (
      id uuid primary key default gen_random_uuid(),
      tenant_id uuid not null references tenants(id) on delete cascade,
      agent_user_id uuid not null references users(id) on delete cascade,
      sender_id uuid references users(id) on delete set null,
      sender_role text not null check (sender_role in ('admin','agent')),
      body text not null,
      task_id uuid references agent_tasks(id) on delete set null,
      read_at timestamptz,
      created_at timestamptz not null default now()
    )
  `;
  await sql`create index if not exists idx_team_messages_thread on team_messages (agent_user_id, created_at)`;

  await sql`
    create table if not exists broadcasts (
      id uuid primary key default gen_random_uuid(),
      title text not null,
      body text not null,
      how_to text,
      link_url text,
      link_label text,
      audience jsonb not null default '{}'::jsonb,
      send_email boolean not null default false,
      created_by text,
      recipient_count int not null default 0,
      email_sent int not null default 0,
      email_failed int not null default 0,
      created_at timestamptz not null default now()
    )
  `;

  await sql`
    create table if not exists notifications (
      id uuid primary key default gen_random_uuid(),
      user_id uuid not null references users(id) on delete cascade,
      tenant_id uuid references tenants(id) on delete cascade,
      kind text not null,
      title text not null,
      body text,
      link text,
      broadcast_id uuid references broadcasts(id) on delete set null,
      created_at timestamptz not null default now(),
      read_at timestamptz
    )
  `;
  await sql`create index if not exists idx_notifications_user on notifications (user_id, created_at desc)`;
  await sql`create index if not exists idx_notifications_broadcast on notifications (broadcast_id)`;

  // ---------- AI summaries & receptionist ----------
  await sql`alter table calls add column if not exists transcript text`;
  await sql`alter table calls add column if not exists summary text`;
  await sql`alter table calls add column if not exists summary_at timestamptz`;
  await sql`alter table calls add column if not exists handled_by text`;

  // ---------- number reputation & rotation ----------
  await sql`alter table phone_numbers add column if not exists rested_until timestamptz`;
  await sql`alter table phone_numbers add column if not exists rest_reason text`;

  // ---------- missed-call text-back ----------
  await sql`
    create table if not exists auto_texts (
      id uuid primary key default gen_random_uuid(),
      tenant_id uuid not null references tenants(id) on delete cascade,
      call_id uuid references calls(id) on delete set null,
      kind text not null default 'missed_call',
      to_number text not null,
      from_number text,
      body text not null,
      status text not null default 'sent',
      error text,
      created_at timestamptz not null default now()
    )
  `;
  await sql`create index if not exists idx_auto_texts_lookup on auto_texts (tenant_id, to_number, created_at desc)`;

  // ---------- AI agent: tags, settings snapshot, appointments ----------
  await sql`alter table calls add column if not exists ai_outcome text`;
  await sql`alter table calls add column if not exists ai_note text`;
  await sql`alter table calls add column if not exists ai_settings jsonb`;
  await sql`alter table calls add column if not exists ai_text_sent_at timestamptz`;
  await sql`alter table campaigns add column if not exists ai_settings jsonb`;
  await sql`
    create table if not exists appointments (
      id uuid primary key default gen_random_uuid(),
      tenant_id uuid not null references tenants(id) on delete cascade,
      call_id uuid references calls(id) on delete set null,
      contact_id uuid references contacts(id) on delete set null,
      name text,
      phone text,
      when_text text not null,
      reason text,
      status text not null default 'requested' check (status in ('requested','confirmed','dismissed')),
      created_at timestamptz not null default now()
    )
  `;
  await sql`create index if not exists idx_appointments_tenant on appointments (tenant_id, created_at desc)`;
  await sql`create index if not exists idx_calls_ai_outcome on calls (tenant_id, ai_outcome) where ai_outcome is not null`;

  // ---------- signup details and phone verification ----------
  await sql`alter table signup_requests add column if not exists phone text`;
  await sql`alter table signup_requests add column if not exists country text`;
  await sql`alter table signup_requests add column if not exists city text`;
  await sql`alter table signup_requests add column if not exists address text`;
  await sql`alter table signup_requests add column if not exists website text`;
  await sql`alter table signup_requests add column if not exists phone_code_hash text`;
  await sql`alter table signup_requests add column if not exists phone_code_expires_at timestamptz`;
  await sql`alter table signup_requests add column if not exists phone_code_attempts int not null default 0`;
  await sql`alter table signup_requests add column if not exists phone_verified_at timestamptz`;
  await sql`alter table tenants add column if not exists country text`;
  await sql`alter table tenants add column if not exists phone_verified_at timestamptz`;

  // ---------- help assistant: questions counted per hour, so it cannot run up a bill ----------
  await sql`
    create table if not exists help_chat_usage (
      bucket text not null,
      hour timestamptz not null,
      n int not null default 0,
      primary key (bucket, hour)
    )
  `;

  // ---------- plan expiry and renewal reminders ----------
  await sql`alter table tenants add column if not exists paid_until timestamptz`;
  await sql`alter table tenants add column if not exists renewal_stage text`;
  await sql`alter table tenants add column if not exists renewal_checked_on date`
  // An account the platform owner has put on hold by hand, and when its owners were told.
  await sql`alter table tenants add column if not exists held_at timestamptz`
  await sql`alter table tenants add column if not exists held_notified_at timestamptz`;
  await sql`create table if not exists app_flags (name text primary key, done_at timestamptz not null default now())`;
  // Trials that ran out used to be suspended outright, which locked the owner out of
  // the very page they need to pay. They are now simply on hold, so reopen them, once.
  await sql`
    if not exists (select 1 from app_flags where name = 'lapsed-trials-reopened') then
      update tenants set status = 'active'
        where status = 'suspended' and plan = 'trial' and trial_ends_at is not null and trial_ends_at < now();
      insert into app_flags (name) values ('lapsed-trials-reopened');
    end if
  `;

  // ---------- payments received (one row per provider transaction, so none is handled twice) ----------
  await sql`
    create table if not exists payments (
      id uuid primary key default gen_random_uuid(),
      provider text not null,
      provider_tx_id text not null,
      tx_ref text,
      tenant_id uuid references tenants(id) on delete set null,
      email text,
      amount numeric(12,2) not null default 0,
      currency text,
      plan_id text,
      seats int,
      interval text,
      status text not null default 'received',
      note text,
      created_at timestamptz not null default now(),
      unique (provider, provider_tx_id)
    )
  `;

  // ---------- messages from the public contact form ----------
  await sql`
    create table if not exists contact_requests (
      id uuid primary key default gen_random_uuid(),
      name text not null,
      email text not null,
      company text,
      team_size text,
      message text not null,
      created_at timestamptz not null default now()
    )
  `;

  // ---------- payment links the owner manages (card, bank, crypto, gift card) ----------
  await sql`
    create table if not exists payment_links (
      id uuid primary key default gen_random_uuid(),
      region text not null default 'default' check (region in ('default','emerging')),
      plan_id text not null,
      seats int not null default 1,
      interval text not null default 'monthly' check (interval in ('monthly','annual')),
      method text not null default 'card' check (method in ('card','bank','crypto','giftcard','other')),
      label text not null default '',
      amount_usd numeric(10,2) not null check (amount_usd > 0),
      url text not null,
      active boolean not null default true,
      created_at timestamptz not null default now()
    )
  `;

  // ---------- how crypto and gift-card payments are received (wallets, instructions) ----------
  await sql`
    create table if not exists payment_settings (
      key text primary key,
      value jsonb not null default '{}'::jsonb,
      updated_at timestamptz not null default now()
    )
  `;

  // ---------- receipts customers attach to "I've paid" ----------
  await sql`
    create table if not exists payment_receipts (
      id uuid primary key default gen_random_uuid(),
      tenant_id uuid references tenants(id) on delete cascade,
      filename text not null,
      content_type text not null,
      size int not null,
      data bytea not null,
      created_at timestamptz not null default now()
    )
  `;

  // One request for everything. The advisory lock makes two workers that start
  // at once take turns instead of racing to create the same table.
  await sqlQuery(
    `do $schema$ begin perform pg_advisory_xact_lock(7241001); ${statements.map((s) => `${s};`).join("\n")} end $schema$`,
  );
}
