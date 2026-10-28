// The daily sweep and the payment-side helper. The rules live in billing-lifecycle.ts.
//
// Server-only (it sends email).

import { sql } from "./db";
import { ensureSchema } from "./schema.server";
import { sendRenewalEmail } from "./email";
import { getPlan } from "./plans";
import { SEND_FROM_HOUR_UTC, day, emailDue, lifecycleOf, pretty } from "./billing-lifecycle";

const BATCH = 10;

interface Row {
  id: string;
  name: string;
  plan: string | null;
  trial_ends_at: string | null;
  paid_until: string | null;
  renewal_stage: string | null;
}

async function ownerEmails(tenantId: string): Promise<string[]> {
  const rows = await sql`
    select email from users
    where tenant_id = ${tenantId} and role = 'tenant_owner' and coalesce(status, 'active') <> 'disabled'
  `;
  return rows.map((r) => String(r["email"]));
}

/**
 * The daily check. It runs often (every few minutes) but each workspace is looked
 * at once a day and only a handful per run, so it stays well inside Cloudflare's
 * limit on outside requests per invocation, and one failed email does not stop the
 * rest or get marked as sent.
 */
export async function runRenewalSweep(options: { now?: Date; limit?: number } = {}) {
  const now = options.now ?? new Date();
  const result = { checked: 0, emailed: 0, failed: 0, skipped: "" };
  if (now.getUTCHours() < SEND_FROM_HOUR_UTC) {
    result.skipped = "too early in the day";
    return result;
  }
  await ensureSchema();
  const iso = now.toISOString();
  const today = day(now);

  const due = await sql`
    select id, name, plan, trial_ends_at, paid_until, renewal_stage from tenants
    where status = 'active'
      and (renewal_checked_on is null or renewal_checked_on < ${today}::date)
      and (
        (plan = 'trial' and trial_ends_at is not null
           and trial_ends_at between ${iso}::timestamptz - interval '8 days' and ${iso}::timestamptz + interval '3 days')
        or (plan <> 'trial' and paid_until is not null
           and paid_until between ${iso}::timestamptz - interval '16 days' and ${iso}::timestamptz + interval '8 days')
      )
    order by coalesce(paid_until, trial_ends_at) asc
    limit ${options.limit ?? BATCH}
  `;

  for (const r of due as unknown as Row[]) {
    result.checked++;
    try {
      const isTrial = getPlan(r.plan).id === "trial";
      const l = lifecycleOf({ plan: r.plan, trialEndsAt: r.trial_ends_at, paidUntil: r.paid_until }, now);
      const todo = emailDue(l, isTrial, r.renewal_stage, now);

      if (todo && l.state !== "none" && l.state !== "ok") {
        const owners = await ownerEmails(r.id);
        for (const to of owners) {
          await sendRenewalEmail(to, {
            workspaceName: r.name,
            planName: isTrial ? "free trial" : getPlan(r.plan).name,
            kind: todo.kind,
            daysLeft: l.state === "upcoming" ? l.daysLeft : 0,
            endsOn: pretty(l.endsAt),
            holdOn: l.state === "grace" ? pretty(l.holdAt) : null,
            daysToHold: l.state === "grace" ? l.daysToHold : 0,
          });
        }
        await sql`update tenants set renewal_stage = ${todo.stage}, renewal_checked_on = ${today}::date where id = ${r.id}`;
        result.emailed++;
      } else {
        await sql`update tenants set renewal_checked_on = ${today}::date where id = ${r.id}`;
      }
    } catch (err) {
      // Left unmarked, so the next run tries this workspace again.
      result.failed++;
      console.error("[renewals] could not process", r.id, err);
    }
  }
  if (result.checked > 0) console.log(`[renewals] checked ${result.checked}, emailed ${result.emailed}, failed ${result.failed}`);
  return result;
}

/** Called when a payment is confirmed or an owner activates a plan: extends the paid period and clears the reminder state. */
export async function extendPaidPeriod(tenantId: string, interval: "monthly" | "annual", months?: number): Promise<void> {
  const addMonths = months ?? (interval === "annual" ? 12 : 1);
  await sql`
    update tenants set
      paid_until = greatest(now(), coalesce(paid_until, now())) + (${addMonths} || ' months')::interval,
      renewal_stage = null, renewal_checked_on = null
    where id = ${tenantId}
  `;
}
