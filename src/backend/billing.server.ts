import { createServerFn } from "@tanstack/react-start";

import { sql } from "./db";
import { verifyToken } from "./tokens";
import { getUsageSummary } from "./entitlements";
import { CHECKOUT_OPTIONS, PLANS, getPlan, isPlanId, type PlanId } from "./plans";
import { sendAccountActivatedEmail } from "./email";

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
export const listPlansFn = createServerFn({ method: "POST" })
  .validator((_data: Record<string, never>) => _data)
  .handler(async () => ({
    ok: true as const,
    plans: Object.values(PLANS).map((p) => ({
      id: p.id,
      name: p.name,
      price: p.pricePerAgentMonthly,
      blurb: p.blurb,
      managedSip: p.managedSip,
      limits: p.limits,
    })),
    // Seat tiers a customer can actually pay for. Managed has none — it's
    // quoted, not self-serve, until the carrier side is approved.
    checkout: CHECKOUT_OPTIONS,
  }));

/** Current plan plus real usage, for the Billing page. */
export const getPlanUsageFn = createServerFn({ method: "POST" })
  .validator((data: { token: string }) => data)
  .handler(async ({ data }) => {
    const tenantId = await requireTenant(data.token);
    const { plan, usage } = await getUsageSummary(tenantId);

    return {
      ok: true as const,
      plan: {
        id: plan.plan.id,
        name: plan.plan.name,
        price: plan.plan.pricePerAgentMonthly,
        blurb: plan.plan.blurb,
        managedSip: plan.plan.managedSip,
      },
      trialEndsAt: plan.trialEndsAt,
      trialExpired: plan.trialExpired,
      daysRemaining: plan.daysRemaining,
      usage,
    };
  });

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
      const days = data.trialDays ?? plan.trialDays ?? 14;
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
    (data: { token: string; tenantId: string; plan: string; notify?: boolean; origin?: string }) =>
      data,
  )
  .handler(async ({ data }) => {
    await requireSuperAdmin(data.token);

    if (!isPlanId(data.plan)) throw new Error(`"${data.plan}" is not a known plan.`);
    const plan = getPlan(data.plan);

    // Paid plans clear the trial clock. Activating onto a trial still needs an
    // end date — leaving it null would read as a trial that never expires.
    const trialDays = plan.id === "trial" ? (plan.trialDays ?? 14) : null;
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
