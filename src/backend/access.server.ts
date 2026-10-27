// Who is asking, and are they allowed? Shared by everything an agent can reach.
//
// Two kinds of workspace member: the owner (full access, as before) and an
// invited agent (only what the owner switched on). Functions that agents may
// use call `requireMember`; everything else keeps calling `verifyToken`
// without opting in, which refuses agent tokens outright.

import { sql } from "./db";
import { verifyToken } from "./tokens";
import { ensureSchema } from "./schema.server";
import type { AgentPermissions } from "./permissions";

export interface Member {
  userId: string;
  email: string;
  tenantId: string;
  isAgent: boolean;
  /** Null for owners, who can do everything. */
  permissions: AgentPermissions | null;
}

/** Any signed-in member of a workspace: owner or agent. */
export async function requireMember(token: string): Promise<Member> {
  const payload = await verifyToken(token, { allowAgent: true });
  if (!payload || !payload.tenantId) throw new Error("Not signed in.");
  return {
    userId: payload.sub,
    email: payload.email,
    tenantId: payload.tenantId,
    isAgent: Boolean(payload.agent),
    permissions: payload.permissions ?? null,
  };
}

/** The workspace owner only. Agent tokens are refused by verifyToken itself. */
export async function requireOwner(token: string): Promise<Member> {
  const payload = await verifyToken(token);
  if (!payload || !payload.tenantId) throw new Error("Not signed in.");
  return { userId: payload.sub, email: payload.email, tenantId: payload.tenantId, isAgent: false, permissions: null };
}

/** An agent (not an owner), for screens that only make sense for one. */
export async function requireAgent(token: string): Promise<Member & { permissions: AgentPermissions }> {
  const member = await requireMember(token);
  if (!member.isAgent || !member.permissions) throw new Error("This is only available to agents.");
  return member as Member & { permissions: AgentPermissions };
}

/** Blocks an agent who hasn't been given a permission. Owners always pass. */
export function requirePermission(member: Member, allowed: (p: AgentPermissions) => boolean, message: string): void {
  if (member.permissions && !allowed(member.permissions)) throw new Error(message);
}

/** Every owner (non-agent, enabled) in a workspace: who hears about an agent's messages and finished tasks. */
export async function ownersOf(tenantId: string): Promise<{ id: string; email: string }[]> {
  await ensureSchema();
  const rows = await sql`
    select id, email from users
    where tenant_id = ${tenantId} and role <> 'agent' and status <> 'disabled' and is_super_admin = false
  `;
  return rows as unknown as { id: string; email: string }[];
}

/** Records that someone is using the app right now, so alerts only email people who are away. */
export async function touchSeen(userId: string): Promise<void> {
  await sql`update users set last_seen_at = now() where id = ${userId}`;
}
