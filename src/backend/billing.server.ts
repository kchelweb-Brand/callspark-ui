import { createServerFn } from "@tanstack/react-start";

import { sql } from "./db";
import { verifyToken } from "./tokens";
import { getUsageSummary } from "./entitlements";
import { PLANS, getPlan, isPlanId, type PlanId } from "./plans";
import { checkoutFor } from "./payments.server";
import { extendPaidPeriod } from "./billing-lifecycle.server";
import type { Lifecycle } from "./billing-lifecycle";
import { sendAccountActivatedEmail } from "./email";
import { createMyTicket } from "./workspace.server";

async function requireTenant(token: string): Promise<string> {
  const payload = await verifyToken(token);
  if (!payload || !payload.tenantId) throw new Error("Not signed in.");
  return payload.tenantId;
}

async function requireSuperAdmin(token: string) {
  const payload = await verifyToken(token);
  if (!payload || !payload.isSuperAdmin) throw new Error("Not authorized.");
  return payload;
}

/** The catalog, flattened for rendering. Safe for anyone to read — it's pricing. */
export async function listPlans(data: { token?: string }) {
  // Prices depend on where the customer is, so the payment links are chosen per signed-in workspace.
  const signedIn = data.token ? await verifyToken(data.token) : null;
  const { region, options } = await checkoutFor(signedIn?.tenantId ?? null);
  return ({
    ok: true as const,
    region,
    plans: Object.values(PLANS).map((p) => ({
      id: p.id,
      name: p.name,
      price: p.pricePerAgentMonthly,
      // Null on per-seat plans, so the UI can tell the two models apart.
      priceFlatMonthly: p.priceFlatMonthly ?? null,
      blurb: p.blurb,
      managedSip: p.managedSip,
      limits: p.limits,
      features: p.features,
    })),
    // Seat tiers a customer can actually pay for. Managed has none — it's
    // quoted, not self-serve, until the carrier side is approved.
    checkout: options,
  }); }

export const listPlansFn = createServerFn({ method: "POST" })
  .validator((data: Parameters<typeof listPlans>[0]) => data)
  .handler(async ({ data }) => listPlans(data));

/**
 * A customer asking for a plan that has no self-serve payment link (Business,
 * Managed Enterprise). It lands in the support inbox as a high-priority thread
 * so the conversation about price and payment happens where it can be answered.
 */
export async function requestPlanUpgrade(data: { token: string; planId: string }) {
  const payload = await verifyToken(data.token);
  if (!payload || !payload.tenantId) throw new Error("Not signed in.");
  if (!isPlanId(data.planId) || data.planId === "trial") throw new Error("Choose a plan to upgrade to.");
  const plan = getPlan(data.planId);

  const subject = `Upgrade request: ${plan.name}`;
  const existing = await sql`
    select ticket_ref from support_tickets
    where tenant_id = ${payload.tenantId} and subject = ${subject} and status <> 'Resolved' limit 1
  `;
  if (existing.length > 0) {
    return { ok: true as const, ticketRef: (existing[0] as { ticket_ref: string }).ticket_ref, alreadyRequested: true };
  }

  const price =
    plan.priceFlatMonthly !== undefined
      ? `$${plan.priceFlatMonthly.toLocaleString()}/month flat`
      : `$${plan.pricePerAgentMonthly}/agent/month`;
  const result = await createMyTicket({
    token: data.token,
    subject,
    priority: "High",
    body: `We'd like to move to the ${plan.name} plan (${price}). Please send the payment link and let us know the next steps.`,
  });
  return { ok: true as const, ticketRef: result.ticket.ticket_ref, alreadyRequested: false };
}

export const requestPlanUpgradeFn = createServerFn({ method: "POST" })
  .validator((data: Parameters<typeof requestPlanUpgrade>[0]) => data)
  .handler(async ({ data }) => requestPlanUpgrade(data));

/** How close the plan is to ending, in plain values the browser can show. */
function renewalView(l: Lifecycle) {
  const iso = (d: Date) => d.toISOString();
  return {
    state: l.state,
    endsAt: "endsAt" in l ? iso(l.endsAt) : null,
    holdAt: l.state === "grace" ? iso(l.holdAt) : null,
    daysLeft: l.state === "upcoming" || l.state === "ok" ? l.daysLeft : null,
    daysToHold: l.state === "grace" ? l.daysToHold : null,
    reason: l.state === "hold" ? l.reason : null,
  };
}

/** Current plan plus real usage, for the Billing page. */
export async function getPlanUsage(data: { token: string }) {
    const tenantId = await requireTenant(data.token);
    const { plan, usage } = await getUsageSummary(tenantId);

    return {
      ok: true as const,
      plan: {
        id: plan.plan.id,
        name: plan.plan.name,
        price: plan.plan.pricePerAgentMonthly,
        priceFlatMonthly: plan.plan.priceFlatMonthly ?? null,
        blurb: plan.plan.blurb,
        managedSip: plan.plan.managedSip,
        features: plan.plan.features,
      },
      trialEndsAt: plan.trialEndsAt,
      trialExpired: plan.trialExpired,
      daysRemaining: plan.daysRemaining,
      usage,
      renewal: renewalView(plan.lifecycle),
    };
  }

export const getPlanUsageFn = createServerFn({ method: "POST" })
  .validator((data: Parameters<typeof getPlanUsage>[0]) => data)
  .handler(async ({ data }) => getPlanUsage(data));

/**
 * Moves a tenant onto a plan.
 *
 * Super-admin only, and deliberately the *only* way a plan changes: letting a
 * tenant set their own would make every limit self-service. Once payments are
 * connected this is what the payment webhook calls after money clears.
 */
export const setTenantPlanFn = createServerFn({ method: "POST" })
  .validator((data: { token: string; tenantId: string; plan: string; trialDays?: number }) => data)
  .handler(async ({ data }) => {
    await requireSuperAdmin(data.token);

    if (!isPlanId(data.plan)) throw new Error(`"${data.plan}" is not a known plan.`);
    const plan = getPlan(data.plan);

    // Only a trial carries an end date; moving to a paid plan clears it so a
    // stale timestamp can't expire a paying customer.
    if (plan.id === "trial") {
      const days = data.trialDays ?? plan.trialDays ?? 7;
      await sql`
        update tenants
        set plan = ${plan.id}, trial_ends_at = now() + (${days} || ' days')::interval
        where id = ${data.tenantId}
      `;
    } else {
      await sql`
        update tenants set plan = ${plan.id}, trial_ends_at = null where id = ${data.tenantId}
      `;
    }

    return { ok: true as const, plan: plan.id as PlanId };
  });

/**
 * Activates a tenant after payment has been confirmed.
 *
 * The confirmation itself happens outside this system — an operator verifies
 * the payment in Flutterwave and then activates here. That manual step is the
 * point: nothing in this codebase can be tricked into granting a paid plan,
 * because granting one requires a human who has seen the money.
 *
 * Sets the plan, marks the tenant active, and emails the owner. Emailing is
 * best-effort — a mail failure must not leave the account unactivated, since
 * the customer has already paid.
 */
export const activateTenantFn = createServerFn({ method: "POST" })
  .validator(
    (data: { token: string; tenantId: string; plan: string; notify?: boolean; origin?: string; months?: number }) =>
      data,
  )
  .handler(async ({ data }) => {
    await requireSuperAdmin(data.token);

    if (!isPlanId(data.plan)) throw new Error(`"${data.plan}" is not a known plan.`);
    const plan = getPlan(data.plan);

    // Paid plans clear the trial clock. Activating onto a trial still needs an
    // end date — leaving it null would read as a trial that never expires.
    const trialDays = plan.id === "trial" ? (plan.trialDays ?? 7) : null;
    const updated = trialDays
      ? await sql`
          update tenants
          set plan = ${plan.id}, status = 'active',
              trial_ends_at = now() + (${trialDays} || ' days')::interval
          where id = ${data.tenantId}
          returning name, workspace_slug
        `
      : await sql`
          update tenants
          set plan = ${plan.id}, status = 'active', trial_ends_at = null
          where id = ${data.tenantId}
          returning name, workspace_slug
        `;
    const tenant = updated[0] as { name: string; workspace_slug: string } | undefined;
    if (!tenant) throw new Error("Could not find that tenant.");

    // Confirming a payment starts a paid period: a month unless told otherwise.
    // Zero means "never expires", for a plan that is not paid month by month.
    if (plan.id !== "trial") {
      const months = Math.max(0, Math.min(60, Math.round(data.months ?? 1)));
      if (months === 0) {
        await sql`update tenants set paid_until = null, renewal_stage = null, renewal_checked_on = null where id = ${data.tenantId}`;
      } else {
        await extendPaidPeriod(data.tenantId, "monthly", months);
      }
    }

    // The owner is the account that signed up; fall back to the earliest user
    // so an activation notice still reaches someone.
    const ownerRows = await sql`
      select email from users
      where tenant_id = ${data.tenantId}
      order by (role = 'tenant_owner') desc, created_at asc
      limit 1
    `;
    const ownerEmail = (ownerRows[0] as { email: string } | undefined)?.email ?? null;

    let notified = false;
    if (data.notify !== false && ownerEmail) {
      try {
        await sendAccountActivatedEmail(ownerEmail, {
          workspaceName: tenant.name,
          workspaceSlug: tenant.workspace_slug,
          planName: plan.name,
          agentLimit: plan.limits.agents,
          signInUrl: `${data.origin ?? ""}/login`,
        });
        notified = true;
      } catch (err) {
        console.error("[activate] could not email the owner", err);
      }
    }

    return { ok: true as const, plan: plan.id as PlanId, ownerEmail, notified };
  });
