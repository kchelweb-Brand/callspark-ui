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
}
