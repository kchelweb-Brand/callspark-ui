import { createServerFn } from "@tanstack/react-start";

import { sql } from "./db";
import { verifyToken } from "./tokens";
import { requireCanCreate } from "./entitlements";
import { ensureSchema } from "./schema.server";
import { deleteStoredFiles } from "./media-store";
import {
  recordingSettingsProblem,
  sanitizeRecordingSettings,
  type RecordingSettings,
} from "./recording-options";

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
  /** "manual": people dial the list (power dialer). "recording": a voice broadcast that plays one recording. */
  mode: "manual" | "recording";
  /** The recording and what happens around it. Only set on a voice broadcast. */
  recording: RecordingSettings | null;
  compliance_ack: boolean;
  contacts_loaded: number;
  calls_made: number;
  connect_rate: number;
  created_at: string;
  /** Live counts from campaign_calls — only meaningful for mode='recording'; the dead contacts_loaded/calls_made columns never reflect a run in progress. */
  queue_total: number;
  queue_completed: number;
  queue_failed: number;
}

export async function listCampaigns(data: { token: string }) {
  const tenantId = await requireTenant(data.token);
  await ensureSchema();
  const rows = await sql`
    select c.id, c.name, c.status, c.list_name, c.list_id, c.owner, c.script, c.mode, c.recording, c.compliance_ack,
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

/** The recording must be one this workspace uploaded, in a format phones can play. */
function checkRecording(tenantId: string, settings: RecordingSettings): void {
  if (settings.file && !settings.file.key.startsWith(`greetings/${tenantId}/`)) {
    throw new Error("That recording doesn't belong to this workspace. Upload it again.");
  }
  const problem = recordingSettingsProblem(settings);
  if (problem) throw new Error(problem);
}

/**
 * The recording file to remove from storage, if nothing else plays it any more
 * (a duplicated campaign shares the file with the original). Returns the key to delete, or none.
 */
async function unusedRecordingKeys(tenantId: string, key: string | null | undefined): Promise<string[]> {
  if (!key || !key.startsWith(`greetings/${tenantId}/`)) return [];
  const stillUsed = await sql`
    select 1 from campaigns where tenant_id = ${tenantId} and recording -> 'file' ->> 'key' = ${key} limit 1
  `;
  return stillUsed.length > 0 ? [] : [key];
}

export async function createCampaign(data: {
  token: string;
  name: string;
  listId?: string;
  listName?: string;
  owner?: string;
  script?: string;
  status?: string;
  mode?: "manual" | "recording";
  recording?: RecordingSettings;
  complianceAck?: boolean;
}) {
  const tenantId = await requireTenant(data.token);
  await ensureSchema();
  const name = data.name.trim();
  if (!name) throw new Error("Give the campaign a name.");
  await requireCanCreate(tenantId, "campaigns");

  const mode = data.mode === "recording" ? "recording" : "manual";
  const recording = mode === "recording" ? sanitizeRecordingSettings(data.recording) : null;
  if (recording) checkRecording(tenantId, recording);
  // A voice broadcast always starts Draft — it's only allowed to go Active
  // through startCampaignDialingFn, which gates on the recording and the
  // compliance acknowledgment existing first.
  const status = mode === "recording" ? "Draft" : data.status ?? "Draft";

  const rows = await sql`
    insert into campaigns (tenant_id, name, status, list_name, list_id, owner, script, mode, recording, compliance_ack)
    values (
      ${tenantId}, ${name}, ${status},
      ${data.listName ?? null}, ${data.listId ?? null}, ${data.owner ?? null}, ${data.script ?? null},
      ${mode}, ${recording ? JSON.stringify(recording) : null}::jsonb, ${data.complianceAck ?? false}
    )
    returning id, name, status, list_name, list_id, owner, script, mode, recording, compliance_ack,
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
      mode?: "manual" | "recording";
      recording?: RecordingSettings;
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
  recording?: RecordingSettings;
  complianceAck?: boolean;
}) {
  const tenantId = await requireTenant(data.token);
  await ensureSchema();

  const [existing] = await sql`
    select mode, recording from campaigns where id = ${data.id} and tenant_id = ${tenantId} limit 1
  `;
  if (!existing) throw new Error("Campaign not found.");
  if (data.status === "Active" && existing["mode"] === "recording") {
    throw new Error("Use \"Start broadcast\" for a voice broadcast — it needs to build the call queue first.");
  }
  if (data.recording !== undefined && existing["mode"] !== "recording") {
    throw new Error("Only a voice broadcast has a recording.");
  }

  const previous = sanitizeRecordingSettings(existing["recording"]);
  const recording = data.recording === undefined ? null : sanitizeRecordingSettings(data.recording);
  if (recording) checkRecording(tenantId, recording);

  // coalesce keeps unspecified fields untouched, so a status change can't
  // accidentally blank out the name.
  const rows = await sql`
    update campaigns set
      name = coalesce(${data.name ?? null}, name),
      status = coalesce(${data.status ?? null}, status),
      list_id = coalesce(${data.listId ?? null}, list_id),
      recording = coalesce(${recording ? JSON.stringify(recording) : null}::jsonb, recording),
      compliance_ack = coalesce(${data.complianceAck ?? null}, compliance_ack),
      updated_at = now()
    where id = ${data.id} and tenant_id = ${tenantId}
    returning id, name, status, list_name, list_id, owner, script, mode, recording, compliance_ack,
              contacts_loaded, calls_made, connect_rate, created_at
  `;
  if (rows.length === 0) throw new Error("Campaign not found.");

  const released =
    recording && previous.file && previous.file.key !== recording.file?.key
      ? await unusedRecordingKeys(tenantId, previous.file.key)
      : [];
  return { ok: true as const, campaign: rows[0] as unknown as CampaignRecord, released };
}

export const updateCampaignFn = createServerFn({ method: "POST" })
  .validator(
    (data: {
      token: string;
      id: string;
      name?: string;
      status?: string;
      listId?: string;
      recording?: RecordingSettings;
      complianceAck?: boolean;
    }) => data,
  )
  .handler(async ({ data }) => {
    const { released, ...result } = await updateCampaign(data);
    await deleteStoredFiles(released);
    return result;
  });

export async function duplicateCampaign(data: { token: string; id: string }) {
  const tenantId = await requireTenant(data.token);
  await ensureSchema();

  // A duplicate is still a new campaign as far as the plan is concerned.
  await requireCanCreate(tenantId, "campaigns");

  // Copies the setup but not the results (or the compliance ack — a fresh
  // copy needs its own explicit confirmation, not an inherited one) — a
  // duplicate starts fresh.
  const rows = await sql`
    insert into campaigns (tenant_id, name, status, list_name, list_id, owner, script, mode, recording, compliance_ack)
    select tenant_id, name || ' (copy)', 'Draft', list_name, list_id, owner, script, mode, recording, false
    from campaigns where id = ${data.id} and tenant_id = ${tenantId}
    returning id, name, status, list_name, list_id, owner, script, mode, recording, compliance_ack,
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
  await ensureSchema();
  const [existing] = await sql`select recording from campaigns where id = ${data.id} and tenant_id = ${tenantId} limit 1`;
  await sql`delete from campaigns where id = ${data.id} and tenant_id = ${tenantId}`;
  const released = await unusedRecordingKeys(tenantId, sanitizeRecordingSettings(existing?.["recording"]).file?.key);
  return { ok: true as const, released };
}

export const deleteCampaignFn = createServerFn({ method: "POST" })
  .validator((data: { token: string; id: string }) => data)
  .handler(async ({ data }) => {
    const { released } = await deleteCampaign(data);
    await deleteStoredFiles(released);
    return { ok: true as const };
  });
