import { createServerFn } from "@tanstack/react-start";

import { sql, sqlQuery } from "./db";
import { verifyToken } from "./tokens";
import { requireCanCreate } from "./entitlements";
import { ensureSchema } from "./schema.server";
import { resolvePermissions, type AgentPermissions } from "./permissions";
import { sendAgentInviteEmail } from "./email";
import { notify } from "./notifications.server";

// Owner only: agent tokens are refused by verifyToken, so an invited agent can
// never add, edit or remove people.
async function requireOwnerSession(token: string) {
  const payload = await verifyToken(token);
  if (!payload || !payload.tenantId) throw new Error("Not signed in.");
  return { tenantId: payload.tenantId, email: payload.email, userId: payload.sub };
}

export type AccessStatus = "invited" | "active" | "disabled";

export interface AgentRecord {
  id: string;
  name: string;
  email: string | null;
  extension: string;
  role: string;
  status: string;
  calls_today: number;
  talk_seconds: number;
  connect_rate: number;
  csat: number;
  /** The agent's login, once invited. Used to message them and assign tasks. */
  user_id: string | null;
  access: AccessStatus | null;
  permissions: AgentPermissions | null;
  last_seen_at: string | null;
  accepted_at: string | null;
}

const AGENT_SELECT = `
  a.id, a.name, a.email, a.extension, a.role, a.status,
  a.calls_today, a.talk_seconds, a.connect_rate, a.csat,
  u.id as user_id, u.status as access, u.permissions, u.last_seen_at, u.accepted_at
`;

function shape(row: Record<string, unknown>): AgentRecord {
  const r = row as unknown as AgentRecord & { permissions: unknown };
  return {
    ...r,
    permissions: r.user_id ? resolvePermissions({ permissions: r.permissions }) : null,
  };
}

async function loadAgent(tenantId: string, id: string): Promise<AgentRecord | null> {
  const rows = await sqlQuery(
    `select ${AGENT_SELECT} from agents a
     left join users u on u.tenant_id = a.tenant_id and u.email = a.email and u.role = 'agent'
     where a.id = $1 and a.tenant_id = $2`,
    [id, tenantId],
  );
  return rows[0] ? shape(rows[0]) : null;
}

export async function listAgents(data: { token: string }) {
  const { tenantId } = await requireOwnerSession(data.token);
  await ensureSchema();
  const rows = await sqlQuery(
    `select ${AGENT_SELECT} from agents a
     left join users u on u.tenant_id = a.tenant_id and u.email = a.email and u.role = 'agent'
     where a.tenant_id = $1 order by a.created_at`,
    [tenantId],
  );
  return { ok: true as const, agents: rows.map(shape) };
}

export const listAgentsFn = createServerFn({ method: "POST" })
  .validator((data: Parameters<typeof listAgents>[0]) => data)
  .handler(async ({ data }) => listAgents(data));

async function sendInvite(tenantId: string, agentName: string, email: string, invitedBy: string) {
  const rows = await sql`select name, workspace_slug from tenants where id = ${tenantId} limit 1`;
  const tenant = rows[0] as { name: string; workspace_slug: string } | undefined;
  if (!tenant) return;
  await sendAgentInviteEmail(email, {
    agentName,
    workspaceName: tenant.name,
    workspaceSlug: tenant.workspace_slug,
    invitedBy,
  });
}

/**
 * Adds an agent and invites them by email.
 *
 * Creates both the roster entry (extension, stats) and the login. They sign in
 * with the same emailed-code flow as everyone else, into a dashboard that only
 * shows what `permissions` allows.
 */
export async function createAgent(data: {
  token: string;
  name: string;
  email: string;
  extension?: string;
  role?: string;
  preset?: string;
  permissions?: unknown;
}) {
  const owner = await requireOwnerSession(data.token);
  await ensureSchema();
  const tenantId = owner.tenantId;
  const name = data.name.trim();
  const email = data.email.trim().toLowerCase();
  if (!name || !email) throw new Error("Name and email are required.");
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error("That doesn't look like an email address.");

  // An address can belong to one login per workspace. Refuse before anything is written.
  const existing = await sql`select id from users where tenant_id = ${tenantId} and email = ${email} limit 1`;
  if (existing.length > 0) throw new Error("That email already belongs to someone in this workspace.");

  // Auto-assign the next free extension when none was given, so inviting
  // someone doesn't require knowing the numbering scheme.
  let extension = data.extension?.trim() ?? "";
  if (!extension) {
    const rows = await sql`
      select coalesce(max(nullif(regexp_replace(extension, '\\D', '', 'g'), '')::int), 1000) as top
      from agents where tenant_id = ${tenantId}
    `;
    extension = String(Number((rows[0] as { top: number }).top) + 1);
  }

  await requireCanCreate(tenantId, "agents");

  const inserted = await sql`
    insert into agents (tenant_id, name, email, extension, role, status)
    values (${tenantId}, ${name}, ${email}, ${extension}, ${data.role ?? "Agent"}, 'Offline')
    on conflict (tenant_id, extension) do nothing
    returning id
  `;
  if (inserted.length === 0) {
    throw new Error(`Extension ${extension} is already in use.`);
  }
  const agentId = (inserted[0] as { id: string }).id;

  const permissions = resolvePermissions({ preset: data.preset, permissions: data.permissions });
  try {
    await sql`
      insert into users (tenant_id, email, role, is_super_admin, status, permissions, invited_at)
      values (${tenantId}, ${email}, 'agent', false, 'invited', ${JSON.stringify(permissions)}::jsonb, now())
    `;
  } catch (err) {
    // Don't leave a roster entry that can never sign in.
    await sql`delete from agents where id = ${agentId}`;
    throw err;
  }

  await sendInvite(tenantId, name, email, owner.email);
  return { ok: true as const, agent: (await loadAgent(tenantId, agentId)) as AgentRecord };
}

export const createAgentFn = createServerFn({ method: "POST" })
  .validator((data: Parameters<typeof createAgent>[0]) => data)
  .handler(async ({ data }) => createAgent(data));

export async function updateAgent(data: {
  token: string;
  id: string;
  status?: string;
  role?: string;
  /** "disabled" locks the agent out at once; "enabled" lets them back in. */
  access?: "disabled" | "enabled";
  preset?: string;
  permissions?: unknown;
}) {
  const owner = await requireOwnerSession(data.token);
  await ensureSchema();
  const tenantId = owner.tenantId;

  const rows = await sql`
    update agents set
      status = coalesce(${data.status ?? null}, status),
      role = coalesce(${data.role ?? null}, role)
    where id = ${data.id} and tenant_id = ${tenantId}
    returning id, email
  `;
  const agent = rows[0] as { id: string; email: string | null } | undefined;
  if (!agent) throw new Error("Agent not found.");

  if (agent.email) {
    if (data.access === "disabled") {
      await sql`
        update users set status = 'disabled' where tenant_id = ${tenantId} and email = ${agent.email} and role = 'agent'
      `;
      await sql`update agents set status = 'Offline' where id = ${data.id}`;
    } else if (data.access === "enabled") {
      await sql`
        update users set status = case when accepted_at is null then 'invited' else 'active' end
        where tenant_id = ${tenantId} and email = ${agent.email} and role = 'agent'
      `;
    }
    if (data.preset !== undefined || data.permissions !== undefined) {
      const permissions = resolvePermissions({ preset: data.preset, permissions: data.permissions });
      await sql`
        update users set permissions = ${JSON.stringify(permissions)}::jsonb
        where tenant_id = ${tenantId} and email = ${agent.email} and role = 'agent'
      `;
      const target = await sql`select id from users where tenant_id = ${tenantId} and email = ${agent.email} and role = 'agent' limit 1`;
      const userId = (target[0] as { id: string } | undefined)?.id;
      if (userId) {
        await notify({
          tenantId,
          userId,
          kind: "system",
          title: "Your access was updated",
          body: "Your workspace owner changed what you can do. Reload to see it.",
        });
      }
    }
  }

  return { ok: true as const, agent: (await loadAgent(tenantId, data.id)) as AgentRecord };
}

export const updateAgentFn = createServerFn({ method: "POST" })
  .validator((data: Parameters<typeof updateAgent>[0]) => data)
  .handler(async ({ data }) => updateAgent(data));

/** Sends the invitation again, e.g. when it went to spam or expired from view. */
export async function resendInvite(data: { token: string; id: string }) {
  const owner = await requireOwnerSession(data.token);
  await ensureSchema();
  const rows = await sql`select name, email from agents where id = ${data.id} and tenant_id = ${owner.tenantId} limit 1`;
  const agent = rows[0] as { name: string; email: string | null } | undefined;
  if (!agent?.email) throw new Error("That agent has no email address.");
  await sendInvite(owner.tenantId, agent.name, agent.email, owner.email);
  return { ok: true as const };
}

export const resendInviteFn = createServerFn({ method: "POST" })
  .validator((data: Parameters<typeof resendInvite>[0]) => data)
  .handler(async ({ data }) => resendInvite(data));

export async function deleteAgent(data: { token: string; id: string }) {
  const owner = await requireOwnerSession(data.token);
  await ensureSchema();
  const rows = await sql`delete from agents where id = ${data.id} and tenant_id = ${owner.tenantId} returning email`;
  const email = (rows[0] as { email: string | null } | undefined)?.email;
  // Removing someone from the roster also removes their login, along with
  // their tasks, messages and notifications.
  if (email) {
    await sql`delete from users where tenant_id = ${owner.tenantId} and email = ${email} and role = 'agent'`;
  }
  return { ok: true as const };
}

export const deleteAgentFn = createServerFn({ method: "POST" })
  .validator((data: Parameters<typeof deleteAgent>[0]) => data)
  .handler(async ({ data }) => deleteAgent(data));
