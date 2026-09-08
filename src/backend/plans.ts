// What each plan is allowed to do.
//
// One source of truth for pricing and limits, kept pure so the rules can be
// exercised directly. Everything here is advertised to the customer, so it is
// also what the Billing page renders — a second hardcoded copy in the UI would
// eventually disagree with what the server actually enforces.

export type PlanId = "trial" | "starter" | "professional" | "managed";

/** `null` means unlimited — deliberately not a sentinel like -1 or 0. */
export type Limit = number | null;

export interface PlanLimits {
  agents: Limit;
  contacts: Limit;
  campaigns: Limit;
  ivrMenus: Limit;
  phoneNumbers: Limit;
  /** Outbound + inbound call records allowed for the whole plan period. */
  calls: Limit;
  smsCampaigns: Limit;
  recordingRetentionDays: Limit;
}

export interface Plan {
  id: PlanId;
  name: string;
  /** USD per agent seat per month. Zero for the trial. */
  pricePerAgentMonthly: number;
  blurb: string;
  limits: PlanLimits;
  /** Trial only: how long before it lapses. */
  trialDays?: number;
  /**
   * Whether the tenant may use a Kchel-provided trunk and be billed for
   * minutes. Everyone else brings their own carrier, which is what keeps a
   * free trial affordable — the customer pays their own call costs.
   */
  managedSip: boolean;
}

export const PLANS: Record<PlanId, Plan> = {
  trial: {
    id: "trial",
    name: "Trial",
    pricePerAgentMonthly: 0,
    blurb: "Bring your own SIP and prove it works, free for 14 days.",
    trialDays: 14,
    managedSip: false,
    limits: {
      agents: 1,
      contacts: 100,
      campaigns: 1,
      ivrMenus: 1,
      phoneNumbers: 1,
      calls: 50,
      smsCampaigns: 0,
      recordingRetentionDays: 0,
    },
  },
  starter: {
    id: "starter",
    name: "Starter",
    pricePerAgentMonthly: 29,
    blurb: "The full dialer on your own carrier.",
    managedSip: false,
    limits: {
      agents: 5,
      contacts: 10_000,
      campaigns: 10,
      ivrMenus: 5,
      phoneNumbers: 3,
      calls: null,
      smsCampaigns: 0,
      recordingRetentionDays: 30,
    },
  },
  professional: {
    id: "professional",
    name: "Professional",
    pricePerAgentMonthly: 59,
    blurb: "Campaigns, SMS and analytics for a working floor.",
    managedSip: false,
    limits: {
      agents: 25,
      contacts: 100_000,
      campaigns: null,
      ivrMenus: 25,
      phoneNumbers: 15,
      calls: null,
      smsCampaigns: null,
      recordingRetentionDays: 90,
    },
  },
  managed: {
    id: "managed",
    name: "Managed",
    pricePerAgentMonthly: 59,
    blurb: "We supply the trunk and bill your minutes.",
    managedSip: true,
    limits: {
      agents: null,
      contacts: null,
      campaigns: null,
      ivrMenus: null,
      phoneNumbers: null,
      calls: null,
      smsCampaigns: null,
      recordingRetentionDays: 365,
    },
  },
};

export const DEFAULT_PLAN: PlanId = "trial";

export function isPlanId(value: string | null | undefined): value is PlanId {
  return value === "trial" || value === "starter" || value === "professional" || value === "managed";
}

/** Never throws on unknown input — an unrecognised plan falls back to the trial. */
export function getPlan(id: string | null | undefined): Plan {
  return isPlanId(id) ? PLANS[id] : PLANS[DEFAULT_PLAN];
}

export type LimitKey = keyof PlanLimits;

/** Human names used in the messages a customer actually reads. */
export const RESOURCE_LABELS: Record<LimitKey, { one: string; many: string }> = {
  agents: { one: "agent", many: "agents" },
  contacts: { one: "contact", many: "contacts" },
  campaigns: { one: "campaign", many: "campaigns" },
  ivrMenus: { one: "IVR menu", many: "IVR menus" },
  phoneNumbers: { one: "phone number", many: "phone numbers" },
  calls: { one: "call", many: "calls" },
  smsCampaigns: { one: "SMS campaign", many: "SMS campaigns" },
  recordingRetentionDays: { one: "day of recording retention", many: "days of recording retention" },
};

export interface LimitVerdict {
  allowed: boolean;
  limit: Limit;
  current: number;
  /** Populated only when blocked — phrased for the person who hit it. */
  message?: string;
}

/**
 * Whether `adding` more of a resource stays within plan.
 *
 * Being over the limit already (after a downgrade, say) blocks *new* additions
 * but never implies anything should be removed. Deleting a customer's data
 * because they changed plan would be indefensible; refusing to add more is
 * the honest response.
 */
export function checkLimit(
  plan: Plan,
  key: LimitKey,
  current: number,
  adding = 1,
): LimitVerdict {
  const limit = plan.limits[key];
  if (limit === null) return { allowed: true, limit, current };

  if (current + adding <= limit) return { allowed: true, limit, current };

  const label = RESOURCE_LABELS[key];
  const noun = limit === 1 ? label.one : label.many;

  const message =
    limit === 0
      ? `${label.many.replace(/^./, (c) => c.toUpperCase())} aren't included in the ${plan.name} plan. Upgrade to use them.`
      : current >= limit
        ? `Your ${plan.name} plan includes ${limit} ${noun} and you're using ${current}. Upgrade to add more.`
        : `That would exceed your ${plan.name} plan's limit of ${limit} ${noun} — you're using ${current} and adding ${adding}.`;

  return { allowed: false, limit, current, message };
}

/** Whether a trial has lapsed. Non-trial plans never expire this way. */
export function isTrialExpired(
  planId: string | null | undefined,
  trialEndsAt: string | Date | null | undefined,
  now: Date = new Date(),
): boolean {
  if (getPlan(planId).id !== "trial") return false;
  // A trial with no end date recorded is treated as active — locking someone
  // out because of a missing timestamp is the wrong way to fail.
  if (!trialEndsAt) return false;
  const ends = trialEndsAt instanceof Date ? trialEndsAt : new Date(trialEndsAt);
  return Number.isFinite(ends.getTime()) && ends.getTime() < now.getTime();
}

/** Whole days left in a trial, floored at zero. Null when not on a trial. */
export function trialDaysRemaining(
  planId: string | null | undefined,
  trialEndsAt: string | Date | null | undefined,
  now: Date = new Date(),
): number | null {
  if (getPlan(planId).id !== "trial" || !trialEndsAt) return null;
  const ends = trialEndsAt instanceof Date ? trialEndsAt : new Date(trialEndsAt);
  if (!Number.isFinite(ends.getTime())) return null;
  return Math.max(0, Math.ceil((ends.getTime() - now.getTime()) / 86_400_000));
}
