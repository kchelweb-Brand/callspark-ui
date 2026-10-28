// The platform owner's side of "I've paid": see who says they paid, check the proof, and
// grant the plan or turn it down. This is what the owner's phone app talks to. Granting
// goes through the same activation as the admin console, so the plan, the paid-until date
// and the customer's receipt email all behave the same. Server-only.

import { createServerFn } from "@tanstack/react-start";

import { sql, sqlQuery } from "./db";
import { activateTenant } from "./billing.server";
import { sendClaimRejectedEmail } from "./email";
import { getPlan } from "./plans";
import { RECEIPT_METHODS } from "./payment-receipt.server";
import { receiptPath } from "./receipts.server";
import { ensureSchema } from "./schema.server";
import { verifyToken } from "./tokens";

async function requireOwner(token: string) {
  const payload = await verifyToken(token);
  if (!payload || !payload.isSuperAdmin) throw new Error("Not authorized.");
  return payload;
}

const methodLabel = (id: string) => RECEIPT_METHODS.find((m) => m.id === id)?.label ?? id;

export interface ClaimView {
  id: string;
  status: "pending" | "approved" | "rejected";
  createdAt: string;
  handledAt: string | null;
  tenantId: string;
  workspace: string;
  slug: string;
  ownerEmail: string | null;
  currentPlan: string;
  planId: string;
  planName: string;
  seats: number;
  interval: string;
  method: string;
  methodLabel: string;
  expectedUsd: number | null;
  declaredUsd: number | null;
  reference: string | null;
  ticketRef: string | null;
  note: string | null;
  receipts: { path: string; amountUsd: number | null; type: string }[];
}

/** Claims waiting for a decision (newest first), and the last few already decided. */
export async function listClaims(data: { token: string }) {
  await requireOwner(data.token);
  await ensureSchema();
  const rows = await sql`
    select c.id, c.status, c.created_at, c.handled_at, c.tenant_id, c.plan_id, c.seats, c.interval, c.method,
           c.expected_usd::float as expected_usd, c.declared_usd::float as declared_usd, c.reference, c.ticket_ref, c.note,
           t.name, t.workspace_slug, t.plan as current_plan,
           (select email from users u where u.tenant_id = t.id order by (u.role = 'tenant_owner') desc, u.created_at asc limit 1) as owner_email
    from payment_claims c join tenants t on t.id = c.tenant_id
    order by (c.status = 'pending') desc, c.created_at desc limit 40
  `;
  const ids = rows.map((r) => String(r["id"]));
  const receipts = ids.length
    ? await sqlQuery("select id, claim_id, amount_usd::float as amount_usd, content_type from payment_receipts where claim_id = any($1::uuid[]) order by created_at", [ids])
    : [];

  const claims: ClaimView[] = [];
  for (const r of rows) {
    const mine = receipts.filter((x) => String(x["claim_id"]) === String(r["id"]));
    claims.push({
      id: String(r["id"]),
      status: r["status"] as ClaimView["status"],
      createdAt: new Date(String(r["created_at"])).toISOString(),
      handledAt: r["handled_at"] ? new Date(String(r["handled_at"])).toISOString() : null,
      tenantId: String(r["tenant_id"]),
      workspace: String(r["name"]),
      slug: String(r["workspace_slug"]),
      ownerEmail: (r["owner_email"] as string | null) ?? null,
      currentPlan: String(r["current_plan"] ?? "trial"),
      planId: String(r["plan_id"]),
      planName: getPlan(String(r["plan_id"])).name,
      seats: Number(r["seats"]),
      interval: String(r["interval"]),
      method: String(r["method"]),
      methodLabel: methodLabel(String(r["method"])),
      expectedUsd: r["expected_usd"] === null ? null : Number(r["expected_usd"]),
      declaredUsd: r["declared_usd"] === null ? null : Number(r["declared_usd"]),
      reference: (r["reference"] as string | null) ?? null,
      ticketRef: (r["ticket_ref"] as string | null) ?? null,
      note: (r["note"] as string | null) ?? null,
      receipts: await Promise.all(
        mine.map(async (x) => ({
          path: await receiptPath(String(x["id"])),
          amountUsd: x["amount_usd"] === null ? null : Number(x["amount_usd"]),
          type: String(x["content_type"]),
        })),
      ),
    });
  }
  return { ok: true as const, claims, pending: claims.filter((c) => c.status === "pending").length };
}

export const listClaimsFn = createServerFn({ method: "POST" })
  .validator((data: { token: string }) => data)
  .handler(async ({ data }) => listClaims(data));

/** Grants the plan the customer paid for. `amountUsd` is what you confirmed actually arrived. */
export async function approveClaim(data: { token: string; claimId: string; months?: number; amountUsd?: number; origin?: string }) {
  await requireOwner(data.token);
  await ensureSchema();

  // Taken first, so a double tap cannot grant it twice.
  const taken = await sql`
    update payment_claims set status = 'approved', handled_at = now(), handled_by = 'owner'
    where id = ${data.claimId} and status = 'pending'
    returning tenant_id, plan_id, seats, interval, method, reference, expected_usd::float as expected_usd, declared_usd::float as declared_usd
  `;
  const c = taken[0] as
    | { tenant_id: string; plan_id: string; seats: number; interval: string; method: string; reference: string | null; expected_usd: number | null; declared_usd: number | null }
    | undefined;
  if (!c) throw new Error("That payment was already dealt with, or no longer exists.");

  try {
    const amount = Number(data.amountUsd ?? c.declared_usd ?? c.expected_usd);
    const months = data.months && data.months > 0 ? Math.round(data.months) : c.interval === "annual" ? 12 : 1;
    const result = await activateTenant({
      token: data.token,
      tenantId: c.tenant_id,
      plan: c.plan_id,
      notify: true,
      months,
      ...(data.origin ? { origin: data.origin } : {}),
      payment: { method: c.method, amountUsd: amount, ...(c.reference ? { reference: c.reference } : {}) },
    });
    return { ok: true as const, plan: result.plan, receiptSent: result.receiptSent, ownerEmail: result.ownerEmail };
  } catch (err) {
    // Nothing was granted, so it goes back in the queue.
    await sql`update payment_claims set status = 'pending', handled_at = null, handled_by = null where id = ${data.claimId}`;
    throw err;
  }
}

export const approveClaimFn = createServerFn({ method: "POST" })
  .validator((data: Parameters<typeof approveClaim>[0]) => data)
  .handler(async ({ data }) => approveClaim(data));

/** Turns a claim down and tells the customer why, so they can send what is missing. */
export async function rejectClaim(data: { token: string; claimId: string; reason: string }) {
  await requireOwner(data.token);
  await ensureSchema();
  const reason = String(data.reason ?? "").trim().slice(0, 500);
  if (reason.length < 3) throw new Error("Say why, so the customer knows what to fix.");

  const done = await sql`
    update payment_claims set status = 'rejected', note = ${reason}, handled_at = now(), handled_by = 'owner'
    where id = ${data.claimId} and status = 'pending'
    returning tenant_id, plan_id, method
  `;
  const c = done[0] as { tenant_id: string; plan_id: string; method: string } | undefined;
  if (!c) throw new Error("That payment was already dealt with, or no longer exists.");

  const who = await sql`
    select u.email, t.name from users u join tenants t on t.id = u.tenant_id
    where u.tenant_id = ${c.tenant_id} order by (u.role = 'tenant_owner') desc, u.created_at asc limit 1
  `;
  const owner = who[0] as { email: string; name: string } | undefined;
  let notified = false;
  if (owner) {
    try {
      await sendClaimRejectedEmail(owner.email, { workspaceName: owner.name, planName: getPlan(c.plan_id).name, methodLabel: methodLabel(c.method), reason });
      notified = true;
    } catch (err) {
      console.error("[claims] could not email the customer", err);
    }
  }
  return { ok: true as const, notified };
}

export const rejectClaimFn = createServerFn({ method: "POST" })
  .validator((data: Parameters<typeof rejectClaim>[0]) => data)
  .handler(async ({ data }) => rejectClaim(data));

/** The latest payments of every kind, so the owner can watch money arrive. */
export async function listPaymentFeed(data: { token: string }) {
  await requireOwner(data.token);
  await ensureSchema();
  const rows = await sql`
    select p.id, p.provider, p.email, p.amount::float as amount, p.currency, p.plan_id, p.status, p.note, p.created_at,
           t.name, t.workspace_slug
    from payments p left join tenants t on t.id = p.tenant_id
    order by p.created_at desc limit 30
  `;
  return {
    ok: true as const,
    payments: rows.map((r) => ({
      id: String(r["id"]),
      provider: String(r["provider"]),
      email: (r["email"] as string | null) ?? null,
      amount: Number(r["amount"]),
      currency: String(r["currency"] ?? "USD"),
      planName: r["plan_id"] ? getPlan(String(r["plan_id"])).name : null,
      status: String(r["status"]),
      note: (r["note"] as string | null) ?? null,
      createdAt: new Date(String(r["created_at"])).toISOString(),
      workspace: (r["name"] as string | null) ?? null,
      slug: (r["workspace_slug"] as string | null) ?? null,
    })),
  };
}

export const listPaymentFeedFn = createServerFn({ method: "POST" })
  .validator((data: { token: string }) => data)
  .handler(async ({ data }) => listPaymentFeed(data));

/** Finds an account by name, workspace or any member's email, to grant a plan by hand. */
export async function findAccounts(data: { token: string; query: string }) {
  await requireOwner(data.token);
  await ensureSchema();
  const q = String(data.query ?? "").trim().toLowerCase().slice(0, 80);
  if (q.length < 2) return { ok: true as const, accounts: [] as { id: string; name: string; slug: string; plan: string; status: string; ownerEmail: string | null; paidUntil: string | null }[] };
  const like = `%${q.replace(/[%_\\]/g, "")}%`;
  const rows = await sql`
    select t.id, t.name, t.workspace_slug, t.plan, t.status, t.paid_until,
           (select email from users u where u.tenant_id = t.id order by (u.role = 'tenant_owner') desc, u.created_at asc limit 1) as owner_email
    from tenants t
    where lower(t.name) like ${like} or lower(t.workspace_slug) like ${like}
       or exists (select 1 from users u where u.tenant_id = t.id and lower(u.email) like ${like})
    order by t.created_at desc limit 12
  `;
  return {
    ok: true as const,
    accounts: rows.map((r) => ({
      id: String(r["id"]),
      name: String(r["name"]),
      slug: String(r["workspace_slug"]),
      plan: String(r["plan"] ?? "trial"),
      status: String(r["status"]),
      ownerEmail: (r["owner_email"] as string | null) ?? null,
      paidUntil: r["paid_until"] ? new Date(String(r["paid_until"])).toISOString() : null,
    })),
  };
}

export const findAccountsFn = createServerFn({ method: "POST" })
  .validator((data: { token: string; query: string }) => data)
  .handler(async ({ data }) => findAccounts(data));

/** Grants a plan to any account from the phone, recording how it was paid. */
export const grantPlanFn = createServerFn({ method: "POST" })
  .validator((data: Parameters<typeof activateTenant>[0]) => data)
  .handler(async ({ data }) => activateTenant(data));
