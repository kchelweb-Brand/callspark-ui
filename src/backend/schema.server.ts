// Additive schema for features added after the original migration script.
//
// There is no deploy-time migration step for this app, so these statements are
// idempotent and run once per worker isolate, the first time a feature that
// needs them is used. Everything is `if not exists` — safe to run any number of
// times, in parallel, against a database that already has it.

import { sql } from "./db";

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
}
