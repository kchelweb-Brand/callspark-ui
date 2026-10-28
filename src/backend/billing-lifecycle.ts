// What happens as a plan runs out, and the daily check that acts on it.
//
//   Paid plan, with a "paid until" date:
//     7, 3 and 1 days before   -> a reminder email
//     the day it ends          -> a daily email, with 3 days of full access left (the grace period)
//     after the grace period   -> the account is put on hold until a payment is verified,
//                                 with one final email
//   Free trial:
//     2 and 1 days before      -> a reminder email
//     the day it ends          -> on hold at once, and a daily email for 7 days
//
// "On hold" never deletes anything. It stops new work (calls, campaigns, imports,
// AI) and leaves sign-in, Billing, Support and the data open, so a customer can
// always get back in to renew. A paid plan with no "paid until" date never
// expires: that is how plans activated before this existed keep working.
//
// The decision is a pure function of dates, so the website, the checks that guard
// actions and the daily sweep all agree. Pure: no database, no email, so anything can import it.

import { getPlan } from "./plans";
import type { RenewalKind } from "./email";

/** Days after a paid plan ends before the account is put on hold. */
export const GRACE_DAYS = 3;
/** How long a lapsed trial keeps getting a daily email. */
export const TRIAL_FOLLOWUP_DAYS = 7;
const PAID_REMINDERS = [7, 3, 1];
const TRIAL_REMINDERS = [2, 1];
/** Reminders go out from this UTC hour, so they land in the morning for most customers. */
export const SEND_FROM_HOUR_UTC = 8;

const DAY = 86_400_000;

export type Lifecycle =
  | { state: "none" }
  | { state: "ok"; endsAt: Date; daysLeft: number }
  | { state: "upcoming"; endsAt: Date; daysLeft: number }
  | { state: "grace"; endsAt: Date; holdAt: Date; daysToHold: number }
  | { state: "hold"; endsAt: Date; since: Date; reason: "trial_ended" | "plan_expired" };

function asDate(v: string | Date | null | undefined): Date | null {
  if (!v) return null;
  const d = v instanceof Date ? v : new Date(v);
  return Number.isFinite(d.getTime()) ? d : null;
}

const daysBetween = (later: Date, earlier: Date) => Math.ceil((later.getTime() - earlier.getTime()) / DAY);

export function lifecycleOf(
  input: { plan: string | null | undefined; trialEndsAt?: string | Date | null; paidUntil?: string | Date | null },
  now: Date = new Date(),
): Lifecycle {
  const planId = getPlan(input.plan).id;

  if (planId === "trial") {
    const ends = asDate(input.trialEndsAt);
    if (!ends) return { state: "none" };
    if (now.getTime() > ends.getTime()) return { state: "hold", endsAt: ends, since: ends, reason: "trial_ended" };
    const daysLeft = daysBetween(ends, now);
    return daysLeft <= TRIAL_REMINDERS[0]! ? { state: "upcoming", endsAt: ends, daysLeft } : { state: "ok", endsAt: ends, daysLeft };
  }

  const ends = asDate(input.paidUntil);
  if (!ends) return { state: "none" };
  if (now.getTime() <= ends.getTime()) {
    const daysLeft = daysBetween(ends, now);
    return daysLeft <= PAID_REMINDERS[0]! ? { state: "upcoming", endsAt: ends, daysLeft } : { state: "ok", endsAt: ends, daysLeft };
  }
  const holdAt = new Date(ends.getTime() + GRACE_DAYS * DAY);
  if (now.getTime() <= holdAt.getTime()) return { state: "grace", endsAt: ends, holdAt, daysToHold: daysBetween(holdAt, now) };
  return { state: "hold", endsAt: ends, since: holdAt, reason: "plan_expired" };
}

export function isOnHold(l: Lifecycle): boolean {
  return l.state === "hold";
}

export const day = (d: Date) => d.toISOString().slice(0, 10);
export const pretty = (d: Date) => d.toLocaleDateString("en-US", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });

/** The short notice shown in the app's notification bell and as a desktop pop-up. */
export function renewalNotice(
  kind: RenewalKind,
  d: { planName: string; daysLeft: number; daysToHold: number; endsOn: string; holdOn: string | null },
): { title: string; body: string } {
  const days = (n: number) => `${n} day${n === 1 ? "" : "s"}`;
  const trial = d.planName === "free trial";
  const label = trial ? "free trial" : `${d.planName} plan`;
  switch (kind) {
    case "ending":
    case "trial_ending":
      return { title: `Your ${label} ends in ${days(d.daysLeft)}`, body: `It ends on ${d.endsOn}. Renew in Billing so nothing is interrupted.` };
    case "grace":
      return { title: `Your plan has ended: renew within ${days(d.daysToHold)}`, body: `Renew by ${d.holdOn} or the account is put on hold.` };
    case "hold":
      return { title: "Your account is on hold", body: "Renew in Billing to start working again. Your data is safe." };
    default:
      return { title: "Your free trial has ended", body: "Choose a plan in Billing to pick up where you left off." };
  }
}

/** The email owed to this workspace today, if any, and the stage that records it was sent. */
export function emailDue(l: Lifecycle, isTrial: boolean, stage: string | null, now: Date): { kind: RenewalKind; stage: string } | null {
  const today = day(now);
  switch (l.state) {
    case "upcoming": {
      const reminders = isTrial ? TRIAL_REMINDERS : PAID_REMINDERS;
      if (!reminders.includes(l.daysLeft)) return null;
      const mark = `up${l.daysLeft}:${day(l.endsAt)}`;
      return stage === mark ? null : { kind: isTrial ? "trial_ending" : "ending", stage: mark };
    }
    case "grace":
      return { kind: "grace", stage: `grace:${day(l.endsAt)}:${today}` };
    case "hold": {
      if (isTrial) {
        // A daily nudge for a week after the trial, then silence.
        if (now.getTime() - l.since.getTime() > TRIAL_FOLLOWUP_DAYS * DAY) return null;
        return { kind: "trial_ended", stage: `trial:${day(l.endsAt)}:${today}` };
      }
      const mark = `hold:${day(l.endsAt)}`;
      // The hold notice is sent once, and only while it is news.
      if (stage === mark || now.getTime() - l.since.getTime() > 3 * DAY) return null;
      return { kind: "hold", stage: mark };
    }
    default:
      return null;
  }
}
