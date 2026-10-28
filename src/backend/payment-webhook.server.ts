// Switches a plan on the moment its payment clears, so nobody has to be awake to
// do it, and tells the owner about every payment by email.
//
// Flutterwave calls this address when a payment succeeds. Before anything is
// granted the call is checked three ways:
//   1. it carries the shared secret set in the Flutterwave dashboard,
//   2. Flutterwave itself is asked to confirm the transaction, and
//   3. the amount must match exactly one plan price, and the payer's email must
//      belong to exactly one workspace.
// Anything that fails a check is not guessed at: the payment is recorded and the
// owner is emailed to look at it. A payment is only ever handled once, however
// many times Flutterwave repeats the call.
//
// Server-only.

import { sql } from "./db";
import { ensureSchema } from "./schema.server";
import { sendAccountActivatedEmail, sendTeamAlertEmail } from "./email";
import { PLANS, getPlan, type BillingInterval, type PlanId } from "./plans";
import { knownPaidOptions } from "./payments.server";
import { extendPaidPeriod } from "./billing-lifecycle.server";

export const FLUTTERWAVE_WEBHOOK_PATH = "/api/payments/flutterwave";

const RANK: Record<string, number> = { trial: 0, starter: 1, professional: 2, business: 3, managed: 4 };

function same(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

interface FlwPayload {
  event?: string;
  data?: {
    id?: number | string;
    tx_ref?: string;
    flw_ref?: string;
    amount?: number | string;
    currency?: string;
    status?: string;
    customer?: { email?: string; name?: string };
  };
}

interface Decision {
  status: "activated" | "needs_review";
  note: string;
  tenantId?: string;
  planId?: PlanId;
  seats?: number;
  interval?: BillingInterval;
}

/** Asks Flutterwave whether this transaction really happened and for how much. */
async function confirmWithFlutterwave(id: string, txRef: string): Promise<{ ok: boolean; amount: number; currency: string; why?: string }> {
  const secret = process.env["FLUTTERWAVE_SECRET_KEY"] || "";
  if (!secret) return { ok: false, amount: 0, currency: "", why: "The Flutterwave secret key isn't set, so the payment couldn't be double-checked." };
  try {
    const res = await fetch(`https://api.flutterwave.com/v3/transactions/${encodeURIComponent(id)}/verify`, {
      headers: { authorization: `Bearer ${secret}`, accept: "application/json" },
    });
    const body = (await res.json()) as { status?: string; data?: { status?: string; amount?: number; currency?: string; tx_ref?: string } };
    if (!res.ok || body.status !== "success" || body.data?.status !== "successful") {
      return { ok: false, amount: 0, currency: "", why: "Flutterwave did not confirm this payment as successful." };
    }
    if (body.data.tx_ref && body.data.tx_ref !== txRef) {
      return { ok: false, amount: 0, currency: "", why: "Flutterwave's record doesn't match this notification." };
    }
    return { ok: true, amount: Number(body.data.amount), currency: String(body.data.currency ?? "") };
  } catch (err) {
    console.error("[payments] verify call failed", err);
    return { ok: false, amount: 0, currency: "", why: "Flutterwave could not be reached to double-check the payment." };
  }
}

async function decide(amount: number, currency: string, email: string): Promise<Decision> {
  if (currency.toUpperCase() !== "USD") {
    return { status: "needs_review", note: `Paid in ${currency || "an unknown currency"}, not US dollars, so the plan could not be worked out.` };
  }

  // Which plan does this amount buy? It must point at exactly one.
  const options = await knownPaidOptions();
  const hits = options.filter((o) => Math.abs(o.amountUsd - amount) < 0.01);
  const plans = [...new Set(hits.map((h) => h.planId))];
  if (plans.length === 0) return { status: "needs_review", note: `$${amount} doesn't match any plan price.` };
  if (plans.length > 1) return { status: "needs_review", note: `$${amount} matches more than one plan (${plans.join(", ")}).` };
  const hit = hits[0]!;
  const planId = hit.planId;

  // Whose workspace is it? The payer's email must belong to exactly one.
  const owners = await sql`
    select distinct u.tenant_id, t.plan from users u join tenants t on t.id = u.tenant_id
    where lower(u.email) = ${email} and u.is_super_admin = false and u.tenant_id is not null
  `;
  if (owners.length === 0) return { status: "needs_review", note: `No workspace uses the email ${email}.`, planId, seats: hit.seats, interval: hit.interval };
  if (owners.length > 1) return { status: "needs_review", note: `${email} belongs to more than one workspace.`, planId, seats: hit.seats, interval: hit.interval };
  const tenantId = String((owners[0] as { tenant_id: string }).tenant_id);
  const current = String((owners[0] as { plan: string | null }).plan ?? "trial");

  // Never move someone down a plan on a payment alone.
  if ((RANK[planId] ?? 0) < (RANK[current] ?? 0)) {
    return { status: "needs_review", note: `They are on ${getPlan(current).name} and paid for ${PLANS[planId].name}.`, tenantId, planId, seats: hit.seats, interval: hit.interval };
  }
  return { status: "activated", note: current === planId ? "Renewal of the same plan." : `Moved from ${getPlan(current).name}.`, tenantId, planId, seats: hit.seats, interval: hit.interval };
}

async function tellOwners(subject: string, message: string): Promise<void> {
  try {
    const owners = await sql`select email from users where is_super_admin = true`;
    for (const o of owners) {
      await sendTeamAlertEmail(String(o["email"]), subject, {
        heading: subject,
        message,
        ctaLabel: "Open revenue",
        ctaPath: "/admin/revenue",
      });
    }
  } catch (err) {
    console.error("[payments] could not email the owners", err);
  }
}

export async function handleFlutterwaveWebhook(request: Request): Promise<Response> {
  const expected = process.env["FLUTTERWAVE_WEBHOOK_HASH"] || "";
  if (!expected) {
    console.error("[payments] FLUTTERWAVE_WEBHOOK_HASH is not set");
    return new Response("Not configured", { status: 503 });
  }
  const sent = request.headers.get("verif-hash") ?? "";
  if (!sent || !same(sent, expected)) return new Response("Unauthorized", { status: 401 });

  let payload: FlwPayload;
  try {
    payload = (await request.json()) as FlwPayload;
  } catch {
    return new Response("Bad request", { status: 400 });
  }
  const d = payload.data;
  // Failed attempts, refunds and other events are not payments to act on.
  if (payload.event !== "charge.completed" || !d || d.status !== "successful" || d.id === undefined) {
    return new Response("Ignored", { status: 200 });
  }

  await ensureSchema();
  const txId = String(d.id);
  const email = String(d.customer?.email ?? "").trim().toLowerCase();
  const claimed = Number(d.amount);
  const txRef = String(d.tx_ref ?? "");

  // Handled once. A repeat of the same call stops here.
  const first = await sql`
    insert into payments (provider, provider_tx_id, tx_ref, email, amount, currency, status)
    values ('flutterwave', ${txId}, ${txRef}, ${email}, ${Number.isFinite(claimed) ? claimed : 0}, ${String(d.currency ?? "")}, 'received')
    on conflict (provider, provider_tx_id) do nothing
    returning id
  `;
  if (first.length === 0) return new Response("Already handled", { status: 200 });
  const paymentId = String((first[0] as { id: string }).id);

  let decision: Decision;
  const proof = await confirmWithFlutterwave(txId, txRef);
  if (!proof.ok) {
    decision = { status: "needs_review", note: proof.why ?? "The payment could not be confirmed." };
  } else if (Math.abs(proof.amount - claimed) > 0.01) {
    decision = { status: "needs_review", note: `The notification said $${claimed} but Flutterwave says ${proof.amount}.` };
  } else {
    decision = await decide(proof.amount, proof.currency, email);
  }

  let tenantName = "";
  let tenantSlug = "";
  if (decision.status === "activated" && decision.tenantId && decision.planId) {
    const before = await sql`select plan from tenants where id = ${decision.tenantId}`;
    const wasPlan = String((before[0] as { plan: string | null } | undefined)?.plan ?? "trial");
    const updated = await sql`
      update tenants set plan = ${decision.planId}, status = 'active', trial_ends_at = null
      where id = ${decision.tenantId} returning name, workspace_slug
    `;
    const t = updated[0] as { name: string; workspace_slug: string } | undefined;
    tenantName = t?.name ?? "";
    tenantSlug = t?.workspace_slug ?? "";
    // Paid for another month (or year): the clock restarts and the reminders reset.
    await extendPaidPeriod(decision.tenantId, decision.interval ?? "monthly");

    // The customer is told once, when their plan actually changes.
    if (wasPlan !== decision.planId && email) {
      try {
        const plan = getPlan(decision.planId);
        await sendAccountActivatedEmail(email, {
          workspaceName: tenantName,
          workspaceSlug: tenantSlug,
          planName: plan.name,
          agentLimit: plan.limits.agents,
          signInUrl: "/login",
        });
      } catch (err) {
        console.error("[payments] could not email the customer", err);
      }
    }
  }

  await sql`
    update payments set status = ${decision.status}, note = ${decision.note}, tenant_id = ${decision.tenantId ?? null},
      plan_id = ${decision.planId ?? null}, seats = ${decision.seats ?? null}, interval = ${decision.interval ?? null}
    where id = ${paymentId}
  `;

  const lines = [
    `Payer: ${String(d.customer?.name ?? "")} <${email || "no email"}>`,
    `Amount: ${proof.ok ? proof.currency : String(d.currency ?? "")} ${proof.ok ? proof.amount : claimed}`,
    `Flutterwave reference: ${txRef || txId}`,
  ];
  if (decision.status === "activated") {
    await tellOwners(
      `Payment received: ${tenantName || email} on ${PLANS[decision.planId!].name}`,
      [`The plan was switched on automatically.`, `Workspace: ${tenantName} (${tenantSlug})`, `Plan: ${PLANS[decision.planId!].name}`, decision.note, ...lines].join("\n"),
    );
  } else {
    await tellOwners(
      `Payment needs your attention: ${email || "unknown payer"}`,
      [`The plan was NOT switched on.`, `Why: ${decision.note}`, ...lines, "", "Match it to a workspace in Admin → Tenants and activate the plan by hand."].join("\n"),
    );
  }
  return new Response("OK", { status: 200 });
}
