import { createServerFn } from "@tanstack/react-start";

import { sql } from "./db";
import { getPlan } from "./plans";
import { verifyToken } from "./tokens";
import { sendTicketStatusEmail } from "./email";

async function requireSuperAdmin(token: string) {
  const payload = await verifyToken(token);
  if (!payload || !payload.isSuperAdmin) throw new Error("Not authorized.");
  return payload;
}

/**
 * Revenue is priced per agent seat, so MRR is the plan's seat price times the
 * seats a tenant actually has. Prices come from src/backend/plans.ts — the
 * same catalog the Billing page renders and the entitlement checks enforce,
 * so the admin console can't drift from what customers are charged.
 */
function monthlyRevenue(planId: string | null | undefined, seats: number): number {
  return getPlan(planId).pricePerAgentMonthly * Math.max(0, seats);
}

function num(value: unknown): number {
  return Number(value ?? 0);
}

// ---------- platform overview ----------

export const getPlatformOverviewFn = createServerFn({ method: "POST" })
  .validator((data: { token: string }) => data)
  .handler(async ({ data }) => {
    await requireSuperAdmin(data.token);

    // `customer` excludes internal sandboxes so they can't inflate any metric.
    const totalsRows = await sql`
      with customer as (select id from tenants where is_internal = false)
      select
        (select count(*)::int from customer) as tenants,
        (select count(*)::int from tenants where is_internal = false and status = 'active') as active_tenants,
        (select count(*)::int from tenants where is_internal = false and status = 'pending') as pending_tenants,
        (select count(*)::int from tenants where is_internal = false and created_at >= date_trunc('month', now())) as new_this_month,
        (select count(*)::int from users where tenant_id in (select id from customer)) as users,
        (select count(*)::int from agents where tenant_id in (select id from customer)) as agents,
        (select count(*)::int from contacts where tenant_id in (select id from customer)) as contacts,
        (select count(*)::int from campaigns where tenant_id in (select id from customer)) as campaigns,
        (select count(*)::int from calls where tenant_id in (select id from customer)) as calls,
        (select count(*)::int from calls where tenant_id in (select id from customer) and started_at >= current_date) as calls_today,
        (select count(*)::int from calls where tenant_id in (select id from customer) and status = 'active') as calls_active,
        (select coalesce(sum(duration_seconds), 0)::int from calls where tenant_id in (select id from customer)) as talk_seconds,
        (select coalesce(sum(duration_seconds), 0)::int from calls where tenant_id in (select id from customer) and started_at >= date_trunc('month', now())) as talk_seconds_month,
        (select count(*)::int from phone_numbers where tenant_id in (select id from customer)) as numbers,
        (select count(*)::int from sms_campaigns where tenant_id in (select id from customer)) as sms_campaigns,
        (select coalesce(sum(sent), 0)::int from sms_campaigns where tenant_id in (select id from customer)) as sms_sent
    `;
    const totals = totalsRows[0] as Record<string, number>;

    // New tenants per month for the last six months, zero-filled so the chart
    // doesn't skip quiet months.
    const growth = await sql`
      select to_char(m, 'Mon') as month,
             (select count(*)::int from tenants t
               where t.is_internal = false and date_trunc('month', t.created_at) = m) as tenants
      from generate_series(
        date_trunc('month', now()) - interval '5 months',
        date_trunc('month', now()),
        interval '1 month'
      ) as m
      order by m
    `;

    // Plan mix drives MRR. Seats are counted per tenant and floored at one —
    // a paying workspace always has at least its owner on it, so counting zero
    // would understate revenue for anyone who hasn't invited a team yet.
    const planRows = await sql`
      select t.plan as plan,
             count(*)::int as tenants,
             coalesce(sum(greatest((select count(*) from agents a where a.tenant_id = t.id), 1)), 0)::int as seats
      from tenants t
      where t.status = 'active' and t.is_internal = false
      group by 1
    `;
    const plans = (planRows as { plan: string; tenants: number; seats: number }[]).map((p) => ({
      plan: getPlan(p.plan).name,
      tenants: p.tenants,
      mrr: monthlyRevenue(p.plan, p.seats),
    }));
    const mrr = plans.reduce((sum, p) => sum + p.mrr, 0);

    const largest = await sql`
      select t.id, t.name, t.workspace_slug, t.status,
             t.plan as plan,
             (select count(*)::int from users u where u.tenant_id = t.id) as users,
             (select count(*)::int from contacts c where c.tenant_id = t.id) as contacts,
             (select count(*)::int from calls c where c.tenant_id = t.id) as calls,
             (select coalesce(sum(duration_seconds), 0)::int from calls c where c.tenant_id = t.id) as talk_seconds
      from tenants t
      left join tenant_settings s on s.tenant_id = t.id
      where t.is_internal = false
      order by talk_seconds desc, contacts desc
      limit 8
    `;

    return {
      ok: true as const,
      totals: {
        tenants: num(totals["tenants"]),
        activeTenants: num(totals["active_tenants"]),
        pendingTenants: num(totals["pending_tenants"]),
        newThisMonth: num(totals["new_this_month"]),
        users: num(totals["users"]),
        agents: num(totals["agents"]),
        contacts: num(totals["contacts"]),
        campaigns: num(totals["campaigns"]),
        calls: num(totals["calls"]),
        callsToday: num(totals["calls_today"]),
        callsActive: num(totals["calls_active"]),
        talkSeconds: num(totals["talk_seconds"]),
        talkSecondsMonth: num(totals["talk_seconds_month"]),
        numbers: num(totals["numbers"]),
        smsCampaigns: num(totals["sms_campaigns"]),
        smsSent: num(totals["sms_sent"]),
        mrr,
      },
      growth: growth as unknown as { month: string; tenants: number }[],
      plans,
      largest: largest as unknown as {
        id: string;
        name: string;
        workspace_slug: string;
        status: string;
        plan: string;
        users: number;
        contacts: number;
        calls: number;
        talk_seconds: number;
      }[],
    };
  });

// ---------- revenue ----------

export const getPlatformRevenueFn = createServerFn({ method: "POST" })
  .validator((data: { token: string }) => data)
  .handler(async ({ data }) => {
    await requireSuperAdmin(data.token);

    const byTenant = await sql`
      select t.id, t.name, t.workspace_slug, t.status,
             t.plan as plan,
             greatest((select count(*)::int from agents a where a.tenant_id = t.id), 1) as seats,
             (select coalesce(sum(duration_seconds), 0)::int from calls c where c.tenant_id = t.id) as talk_seconds,
             (select coalesce(sum(sent), 0)::int from sms_campaigns sc where sc.tenant_id = t.id) as sms_sent,
             coalesce(w.balance_cents, 0)::int as wallet_cents
      from tenants t
      left join tenant_settings s on s.tenant_id = t.id
      left join tenant_wallets w on w.tenant_id = t.id
      where t.is_internal = false
      order by t.created_at desc
    `;

    const rows = (
      byTenant as unknown as {
        id: string;
        name: string;
        workspace_slug: string;
        status: string;
        plan: string;
        seats: number;
        talk_seconds: number;
        sms_sent: number;
        wallet_cents: number;
      }[]
    ).map((r) => ({
      ...r,
      plan: getPlan(r.plan).name,
      mrr: monthlyRevenue(r.plan, r.seats),
    }));

    const topups = await sql`
      select coalesce(sum(amount_cents), 0)::int as cents
      from wallet_transactions
      where kind = 'topup'
        and tenant_id in (select id from tenants where is_internal = false)
    `;

    return {
      ok: true as const,
      tenants: rows,
      mrr: rows.filter((r) => r.status === "active").reduce((s, r) => s + r.mrr, 0),
      topupCents: num((topups[0] as { cents: number }).cents),
      walletCents: rows.reduce((s, r) => s + r.wallet_cents, 0),
    };
  });

// ---------- system health ----------

export const getPlatformHealthFn = createServerFn({ method: "POST" })
  .validator((data: { token: string }) => data)
  .handler(async ({ data }) => {
    await requireSuperAdmin(data.token);

    const statsRows = await sql`
      with customer as (select id from tenants where is_internal = false)
      select
        (select count(*)::int from calls where tenant_id in (select id from customer) and status = 'active') as active_calls,
        (select count(*)::int from calls where tenant_id in (select id from customer) and started_at >= current_date) as calls_today,
        (select count(*)::int from calls where tenant_id in (select id from customer) and started_at >= current_date and status in ('failed','busy')) as failed_today,
        (select count(*)::int from sip_connections where tenant_id in (select id from customer) and status = 'active') as trunks_active,
        (select count(*)::int from sip_connections where tenant_id in (select id from customer) and status = 'failed') as trunks_failed,
        (select count(*)::int from sip_connections where tenant_id in (select id from customer)) as trunks_total
    `;
    const stats = statsRows[0] as Record<string, number>;

    // Today's calls bucketed by hour, zero-filled across the full day.
    const hourly = await sql`
      select to_char(h, 'HH24') || ':00' as hour,
             (select count(*)::int from calls c
               where date_trunc('hour', c.started_at) = h
                 and c.tenant_id in (select id from tenants where is_internal = false)) as calls
      from generate_series(current_date, current_date + interval '23 hours', interval '1 hour') as h
      order by h
    `;

    // Registration failures are the closest thing to a real platform alert
    // until carrier telemetry is connected.
    const failing = await sql`
      select s.last_error, s.updated_at, t.name as tenant_name, t.workspace_slug
      from sip_connections s
      join tenants t on t.id = s.tenant_id
      where s.status = 'failed' and s.last_error is not null and t.is_internal = false
      order by s.updated_at desc limit 20
    `;

    const callsToday = num(stats["calls_today"]);
    const failedToday = num(stats["failed_today"]);

    return {
      ok: true as const,
      activeCalls: num(stats["active_calls"]),
      callsToday,
      failedToday,
      failureRate: callsToday === 0 ? 0 : (failedToday / callsToday) * 100,
      trunksActive: num(stats["trunks_active"]),
      trunksFailed: num(stats["trunks_failed"]),
      trunksTotal: num(stats["trunks_total"]),
      hourly: hourly as unknown as { hour: string; calls: number }[],
      failures: failing as unknown as {
        last_error: string;
        updated_at: string;
        tenant_name: string;
        workspace_slug: string;
      }[],
    };
  });

// ---------- support ----------

export interface TicketRecord {
  id: string;
  ticket_ref: string;
  tenant_id: string | null;
  tenant_name: string | null;
  subject: string;
  body: string | null;
  priority: string;
  status: string;
  created_by_email: string | null;
  created_at: string;
  updated_at: string;
}

export const listTicketsFn = createServerFn({ method: "POST" })
  .validator((data: { token: string }) => data)
  .handler(async ({ data }) => {
    await requireSuperAdmin(data.token);
    const rows = await sql`
      select tk.id, tk.ticket_ref, tk.tenant_id, t.name as tenant_name, tk.subject, tk.body,
             tk.priority, tk.status, tk.created_by_email, tk.created_at, tk.updated_at
      from support_tickets tk
      left join tenants t on t.id = tk.tenant_id
      order by tk.updated_at desc
    `;
    // Tenant list powers the "raise a ticket" picker.
    const tenants = await sql`select id, name from tenants order by name`;
    return {
      ok: true as const,
      tickets: rows as unknown as TicketRecord[],
      tenants: tenants as unknown as { id: string; name: string }[],
    };
  });

export const createTicketFn = createServerFn({ method: "POST" })
  .validator(
    (data: { token: string; tenantId?: string; subject: string; body?: string; priority?: string }) =>
      data,
  )
  .handler(async ({ data }) => {
    const payload = await requireSuperAdmin(data.token);
    const subject = data.subject.trim();
    if (!subject) throw new Error("Give the ticket a subject.");

    const rows = await sql`
      insert into support_tickets (tenant_id, subject, body, priority, created_by_email)
      values (${data.tenantId ?? null}, ${subject}, ${data.body ?? null},
              ${data.priority ?? "Medium"}, ${payload.email})
      returning id
    `;
    const created = await sql`
      select tk.id, tk.ticket_ref, tk.tenant_id, t.name as tenant_name, tk.subject, tk.body,
             tk.priority, tk.status, tk.created_by_email, tk.created_at, tk.updated_at
      from support_tickets tk
      left join tenants t on t.id = tk.tenant_id
      where tk.id = ${(rows[0] as { id: string }).id}
    `;
    return { ok: true as const, ticket: created[0] as unknown as TicketRecord };
  });

export const updateTicketFn = createServerFn({ method: "POST" })
  .validator((data: { token: string; id: string; status?: string; priority?: string }) => data)
  .handler(async ({ data }) => {
    await requireSuperAdmin(data.token);

    // Capture the prior status so we only email on an actual change — not on
    // a priority edit, and not when re-selecting the status already set.
    const before = await sql`
      select status, created_by_email from support_tickets where id = ${data.id} limit 1
    `;
    const prior = before[0] as { status: string; created_by_email: string | null } | undefined;

    const updated = await sql`
      update support_tickets set
        status = coalesce(${data.status ?? null}, status),
        priority = coalesce(${data.priority ?? null}, priority),
        updated_at = now()
      where id = ${data.id}
      returning ticket_ref, subject, priority, status
    `;
    const row = updated[0] as
      | { ticket_ref: string; subject: string; priority: string; status: string }
      | undefined;

    const statusChanged = Boolean(row && prior && row.status !== prior.status);
    if (statusChanged && prior?.created_by_email) {
      await sendTicketStatusEmail(prior.created_by_email, {
        ref: row!.ticket_ref,
        subject: row!.subject,
        priority: row!.priority,
        status: row!.status,
      });
    }

    return { ok: true as const, notified: statusChanged };
  });

export const deleteTicketFn = createServerFn({ method: "POST" })
  .validator((data: { token: string; id: string }) => data)
  .handler(async ({ data }) => {
    await requireSuperAdmin(data.token);
    await sql`delete from support_tickets where id = ${data.id}`;
    return { ok: true as const };
  });
