// When does a question mean the person has outgrown their plan, and which plan fits?
//
// Pure functions with no I/O, so the rules can be tested directly. The help assistant uses the
// result in two ways: it is given to the model as facts to mention in its reply, and it is shown
// as a plan card under the answer. Nothing here is invented: every figure comes from the plan
// table that also enforces the limits, and a suggestion is made only when the question or the
// person's real usage shows a need.

import { FEATURE_LABELS, PLANS, RESOURCE_LABELS, monthlyPrice, type FeatureKey, type LimitKey, type PlanId } from "./plans";

export interface UsageRow {
  key: LimitKey;
  used: number;
  limit: number | null;
}

export interface UpgradeAdvice {
  planId: PlanId;
  planName: string;
  priceLine: string;
  points: string[];
  includes: string[];
}

/** Cheapest first. A suggestion is always a plan above the current one. */
const LADDER: PlanId[] = ["trial", "starter", "professional", "business", "managed"];

const LIMIT_TALK = /\b(limits?|maxim(?:um|a)|max|caps?|too many|exceed(?:ed|s)?|upgrade|bigger plan|higher plan|more (?:agents?|contacts?|numbers?|seats?|menus?|campaigns?)|add (?:more|another|an extra|a new|extra) |not enough|run(?:ning)? out|can'?t add|cannot add|reached|over the|outgrow)/i;
const ADDING_TALK = /\b(add|adding|import|importing|upload|uploading|create|creating|invite|inviting|another|new)\b/i;
const BUYING_TALK = /\b(buy|purchase|subscribe|subscription|which plan|what plan|best plan|right plan|recommend|pricing|prices?|cost|how much|pay for|ready to pay|go live|after (?:the )?trial|trial (?:ends|ended|expired|expires)|expired)\b/i;

const RESOURCE_WORDS: Record<LimitKey, RegExp> = {
  agents: /\b(agents?|seats?|users?|team members?|reps?|callers?|employees?|staff)\b/i,
  contacts: /\b(contacts?|leads?|prospects?|import(?:ing)?|records?)\b/i,
  campaigns: /\b(campaigns?)\b/i,
  ivrMenus: /\b(ivr|menus?)\b/i,
  phoneNumbers: /\b(phone numbers?|numbers?|dids?|caller ids?)\b/i,
  calls: /\b(calls?)\b/i,
  smsCampaigns: /\b(sms|text campaigns?|bulk text|mass text|texting)\b/i,
  recordingRetentionDays: /\b(retention|keep(?:ing)? recordings?|recordings? (?:kept|stored|history)|store recordings?)\b/i,
};

const FEATURE_WORDS: Record<FeatureKey, RegExp> = {
  powerDialer: /\bpower ?dial/i,
  numberHealth: /\bnumber health\b/i,
  numberRotation: /\b(number rotation|rotate numbers?|rotating numbers?|spam (?:flag|likely|label)|flagged as spam|scam likely)\b/i,
  missedCallTextBack: /\b(text[- ]?back|missed[- ]call text|auto(?:matic)? text)\b/i,
  callSummaries: /\b(call summar(?:y|ies)|summaris|summariz|transcri(?:pt|be|ption))\b/i,
};

const MANAGED_WORDS =
  /\b(managed (?:sip|enterprise|carrier|trunk)|(?:run|manage|handle|provide) (?:the |my |our )?(?:carrier|phone line|sip|trunk|calling)|(?:don'?t|do not|dont) (?:have|want|know) (?:a |any )?(?:sip|provider|carrier|trunk)|no (?:sip|provider|carrier)|full support|maintenance|dedicated support|white[- ]?glove|done for me|hands[- ]?off)\b/i;

/** "12", "1,200", "10k", "2.5k" as a number. */
function toNumber(raw: string): number {
  const t = raw.toLowerCase().replace(/,/g, "");
  const k = /k$/.test(t);
  const n = Number.parseFloat(t.replace(/k$/, ""));
  return Number.isFinite(n) ? Math.round(k ? n * 1000 : n) : 0;
}

/** Counts the person states outright: “we have 12 agents”, “50,000 contacts”. */
export function statedNeeds(question: string): Partial<Record<LimitKey, number>> {
  const out: Partial<Record<LimitKey, number>> = {};
  const q = question.replace(/\s+/g, " ");
  const grab = (re: RegExp, key: LimitKey, floor = 2) => {
    for (const m of q.matchAll(re)) {
      const n = toNumber(m[1] ?? "");
      if (n >= floor) out[key] = Math.max(out[key] ?? 0, n);
    }
  };
  grab(/(\d[\d,.]*k?)\s*\+?\s*(?:agents?|seats?|users?|reps?|callers?|employees|staff|team members?|salespeople|sales people)\b/gi, "agents");
  grab(/\b(\d+)(?:st|nd|rd|th)\s+(?:agent|seat|user|rep|caller|team member|employee)\b/gi, "agents");
  grab(/(\d[\d,.]*k?)\s*\+?\s*(?:contacts?|leads?|prospects?|customers?|records)\b/gi, "contacts", 50);
  grab(/(\d[\d,.]*k?)\s*\+?\s*(?:ivr(?: menus?)?|menus)\b/gi, "ivrMenus");
  const numbers = q.matchAll(/(\d[\d,.]*k?)\s*\+?\s*(?:phone numbers?|dids?|numbers)\b/gi);
  for (const m of numbers) {
    const n = toNumber(m[1] ?? "");
    // “50,000 phone numbers” is a list of people to call, not lines the business owns.
    if (n > 60) out.contacts = Math.max(out.contacts ?? 0, n);
    else if (n >= 2) out.phoneNumbers = Math.max(out.phoneNumbers ?? 0, n);
  }
  const days = q.match(/(?:keep|store|retain|retention|history)[^.?!]{0,40}?(\d+)\s*(day|days|month|months|year|years)/i);
  if (days) {
    const n = Number(days[1]);
    const unit = (days[2] ?? "").toLowerCase();
    out.recordingRetentionDays = unit.startsWith("year") ? n * 365 : unit.startsWith("month") ? n * 30 : n;
  } else if (/\b(a|one|1) year of recordings\b|\brecordings? (?:for|up to) a year\b/i.test(q)) {
    out.recordingRetentionDays = 365;
  }
  return out;
}

export function describeLimit(plan: (typeof PLANS)[PlanId], key: LimitKey): string {
  const limit = plan.limits[key];
  const label = RESOURCE_LABELS[key];
  if (key === "recordingRetentionDays") return limit === null ? "unlimited recording history" : limit === 0 ? "no recording storage" : `${limit} days of recordings`;
  if (limit === null) return `unlimited ${label.many}`;
  return `${limit.toLocaleString()} ${limit === 1 ? label.one : label.many}`;
}

function fits(planId: PlanId, needs: Partial<Record<LimitKey, number>>, features: FeatureKey[], managed: boolean): boolean {
  const plan = PLANS[planId];
  if (managed && !plan.managedSip) return false;
  for (const f of features) if (!plan.features[f]) return false;
  for (const key of Object.keys(needs) as LimitKey[]) {
    const need = needs[key] ?? 0;
    const limit = plan.limits[key];
    if (limit !== null && limit < need) return false;
  }
  return true;
}

export function priceLine(planId: PlanId): string {
  const plan = PLANS[planId];
  if (plan.priceFlatMonthly !== undefined) return `$${plan.priceFlatMonthly.toLocaleString()} a month, flat for the whole team`;
  return `$${plan.pricePerAgentMonthly} per agent per month`;
}

function includesFor(planId: PlanId): string[] {
  const plan = PLANS[planId];
  const out = [
    describeLimit(plan, "agents").replace(/^/, "up to "),
    describeLimit(plan, "contacts").replace(/^/, "up to "),
    describeLimit(plan, "phoneNumbers"),
    describeLimit(plan, "recordingRetentionDays"),
  ];
  const extras = (Object.keys(FEATURE_LABELS) as FeatureKey[]).filter((f) => plan.features[f] && f !== "powerDialer" && f !== "numberHealth").map((f) => FEATURE_LABELS[f]);
  if (extras.length) out.push(extras.join(", "));
  if (plan.managedSip) out.push("Kchel runs the carrier for you, the Windows Dialer is included, and you get full support and maintenance");
  else out.push("runs on your own carrier");
  return out;
}

/**
 * Whether this question shows a need for a bigger plan, and which plan fits it.
 *
 * `usage` is what the workspace really has. A resource counts as a pressure only when the question
 * is about it (or is a general limits or buying question) and it is at least 80 percent used.
 */
export function adviceFor(args: { planId: PlanId; usage: UsageRow[]; question: string; trialExpired?: boolean; signedIn?: boolean }): UpgradeAdvice | null {
  const { planId, usage, question } = args;
  if (planId === "managed") return null;

  const asked = statedNeeds(question);
  const limitTalk = LIMIT_TALK.test(question);
  const buyingTalk = BUYING_TALK.test(question);
  const reasons: string[] = [];
  const needs: Partial<Record<LimitKey, number>> = {};
  const current = PLANS[planId];

  const consider = (key: LimitKey, need: number, reason: string) => {
    needs[key] = Math.max(needs[key] ?? 0, need);
    if (!reasons.includes(reason)) reasons.push(reason);
  };

  // 1. Numbers the person states: more than the current plan allows.
  for (const key of Object.keys(asked) as LimitKey[]) {
    const need = asked[key] ?? 0;
    const limit = current.limits[key];
    if (limit !== null && need > limit) {
      consider(key, need, `You mentioned ${need.toLocaleString()} ${need === 1 ? RESOURCE_LABELS[key].one : RESOURCE_LABELS[key].many}, and ${current.name} includes ${describeLimit(current, key)}`);
    }
  }

  // 2. Real usage at or near a limit, when the question touches that resource or is about limits and buying generally.
  for (const row of usage) {
    if (row.limit === null || row.limit === 0 || row.key === "calls") continue;
    const pressed = row.used / row.limit >= 0.8;
    if (!pressed) continue;
    const mentioned = RESOURCE_WORDS[row.key].test(question);
    const full = row.used >= row.limit;
    // At 90 percent or more, asking how to add or import more is itself the moment the limit matters.
    const adding = row.used / row.limit >= 0.9 && ADDING_TALK.test(question);
    if (full ? mentioned || limitTalk : mentioned && (limitTalk || adding)) {
      const noun = row.limit === 1 ? RESOURCE_LABELS[row.key].one : RESOURCE_LABELS[row.key].many;
      consider(row.key, row.limit + 1, `You are using ${row.used.toLocaleString()} of ${row.limit.toLocaleString()} ${noun} on ${current.name}${full ? ", so that limit is full" : ""}`);
    }
  }

  // 3. A feature the current plan does not include.
  const features: FeatureKey[] = [];
  for (const f of Object.keys(FEATURE_WORDS) as FeatureKey[]) {
    if (FEATURE_WORDS[f].test(question) && !current.features[f]) {
      features.push(f);
      reasons.push(`${FEATURE_LABELS[f]} is not included in ${current.name}`);
    }
  }
  if (RESOURCE_WORDS.smsCampaigns.test(question) && current.limits.smsCampaigns === 0) {
    consider("smsCampaigns", 1, `SMS campaigns are not included in ${current.name}`);
  }

  // 4. Wants the carrier run for them.
  const managed = MANAGED_WORDS.test(question) && !current.managedSip;
  if (managed) reasons.push("You want Kchel to run the phone line and look after it for you");

  // 5. A plain buying question: size the plan to what they actually use today.
  if (reasons.length === 0 && buyingTalk && args.signedIn && (planId === "trial" || args.trialExpired)) {
    for (const row of usage) {
      if (row.key === "calls" || row.used === 0) continue;
      if (row.limit !== null) needs[row.key] = Math.max(needs[row.key] ?? 0, row.used);
    }
    reasons.push(args.trialExpired ? "Your trial has ended, and a plan switches your workspace back on with all your data intact" : "A plan gives you more room than the trial");
  }

  if (reasons.length === 0) return null;

  const start = LADDER.indexOf(planId);
  const target = LADDER.slice(start + 1).find((p) => fits(p, needs, features, managed)) ?? "managed";
  const stretched = !fits(target, needs, features, managed);
  const points = [...reasons];
  if (stretched) points.push("That is beyond what any standard plan covers, so Managed Enterprise with a tailored setup is the place to start: our team will size it with you");

  return { planId: target, planName: PLANS[target].name, priceLine: priceLine(target), points, includes: includesFor(target) };
}

/** What the monthly price is for a seat count, for answers like “what would 6 agents cost on Professional”. */
export function priceFor(planId: PlanId, seats: number): number {
  return monthlyPrice(PLANS[planId], seats);
}
