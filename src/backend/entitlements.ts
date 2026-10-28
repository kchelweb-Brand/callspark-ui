// Enforcing plan limits.
//
// Every check runs on the server, inside the server function that performs the
// write. A limit enforced only in the UI is decoration: the RPC endpoints are
// reachable directly, so the gate has to sit next to the insert.

import { sql } from "./db";
import { findAiVoice } from "./ai-agent-options";
import { ensureSchema } from "./schema.server";
import { isOnHold, lifecycleOf, type Lifecycle } from "./billing-lifecycle";
import {
  FEATURE_LABELS,
  checkLimit,
  getPlan,
  planThatIncludes,
  type FeatureKey,
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
  status: string;
  /** Where the plan is in its life: fine, ending, in its grace period, or on hold. */
  lifecycle: Lifecycle;
  /** True once a trial has ended, or a paid plan's grace period has run out. New work is refused. */
  onHold: boolean;
  paidUntil: string | null;
}

/** A blocked action. Thrown so callers surface the message verbatim. */
export class PlanLimitError extends Error {
  readonly code = "PLAN_LIMIT";
  constructor(message: string) {
    super(message);
    this.name = "PlanLimitError";
  }
}

/**
 * The plan a workspace is on, and how healthy it is.
 *
 * A lapsed trial or an unrenewed plan is "on hold", worked out from dates (see
 * billing-lifecycle.ts). The workspace is not suspended: the owner can still sign
 * in, open Billing and pay, and the checks that guard new work refuse it with a
 * clear message. A real suspension, set by a platform admin, is a different
 * thing and still locks everyone out.
 */
export async function getTenantPlan(tenantId: string): Promise<TenantPlan> {
  // paid_until is added by the one-time schema upgrade, so it must have run before it is read.
  await ensureSchema();
  const rows = await sql`
    select plan, trial_ends_at, paid_until, held_at, status from tenants where id = ${tenantId} limit 1
  `;
  const row = rows[0] as
    | { plan: string | null; trial_ends_at: string | null; paid_until: string | null; held_at: string | null; status: string | null }
    | undefined;

  const plan = getPlan(row?.plan);
  const trialEndsAt = row?.trial_ends_at ?? null;
  const trialExpired = isTrialExpired(plan.id, trialEndsAt);
  const paidUntil = row?.paid_until ?? null;
  const lifecycle = lifecycleOf({ plan: plan.id, trialEndsAt, paidUntil, heldAt: row?.held_at ?? null });

  return {
    plan,
    trialEndsAt,
    trialExpired,
    daysRemaining: trialDaysRemaining(plan.id, trialEndsAt),
    status: row?.status ?? "active",
    lifecycle,
    onHold: isOnHold(lifecycle),
    paidUntil,
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
 * Blocks new work once a trial has lapsed, inside a session that was already
 * open when it did.
 *
 * The account itself is fully suspended by now — getTenantPlan already wrote
 * that the moment it noticed — so the next sign-in is refused outright. This
 * only covers the gap before that: a tab left open across the expiry moment
 * can still read and export what's already there, just not create anything
 * new, until the token itself runs out or they sign in again and find the
 * door shut.
 */
export async function requireActivePlan(tenantId: string): Promise<void> {
  const { plan, onHold, lifecycle } = await getTenantPlan(tenantId);
  if (onHold) {
    throw new PlanLimitError(
      lifecycle.state === "hold" && lifecycle.reason !== "trial_ended"
        ? `Your ${plan.name} plan ended and the account is on hold. Renew it in Billing to start working again. Your data is safe.`
        : `Your ${plan.name} has ended. Your data is safe and still exportable. Choose a plan in Billing to start working again.`,
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

/** Whether the tenant's plan includes a feature. Never throws. */
export async function tenantHasFeature(tenantId: string, feature: FeatureKey): Promise<boolean> {
  const { plan, onHold } = await getTenantPlan(tenantId);
  return !onHold && plan.features[feature];
}

/** Blocks a feature the plan doesn't include, naming the plan that does. */
export async function requireFeature(tenantId: string, feature: FeatureKey): Promise<void> {
  const { plan } = await getTenantPlan(tenantId);
  if (plan.features[feature]) return;
  const needed = planThatIncludes(feature);
  throw new PlanLimitError(
    `${FEATURE_LABELS[feature]} isn't included in the ${plan.name} plan. Upgrade to ${needed.name} to use it.`,
  );
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

// ---------------------------------------------------------------------------
// AI voices
// ---------------------------------------------------------------------------

/** Premium voices cost the most per minute, so they come with the plans that include them. */
export async function requirePremiumVoice(tenantId: string, voiceId: string): Promise<void> {
  if (findAiVoice(voiceId).tier === "premium") await requireFeature(tenantId, "premiumVoices");
}

/**
 * The voice a call will really use. A plan that no longer includes premium
 * voices (after a downgrade, or a lapsed trial) falls back to a standard one
 * instead of dropping the call.
 */
export async function voiceForPlan(tenantId: string, voiceId: string): Promise<string> {
  if (findAiVoice(voiceId).tier !== "premium") return voiceId;
  return (await tenantHasFeature(tenantId, "premiumVoices")) ? voiceId : "ella";
}
