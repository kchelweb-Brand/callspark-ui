import { createServerFn } from "@tanstack/react-start";

import { sql } from "./db";
import { verifyToken } from "./tokens";
import { requireCanCreate, requirePremiumVoice } from "./entitlements";
import { reviewCampaignPrompt } from "./prompt-review";
import { ensureSchema } from "./schema.server";
import { aiSettingsProblem, sanitizeAiSettings, type AiAgentSettings } from "./ai-agent-options";

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
  list_id: string | null;
  owner: string | null;
  script: string | null;
  mode: "manual" | "ai_agent";
  ai_prompt: string | null;
  /** Voice, style, voicemail and actions for an AI campaign. */
  ai_settings: AiAgentSettings | null;
  compliance_ack: boolean;
  contacts_loaded: number;
  calls_made: number;
  connect_rate: number;
  created_at: string;
  /** Live counts from campaign_calls — only meaningful for mode='ai_agent'; the dead contacts_loaded/calls_made columns never reflect a run in progress. */
  queue_total: number;
  queue_completed: number;
  queue_failed: number;
}

export async function listCampaigns(data: { token: string }) {
  const tenantId = await requireTenant(data.token);
  await ensureSchema();
  const rows = await sql`
    select c.id, c.name, c.status, c.list_name, c.list_id, c.owner, c.script, c.mode, c.ai_prompt, c.ai_settings, c.compliance_ack,
           c.contacts_loaded, c.calls_made, c.connect_rate, c.created_at,
           count(cc.id)::int as queue_total,
           count(cc.id) filter (where cc.status = 'completed')::int as queue_completed,
           count(cc.id) filter (where cc.status = 'failed')::int as queue_failed
    from campaigns c
    left join campaign_calls cc on cc.campaign_id = c.id
    where c.tenant_id = ${tenantId}
    group by c.id
    order by c.created_at desc
  `;
  return { ok: true as const, campaigns: rows as unknown as CampaignRecord[] };
}

export const listCampaignsFn = createServerFn({ method: "POST" })
  .validator((data: { token: string }) => data)
  .handler(async ({ data }) => listCampaigns(data));

export async function createCampaign(data: {
  token: string;
  name: string;
  listId?: string;
  listName?: string;
  owner?: string;
  script?: string;
  status?: string;
  mode?: "manual" | "ai_agent";
  aiPrompt?: string;
  aiSettings?: AiAgentSettings;
  complianceAck?: boolean;
}) {
  const tenantId = await requireTenant(data.token);
  await ensureSchema();
  const name = data.name.trim();
  if (!name) throw new Error("Give the campaign a name.");
  await requireCanCreate(tenantId, "campaigns");

  const mode = data.mode ?? "manual";
  const aiSettings = data.aiSettings === undefined ? null : sanitizeAiSettings(data.aiSettings);
  const aiProblem = aiSettings ? aiSettingsProblem(aiSettings) : null;
  if (aiProblem) throw new Error(aiProblem);
  if (aiSettings) await requirePremiumVoice(tenantId, aiSettings.voice);
  // An AI campaign always starts Draft — it's only allowed to go Active
  // through startCampaignDialingFn, which gates on the prompt and the
  // compliance acknowledgment existing first.
  const status = mode === "ai_agent" ? "Draft" : data.status ?? "Draft";

  const rows = await sql`
    insert into campaigns (tenant_id, name, status, list_name, list_id, owner, script, mode, ai_prompt, ai_settings, compliance_ack)
    values (
      ${tenantId}, ${name}, ${status},
      ${data.listName ?? null}, ${data.listId ?? null}, ${data.owner ?? null}, ${data.script ?? null},
      ${mode}, ${data.aiPrompt ?? null}, ${aiSettings ? JSON.stringify(aiSettings) : null}::jsonb, ${data.complianceAck ?? false}
    )
    returning id, name, status, list_name, list_id, owner, script, mode, ai_prompt, ai_settings, compliance_ack,
              contacts_loaded, calls_made, connect_rate, created_at
  `;
  return { ok: true as const, campaign: rows[0] as unknown as CampaignRecord };
}

export const createCampaignFn = createServerFn({ method: "POST" })
  .validator(
    (data: {
      token: string;
      name: string;
      listId?: string;
      listName?: string;
      owner?: string;
      script?: string;
      status?: string;
      mode?: "manual" | "ai_agent";
      aiPrompt?: string;
      aiSettings?: AiAgentSettings;
      complianceAck?: boolean;
    }) => data,
  )
  .handler(async ({ data }) => createCampaign(data));

export async function updateCampaign(data: {
  token: string;
  id: string;
  name?: string;
  status?: string;
  listId?: string;
  aiPrompt?: string;
  aiSettings?: AiAgentSettings;
  complianceAck?: boolean;
}) {
  const tenantId = await requireTenant(data.token);
  await ensureSchema();
  const aiSettings = data.aiSettings === undefined ? null : sanitizeAiSettings(data.aiSettings);
  const aiProblem = aiSettings ? aiSettingsProblem(aiSettings) : null;
  if (aiProblem) throw new Error(aiProblem);
  if (aiSettings) await requirePremiumVoice(tenantId, aiSettings.voice);

  if (data.status === "Active") {
    const [existing] = await sql`select mode from campaigns where id = ${data.id} and tenant_id = ${tenantId}`;
    if (existing?.mode === "ai_agent") {
      throw new Error("Use \"Start dialing\" for an AI campaign — it needs to seed the call queue first.");
    }
  }

  // coalesce keeps unspecified fields untouched, so a status change can't
  // accidentally blank out the name.
  const rows = await sql`
    update campaigns set
      name = coalesce(${data.name ?? null}, name),
      status = coalesce(${data.status ?? null}, status),
      list_id = coalesce(${data.listId ?? null}, list_id),
      ai_prompt = coalesce(${data.aiPrompt ?? null}, ai_prompt),
      ai_settings = coalesce(${aiSettings ? JSON.stringify(aiSettings) : null}::jsonb, ai_settings),
      compliance_ack = coalesce(${data.complianceAck ?? null}, compliance_ack),
      updated_at = now()
    where id = ${data.id} and tenant_id = ${tenantId}
    returning id, name, status, list_name, list_id, owner, script, mode, ai_prompt, ai_settings, compliance_ack,
              contacts_loaded, calls_made, connect_rate, created_at
  `;
  if (rows.length === 0) throw new Error("Campaign not found.");
  return { ok: true as const, campaign: rows[0] as unknown as CampaignRecord };
}

export const updateCampaignFn = createServerFn({ method: "POST" })
  .validator(
    (data: {
      token: string;
      id: string;
      name?: string;
      status?: string;
      listId?: string;
      aiPrompt?: string;
      aiSettings?: AiAgentSettings;
      complianceAck?: boolean;
    }) => data,
  )
  .handler(async ({ data }) => updateCampaign(data));

export async function duplicateCampaign(data: { token: string; id: string }) {
  const tenantId = await requireTenant(data.token);
  await ensureSchema();

  // A duplicate is still a new campaign as far as the plan is concerned.
  await requireCanCreate(tenantId, "campaigns");

  // Copies the setup but not the results (or the compliance ack — a fresh
  // copy needs its own explicit confirmation, not an inherited one) — a
  // duplicate starts fresh.
  const rows = await sql`
    insert into campaigns (tenant_id, name, status, list_name, list_id, owner, script, mode, ai_prompt, ai_settings, compliance_ack)
    select tenant_id, name || ' (copy)', 'Draft', list_name, list_id, owner, script, mode, ai_prompt, ai_settings, false
    from campaigns where id = ${data.id} and tenant_id = ${tenantId}
    returning id, name, status, list_name, list_id, owner, script, mode, ai_prompt, ai_settings, compliance_ack,
              contacts_loaded, calls_made, connect_rate, created_at
  `;
  if (rows.length === 0) throw new Error("Campaign not found.");
  return { ok: true as const, campaign: rows[0] as unknown as CampaignRecord };
}

export const duplicateCampaignFn = createServerFn({ method: "POST" })
  .validator((data: { token: string; id: string }) => data)
  .handler(async ({ data }) => duplicateCampaign(data));

export async function deleteCampaign(data: { token: string; id: string }) {
  const tenantId = await requireTenant(data.token);
  await sql`delete from campaigns where id = ${data.id} and tenant_id = ${tenantId}`;
  return { ok: true as const };
}

export const deleteCampaignFn = createServerFn({ method: "POST" })
  .validator((data: { token: string; id: string }) => data)
  .handler(async ({ data }) => deleteCampaign(data));

export const reviewCampaignPromptFn = createServerFn({ method: "POST" })
  .validator((data: { token: string; prompt: string; businessName?: string }) => data)
  .handler(async ({ data }) => reviewCampaignPrompt(data));
