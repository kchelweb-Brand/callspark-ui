import { createServerFn } from "@tanstack/react-start";

import { sql } from "./db";
import { verifyToken } from "./tokens";
import { sendTicketRaisedEmail } from "./email";
import type { JsonObject } from "./phone-system.server";
import { requireCanCreate } from "./entitlements";

async function requireTenant(token: string): Promise<string> {
  const payload = await verifyToken(token);
  if (!payload || !payload.tenantId) throw new Error("Not signed in.");
  return payload.tenantId;
}

// ---------- workspace / call preferences / billing ----------

export const getTenantSettingsFn = createServerFn({ method: "POST" })
  .validator((data: { token: string }) => data)
  .handler(async ({ data }) => {
    const tenantId = await requireTenant(data.token);
    const rows = await sql`
      select workspace, preferences, billing
      from tenant_settings where tenant_id = ${tenantId} limit 1
    `;
    const row = rows[0] as
      | { workspace: JsonObject; preferences: JsonObject; billing: JsonObject }
      | undefined;

    return {
      ok: true as const,
      saved: Boolean(row),
      workspace: row?.workspace ?? {},
      preferences: row?.preferences ?? {},
      billing: row?.billing ?? {},
    };
  });

export const saveTenantSettingsFn = createServerFn({ method: "POST" })
  .validator(
    (data: {
      token: string;
      workspace?: JsonObject;
      preferences?: JsonObject;
      billing?: JsonObject;
    }) => data,
  )
  .handler(async ({ data }) => {
    const tenantId = await requireTenant(data.token);

    // Merge rather than replace, so saving the billing panel can't wipe the
    // workspace profile the user set on a different screen.
    await sql`
      insert into tenant_settings (tenant_id, workspace, preferences, billing, updated_at)
      values (
        ${tenantId},
        ${JSON.stringify(data.workspace ?? {})}::jsonb,
        ${JSON.stringify(data.preferences ?? {})}::jsonb,
        ${JSON.stringify(data.billing ?? {})}::jsonb,
        now()
      )
      on conflict (tenant_id) do update set
        workspace = tenant_settings.workspace || excluded.workspace,
        preferences = tenant_settings.preferences || excluded.preferences,
        billing = tenant_settings.billing || excluded.billing,
        updated_at = now()
    `;
    return { ok: true as const };
  });

// ---------- tenant-facing support ----------

export interface MyTicketRecord {
  id: string;
  ticket_ref: string;
  subject: string;
  body: string | null;
  priority: string;
  status: string;
  created_at: string;
  updated_at: string;
}

/** A tenant only ever sees tickets belonging to their own workspace. */
export const listMyTicketsFn = createServerFn({ method: "POST" })
  .validator((data: { token: string }) => data)
  .handler(async ({ data }) => {
    const tenantId = await requireTenant(data.token);
    const rows = await sql`
      select id, ticket_ref, subject, body, priority, status, created_at, updated_at
      from support_tickets where tenant_id = ${tenantId}
      order by updated_at desc
    `;
    return { ok: true as const, tickets: rows as unknown as MyTicketRecord[] };
  });

export const createMyTicketFn = createServerFn({ method: "POST" })
  .validator((data: { token: string; subject: string; body?: string; priority?: string }) => data)
  .handler(async ({ data }) => {
    const payload = await verifyToken(data.token);
    if (!payload || !payload.tenantId) throw new Error("Not signed in.");

    const subject = data.subject.trim();
    if (!subject) throw new Error("Tell us what the problem is.");

    // Priority is deliberately not accepted from the tenant beyond a bounded
    // set — otherwise every ticket arrives marked High.
    const priority = ["Low", "Medium", "High"].includes(data.priority ?? "")
      ? data.priority!
      : "Medium";

    const inserted = await sql`
      insert into support_tickets (tenant_id, subject, body, priority, created_by_email)
      values (${payload.tenantId}, ${subject}, ${data.body ?? null}, ${priority}, ${payload.email})
      returning id
    `;
    const rows = await sql`
      select id, ticket_ref, subject, body, priority, status, created_at, updated_at
      from support_tickets where id = ${(inserted[0] as { id: string }).id}
    `;
    const ticket = rows[0] as unknown as MyTicketRecord;

    // Notify the platform owners. Deliberately after the insert and
    // non-throwing — the ticket exists whether or not the email goes out.
    const admins = await sql`
      select distinct email from users where is_super_admin = true and email is not null
    `;
    const tenantRows = await sql`select name from tenants where id = ${payload.tenantId} limit 1`;
    await sendTicketRaisedEmail(
      (admins as { email: string }[]).map((a) => a.email),
      {
        ref: ticket.ticket_ref,
        subject: ticket.subject,
        body: ticket.body,
        priority: ticket.priority,
        tenantName: (tenantRows[0] as { name: string } | undefined)?.name ?? null,
        raisedBy: payload.email,
      },
    );

    return { ok: true as const, ticket };
  });

// ---------- SMS campaigns & drafts ----------

export interface SmsCampaignRecord {
  id: string;
  name: string;
  status: string;
  list_name: string | null;
  body: string | null;
  sent: number;
  delivered: number;
  replies: number;
}

export interface SmsDraftRecord {
  id: string;
  list_name: string | null;
  body: string;
  created_at: string;
}

export const listSmsFn = createServerFn({ method: "POST" })
  .validator((data: { token: string }) => data)
  .handler(async ({ data }) => {
    const tenantId = await requireTenant(data.token);
    const campaigns = await sql`
      select id, name, status, list_name, body, sent, delivered, replies
      from sms_campaigns where tenant_id = ${tenantId} order by created_at desc
    `;
    const drafts = await sql`
      select id, list_name, body, created_at
      from sms_drafts where tenant_id = ${tenantId} order by created_at desc limit 20
    `;
    return {
      ok: true as const,
      campaigns: campaigns as unknown as SmsCampaignRecord[],
      drafts: drafts as unknown as SmsDraftRecord[],
    };
  });

export const createSmsCampaignFn = createServerFn({ method: "POST" })
  .validator(
    (data: { token: string; name: string; listName?: string; body?: string; status?: string }) =>
      data,
  )
  .handler(async ({ data }) => {
    const tenantId = await requireTenant(data.token);
    const name = data.name.trim() || "Untitled SMS campaign";
    await requireCanCreate(tenantId, "smsCampaigns");

    const rows = await sql`
      insert into sms_campaigns (tenant_id, name, status, list_name, body)
      values (${tenantId}, ${name}, ${data.status ?? "Scheduled"}, ${data.listName ?? null}, ${data.body ?? null})
      returning id, name, status, list_name, body, sent, delivered, replies
    `;
    return { ok: true as const, campaign: rows[0] as unknown as SmsCampaignRecord };
  });

export const updateSmsCampaignFn = createServerFn({ method: "POST" })
  .validator((data: { token: string; id: string; status: string }) => data)
  .handler(async ({ data }) => {
    const tenantId = await requireTenant(data.token);
    await sql`
      update sms_campaigns set status = ${data.status}
      where id = ${data.id} and tenant_id = ${tenantId}
    `;
    return { ok: true as const };
  });

export const saveSmsDraftFn = createServerFn({ method: "POST" })
  .validator((data: { token: string; listName?: string; body: string }) => data)
  .handler(async ({ data }) => {
    const tenantId = await requireTenant(data.token);
    if (!data.body.trim()) throw new Error("Nothing to save yet.");

    const rows = await sql`
      insert into sms_drafts (tenant_id, list_name, body)
      values (${tenantId}, ${data.listName ?? null}, ${data.body})
      returning id, list_name, body, created_at
    `;
    return { ok: true as const, draft: rows[0] as unknown as SmsDraftRecord };
  });

export const deleteSmsDraftFn = createServerFn({ method: "POST" })
  .validator((data: { token: string; id: string }) => data)
  .handler(async ({ data }) => {
    const tenantId = await requireTenant(data.token);
    await sql`delete from sms_drafts where id = ${data.id} and tenant_id = ${tenantId}`;
    return { ok: true as const };
  });
