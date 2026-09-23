import { createServerFn } from "@tanstack/react-start";

import { sql } from "./db";
import { getWorkersAi } from "./cf-env";
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
  list_id: string | null;
  owner: string | null;
  script: string | null;
  mode: "manual" | "ai_agent";
  ai_prompt: string | null;
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

export const listCampaignsFn = createServerFn({ method: "POST" })
  .validator((data: { token: string }) => data)
  .handler(async ({ data }) => {
    const tenantId = await requireTenant(data.token);
    const rows = await sql`
      select c.id, c.name, c.status, c.list_name, c.list_id, c.owner, c.script, c.mode, c.ai_prompt, c.compliance_ack,
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
  });

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
      complianceAck?: boolean;
    }) => data,
  )
  .handler(async ({ data }) => {
    const tenantId = await requireTenant(data.token);
    const name = data.name.trim();
    if (!name) throw new Error("Give the campaign a name.");
    await requireCanCreate(tenantId, "campaigns");

    const mode = data.mode ?? "manual";
    // An AI campaign always starts Draft — it's only allowed to go Active
    // through startCampaignDialingFn, which gates on the prompt and the
    // compliance acknowledgment existing first.
    const status = mode === "ai_agent" ? "Draft" : data.status ?? "Draft";

    const rows = await sql`
      insert into campaigns (tenant_id, name, status, list_name, list_id, owner, script, mode, ai_prompt, compliance_ack)
      values (
        ${tenantId}, ${name}, ${status},
        ${data.listName ?? null}, ${data.listId ?? null}, ${data.owner ?? null}, ${data.script ?? null},
        ${mode}, ${data.aiPrompt ?? null}, ${data.complianceAck ?? false}
      )
      returning id, name, status, list_name, list_id, owner, script, mode, ai_prompt, compliance_ack,
                contacts_loaded, calls_made, connect_rate, created_at
    `;
    return { ok: true as const, campaign: rows[0] as unknown as CampaignRecord };
  });

export const updateCampaignFn = createServerFn({ method: "POST" })
  .validator(
    (data: {
      token: string;
      id: string;
      name?: string;
      status?: string;
      listId?: string;
      aiPrompt?: string;
      complianceAck?: boolean;
    }) => data,
  )
  .handler(async ({ data }) => {
    const tenantId = await requireTenant(data.token);

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
        compliance_ack = coalesce(${data.complianceAck ?? null}, compliance_ack),
        updated_at = now()
      where id = ${data.id} and tenant_id = ${tenantId}
      returning id, name, status, list_name, list_id, owner, script, mode, ai_prompt, compliance_ack,
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

    // Copies the setup but not the results (or the compliance ack — a fresh
    // copy needs its own explicit confirmation, not an inherited one) — a
    // duplicate starts fresh.
    const rows = await sql`
      insert into campaigns (tenant_id, name, status, list_name, list_id, owner, script, mode, ai_prompt, compliance_ack)
      select tenant_id, name || ' (copy)', 'Draft', list_name, list_id, owner, script, mode, ai_prompt, false
      from campaigns where id = ${data.id} and tenant_id = ${tenantId}
      returning id, name, status, list_name, list_id, owner, script, mode, ai_prompt, compliance_ack,
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

/**
 * Reviews an AI-agent prompt for scam/spam-sounding language (fake urgency,
 * requests for sensitive financial info, no business identification, no
 * "this is an automated call" disclosure) and suggests a rewrite. Requires a
 * session — otherwise this is an unauthenticated proxy to the Anthropic bill.
 */
export const reviewCampaignPromptFn = createServerFn({ method: "POST" })
  .validator((data: { token: string; prompt: string; businessName?: string }) => data)
  .handler(async ({ data }) => {
    await requireTenant(data.token);

    const ai = await getWorkersAi();
    if (!ai) throw new Error("Prompt review isn't available in local development — deploy to test it.");

    const prompt = data.prompt.trim();
    if (!prompt) throw new Error("Write a prompt first.");

    const system =
      "You review scripts for an outbound AI voice-calling agent. Flag anything that would make the " +
      "call sound like a scam or spam robocall: fake urgency, requests for passwords/SSNs/card numbers, " +
      "no clear business identification, or no disclosure that the caller is an automated assistant. " +
      "Then rewrite the script so it clearly identifies the business, opens with a plain disclosure " +
      "that this is an automated call, and stays focused on a legitimate purpose. " +
      `${data.businessName ? `The business is called "${data.businessName}". ` : ""}` +
      'Respond with ONLY minified JSON: {"concerns": string[], "rewrite": string}. No prose, no markdown fences.';

    // Workers AI — free tier (10k neurons/day), no separate account or key.
    // `response` is usually the raw text, but this model returns it already
    // parsed into an object when the content is valid JSON — handle both.
    const result = (await ai.run("@cf/meta/llama-3.2-3b-instruct", {
      messages: [
        { role: "system", content: system },
        { role: "user", content: prompt },
      ],
    })) as { response?: unknown };

    let parsed: { concerns?: string[]; rewrite?: string } | undefined;
    if (result.response && typeof result.response === "object") {
      parsed = result.response as { concerns?: string[]; rewrite?: string };
    } else if (typeof result.response === "string") {
      // Instruct models sometimes wrap JSON in a markdown fence despite being told not to.
      const jsonText = result.response.trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "");
      try {
        parsed = JSON.parse(jsonText);
      } catch {
        // fall through to the error below
      }
    }

    if (!parsed) throw new Error("Could not read the review response — try again.");
    return {
      ok: true as const,
      concerns: Array.isArray(parsed.concerns) ? parsed.concerns : [],
      rewrite: parsed.rewrite ?? "",
    };
  });
