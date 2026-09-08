import { createServerFn } from "@tanstack/react-start";

import { sql, sqlQuery } from "./db";
import { verifyToken } from "./tokens";

async function requireTenant(token: string): Promise<string> {
  const payload = await verifyToken(token);
  if (!payload || !payload.tenantId) throw new Error("Not signed in.");
  return payload.tenantId;
}

function num(v: unknown): number {
  return Number(v ?? 0);
}

/** Range keys the analytics screen offers, mapped to a day count. */
const RANGE_DAYS: Record<string, number> = { "7d": 7, "30d": 30, "90d": 90 };

// ---------- tenant overview ----------

export const getOverviewFn = createServerFn({ method: "POST" })
  .validator((data: { token: string }) => data)
  .handler(async ({ data }) => {
    const tenantId = await requireTenant(data.token);

    const statRows = await sql`
      select
        (select count(*)::int from calls
          where tenant_id = ${tenantId} and started_at >= current_date) as calls_today,
        (select count(*)::int from calls
          where tenant_id = ${tenantId} and started_at >= current_date and answered_at is not null) as connected_today,
        (select count(*)::int from calls
          where tenant_id = ${tenantId} and status = 'active') as calls_active,
        (select count(*)::int from agents where tenant_id = ${tenantId}) as agents_total,
        (select count(*)::int from agents
          where tenant_id = ${tenantId} and status <> 'Offline') as agents_online,
        (select coalesce(sum(duration_seconds), 0)::int from calls
          where tenant_id = ${tenantId} and started_at >= date_trunc('month', now())) as talk_seconds_month,
        (select coalesce(sum(sent), 0)::int from sms_campaigns
          where tenant_id = ${tenantId}) as sms_sent,
        (select count(*)::int from campaigns
          where tenant_id = ${tenantId} and status = 'Active') as campaigns_active
    `;
    const s = statRows[0] as Record<string, number>;

    // Last 7 days, zero-filled so the chart keeps a stable shape on quiet days.
    const volume = await sql`
      select to_char(d, 'Dy') as day,
             (select count(*)::int from calls c
               where c.tenant_id = ${tenantId} and date_trunc('day', c.started_at) = d) as calls,
             (select count(*)::int from calls c
               where c.tenant_id = ${tenantId} and date_trunc('day', c.started_at) = d
                 and c.answered_at is not null) as connected
      from generate_series(current_date - interval '6 days', current_date, interval '1 day') as d
      order by d
    `;

    // Recent calls double as the activity feed — the only real events we have.
    const activity = await sql`
      select c.id, c.direction, c.status, c.outcome, c.started_at,
             c.to_number, c.from_number, c.agent_email,
             coalesce(ct.company, ct.person) as contact_name
      from calls c
      left join contacts ct on ct.id = c.contact_id
      where c.tenant_id = ${tenantId}
      order by c.started_at desc limit 8
    `;

    const callsToday = num(s["calls_today"]);
    const connectedToday = num(s["connected_today"]);

    return {
      ok: true as const,
      callsToday,
      connectedToday,
      connectRate: callsToday === 0 ? null : (connectedToday / callsToday) * 100,
      callsActive: num(s["calls_active"]),
      agentsTotal: num(s["agents_total"]),
      agentsOnline: num(s["agents_online"]),
      talkSecondsMonth: num(s["talk_seconds_month"]),
      smsSent: num(s["sms_sent"]),
      campaignsActive: num(s["campaigns_active"]),
      volume: volume as unknown as { day: string; calls: number; connected: number }[],
      activity: activity as unknown as {
        id: string;
        direction: string;
        status: string;
        outcome: string | null;
        started_at: string;
        to_number: string | null;
        from_number: string | null;
        agent_email: string | null;
        contact_name: string | null;
      }[],
    };
  });

// ---------- analytics ----------

export const getAnalyticsFn = createServerFn({ method: "POST" })
  .validator((data: { token: string; range?: string }) => data)
  .handler(async ({ data }) => {
    const tenantId = await requireTenant(data.token);
    const days = RANGE_DAYS[data.range ?? "7d"] ?? 7;

    const totalRows = await sqlQuery(
      `select
         count(*)::int as dials,
         count(*) filter (where answered_at is not null)::int as connected,
         coalesce(avg(duration_seconds) filter (where answered_at is not null), 0)::int as avg_handle
       from calls
       where tenant_id = $1 and started_at >= current_date - ($2::int - 1) * interval '1 day'`,
      [tenantId, days],
    );
    const t = totalRows[0] as Record<string, number>;

    const outcomes = await sqlQuery(
      `select coalesce(outcome, status) as name, count(*)::int as value
       from calls
       where tenant_id = $1 and started_at >= current_date - ($2::int - 1) * interval '1 day'
       group by 1 order by value desc`,
      [tenantId, days],
    );

    const hourly = await sqlQuery(
      `select lpad(h::text, 2, '0') || ':00' as hour,
              (select count(*)::int from calls c
                where c.tenant_id = $1
                  and c.started_at >= current_date - ($2::int - 1) * interval '1 day'
                  and extract(hour from c.started_at) = h) as calls
       from generate_series(0, 23) as h
       order by h`,
      [tenantId, days],
    );

    // Leaderboard joins on the agent email, which is what a call records.
    const leaderboard = await sqlQuery(
      `select a.id, a.name, a.extension,
              count(c.id)::int as calls,
              count(c.id) filter (where c.answered_at is not null)::int as connected,
              coalesce(sum(c.duration_seconds), 0)::int as talk_seconds
       from agents a
       left join calls c
         on c.agent_email = a.email
        and c.tenant_id = a.tenant_id
        and c.started_at >= current_date - ($2::int - 1) * interval '1 day'
       where a.tenant_id = $1
       group by a.id, a.name, a.extension
       order by calls desc, a.name`,
      [tenantId, days],
    );

    const dials = num(t["dials"]);
    const connected = num(t["connected"]);

    return {
      ok: true as const,
      dials,
      connected,
      connectRate: dials === 0 ? null : (connected / dials) * 100,
      avgHandleSeconds: num(t["avg_handle"]),
      outcomes: outcomes as unknown as { name: string; value: number }[],
      hourly: hourly as unknown as { hour: string; calls: number }[],
      leaderboard: (
        leaderboard as unknown as {
          id: string;
          name: string;
          extension: string;
          calls: number;
          connected: number;
          talk_seconds: number;
        }[]
      ).map((a) => ({
        ...a,
        connectRate: a.calls === 0 ? 0 : (a.connected / a.calls) * 100,
      })),
    };
  });

// ---------- live floor ----------

export const getLiveFloorFn = createServerFn({ method: "POST" })
  .validator((data: { token: string }) => data)
  .handler(async ({ data }) => {
    const tenantId = await requireTenant(data.token);

    // Each agent plus whatever call they are currently on, if any.
    const agents = await sql`
      select a.id, a.name, a.extension, a.status,
             c.id as call_id, c.to_number, c.from_number, c.direction,
             c.answered_at, c.started_at,
             coalesce(ct.company, ct.person) as contact_name
      from agents a
      left join calls c
        on c.agent_email = a.email and c.tenant_id = a.tenant_id and c.status = 'active'
      left join contacts ct on ct.id = c.contact_id
      where a.tenant_id = ${tenantId}
      order by a.name
    `;

    // Calls ringing but not yet answered — the waiting queue.
    const waiting = await sql`
      select c.id, c.from_number, c.to_number, c.direction, c.started_at
      from calls c
      where c.tenant_id = ${tenantId} and c.status = 'ringing'
      order by c.started_at
    `;

    const talk = await sql`
      select coalesce(avg(duration_seconds) filter (where answered_at is not null), 0)::int as avg
      from calls where tenant_id = ${tenantId} and started_at >= current_date
    `;

    return {
      ok: true as const,
      agents: agents as unknown as {
        id: string;
        name: string;
        extension: string;
        status: string;
        call_id: string | null;
        to_number: string | null;
        from_number: string | null;
        direction: string | null;
        answered_at: string | null;
        started_at: string | null;
        contact_name: string | null;
      }[],
      waiting: waiting as unknown as {
        id: string;
        from_number: string | null;
        to_number: string | null;
        direction: string;
        started_at: string;
      }[],
      avgTalkSeconds: num((talk[0] as { avg: number }).avg),
    };
  });

// ---------- recordings ----------

export const listRecordingsFn = createServerFn({ method: "POST" })
  .validator((data: { token: string; search?: string }) => data)
  .handler(async ({ data }) => {
    const tenantId = await requireTenant(data.token);

    const params: unknown[] = [tenantId];
    let where = "c.tenant_id = $1 and c.recording_url is not null";
    if (data.search?.trim()) {
      params.push(`%${data.search.trim()}%`);
      const p = params.length;
      where += ` and (ct.company ilike $${p} or ct.person ilike $${p} or c.to_number ilike $${p} or c.from_number ilike $${p})`;
    }

    const rows = await sqlQuery(
      `select c.id, c.recording_url, c.recording_seconds, c.duration_seconds,
              c.started_at, c.agent_email, c.to_number, c.from_number, c.direction,
              c.outcome, coalesce(ct.company, ct.person) as contact_name
       from calls c
       left join contacts ct on ct.id = c.contact_id
       where ${where}
       order by c.started_at desc
       limit 100`,
      params,
    );

    // Total completed calls tells the user whether "no recordings" means
    // "no calls yet" or "calls happened but were not recorded".
    const completed = await sql`
      select count(*)::int as n from calls
      where tenant_id = ${tenantId} and status = 'completed'
    `;

    return {
      ok: true as const,
      recordings: rows as unknown as {
        id: string;
        recording_url: string;
        recording_seconds: number | null;
        duration_seconds: number | null;
        started_at: string;
        agent_email: string | null;
        to_number: string | null;
        from_number: string | null;
        direction: string;
        outcome: string | null;
        contact_name: string | null;
      }[],
      completedCalls: num((completed[0] as { n: number }).n),
    };
  });
