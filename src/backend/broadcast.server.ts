// Outreach: the platform owner tells every user (or a chosen group) about an
// update, and how to use it. Super admins only.
//
// Each recipient gets an in-app notification (the bell, and a desktop pop-up in
// the Dialer), and optionally an email. The notification rows double as read
// receipts, so the history can show how many people have actually opened it.

import { createServerFn } from "@tanstack/react-start";

import { sql, sqlQuery } from "./db";
import { verifyToken } from "./tokens";
import { ensureSchema } from "./schema.server";
import { sendAnnouncementEmails } from "./email";
import { isPlanId } from "./plans";

/** Resend's batch endpoint takes 100 per call; this keeps one send inside the Worker's subrequest budget. */
const MAX_EMAIL_RECIPIENTS = 3000;

async function requireSuperAdmin(token: string) {
  const payload = await verifyToken(token);
  if (!payload || !payload.isSuperAdmin) throw new Error("Not authorized.");
  return payload;
}

export interface Audience {
  /** Who in each workspace: everyone, only owners, or only agents. */
  roles?: "all" | "owners" | "agents";
  /** Only workspaces on these plans. Empty or missing means every plan. */
  plans?: string[];
  /** Only these workspaces. Empty or missing means all of them. */
  tenantIds?: string[];
}

function cleanAudience(raw: Audience | undefined): Required<Audience> {
  const roles = raw?.roles === "owners" || raw?.roles === "agents" ? raw.roles : "all";
  const plans = (raw?.plans ?? []).filter((p) => isPlanId(p));
  const tenantIds = (raw?.tenantIds ?? []).filter((id) => /^[0-9a-f-]{36}$/i.test(id));
  return { roles, plans, tenantIds };
}

interface Recipient {
  user_id: string;
  tenant_id: string;
  email: string;
}

async function resolveRecipients(audience: Required<Audience>): Promise<Recipient[]> {
  const params: unknown[] = [];
  // Real customers only: no internal sandboxes, no suspended or pending
  // workspaces, nobody whose access has been turned off, and never the platform
  // admins themselves.
  let where = "t.is_internal = false and t.status = 'active' and u.status <> 'disabled' and u.is_super_admin = false";
  if (audience.roles === "owners") where += " and u.role <> 'agent'";
  if (audience.roles === "agents") where += " and u.role = 'agent'";
  if (audience.plans.length > 0) {
    params.push(audience.plans);
    where += ` and t.plan = any($${params.length}::text[])`;
  }
  if (audience.tenantIds.length > 0) {
    params.push(audience.tenantIds);
    where += ` and t.id = any($${params.length}::uuid[])`;
  }
  const rows = await sqlQuery(
    `select u.id as user_id, u.tenant_id, u.email from users u join tenants t on t.id = u.tenant_id where ${where}`,
    params,
  );
  return rows as unknown as Recipient[];
}

export async function previewAudience(data: { token: string; audience?: Audience }) {
  await requireSuperAdmin(data.token);
  await ensureSchema();
  const recipients = await resolveRecipients(cleanAudience(data.audience));
  return {
    ok: true as const,
    users: recipients.length,
    workspaces: new Set(recipients.map((r) => r.tenant_id)).size,
  };
}

export interface BroadcastInput {
  token: string;
  title: string;
  body: string;
  /** One step per line. Shown as a numbered list. */
  howTo?: string;
  linkUrl?: string;
  linkLabel?: string;
  audience?: Audience;
  sendEmail?: boolean;
}

export async function sendBroadcast(data: BroadcastInput) {
  const admin = await requireSuperAdmin(data.token);
  await ensureSchema();

  const title = (data.title ?? "").trim().slice(0, 150);
  const body = (data.body ?? "").trim().slice(0, 4000);
  if (!title) throw new Error("Give the announcement a title.");
  if (!body) throw new Error("Write the announcement.");
  const howTo = (data.howTo ?? "").trim().slice(0, 2000) || null;

  let linkUrl: string | null = null;
  if (data.linkUrl?.trim()) {
    try {
      const u = new URL(data.linkUrl.trim());
      if (u.protocol !== "https:" && u.protocol !== "http:") throw new Error("bad protocol");
      linkUrl = u.toString();
    } catch {
      throw new Error("The link must be a full web address starting with https://");
    }
  }
  const linkLabel = data.linkLabel?.trim().slice(0, 60) || null;

  // The same announcement twice in a row is almost always a double-click.
  const dup = await sql`
    select 1 from broadcasts
    where created_by = ${admin.email} and title = ${title} and body = ${body} and created_at > now() - interval '2 minutes'
    limit 1
  `;
  if (dup.length > 0) throw new Error("You just sent this exact announcement. Wait a couple of minutes to send it again.");

  const audience = cleanAudience(data.audience);
  const recipients = await resolveRecipients(audience);
  if (recipients.length === 0) throw new Error("No one matches that audience.");
  if (data.sendEmail && recipients.length > MAX_EMAIL_RECIPIENTS) {
    throw new Error(`That's ${recipients.length} people. Email at most ${MAX_EMAIL_RECIPIENTS} at a time: narrow the audience, or send in-app only.`);
  }

  const created = await sql`
    insert into broadcasts (title, body, how_to, link_url, link_label, audience, send_email, created_by, recipient_count)
    values (${title}, ${body}, ${howTo}, ${linkUrl}, ${linkLabel}, ${JSON.stringify(audience)}::jsonb,
            ${Boolean(data.sendEmail)}, ${admin.email}, ${recipients.length})
    returning id
  `;
  const id = (created[0] as { id: string }).id;

  // One statement for the whole audience.
  const notificationBody = [body, howTo ? `How to use it:\n${howTo}` : ""].filter(Boolean).join("\n\n");
  await sql`
    insert into notifications (user_id, tenant_id, kind, title, body, link, broadcast_id)
    select r.user_id, r.tenant_id, 'announcement', ${title}, ${notificationBody}, ${linkUrl}, ${id}
    from jsonb_to_recordset(${JSON.stringify(recipients)}::jsonb) as r(user_id uuid, tenant_id uuid)
  `;

  let emailed = { sent: 0, failed: 0 };
  if (data.sendEmail) {
    emailed = await sendAnnouncementEmails(
      recipients.map((r) => r.email),
      { title, body, howTo, linkUrl, linkLabel },
    );
    await sql`update broadcasts set email_sent = ${emailed.sent}, email_failed = ${emailed.failed} where id = ${id}`;
  }

  return { ok: true as const, id, recipients: recipients.length, emailSent: emailed.sent, emailFailed: emailed.failed };
}

export interface BroadcastRecord {
  id: string;
  title: string;
  body: string;
  how_to: string | null;
  link_url: string | null;
  audience: Audience;
  send_email: boolean;
  created_by: string | null;
  recipient_count: number;
  email_sent: number;
  email_failed: number;
  created_at: string;
  read_count: number;
}

export async function listBroadcasts(data: { token: string }) {
  await requireSuperAdmin(data.token);
  await ensureSchema();
  const rows = await sql`
    select b.id, b.title, b.body, b.how_to, b.link_url, b.audience, b.send_email, b.created_by,
           b.recipient_count, b.email_sent, b.email_failed, b.created_at,
           (select count(*)::int from notifications n where n.broadcast_id = b.id and n.read_at is not null) as read_count
    from broadcasts b order by b.created_at desc limit 50
  `;
  const plans = await sql`select distinct plan from tenants where is_internal = false order by plan`;
  const tenants = await sql`select id, name from tenants where is_internal = false and status = 'active' order by name`;
  return {
    ok: true as const,
    broadcasts: rows as unknown as BroadcastRecord[],
    plans: (plans as { plan: string }[]).map((p) => p.plan),
    tenants: tenants as unknown as { id: string; name: string }[],
  };
}

export const previewAudienceFn = createServerFn({ method: "POST" })
  .validator((data: Parameters<typeof previewAudience>[0]) => data)
  .handler(async ({ data }) => previewAudience(data));

export const sendBroadcastFn = createServerFn({ method: "POST" })
  .validator((data: Parameters<typeof sendBroadcast>[0]) => data)
  .handler(async ({ data }) => sendBroadcast(data));

export const listBroadcastsFn = createServerFn({ method: "POST" })
  .validator((data: Parameters<typeof listBroadcasts>[0]) => data)
  .handler(async ({ data }) => listBroadcasts(data));
