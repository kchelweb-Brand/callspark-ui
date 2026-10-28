// The daily sweep and the payment-side helper. The rules live in billing-lifecycle.ts.
//
// Server-only (it sends email).

import { sql, sqlQuery } from "./db";
import { ensureSchema } from "./schema.server";
import { sendRenewalEmail } from "./email";
import { getPlan } from "./plans";
import { SEND_FROM_HOUR_UTC, day, emailDue, lifecycleOf, pretty, renewalNotice } from "./billing-lifecycle";

// Each workspace costs a handful of database and email requests, and one scheduled
// run may make about 50 in total, so a run takes only a few.
const BATCH = 6;
const MAX_OWNERS = 5;

interface Row {
  id: string;
  name: string;
  plan: string | null;
  trial_ends_at: string | null;
  paid_until: string | null;
  renewal_stage: string | null;
}

async function owners(tenantId: string): Promise<{ id: string; email: string }[]> {
  const rows = await sql`
    select id, email from users
    where tenant_id = ${tenantId} and role = 'tenant_owner' and coalesce(status, 'active') <> 'disabled'
    order by created_at asc limit ${MAX_OWNERS}
  `;
  return rows.map((r) => ({ id: String(r["id"]), email: String(r["email"]) }));
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
    where status = 'active' and held_at is null
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
        const who = await owners(r.id);
        const detail = {
          planName: isTrial ? "free trial" : getPlan(r.plan).name,
          daysLeft: l.state === "upcoming" ? l.daysLeft : 0,
          endsOn: pretty(l.endsAt),
          holdOn: l.state === "grace" ? pretty(l.holdAt) : null,
          daysToHold: l.state === "grace" ? l.daysToHold : 0,
        };
        for (const o of who) await sendRenewalEmail(o.email, { workspaceName: r.name, kind: todo.kind, ...detail });

        // The same news, in the app: the bell, and the pop-up in the Windows app. One
        // statement for every owner. It follows the emails, so a failed email is retried
        // without the notice having been posted twice.
        if (who.length > 0) {
          const notice = renewalNotice(todo.kind, detail);
          await sqlQuery(
            `insert into notifications (user_id, tenant_id, kind, title, body, link)
             select unnest($1::uuid[]), $2::uuid, 'system', $3, $4, '/billing'`,
            [who.map((o) => o.id), r.id, notice.title, notice.body],
          );
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
      renewal_stage = null, renewal_checked_on = null, held_at = null, held_notified_at = null
    where id = ${tenantId}
  `;
}

/** Tells the owners their account is on hold: an email each, and a notice in the app. */
async function announceHold(tenantId: string, name: string, planId: string | null, endsOn: string): Promise<number> {
  const who = await owners(tenantId);
  const isTrial = getPlan(planId).id === "trial";
  const detail = { planName: isTrial ? "free trial" : getPlan(planId).name, daysLeft: 0, endsOn, holdOn: null, daysToHold: 0 };
  for (const o of who) await sendRenewalEmail(o.email, { workspaceName: name, kind: "held", ...detail });
  if (who.length > 0) {
    const notice = renewalNotice("held", detail);
    await sqlQuery(
      `insert into notifications (user_id, tenant_id, kind, title, body, link)
       select unnest($1::uuid[]), $2::uuid, 'system', $3, $4, '/billing'`,
      [who.map((o) => o.id), tenantId, notice.title, notice.body],
    );
  }
  return who.length;
}

/**
 * Puts an account on hold, or lifts the hold. On hold stops new work but leaves sign-in,
 * Billing and Support open, so the owner can still get in to pay. Putting on hold tells the
 * owners by email and in the app (unless told not to); a verified payment lifts it again.
 */
export async function setTenantHold(data: { tenantId: string; hold: boolean; notify?: boolean }) {
  await ensureSchema();
  if (!data.hold) {
    const lifted = await sql`update tenants set held_at = null, held_notified_at = null where id = ${data.tenantId} returning id`;
    if (lifted.length === 0) throw new Error("Could not find that tenant.");
    return { ok: true as const, held: false, notified: 0 };
  }
  const rows = await sql`
    update tenants set held_at = coalesce(held_at, now()) where id = ${data.tenantId}
    returning name, plan, paid_until, trial_ends_at
  `;
  const t = rows[0] as { name: string; plan: string | null; paid_until: string | null; trial_ends_at: string | null } | undefined;
  if (!t) throw new Error("Could not find that tenant.");

  let notified = 0;
  if (data.notify !== false) {
    const ends = new Date(String((getPlan(t.plan).id === "trial" ? t.trial_ends_at : t.paid_until) ?? new Date().toISOString()));
    notified = await announceHold(data.tenantId, t.name, t.plan, pretty(ends));
    await sql`update tenants set held_notified_at = now() where id = ${data.tenantId}`;
  }
  return { ok: true as const, held: true, notified };
}

const EXPIRED_NOT_HELD = `
  status = 'active' and held_at is null and held_notified_at is null and (
    (plan = 'trial' and trial_ends_at is not null and trial_ends_at < now())
    or (plan <> 'trial' and paid_until is not null and paid_until < now())
  )`;

/**
 * Puts every account whose plan has already expired on hold now, skipping the grace
 * period, and tells its owners. It does a few accounts per call, because one call may
 * only make about 50 outside requests, and says how many are still waiting; the admin
 * screen calls it again until none are. Accounts with no end date are never touched.
 */
export async function holdExpiredBatch(options: { limit?: number } = {}) {
  await ensureSchema();
  const limit = options.limit ?? 5;
  const rows = await sqlQuery(`select id from tenants where ${EXPIRED_NOT_HELD} order by coalesce(paid_until, trial_ends_at) asc limit $1`, [limit]);
  let processed = 0;
  let failed = 0;
  for (const r of rows) {
    try {
      await setTenantHold({ tenantId: String(r["id"]), hold: true, notify: true });
      processed++;
    } catch (err) {
      failed++;
      console.error("[hold] could not hold", r["id"], err);
      // Marked, so one bad account can't block the rest of the queue.
      await sql`update tenants set held_at = coalesce(held_at, now()), held_notified_at = now() where id = ${String(r["id"])}`;
    }
  }
  const left = await sqlQuery(`select count(*)::int as n from tenants where ${EXPIRED_NOT_HELD}`);
  return { ok: true as const, processed, failed, remaining: Number((left[0] as { n: number }).n) };
}
