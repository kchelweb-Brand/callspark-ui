// What happens every 15 minutes for voice broadcasts, on Cloudflare's schedule (see nitro-plugins/scheduled.ts).
//
// A broadcast normally keeps itself going: each finished call places the next one. Three situations leave
// nothing running to do that, so this wakes them:
//   - Scheduled: a start time the owner chose has arrived.
//   - Waiting:   calling hours have opened again, or a retry delay has run out.
//   - Stuck:     a campaign says Active but no call is in flight (a carrier report was lost).
//
// Each wake-up is small on purpose: Cloudflare caps how many outside requests one scheduled run may make.

import { env } from "./env";
import { sql } from "./db";
import { ensureSchema } from "./schema.server";
import { beginCampaign, dialNextPendingContact } from "./campaign-dialer";

/** Campaigns woken per run, and how many calls each may place, to stay inside the request budget. */
const CAMPAIGNS_PER_RUN = 2;
const CALLS_PER_WAKE = 3;
/** A call that never reported back after this long is written off, so it can't hold a campaign open forever. */
const STALLED_AFTER_MINUTES = 20;

export async function runBroadcastSweep(): Promise<{ woken: number; nudged: number; stalled: number }> {
  if (!env.signalwireProjectId || !env.signalwireApiToken || !env.signalwireSpaceName) return { woken: 0, nudged: 0, stalled: 0 };
  await ensureSchema();

  // 1. Scheduled starts and waits that have come due.
  const due = (await sql`
    select id, callback_origin from campaigns
    where mode = 'recording' and callback_origin is not null
      and ((status = 'Scheduled' and start_at <= now()) or (status = 'Waiting' and (resume_at is null or resume_at <= now())))
    order by coalesce(start_at, resume_at) asc
    limit ${CAMPAIGNS_PER_RUN}
  `) as unknown as { id: string; callback_origin: string }[];

  let woken = 0;
  for (const c of due) {
    // Claim it first, so an overlapping run can't start the same campaign twice.
    const [mine] = await sql`
      update campaigns set status = 'Active', updated_at = now()
      where id = ${c.id} and status in ('Scheduled', 'Waiting')
      returning id
    `;
    if (!mine) continue;
    try {
      await beginCampaign(c.id, c.callback_origin, CALLS_PER_WAKE);
      woken++;
    } catch (err) {
      console.error(`[broadcast-sweep] could not start ${c.id}`, err);
    }
  }

  // 2. Written off: calls whose carrier report never arrived.
  const stalledRows = await sql`
    update campaign_calls set status = 'failed', updated_at = now()
    where status = 'calling' and updated_at < now() - (${STALLED_AFTER_MINUTES}::int) * interval '1 minute'
    returning campaign_id
  `;

  // 3. Active campaigns with nothing in flight: give the chain a nudge.
  const idle = (await sql`
    select c.id, c.callback_origin from campaigns c
    where c.mode = 'recording' and c.status = 'Active' and c.callback_origin is not null
      and not exists (select 1 from campaign_calls cc where cc.campaign_id = c.id and cc.status = 'calling')
    limit ${CAMPAIGNS_PER_RUN}
  `) as unknown as { id: string; callback_origin: string }[];

  let nudged = 0;
  for (const c of idle) {
    try {
      await dialNextPendingContact(c.id, c.callback_origin);
      nudged++;
    } catch (err) {
      console.error(`[broadcast-sweep] could not nudge ${c.id}`, err);
    }
  }

  if (woken > 0 || nudged > 0 || stalledRows.length > 0) {
    console.log(`[broadcast-sweep] woke ${woken}, nudged ${nudged}, wrote off ${stalledRows.length} stalled calls`);
  }
  return { woken, nudged, stalled: stalledRows.length };
}
