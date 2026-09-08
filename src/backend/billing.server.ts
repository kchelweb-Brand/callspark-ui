import { createServerFn } from "@tanstack/react-start";

import { sql } from "./db";
import { verifyToken } from "./tokens";
import { getUsageSummary } from "./entitlements";
import { PLANS, getPlan, isPlanId, type PlanId } from "./plans";

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
