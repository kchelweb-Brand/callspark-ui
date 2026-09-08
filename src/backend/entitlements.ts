// Enforcing plan limits.
//
// Every check runs on the server, inside the server function that performs the
// write. A limit enforced only in the UI is decoration: the RPC endpoints are
// reachable directly, so the gate has to sit next to the insert.

import { sql } from "./db";
import {
  checkLimit,
  getPlan,
  isTrialExpired,
  trialDaysRemaining,
  type LimitKey,
  type Plan,
} from "./plans";

export interface TenantPlan {
  plan: Plan;
  trialEndsAt: string | null;
  trialExpired: boolean;
  daysRemaining: number | null;
}

/** A blocked action. Thrown so callers surface the message verbatim. */
export class PlanLimitError extends Error {
  readonly code = "PLAN_LIMIT";
  constructor(message: string) {
    super(message);
    this.name = "PlanLimitError";
  }
}

export async function getTenantPlan(tenantId: string): Promise<TenantPlan> {
  const rows = await sql`
    select plan, trial_ends_at from tenants where id = ${tenantId} limit 1
  `;
  const row = rows[0] as { plan: string | null; trial_ends_at: string | null } | undefined;

  const plan = getPlan(row?.plan);
  const trialEndsAt = row?.trial_ends_at ?? null;

  return {
    plan,
    trialEndsAt,
    trialExpired: isTrialExpired(plan.id, trialEndsAt),
    daysRemaining: trialDaysRemaining(plan.id, trialEndsAt),
  };
}

/**
 * How much of each metered resource a tenant is currently using.
 *
 * IVR menus live inside a JSONB document rather than their own table, so the
 * count comes from the array length — the same value the Phone System page
 * shows, which is what a customer would compare against their limit.
 */
const USAGE_QUERIES: Record<LimitKey, ((tenantId: string) => Promise<number>) | null> = {
  agents: async (t) => count(await sql`select count(*)::int as n from agents where tenant_id = ${t}`),
  contacts: async (t) => count(await sql`select count(*)::int as n from contacts where tenant_id = ${t}`),
  campaigns: async (t) => count(await sql`select count(*)::int as n from campaigns where tenant_id = ${t}`),
  phoneNumbers: async (t) => count(await sql`select count(*)::int as n from phone_numbers where tenant_id = ${t}`),
  calls: async (t) => count(await sql`select count(*)::int as n from calls where tenant_id = ${t}`),
  smsCampaigns: async (t) => count(await sql`select count(*)::int as n from sms_campaigns where tenant_id = ${t}`),
  ivrMenus: async (t) =>
    count(
      await sql`
        select coalesce(jsonb_array_length(menus), 0)::int as n
        from phone_system_settings where tenant_id = ${t}
      `,
    ),
  // Not a countable resource — retention is applied when reading recordings.
  recordingRetentionDays: null,
};

function count(rows: Record<string, unknown>[]): number {
  return Number((rows[0] as { n?: number } | undefined)?.n ?? 0);
}

export async function usageFor(tenantId: string, key: LimitKey): Promise<number> {
  const query = USAGE_QUERIES[key];
  if (!query) return 0;
  return query(tenantId);
}

/**
 * Blocks the action when it would exceed the tenant's plan.
 *
 * `adding` matters for bulk paths — importing 500 contacts into a 100-contact
 * plan has to fail before the insert, not leave a partial import behind.
 */
export async function requireWithinLimit(
  tenantId: string,
  key: LimitKey,
  adding = 1,
): Promise<void> {
  const { plan } = await getTenantPlan(tenantId);
  const current = await usageFor(tenantId, key);
  const verdict = checkLimit(plan, key, current, adding);
  if (!verdict.allowed) {
    throw new PlanLimitError(verdict.message ?? "That would exceed your plan.");
  }
}

/**
 * Blocks work once a trial has lapsed.
 *
 * Reads stay open on purpose: an expired customer can still sign in, see their
 * contacts and export them. Locking people out of their own data to pressure
 * an upgrade is hostile, and it makes the eventual upgrade less likely.
 */
export async function requireActivePlan(tenantId: string): Promise<void> {
  const { plan, trialExpired } = await getTenantPlan(tenantId);
  if (trialExpired) {
    throw new PlanLimitError(
      `Your ${plan.name} has ended. Your data is safe and still exportable — upgrade to start working again.`,
    );
  }
}

/**
 * For resources saved as a whole collection (IVR menus, phone numbers) rather
 * than one row at a time.
 *
 * Crucially this allows a save that keeps the count the same or reduces it,
 * even when already over the limit. Without that escape a tenant who
 * downgraded could never delete anything — the save that removes a menu would
 * be rejected for having too many menus, trapping them permanently.
 */
export async function requireCountWithinLimit(
  tenantId: string,
  key: LimitKey,
  nextCount: number,
): Promise<void> {
  await requireActivePlan(tenantId);

  const { plan } = await getTenantPlan(tenantId);
  const limit = plan.limits[key];
  if (limit === null || nextCount <= limit) return;

  const current = await usageFor(tenantId, key);
  if (nextCount <= current) return; // cleaning up, not adding

  // Report what they have and what they're adding, not the would-be total —
  // "you're using 6" when they have 5 reads as a bug to the person seeing it.
  const verdict = checkLimit(plan, key, current, nextCount - current);
  throw new PlanLimitError(verdict.message ?? "That would exceed your plan.");
}

/** Both gates, for the common "create something new" case. */
export async function requireCanCreate(
  tenantId: string,
  key: LimitKey,
  adding = 1,
): Promise<void> {
  await requireActivePlan(tenantId);
  await requireWithinLimit(tenantId, key, adding);
}

export interface UsageSummary {
  key: LimitKey;
  label: string;
  used: number;
  limit: number | null;
}

/** Everything the Billing page needs to show usage against plan. */
export async function getUsageSummary(tenantId: string): Promise<{
  plan: TenantPlan;
  usage: UsageSummary[];
}> {
  const plan = await getTenantPlan(tenantId);
  const keys: LimitKey[] = [
    "agents",
    "contacts",
    "campaigns",
    "ivrMenus",
    "phoneNumbers",
    "calls",
    "smsCampaigns",
  ];

  const usage = await Promise.all(
    keys.map(async (key) => ({
      key,
      label: key,
      used: await usageFor(tenantId, key),
      limit: plan.plan.limits[key],
    })),
  );

  return { plan, usage };
}
