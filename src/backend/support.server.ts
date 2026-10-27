// Support as a conversation, not a form.
//
// A ticket is a thread: the customer writes, support replies, the customer
// answers. The thread's first message is the ticket body itself (so tickets
// raised before threads existed still read correctly); everything after lives
// in support_messages.
//
// Two audiences, two permission models. A customer can only ever read and write
// threads on their own workspace's tickets. Support (platform super admins) can
// read every thread, and sees the customer's plan and usage next to it so they
// answer with the account in front of them.

import { createServerFn } from "@tanstack/react-start";

import { sql } from "./db";
import { verifyToken } from "./tokens";
import { ensureSchema } from "./schema.server";
import { getPlan, monthlyPrice } from "./plans";
import { sendCustomerReplyEmail, sendSupportReplyEmail } from "./email";

const MAX_MESSAGE = 4000;

async function requireTenantUser(token: string) {
  const payload = await verifyToken(token);
  if (!payload || !payload.tenantId) throw new Error("Not signed in.");
  return payload as typeof payload & { tenantId: string };
}

async function requireSupport(token: string) {
  const payload = await verifyToken(token);
  if (!payload || !payload.isSuperAdmin) throw new Error("Not authorized.");
  return payload;
}

function cleanMessage(body: string | undefined): string {
  const text = (body ?? "").trim();
  if (!text) throw new Error("Write a message first.");
  if (text.length > MAX_MESSAGE) throw new Error(`Keep it under ${MAX_MESSAGE} characters.`);
  return text;
}

export interface ThreadMessage {
  id: string;
  sender_role: "customer" | "support";
  sender_email: string | null;
  body: string;
  created_at: string;
}

export interface CustomerProfile {
  tenant_id: string;
  name: string;
  workspace_slug: string;
  status: string;
  plan_id: string;
  plan_name: string;
  /** What this customer pays per month on their current plan and seat count. */
  monthly_usd: number;
  created_at: string;
  trial_ends_at: string | null;
  owner_email: string | null;
  contact_name: string | null;
  contact_phone: string | null;
  company_name: string | null;
  user_count: number;
  agent_count: number;
  contact_count: number;
  number_count: number;
  call_count: number;
  last_call_at: string | null;
  dialer_addon: boolean;
  sip_addon: boolean;
  ticket_count: number;
  open_ticket_count: number;
}

export interface Conversation {
  id: string;
  ticket_ref: string;
  subject: string;
  priority: string;
  status: string;
  created_at: string;
  updated_at: string;
  created_by_email: string | null;
  admin_unread: boolean;
  customer_unread: boolean;
  message_count: number;
  last_message: string | null;
  last_sender: string | null;
  tenant_id: string | null;
  tenant_name: string | null;
  workspace_slug: string | null;
  plan_name: string | null;
  tenant_status: string | null;
}

/** The ticket body plus every reply, oldest first, as one list. */
async function loadThread(ticketId: string): Promise<ThreadMessage[]> {
  const head = await sql`
    select tk.body, tk.created_at, tk.created_by_email,
           exists (select 1 from users u where u.email = tk.created_by_email and u.is_super_admin = true) as by_support
    from support_tickets tk where tk.id = ${ticketId} limit 1
  `;
  const first = head[0] as
    | { body: string | null; created_at: string; created_by_email: string | null; by_support: boolean }
    | undefined;

  const replies = (await sql`
    select id, sender_role, sender_email, body, created_at
    from support_messages where ticket_id = ${ticketId} order by created_at asc
  `) as unknown as ThreadMessage[];

  const messages: ThreadMessage[] = [];
  if (first?.body?.trim()) {
    messages.push({
      id: `${ticketId}:first`,
      sender_role: first.by_support ? "support" : "customer",
      sender_email: first.created_by_email,
      body: first.body,
      created_at: first.created_at,
    });
  }
  return messages.concat(replies);
}

// ---------------------------------------------------------------------------
// Support side
// ---------------------------------------------------------------------------

/** Every conversation, unanswered first, each tagged with who the customer is. */
export async function listConversations(data: { token: string }) {
  await requireSupport(data.token);
  await ensureSchema();

  const rows = (await sql`
    select tk.id, tk.ticket_ref, tk.subject, tk.priority, tk.status, tk.created_at, tk.updated_at,
           tk.created_by_email, tk.admin_unread, tk.customer_unread, tk.tenant_id,
           t.name as tenant_name, t.workspace_slug, t.plan as plan_id, t.status as tenant_status,
           (select count(*)::int from support_messages m where m.ticket_id = tk.id)
             + (case when coalesce(tk.body, '') <> '' then 1 else 0 end) as message_count,
           coalesce(
             (select m.body from support_messages m where m.ticket_id = tk.id order by m.created_at desc limit 1),
             tk.body
           ) as last_message,
           (select m.sender_role from support_messages m where m.ticket_id = tk.id
              order by m.created_at desc limit 1) as last_sender
    from support_tickets tk
    left join tenants t on t.id = tk.tenant_id
    order by tk.admin_unread desc, (tk.status = 'Resolved') asc, tk.updated_at desc
    limit 300
  `) as unknown as (Omit<Conversation, "plan_name"> & { plan_id: string | null })[];

  const conversations: Conversation[] = rows.map((r) => ({
    ...r,
    plan_name: r.plan_id ? getPlan(r.plan_id).name : null,
  }));

  const tenants = await sql`select id, name from tenants where is_internal = false order by name`;
  return {
    ok: true as const,
    conversations,
    unread: conversations.filter((c) => c.admin_unread).length,
    tenants: tenants as unknown as { id: string; name: string }[],
  };
}

export async function getConversation(data: { token: string; id: string }) {
  await requireSupport(data.token);
  await ensureSchema();

  const rows = await sql`
    select tk.id, tk.ticket_ref, tk.subject, tk.priority, tk.status, tk.created_at, tk.updated_at,
           tk.created_by_email, tk.admin_unread, tk.customer_unread, tk.tenant_id
    from support_tickets tk where tk.id = ${data.id} limit 1
  `;
  const ticket = rows[0] as
    | {
        id: string;
        ticket_ref: string;
        subject: string;
        priority: string;
        status: string;
        created_at: string;
        updated_at: string;
        created_by_email: string | null;
        admin_unread: boolean;
        tenant_id: string | null;
      }
    | undefined;
  if (!ticket) throw new Error("That conversation no longer exists.");

  // Opening it is reading it.
  if (ticket.admin_unread) {
    await sql`update support_tickets set admin_unread = false where id = ${data.id}`;
  }

  const [messages, customer] = await Promise.all([
    loadThread(data.id),
    ticket.tenant_id ? loadCustomerProfile(ticket.tenant_id) : Promise.resolve(null),
  ]);

  return { ok: true as const, ticket: { ...ticket, admin_unread: false }, messages, customer };
}

export async function replyAsSupport(data: {
  token: string;
  id: string;
  body: string;
  status?: string;
}) {
  const admin = await requireSupport(data.token);
  await ensureSchema();
  const body = cleanMessage(data.body);

  const found = await sql`
    select ticket_ref, subject, created_by_email, tenant_id from support_tickets where id = ${data.id} limit 1
  `;
  const ticket = found[0] as
    | { ticket_ref: string; subject: string; created_by_email: string | null; tenant_id: string | null }
    | undefined;
  if (!ticket) throw new Error("That conversation no longer exists.");

  await sql`
    insert into support_messages (ticket_id, sender_role, sender_email, body)
    values (${data.id}, 'support', ${admin.email}, ${body})
  `;
  // Answering means the ball is in the customer's court, unless support says otherwise.
  const status = data.status ?? "Waiting on customer";
  await sql`
    update support_tickets
    set status = ${status}, customer_unread = true, admin_unread = false, updated_at = now()
    where id = ${data.id}
  `;

  // The customer who raised it, or failing that the workspace owner.
  let recipient = ticket.created_by_email;
  if (ticket.tenant_id && (!recipient || recipient === admin.email)) {
    const owner = await sql`
      select email from users where tenant_id = ${ticket.tenant_id}
      order by (role = 'tenant_owner') desc, created_at asc limit 1
    `;
    recipient = (owner[0] as { email: string } | undefined)?.email ?? recipient;
  }
  if (recipient) {
    await sendSupportReplyEmail(recipient, {
      ref: ticket.ticket_ref,
      subject: ticket.subject,
      message: body,
      from: "Kchel support",
    });
  }

  return { ok: true as const, messages: await loadThread(data.id), status };
}

// ---------------------------------------------------------------------------
// Customer side
// ---------------------------------------------------------------------------

export async function listMyConversations(data: { token: string }) {
  const user = await requireTenantUser(data.token);
  await ensureSchema();
  const rows = await sql`
    select tk.id, tk.ticket_ref, tk.subject, tk.body, tk.priority, tk.status, tk.created_at,
           tk.updated_at, tk.customer_unread,
           (select count(*)::int from support_messages m where m.ticket_id = tk.id)
             + (case when coalesce(tk.body, '') <> '' then 1 else 0 end) as message_count
    from support_tickets tk
    where tk.tenant_id = ${user.tenantId}
    order by tk.customer_unread desc, tk.updated_at desc
  `;
  return { ok: true as const, tickets: rows as unknown as MyConversation[] };
}

export interface MyConversation {
  id: string;
  ticket_ref: string;
  subject: string;
  body: string | null;
  priority: string;
  status: string;
  created_at: string;
  updated_at: string;
  customer_unread: boolean;
  message_count: number;
}

export async function getMyConversation(data: { token: string; id: string }) {
  const user = await requireTenantUser(data.token);
  await ensureSchema();
  const rows = await sql`
    select id, ticket_ref, subject, priority, status, created_at, updated_at, customer_unread
    from support_tickets where id = ${data.id} and tenant_id = ${user.tenantId} limit 1
  `;
  const ticket = rows[0] as
    | { id: string; ticket_ref: string; subject: string; priority: string; status: string; created_at: string; updated_at: string; customer_unread: boolean }
    | undefined;
  if (!ticket) throw new Error("That request wasn't found.");

  if (ticket.customer_unread) {
    await sql`update support_tickets set customer_unread = false where id = ${data.id}`;
  }
  return {
    ok: true as const,
    ticket: { ...ticket, customer_unread: false },
    messages: await loadThread(data.id),
  };
}

export async function replyAsCustomer(data: { token: string; id: string; body: string }) {
  const user = await requireTenantUser(data.token);
  await ensureSchema();
  const body = cleanMessage(data.body);

  const rows = await sql`
    select ticket_ref, subject, status from support_tickets
    where id = ${data.id} and tenant_id = ${user.tenantId} limit 1
  `;
  const ticket = rows[0] as { ticket_ref: string; subject: string; status: string } | undefined;
  if (!ticket) throw new Error("That request wasn't found.");

  await sql`
    insert into support_messages (ticket_id, sender_role, sender_email, body)
    values (${data.id}, 'customer', ${user.email}, ${body})
  `;
  // A reply to a resolved ticket reopens it, so it can't sit unseen in a closed column.
  const status = ticket.status === "Resolved" || ticket.status === "Waiting on customer" ? "Open" : ticket.status;
  await sql`
    update support_tickets
    set status = ${status}, admin_unread = true, customer_unread = false, updated_at = now()
    where id = ${data.id}
  `;

  const tenant = await sql`select name from tenants where id = ${user.tenantId} limit 1`;
  const admins = await sql`
    select distinct email from users where is_super_admin = true and email is not null
  `;
  await sendCustomerReplyEmail(
    (admins as { email: string }[]).map((a) => a.email),
    {
      ref: ticket.ticket_ref,
      subject: ticket.subject,
      message: body,
      from: `${(tenant[0] as { name: string } | undefined)?.name ?? "A customer"} (${user.email})`,
    },
  );

  return { ok: true as const, messages: await loadThread(data.id), status };
}

// ---------------------------------------------------------------------------
// Who is this customer?
// ---------------------------------------------------------------------------

async function loadCustomerProfile(tenantId: string): Promise<CustomerProfile | null> {
  const rows = await sql`
    select t.id, t.name, t.workspace_slug, t.status, t.plan, t.created_at, t.trial_ends_at,
           t.dialer_addon_enabled, t.sip_addon_enabled,
           (select email from users u where u.tenant_id = t.id
              order by (u.role = 'tenant_owner') desc, u.created_at asc limit 1) as owner_email,
           (select count(*)::int from users u where u.tenant_id = t.id) as user_count,
           (select count(*)::int from agents a where a.tenant_id = t.id) as agent_count,
           (select count(*)::int from contacts c where c.tenant_id = t.id) as contact_count,
           (select count(*)::int from phone_numbers p where p.tenant_id = t.id) as number_count,
           (select count(*)::int from calls c where c.tenant_id = t.id) as call_count,
           (select max(c.started_at) from calls c where c.tenant_id = t.id) as last_call_at,
           (select count(*)::int from support_tickets s where s.tenant_id = t.id) as ticket_count,
           (select count(*)::int from support_tickets s where s.tenant_id = t.id and s.status <> 'Resolved') as open_ticket_count,
           (select sr.full_name from signup_requests sr where sr.workspace_slug = t.workspace_slug
              order by sr.created_at asc limit 1) as contact_name,
           (select sr.phone from signup_requests sr where sr.workspace_slug = t.workspace_slug
              order by sr.created_at asc limit 1) as contact_phone,
           (select sr.company_name from signup_requests sr where sr.workspace_slug = t.workspace_slug
              order by sr.created_at asc limit 1) as company_name
    from tenants t where t.id = ${tenantId} limit 1
  `;
  const r = rows[0] as Record<string, unknown> | undefined;
  if (!r) return null;

  const plan = getPlan(r["plan"] as string);
  const users = Number(r["user_count"] ?? 0);
  return {
    tenant_id: r["id"] as string,
    name: r["name"] as string,
    workspace_slug: r["workspace_slug"] as string,
    status: r["status"] as string,
    plan_id: plan.id,
    plan_name: plan.name,
    monthly_usd: monthlyPrice(plan, users),
    created_at: r["created_at"] as string,
    trial_ends_at: (r["trial_ends_at"] as string | null) ?? null,
    owner_email: (r["owner_email"] as string | null) ?? null,
    contact_name: (r["contact_name"] as string | null) ?? null,
    contact_phone: (r["contact_phone"] as string | null) ?? null,
    company_name: (r["company_name"] as string | null) ?? null,
    user_count: users,
    agent_count: Number(r["agent_count"] ?? 0),
    contact_count: Number(r["contact_count"] ?? 0),
    number_count: Number(r["number_count"] ?? 0),
    call_count: Number(r["call_count"] ?? 0),
    last_call_at: (r["last_call_at"] as string | null) ?? null,
    dialer_addon: Boolean(r["dialer_addon_enabled"]),
    sip_addon: Boolean(r["sip_addon_enabled"]),
    ticket_count: Number(r["ticket_count"] ?? 0),
    open_ticket_count: Number(r["open_ticket_count"] ?? 0),
  };
}

// ---------------------------------------------------------------------------
// Web (TanStack) wrappers — the desktop app calls the functions above directly.
// ---------------------------------------------------------------------------

export const listConversationsFn = createServerFn({ method: "POST" })
  .validator((data: Parameters<typeof listConversations>[0]) => data)
  .handler(async ({ data }) => listConversations(data));

export const getConversationFn = createServerFn({ method: "POST" })
  .validator((data: Parameters<typeof getConversation>[0]) => data)
  .handler(async ({ data }) => getConversation(data));

export const replyAsSupportFn = createServerFn({ method: "POST" })
  .validator((data: Parameters<typeof replyAsSupport>[0]) => data)
  .handler(async ({ data }) => replyAsSupport(data));

export const listMyConversationsFn = createServerFn({ method: "POST" })
  .validator((data: Parameters<typeof listMyConversations>[0]) => data)
  .handler(async ({ data }) => listMyConversations(data));

export const getMyConversationFn = createServerFn({ method: "POST" })
  .validator((data: Parameters<typeof getMyConversation>[0]) => data)
  .handler(async ({ data }) => getMyConversation(data));

export const replyAsCustomerFn = createServerFn({ method: "POST" })
  .validator((data: Parameters<typeof replyAsCustomer>[0]) => data)
  .handler(async ({ data }) => replyAsCustomer(data));
