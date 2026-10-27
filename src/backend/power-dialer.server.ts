// Power dialer: work through a contact list one call after another without
// typing numbers.
//
// The agent's Dialer asks for the next contact, places the call itself, and
// reports how it went; the server hands out each contact exactly once. A
// contact can be claimed by only one agent at a time (`for update skip locked`),
// so several agents can run the same campaign without ringing anyone twice, and
// anyone marked do-not-call is never handed out — checked at claim time, so a
// flag added mid-campaign still counts.
//
// This is one call at a time per agent by design. It is a power dialer, not a
// predictive one: it never dials ahead of an agent who is free.

import { sql } from "./db";
import { verifyToken } from "./tokens";
import { requireFeature, requireCanCreate } from "./entitlements";

/** A claimed contact nobody reported on within this long is treated as abandoned. */
const ABANDONED_MINUTES = 10;

export const DISPOSITIONS: Record<string, { label: string; queue: "completed" | "failed" | "skipped" }> = {
  connected: { label: "Connected", queue: "completed" },
  callback: { label: "Callback requested", queue: "completed" },
  not_interested: { label: "Not interested", queue: "completed" },
  voicemail: { label: "Voicemail", queue: "failed" },
  no_answer: { label: "No answer", queue: "failed" },
  busy: { label: "Busy", queue: "failed" },
  wrong_number: { label: "Wrong number", queue: "failed" },
  dnc: { label: "Do not call", queue: "skipped" },
  skipped: { label: "Skipped", queue: "skipped" },
};

async function requireTenant(token: string) {
  const payload = await verifyToken(token);
  if (!payload || !payload.tenantId) throw new Error("Not signed in.");
  return payload as typeof payload & { tenantId: string };
}

async function counts(campaignId: string) {
  const rows = await sql`
    select count(*)::int as total,
           count(*) filter (where status = 'pending')::int as pending,
           count(*) filter (where status = 'calling')::int as calling,
           count(*) filter (where status = 'completed')::int as completed,
           count(*) filter (where status = 'failed')::int as failed,
           count(*) filter (where status = 'skipped')::int as skipped
    from campaign_calls where campaign_id = ${campaignId}
  `;
  return rows[0] as { total: number; pending: number; calling: number; completed: number; failed: number; skipped: number };
}

export async function powerStart(data: { token: string; campaignId: string }) {
  const user = await requireTenant(data.token);
  await requireFeature(user.tenantId, "powerDialer");
  await requireCanCreate(user.tenantId, "calls");

  const rows = await sql`
    select mode, list_id, name from campaigns where id = ${data.campaignId} and tenant_id = ${user.tenantId} limit 1
  `;
  const campaign = rows[0] as { mode: string; list_id: string | null; name: string } | undefined;
  if (!campaign) throw new Error("Campaign not found.");
  if (campaign.mode !== "manual") throw new Error("Power dialing is for manual campaigns. AI campaigns dial on their own.");
  if (!campaign.list_id) throw new Error("This campaign has no contact list. Create a new campaign and choose a list.");

  // Idempotent: adds contacts appended to the list since, never resets progress.
  await sql`
    insert into campaign_calls (tenant_id, campaign_id, contact_id)
    select ${user.tenantId}, ${data.campaignId}, c.id
    from contacts c
    where c.tenant_id = ${user.tenantId} and c.list_id = ${campaign.list_id} and c.do_not_call = false
    on conflict (campaign_id, contact_id) do nothing
  `;
  // Someone closed the app mid-call: put their contact back in the queue.
  await sql`
    update campaign_calls set status = 'pending', updated_at = now()
    where campaign_id = ${data.campaignId} and status = 'calling'
      and updated_at < now() - (${ABANDONED_MINUTES} || ' minutes')::interval
  `;
  await sql`update campaigns set status = 'Active', updated_at = now() where id = ${data.campaignId}`;

  return { ok: true as const, name: campaign.name, progress: await counts(data.campaignId) };
}

export async function powerNext(data: { token: string; campaignId: string }) {
  const user = await requireTenant(data.token);
  await requireFeature(user.tenantId, "powerDialer");
  await requireCanCreate(user.tenantId, "calls");

  const camp = await sql`
    select 1 from campaigns where id = ${data.campaignId} and tenant_id = ${user.tenantId} and mode = 'manual' limit 1
  `;
  if (camp.length === 0) throw new Error("Campaign not found.");

  const claimed = await sql`
    update campaign_calls set status = 'calling', attempts = attempts + 1, updated_at = now()
    where id = (
      select cc.id from campaign_calls cc
      join contacts ct on ct.id = cc.contact_id
      where cc.campaign_id = ${data.campaignId} and cc.status = 'pending' and ct.do_not_call = false
      order by cc.created_at asc limit 1
      for update skip locked
    )
    returning id, contact_id
  `;
  const row = claimed[0] as { id: string; contact_id: string } | undefined;
  if (!row) {
    const progress = await counts(data.campaignId);
    // Nothing pending and nothing in flight: the list is finished.
    if (progress.pending === 0 && progress.calling === 0) {
      await sql`update campaigns set status = 'Completed', updated_at = now() where id = ${data.campaignId} and status = 'Active'`;
    }
    return { ok: true as const, done: true as const, progress };
  }

  const contacts = await sql`
    select id, person, company, phone, email from contacts where id = ${row.contact_id} limit 1
  `;
  const contact = contacts[0] as { id: string; person: string | null; company: string | null; phone: string; email: string | null } | undefined;
  if (!contact) {
    await sql`update campaign_calls set status = 'skipped', updated_at = now() where id = ${row.id}`;
    return powerNext(data);
  }
  return { ok: true as const, done: false as const, queueId: row.id, contact, progress: await counts(data.campaignId) };
}

export async function powerResult(data: {
  token: string;
  queueId: string;
  disposition: string;
  callId?: string;
}) {
  const user = await requireTenant(data.token);
  const disposition = DISPOSITIONS[data.disposition];
  if (!disposition) throw new Error("Unknown call result.");

  const rows = await sql`
    update campaign_calls set status = ${disposition.queue}, call_id = coalesce(${data.callId ?? null}, call_id), updated_at = now()
    where id = ${data.queueId} and tenant_id = ${user.tenantId}
    returning campaign_id, contact_id
  `;
  const row = rows[0] as { campaign_id: string; contact_id: string } | undefined;
  if (!row) throw new Error("That queue entry wasn't found.");

  if (data.disposition === "dnc") {
    await sql`update contacts set do_not_call = true where id = ${row.contact_id} and tenant_id = ${user.tenantId}`;
  }
  if (data.callId) {
    await sql`
      update calls set outcome = ${disposition.label}, campaign_id = ${row.campaign_id}
      where id = ${data.callId} and tenant_id = ${user.tenantId}
    `;
  }
  return { ok: true as const, progress: await counts(row.campaign_id) };
}

export async function powerStop(data: { token: string; campaignId: string; queueId?: string }) {
  const user = await requireTenant(data.token);
  // Hand back the contact that was on screen, so stopping doesn't swallow it.
  if (data.queueId) {
    await sql`
      update campaign_calls set status = 'pending', updated_at = now()
      where id = ${data.queueId} and tenant_id = ${user.tenantId} and status = 'calling'
    `;
  }
  await sql`
    update campaigns set status = 'Paused', updated_at = now()
    where id = ${data.campaignId} and tenant_id = ${user.tenantId} and status = 'Active'
  `;
  return { ok: true as const, progress: await counts(data.campaignId) };
}
