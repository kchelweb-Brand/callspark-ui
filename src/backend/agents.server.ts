import { createServerFn } from "@tanstack/react-start";

import { sql } from "./db";
import { verifyToken } from "./tokens";
import { requireCanCreate } from "./entitlements";

async function requireTenant(token: string): Promise<string> {
  const payload = await verifyToken(token);
  if (!payload || !payload.tenantId) throw new Error("Not signed in.");
  return payload.tenantId;
}

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
}

export const listAgentsFn = createServerFn({ method: "POST" })
  .validator((data: { token: string }) => data)
  .handler(async ({ data }) => {
    const tenantId = await requireTenant(data.token);
    const rows = await sql`
      select id, name, email, extension, role, status,
             calls_today, talk_seconds, connect_rate, csat
      from agents where tenant_id = ${tenantId} order by created_at
    `;
    return { ok: true as const, agents: rows as unknown as AgentRecord[] };
  });

export const createAgentFn = createServerFn({ method: "POST" })
  .validator(
    (data: { token: string; name: string; email: string; extension?: string; role?: string }) =>
      data,
  )
  .handler(async ({ data }) => {
    const tenantId = await requireTenant(data.token);
    const name = data.name.trim();
    const email = data.email.trim().toLowerCase();
    if (!name || !email) throw new Error("Name and email are required.");

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
      returning id, name, email, extension, role, status,
                calls_today, talk_seconds, connect_rate, csat
    `;
    if (inserted.length === 0) {
      throw new Error(`Extension ${extension} is already in use.`);
    }
    return { ok: true as const, agent: inserted[0] as unknown as AgentRecord };
  });

export const updateAgentFn = createServerFn({ method: "POST" })
  .validator((data: { token: string; id: string; status?: string; role?: string }) => data)
  .handler(async ({ data }) => {
    const tenantId = await requireTenant(data.token);
    const rows = await sql`
      update agents set
        status = coalesce(${data.status ?? null}, status),
        role = coalesce(${data.role ?? null}, role)
      where id = ${data.id} and tenant_id = ${tenantId}
      returning id, name, email, extension, role, status,
                calls_today, talk_seconds, connect_rate, csat
    `;
    if (rows.length === 0) throw new Error("Agent not found.");
    return { ok: true as const, agent: rows[0] as unknown as AgentRecord };
  });

export const deleteAgentFn = createServerFn({ method: "POST" })
  .validator((data: { token: string; id: string }) => data)
  .handler(async ({ data }) => {
    const tenantId = await requireTenant(data.token);
    await sql`delete from agents where id = ${data.id} and tenant_id = ${tenantId}`;
    return { ok: true as const };
  });
