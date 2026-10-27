// Number health: how likely each outbound number is to be flagged as spam, and
// the rotation that keeps the whole pool healthy.
//
// This is built from the workspace's OWN call results — answer rate, how many
// answered calls were hung up on within seconds, carrier failures, and how many
// calls went out today. Those are the same behavioural signals the carriers'
// reputation engines score (volume, answer rate, call length), so a number that
// looks bad here is a number that is about to look bad to them. It is not a
// lookup against Hiya / First Orion / TNS; it can't see a label those services
// have already applied, and the UI says so.

import { createServerFn } from "@tanstack/react-start";

import { sql } from "./db";
import { verifyToken } from "./tokens";
import { ensureSchema } from "./schema.server";
import { requireFeature, tenantHasFeature } from "./entitlements";
import { loadAutomations } from "./automation.server";

/** Below this many outbound calls in a week there isn't enough signal to score. */
const MIN_CALLS_TO_SCORE = 10;
/** Auto-rest only fires on a real pattern, not a few unlucky calls. */
const MIN_CALLS_TO_REST = 25;
const REST_BELOW_SCORE = 45;
const REST_DAYS = 3;
/** A call answered and dropped inside this many seconds is the "spam hang-up" pattern. */
const SHORT_CALL_SECONDS = 6;

export type HealthStatus = "New" | "Healthy" | "Watch" | "At risk" | "Resting";

export interface NumberHealth {
  id: string;
  number: string;
  label: string | null;
  active: boolean;
  calls_7d: number;
  calls_today: number;
  answer_rate: number | null;
  short_call_rate: number | null;
  failed_rate: number | null;
  score: number | null;
  status: HealthStatus;
  advice: string;
  rested_until: string | null;
  rest_reason: string | null;
  over_cap: boolean;
}

async function requireTenant(token: string) {
  const payload = await verifyToken(token);
  if (!payload || !payload.tenantId) throw new Error("Not signed in.");
  return payload as typeof payload & { tenantId: string };
}

/** Pure scoring, kept separate so it can be tested without a database. */
export function scoreNumber(input: {
  calls7d: number;
  answered7d: number;
  short7d: number;
  failed7d: number;
  callsToday: number;
  dailyCap: number;
}): { score: number | null; answerRate: number | null; shortRate: number | null; failedRate: number | null } {
  const { calls7d, answered7d, short7d, failed7d, callsToday, dailyCap } = input;
  if (calls7d < MIN_CALLS_TO_SCORE) {
    return { score: null, answerRate: null, shortRate: null, failedRate: null };
  }
  const answerRate = answered7d / calls7d;
  const shortRate = answered7d > 0 ? short7d / answered7d : 0;
  const failedRate = failed7d / calls7d;

  let score = 100;
  // Cold outbound normally answers around a third of the time; far below that
  // is what spam-flagged numbers look like.
  if (answerRate < 0.35) score -= ((0.35 - answerRate) / 0.35) * 60;
  score -= shortRate * 25;
  score -= failedRate * 20;
  if (callsToday > dailyCap) score -= Math.min(20, ((callsToday - dailyCap) / dailyCap) * 20);

  return {
    score: Math.max(0, Math.min(100, Math.round(score))),
    answerRate,
    shortRate,
    failedRate,
  };
}

function adviceFor(status: HealthStatus, h: { answerRate: number | null; shortRate: number | null; overCap: boolean }): string {
  if (status === "New") return "Not enough calls yet to judge. Scores appear after about 10 outbound calls in a week.";
  if (status === "Resting") return "Paused from outbound dialing while it recovers. It still receives inbound calls.";
  if (h.overCap) return "Over today's call limit. More calls from this number today raise the chance of a spam label.";
  if (status === "Healthy") return "Looking normal. Keep daily volume steady.";
  if (h.answerRate !== null && h.answerRate < 0.2) return "Few of its calls are being answered, which is the main sign of a spam label. Spread calls across more numbers.";
  if (h.shortRate !== null && h.shortRate > 0.4) return "Many answered calls end within seconds. Check your opening line and calling times.";
  return "Slipping. Spread calls across more numbers and avoid calling the same contacts repeatedly.";
}

export async function computeNumberHealth(tenantId: string): Promise<{
  numbers: NumberHealth[];
  dailyCap: number;
  rotationOn: boolean;
}> {
  await ensureSchema();
  const automations = await loadAutomations(tenantId);
  const dailyCap = automations.numberRotation.dailyCap;

  const rows = await sql`
    select pn.id, pn.number, pn.label, pn.status as number_status, pn.rested_until, pn.rest_reason,
           count(c.id)::int as calls_7d,
           count(c.id) filter (where c.started_at >= current_date)::int as calls_today,
           count(c.id) filter (where c.answered_at is not null)::int as answered_7d,
           count(c.id) filter (where c.answered_at is not null and coalesce(c.duration_seconds, 0) < ${SHORT_CALL_SECONDS})::int as short_7d,
           count(c.id) filter (where c.status = 'failed')::int as failed_7d
    from phone_numbers pn
    left join calls c
      on c.tenant_id = pn.tenant_id
     and c.direction = 'outbound'
     and c.started_at >= now() - interval '7 days'
     and right(regexp_replace(coalesce(c.from_number, ''), '\\D', '', 'g'), 10)
         = right(regexp_replace(pn.number, '\\D', '', 'g'), 10)
    where pn.tenant_id = ${tenantId}
    group by pn.id
    order by pn.created_at
  `;

  const now = Date.now();
  const numbers: NumberHealth[] = (rows as Record<string, unknown>[]).map((r) => {
    const calls7d = Number(r["calls_7d"]);
    const callsToday = Number(r["calls_today"]);
    const s = scoreNumber({
      calls7d,
      answered7d: Number(r["answered_7d"]),
      short7d: Number(r["short_7d"]),
      failed7d: Number(r["failed_7d"]),
      callsToday,
      dailyCap,
    });
    const restedUntil = (r["rested_until"] as string | null) ?? null;
    const resting = restedUntil !== null && new Date(restedUntil).getTime() > now;
    const status: HealthStatus = resting
      ? "Resting"
      : s.score === null
        ? "New"
        : s.score >= 75
          ? "Healthy"
          : s.score >= 50
            ? "Watch"
            : "At risk";
    const overCap = callsToday >= dailyCap;
    return {
      id: r["id"] as string,
      number: r["number"] as string,
      label: (r["label"] as string | null) ?? null,
      active: (r["number_status"] as string) === "Active",
      calls_7d: calls7d,
      calls_today: callsToday,
      answer_rate: s.answerRate,
      short_call_rate: s.shortRate,
      failed_rate: s.failedRate,
      score: s.score,
      status,
      advice: adviceFor(status, { answerRate: s.answerRate, shortRate: s.shortRate, overCap }),
      rested_until: resting ? restedUntil : null,
      rest_reason: resting ? ((r["rest_reason"] as string | null) ?? null) : null,
      over_cap: overCap,
    };
  });

  return { numbers, dailyCap, rotationOn: automations.numberRotation.enabled };
}

export async function getNumberHealth(data: { token: string }) {
  const user = await requireTenant(data.token);
  await requireFeature(user.tenantId, "numberHealth");
  const result = await computeNumberHealth(user.tenantId);
  return { ok: true as const, ...result, canRotate: await tenantHasFeature(user.tenantId, "numberRotation") };
}

export async function restNumber(data: { token: string; id: string; days?: number; resume?: boolean }) {
  const user = await requireTenant(data.token);
  await requireFeature(user.tenantId, "numberRotation");
  await ensureSchema();
  if (data.resume) {
    await sql`
      update phone_numbers set rested_until = null, rest_reason = null
      where id = ${data.id} and tenant_id = ${user.tenantId}
    `;
  } else {
    const days = Math.min(30, Math.max(1, Math.round(data.days ?? REST_DAYS)));
    await sql`
      update phone_numbers
      set rested_until = now() + (${days} || ' days')::interval, rest_reason = 'Rested manually'
      where id = ${data.id} and tenant_id = ${user.tenantId}
    `;
  }
  return { ok: true as const };
}

export const getNumberHealthFn = createServerFn({ method: "POST" })
  .validator((data: Parameters<typeof getNumberHealth>[0]) => data)
  .handler(async ({ data }) => getNumberHealth(data));

export const restNumberFn = createServerFn({ method: "POST" })
  .validator((data: Parameters<typeof restNumber>[0]) => data)
  .handler(async ({ data }) => restNumber(data));

/**
 * The number an automated outbound call should go out from.
 *
 * With rotation off this is exactly what it always was: the oldest active
 * number. With rotation on it picks the active number with the fewest calls
 * today that is under the daily cap and not resting, and puts any number whose
 * scores have collapsed to rest for a few days. Null means every number is
 * capped or resting — better to pause than to keep hammering a flagged number.
 */
export async function pickOutboundNumber(tenantId: string): Promise<string | null> {
  const automations = await loadAutomations(tenantId);
  const rotating = automations.numberRotation.enabled && (await tenantHasFeature(tenantId, "numberRotation"));

  if (!rotating) {
    const rows = await sql`
      select number from phone_numbers where tenant_id = ${tenantId} and status = 'Active'
      order by created_at limit 1
    `;
    return (rows[0] as { number: string } | undefined)?.number ?? null;
  }

  const { numbers, dailyCap } = await computeNumberHealth(tenantId);

  for (const n of numbers) {
    if (n.active && n.status !== "Resting" && n.score !== null && n.score < REST_BELOW_SCORE && n.calls_7d >= MIN_CALLS_TO_REST) {
      await sql`
        update phone_numbers
        set rested_until = now() + (${REST_DAYS} || ' days')::interval,
            rest_reason = ${`Auto-rested: health score ${n.score}`}
        where id = ${n.id}
      `;
      n.status = "Resting";
    }
  }

  const usable = numbers
    .filter((n) => n.active && n.status !== "Resting" && n.calls_today < dailyCap)
    .sort((a, b) => a.calls_today - b.calls_today || (b.score ?? 100) - (a.score ?? 100));
  return usable[0]?.number ?? null;
}
