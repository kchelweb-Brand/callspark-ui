import { createServerFn } from "@tanstack/react-start";

import { sql } from "./db";
import { verifyToken } from "./tokens";
import { requireCanCreate } from "./entitlements";

async function requireTenant(token: string): Promise<string> {
  const payload = await verifyToken(token);
  if (!payload || !payload.tenantId) throw new Error("Not signed in.");
  return payload.tenantId;
}

export interface CampaignRecord {
  id: string;
  name: string;
  status: string;
  list_name: string | null;
  owner: string | null;
  script: string | null;
  contacts_loaded: number;
  calls_made: number;
  connect_rate: number;
  created_at: string;
}

const COLUMNS = `id, name, status, list_name, owner, script,
  contacts_loaded, calls_made, connect_rate, created_at`;

export const listCampaignsFn = createServerFn({ method: "POST" })
  .validator((data: { token: string }) => data)
  .handler(async ({ data }) => {
    const tenantId = await requireTenant(data.token);
    const rows = await sql`
      select id, name, status, list_name, owner, script,
             contacts_loaded, calls_made, connect_rate, created_at
      from campaigns where tenant_id = ${tenantId} order by created_at desc
    `;
    return { ok: true as const, campaigns: rows as unknown as CampaignRecord[] };
  });

export const createCampaignFn = createServerFn({ method: "POST" })
  .validator(
    (data: {
      token: string;
      name: string;
      listName?: string;
      owner?: string;
      script?: string;
      status?: string;
    }) => data,
  )
  .handler(async ({ data }) => {
    const tenantId = await requireTenant(data.token);
    const name = data.name.trim();
    if (!name) throw new Error("Give the campaign a name.");
    await requireCanCreate(tenantId, "campaigns");

    const rows = await sql`
      insert into campaigns (tenant_id, name, status, list_name, owner, script)
      values (
        ${tenantId}, ${name}, ${data.status ?? "Draft"},
        ${data.listName ?? null}, ${data.owner ?? null}, ${data.script ?? null}
      )
      returning id, name, status, list_name, owner, script,
                contacts_loaded, calls_made, connect_rate, created_at
    `;
    return { ok: true as const, campaign: rows[0] as unknown as CampaignRecord };
  });

export const updateCampaignFn = createServerFn({ method: "POST" })
  .validator((data: { token: string; id: string; name?: string; status?: string }) => data)
  .handler(async ({ data }) => {
    const tenantId = await requireTenant(data.token);

    // coalesce keeps unspecified fields untouched, so a status change can't
    // accidentally blank out the name.
    const rows = await sql`
      update campaigns set
        name = coalesce(${data.name ?? null}, name),
        status = coalesce(${data.status ?? null}, status),
        updated_at = now()
      where id = ${data.id} and tenant_id = ${tenantId}
      returning id, name, status, list_name, owner, script,
                contacts_loaded, calls_made, connect_rate, created_at
    `;
    if (rows.length === 0) throw new Error("Campaign not found.");
    return { ok: true as const, campaign: rows[0] as unknown as CampaignRecord };
  });

export const duplicateCampaignFn = createServerFn({ method: "POST" })
  .validator((data: { token: string; id: string }) => data)
  .handler(async ({ data }) => {
    const tenantId = await requireTenant(data.token);

    // A duplicate is still a new campaign as far as the plan is concerned.
    await requireCanCreate(tenantId, "campaigns");

    // Copies the setup but not the results — a duplicate starts fresh.
    const rows = await sql`
      insert into campaigns (tenant_id, name, status, list_name, owner, script)
      select tenant_id, name || ' (copy)', 'Draft', list_name, owner, script
      from campaigns where id = ${data.id} and tenant_id = ${tenantId}
      returning id, name, status, list_name, owner, script,
                contacts_loaded, calls_made, connect_rate, created_at
    `;
    if (rows.length === 0) throw new Error("Campaign not found.");
    return { ok: true as const, campaign: rows[0] as unknown as CampaignRecord };
  });

export const deleteCampaignFn = createServerFn({ method: "POST" })
  .validator((data: { token: string; id: string }) => data)
  .handler(async ({ data }) => {
    const tenantId = await requireTenant(data.token);
    await sql`delete from campaigns where id = ${data.id} and tenant_id = ${tenantId}`;
    return { ok: true as const };
  });
