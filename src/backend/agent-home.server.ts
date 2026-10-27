import { createServerFn } from "@tanstack/react-start";

// The agent's own landing page: today's numbers, what's due, what's unread.

import { sql } from "./db";
import { ensureSchema } from "./schema.server";
import { requireAgent, touchSeen } from "./access.server";
import type { AgentPermissions } from "./permissions";

export interface AgentHome {
  workspaceName: string;
  agentName: string;
  email: string;
  permissions: AgentPermissions;
  today: { calls: number; connected: number; talkSeconds: number };
  month: { calls: number; connected: number; talkSeconds: number };
  tasks: { open: number; overdue: number; dueToday: number };
  upcoming: { id: string; title: string; priority: string; status: string; due_at: string | null; overdue: boolean }[];
  unreadMessages: number;
  unreadNotifications: number;
}

export async function getAgentHome(data: { token: string }) {
  const agent = await requireAgent(data.token);
  await ensureSchema();
  await touchSeen(agent.userId);

  const [info, today, month, tasks, upcoming, messages, notes] = await Promise.all([
    sql`
      select t.name as workspace_name, a.name as agent_name
      from tenants t left join agents a on a.tenant_id = t.id and a.email = ${agent.email}
      where t.id = ${agent.tenantId} limit 1
    `,
    sql`
      select count(*)::int as calls, count(*) filter (where answered_at is not null)::int as connected,
             coalesce(sum(duration_seconds), 0)::int as talk
      from calls where tenant_id = ${agent.tenantId} and agent_email = ${agent.email} and started_at >= current_date
    `,
    sql`
      select count(*)::int as calls, count(*) filter (where answered_at is not null)::int as connected,
             coalesce(sum(duration_seconds), 0)::int as talk
      from calls where tenant_id = ${agent.tenantId} and agent_email = ${agent.email}
        and started_at >= date_trunc('month', now())
    `,
    sql`
      select count(*)::int as open,
             count(*) filter (where due_at is not null and due_at < now())::int as overdue,
             count(*) filter (where due_at::date = current_date)::int as due_today
      from agent_tasks where assignee_id = ${agent.userId} and status <> 'Done'
    `,
    sql`
      select id, title, priority, status, due_at, (due_at is not null and due_at < now()) as overdue
      from agent_tasks where assignee_id = ${agent.userId} and status <> 'Done'
      order by due_at asc nulls last, created_at desc limit 5
    `,
    sql`select count(*)::int as n from team_messages where agent_user_id = ${agent.userId} and sender_role = 'admin' and read_at is null`,
    sql`select count(*)::int as n from notifications where user_id = ${agent.userId} and read_at is null`,
  ]);

  const i = info[0] as { workspace_name: string; agent_name: string | null } | undefined;
  const c = (r: Record<string, unknown>[]) => {
    const row = (r[0] ?? {}) as { calls?: number; connected?: number; talk?: number };
    return { calls: Number(row.calls ?? 0), connected: Number(row.connected ?? 0), talkSeconds: Number(row.talk ?? 0) };
  };
  const t = (tasks[0] ?? {}) as { open?: number; overdue?: number; due_today?: number };

  const home: AgentHome = {
    workspaceName: i?.workspace_name ?? "Your workspace",
    agentName: i?.agent_name ?? agent.email,
    email: agent.email,
    permissions: agent.permissions,
    today: c(today),
    month: c(month),
    tasks: { open: Number(t.open ?? 0), overdue: Number(t.overdue ?? 0), dueToday: Number(t.due_today ?? 0) },
    upcoming: upcoming as unknown as AgentHome["upcoming"],
    unreadMessages: Number((messages[0] as { n?: number } | undefined)?.n ?? 0),
    unreadNotifications: Number((notes[0] as { n?: number } | undefined)?.n ?? 0),
  };
  return { ok: true as const, home };
}

export const getAgentHomeFn = createServerFn({ method: "POST" })
  .validator((data: Parameters<typeof getAgentHome>[0]) => data)
  .handler(async ({ data }) => getAgentHome(data));

