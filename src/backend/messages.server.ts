import { createServerFn } from "@tanstack/react-start";

// Direct messages between an owner and each of their agents.
//
// One conversation per agent. The owners of a workspace share the owner side of
// it, so whoever is around can answer, and an agent can only ever read and write
// their own conversation. Messages can carry a task, shown as a card in the chat.

import { sql, sqlQuery } from "./db";
import { ensureSchema } from "./schema.server";
import { ownersOf, requireMember } from "./access.server";
import { notify } from "./notifications.server";

const MAX_BODY = 2000;

export interface ChatMessage {
  id: string;
  sender_role: "admin" | "agent";
  sender_email: string | null;
  body: string;
  created_at: string;
  read_at: string | null;
  task_id: string | null;
  task_title: string | null;
  task_status: string | null;
  task_due_at: string | null;
}

export interface ThreadSummary {
  agent_user_id: string;
  name: string | null;
  email: string;
  status: string;
  last_message: string | null;
  last_at: string | null;
  last_role: string | null;
  unread: number;
}

/** Owner: every agent with their latest message and how many of theirs are unread. */
export async function listThreads(data: { token: string }) {
  const member = await requireMember(data.token);
  if (member.isAgent) throw new Error("Not signed in.");
  await ensureSchema();
  const rows = await sql`
    select u.id as agent_user_id, a.name, u.email, u.status,
           (select m.body from team_messages m where m.agent_user_id = u.id order by m.created_at desc limit 1) as last_message,
           (select m.created_at from team_messages m where m.agent_user_id = u.id order by m.created_at desc limit 1) as last_at,
           (select m.sender_role from team_messages m where m.agent_user_id = u.id order by m.created_at desc limit 1) as last_role,
           (select count(*)::int from team_messages m
              where m.agent_user_id = u.id and m.sender_role = 'agent' and m.read_at is null) as unread
    from users u
    left join agents a on a.tenant_id = u.tenant_id and a.email = u.email
    where u.tenant_id = ${member.tenantId} and u.role = 'agent'
    order by last_at desc nulls last, a.name
  `;
  return { ok: true as const, threads: rows as unknown as ThreadSummary[] };
}

async function resolveThread(member: Awaited<ReturnType<typeof requireMember>>, agentUserId?: string) {
  if (member.isAgent) return member.userId;
  if (!agentUserId) throw new Error("Choose an agent to message.");
  const rows = await sql`
    select id from users where id = ${agentUserId} and tenant_id = ${member.tenantId} and role = 'agent' limit 1
  `;
  if (rows.length === 0) throw new Error("That agent wasn't found.");
  return agentUserId;
}

/** Messages in a conversation, oldest first. Opening it marks the other side's messages as read. */
export async function getThread(data: { token: string; agentUserId?: string; since?: string }) {
  const member = await requireMember(data.token);
  await ensureSchema();
  const threadId = await resolveThread(member, data.agentUserId);
  const viewerRole = member.isAgent ? "agent" : "admin";

  await sql`
    update team_messages set read_at = now()
    where agent_user_id = ${threadId} and sender_role <> ${viewerRole} and read_at is null
  `;
  // Opening the chat also clears its message alerts.
  await sql`
    update notifications set read_at = now()
    where user_id = ${member.userId} and kind = 'message' and read_at is null
      and (${member.isAgent}::boolean or link = ${"messages:" + threadId})
  `;

  const params: unknown[] = [threadId];
  let where = "m.agent_user_id = $1";
  if (data.since) {
    const since = new Date(data.since);
    if (!Number.isNaN(since.getTime())) {
      params.push(since.toISOString());
      where += ` and m.created_at > $${params.length}`;
    }
  }
  const rows = await sqlQuery(
    `select m.id, m.sender_role, s.email as sender_email, m.body, m.created_at, m.read_at,
            m.task_id, t.title as task_title, t.status as task_status, t.due_at as task_due_at
     from team_messages m
     left join users s on s.id = m.sender_id
     left join agent_tasks t on t.id = m.task_id
     where ${where}
     order by m.created_at asc
     limit 200`,
    params,
  );
  return { ok: true as const, agentUserId: threadId, messages: rows as unknown as ChatMessage[] };
}

export async function sendMessage(data: { token: string; agentUserId?: string; body: string; taskId?: string }) {
  const member = await requireMember(data.token);
  await ensureSchema();
  const body = (data.body ?? "").trim();
  if (!body) throw new Error("Write a message first.");
  if (body.length > MAX_BODY) throw new Error(`Keep it under ${MAX_BODY} characters.`);
  const threadId = await resolveThread(member, data.agentUserId);

  if (data.taskId) {
    // A task can only be attached to its own agent's conversation.
    const ok = await sql`
      select 1 from agent_tasks where id = ${data.taskId} and tenant_id = ${member.tenantId} and assignee_id = ${threadId} limit 1
    `;
    if (ok.length === 0) throw new Error("That task isn't assigned to this agent.");
  }

  const role = member.isAgent ? "agent" : "admin";
  const inserted = await sql`
    insert into team_messages (tenant_id, agent_user_id, sender_id, sender_role, body, task_id)
    values (${member.tenantId}, ${threadId}, ${member.userId}, ${role}, ${body}, ${data.taskId ?? null})
    returning id
  `;

  const preview = body.length > 140 ? `${body.slice(0, 140)}…` : body;
  if (member.isAgent) {
    for (const owner of await ownersOf(member.tenantId)) {
      await notify({
        tenantId: member.tenantId,
        userId: owner.id,
        kind: "message",
        title: `Message from ${member.email}`,
        body: preview,
        link: `messages:${threadId}`,
        emailIfAway: { subject: `Message from ${member.email}`, heading: "New message from your agent", ctaLabel: "Open messages", ctaPath: "/team" },
      });
    }
  } else {
    await notify({
      tenantId: member.tenantId,
      userId: threadId,
      kind: "message",
      title: `Message from ${member.email}`,
      body: preview,
      link: "messages",
      emailIfAway: { subject: `Message from ${member.email}`, heading: "New message from your team lead", ctaLabel: "Open messages", ctaPath: "/agent" },
    });
  }

  return { ok: true as const, id: (inserted[0] as { id: string }).id };
}

export const listThreadsFn = createServerFn({ method: "POST" })
  .validator((data: Parameters<typeof listThreads>[0]) => data)
  .handler(async ({ data }) => listThreads(data));

export const getThreadFn = createServerFn({ method: "POST" })
  .validator((data: Parameters<typeof getThread>[0]) => data)
  .handler(async ({ data }) => getThread(data));

export const sendMessageFn = createServerFn({ method: "POST" })
  .validator((data: Parameters<typeof sendMessage>[0]) => data)
  .handler(async ({ data }) => sendMessage(data));

