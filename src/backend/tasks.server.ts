import { createServerFn } from "@tanstack/react-start";

// Tasks an owner assigns to an agent.
//
// The owner creates and edits them and sees the whole board; an agent sees only
// their own and can only move them along (status and a completion note), so a
// task can't be quietly rewritten or reassigned from the other side.

import { sql, sqlQuery } from "./db";
import { ensureSchema } from "./schema.server";
import { ownersOf, requireMember, requireOwner } from "./access.server";
import { notify } from "./notifications.server";

export const TASK_STATUSES = ["To do", "In progress", "Done"] as const;
export const TASK_PRIORITIES = ["Low", "Medium", "High"] as const;

export interface TaskRow {
  id: string;
  title: string;
  details: string | null;
  priority: string;
  status: string;
  due_at: string | null;
  completion_note: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
  assignee_id: string;
  assignee_email: string;
  assignee_name: string | null;
  contact_id: string | null;
  contact_name: string | null;
  contact_phone: string | null;
  overdue: boolean;
}

const TASK_SELECT = `
  t.id, t.title, t.details, t.priority, t.status, t.due_at, t.completion_note, t.completed_at,
  t.created_at, t.updated_at, t.assignee_id, u.email as assignee_email, a.name as assignee_name,
  t.contact_id, coalesce(c.person, c.company) as contact_name, c.phone as contact_phone,
  (t.status <> 'Done' and t.due_at is not null and t.due_at < now()) as overdue
`;

function cleanText(value: unknown, max: number): string | null {
  const text = typeof value === "string" ? value.trim() : "";
  return text ? text.slice(0, max) : null;
}

function parseDue(value: unknown): string | null {
  if (!value) return null;
  const d = new Date(String(value));
  if (Number.isNaN(d.getTime())) throw new Error("That due date isn't valid.");
  return d.toISOString();
}

async function loadTask(id: string): Promise<TaskRow | null> {
  const rows = await sqlQuery(
    `select ${TASK_SELECT}
     from agent_tasks t
     join users u on u.id = t.assignee_id
     left join agents a on a.tenant_id = t.tenant_id and a.email = u.email
     left join contacts c on c.id = t.contact_id
     where t.id = $1`,
    [id],
  );
  return (rows[0] as unknown as TaskRow | undefined) ?? null;
}

export async function listTasks(data: { token: string; status?: string; assigneeId?: string }) {
  const member = await requireMember(data.token);
  await ensureSchema();

  const params: unknown[] = [member.tenantId];
  let where = "t.tenant_id = $1";
  if (member.isAgent) {
    params.push(member.userId);
    where += ` and t.assignee_id = $${params.length}`;
  } else if (data.assigneeId) {
    params.push(data.assigneeId);
    where += ` and t.assignee_id = $${params.length}`;
  }
  if (data.status === "open") where += " and t.status <> 'Done'";
  else if (data.status && (TASK_STATUSES as readonly string[]).includes(data.status)) {
    params.push(data.status);
    where += ` and t.status = $${params.length}`;
  }

  const rows = await sqlQuery(
    `select ${TASK_SELECT}
     from agent_tasks t
     join users u on u.id = t.assignee_id
     left join agents a on a.tenant_id = t.tenant_id and a.email = u.email
     left join contacts c on c.id = t.contact_id
     where ${where}
     order by (t.status = 'Done') asc, t.due_at asc nulls last, t.created_at desc
     limit 300`,
    params,
  );
  return { ok: true as const, tasks: rows as unknown as TaskRow[] };
}

export async function createTask(data: {
  token: string;
  assigneeId: string;
  title: string;
  details?: string;
  priority?: string;
  dueAt?: string;
  contactId?: string;
}) {
  const owner = await requireOwner(data.token);
  await ensureSchema();

  const title = cleanText(data.title, 200);
  if (!title) throw new Error("Give the task a title.");
  const priority = (TASK_PRIORITIES as readonly string[]).includes(data.priority ?? "") ? data.priority! : "Medium";
  const dueAt = parseDue(data.dueAt);

  const assignee = await sql`
    select id from users where id = ${data.assigneeId} and tenant_id = ${owner.tenantId} and role = 'agent' and status <> 'disabled' limit 1
  `;
  if (assignee.length === 0) throw new Error("Choose an active agent from your team.");

  if (data.contactId) {
    const contact = await sql`select 1 from contacts where id = ${data.contactId} and tenant_id = ${owner.tenantId} limit 1`;
    if (contact.length === 0) throw new Error("That contact wasn't found.");
  }

  const inserted = await sql`
    insert into agent_tasks (tenant_id, assignee_id, created_by, title, details, priority, due_at, contact_id)
    values (${owner.tenantId}, ${data.assigneeId}, ${owner.userId}, ${title}, ${cleanText(data.details, 2000)},
            ${priority}, ${dueAt}, ${data.contactId ?? null})
    returning id
  `;
  const id = (inserted[0] as { id: string }).id;

  await notify({
    tenantId: owner.tenantId,
    userId: data.assigneeId,
    kind: "task",
    title: `New task: ${title}`,
    body: [dueAt ? `Due ${new Date(dueAt).toUTCString()}` : "", cleanText(data.details, 300) ?? ""].filter(Boolean).join("\n") || null,
    link: "tasks",
    emailIfAway: { subject: `New task: ${title}`, heading: "You have a new task", ctaLabel: "Open my tasks", ctaPath: "/agent" },
  });

  return { ok: true as const, task: await loadTask(id) };
}

export async function updateTask(data: {
  token: string;
  id: string;
  status?: string;
  note?: string;
  title?: string;
  details?: string;
  priority?: string;
  dueAt?: string | null;
  assigneeId?: string;
}) {
  const member = await requireMember(data.token);
  await ensureSchema();

  const found = await sql`select id, assignee_id, title, status from agent_tasks where id = ${data.id} and tenant_id = ${member.tenantId} limit 1`;
  const task = found[0] as { id: string; assignee_id: string; title: string; status: string } | undefined;
  if (!task) throw new Error("That task wasn't found.");
  if (member.isAgent && task.assignee_id !== member.userId) throw new Error("That task wasn't found.");

  if (data.status !== undefined && !(TASK_STATUSES as readonly string[]).includes(data.status)) {
    throw new Error("Unknown task status.");
  }

  const hasStatus = data.status !== undefined;
  const isDone = data.status === "Done";

  if (member.isAgent) {
    // Agents move their own work along; they don't rewrite the brief.
    if (data.status !== undefined || data.note !== undefined) {
      await sql`
        update agent_tasks set
          status = coalesce(${data.status ?? null}, status),
          completion_note = coalesce(${cleanText(data.note, 1000)}, completion_note),
          completed_at = case
            when ${isDone}::boolean then now()
            when ${hasStatus}::boolean then null
            else completed_at end,
          updated_at = now()
        where id = ${data.id}
      `;
    }
  } else {
    if (data.assigneeId) {
      const ok = await sql`select 1 from users where id = ${data.assigneeId} and tenant_id = ${member.tenantId} and role = 'agent' and status <> 'disabled' limit 1`;
      if (ok.length === 0) throw new Error("Choose an active agent from your team.");
    }
    const title = data.title !== undefined ? cleanText(data.title, 200) : null;
    if (data.title !== undefined && !title) throw new Error("Give the task a title.");
    const priority = (TASK_PRIORITIES as readonly string[]).includes(data.priority ?? "") ? data.priority! : null;
    const dueProvided = data.dueAt !== undefined;
    await sql`
      update agent_tasks set
        title = coalesce(${title}, title),
        details = case when ${data.details !== undefined}::boolean then ${cleanText(data.details, 2000)} else details end,
        priority = coalesce(${priority}, priority),
        due_at = case when ${dueProvided}::boolean then ${dueProvided ? parseDue(data.dueAt) : null}::timestamptz else due_at end,
        assignee_id = coalesce(${data.assigneeId ?? null}, assignee_id),
        status = coalesce(${data.status ?? null}, status),
        completion_note = case when ${data.note !== undefined}::boolean then ${cleanText(data.note, 1000)} else completion_note end,
        completed_at = case
          when ${isDone}::boolean then now()
          when ${hasStatus}::boolean then null
          else completed_at end,
        updated_at = now()
      where id = ${data.id}
    `;
    if (data.assigneeId && data.assigneeId !== task.assignee_id) {
      await notify({
        tenantId: member.tenantId,
        userId: data.assigneeId,
        kind: "task",
        title: `Task assigned to you: ${title ?? task.title}`,
        link: "tasks",
        emailIfAway: { subject: `New task: ${title ?? task.title}`, heading: "You have a new task", ctaLabel: "Open my tasks", ctaPath: "/agent" },
      });
    }
  }

  // Tell the owners when an agent finishes something.
  if (member.isAgent && data.status === "Done" && task.status !== "Done") {
    const who = member.email;
    for (const owner of await ownersOf(member.tenantId)) {
      await notify({
        tenantId: member.tenantId,
        userId: owner.id,
        kind: "task",
        title: `${who} completed: ${task.title}`,
        body: cleanText(data.note, 300),
        link: "team-tasks",
      });
    }
  }

  return { ok: true as const, task: await loadTask(data.id) };
}

export async function deleteTask(data: { token: string; id: string }) {
  const owner = await requireOwner(data.token);
  await ensureSchema();
  await sql`delete from agent_tasks where id = ${data.id} and tenant_id = ${owner.tenantId}`;
  return { ok: true as const };
}

export const listTasksFn = createServerFn({ method: "POST" })
  .validator((data: Parameters<typeof listTasks>[0]) => data)
  .handler(async ({ data }) => listTasks(data));

export const createTaskFn = createServerFn({ method: "POST" })
  .validator((data: Parameters<typeof createTask>[0]) => data)
  .handler(async ({ data }) => createTask(data));

export const updateTaskFn = createServerFn({ method: "POST" })
  .validator((data: Parameters<typeof updateTask>[0]) => data)
  .handler(async ({ data }) => updateTask(data));

export const deleteTaskFn = createServerFn({ method: "POST" })
  .validator((data: Parameters<typeof deleteTask>[0]) => data)
  .handler(async ({ data }) => deleteTask(data));

