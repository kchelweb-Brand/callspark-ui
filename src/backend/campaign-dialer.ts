// Autonomous AI-agent campaign calling.
//
// SignalWire's SWML "ai" method hosts the ASR+LLM+TTS voice agent itself —
// we only ever hand it prompt text via a webhook response, same idiom as the
// cXML inbound flow. There's no Cloudflare Cron in this app, so the dialer
// chains itself call-by-call through webhooks instead: place one call, wait
// for its status callback, place the next. Mirrors the client_state-carried
// bridging inbound.ts already does for Telnyx ring-group fallthrough.

import { sql } from "./db";
import { env } from "./env";
import { verifyToken } from "./tokens";
import { requireCanCreate, requirePremiumVoice, voiceForPlan } from "./entitlements";
import { originateAiCall } from "./signalwire-rest";
import { pickOutboundNumber } from "./reputation.server";
import { verifySignalWireSignature } from "./signalwire";
import { createServerFn } from "@tanstack/react-start";
import { sqlQuery } from "./db";
import { ensureSchema } from "./schema.server";
import { parsePhone } from "./contact-import";
import { workspaceDialCode } from "./contacts.server";
import { buildAiVerb, campaignGreeting, contactBrief, summaryPrompt, tagCall } from "./ai-agent.server";
import {
  AI_OUTCOMES,
  aiOutcomeLabel,
  sanitizeAiSettings,
} from "./ai-agent-options";

export const CAMPAIGN_AI_WEBHOOK_PATH = "/api/voice/signalwire-ai";

/** A stalled row waits this long for its status callback before the reconcile check gives up on it. */
const STALL_TIMEOUT_MINUTES = 5;
/** Caps synchronous dial failures walked in one invocation, so a bad list can't run past the Worker's CPU budget. */
const MAX_SYNCHRONOUS_FAILURES = 5;

async function requireTenant(token: string): Promise<string> {
  const payload = await verifyToken(token);
  if (!payload || !payload.tenantId) throw new Error("Not signed in.");
  return payload.tenantId;
}

/** "Hi {{first_name}}" -> "Hi Jordan". Falls back to "there"/"" for missing fields rather than leaving the literal placeholder. */
function interpolate(
  template: string,
  contact: { person: string | null; company: string | null; firstName?: string | null; lastName?: string | null; location?: string | null; country?: string | null },
): string {
  const name = contact.person?.trim() || [contact.firstName, contact.lastName].filter(Boolean).join(" ").trim() || "";
  const firstName = contact.firstName?.trim() || name.split(/\s+/)[0] || "there";
  const lastName = contact.lastName?.trim() || name.split(/\s+/).slice(1).join(" ");
  return template
    .replaceAll("{{first_name}}", firstName)
    .replaceAll("{{last_name}}", lastName)
    .replaceAll("{{name}}", name || "there")
    .replaceAll("{{company}}", contact.company?.trim() || "")
    .replaceAll("{{location}}", contact.location?.trim() || "")
    .replaceAll("{{city}}", contact.location?.trim() || "")
    .replaceAll("{{country}}", contact.country?.trim() || "");
}

function originForRequest(request: Request): string {
  return new URL(request.url).origin;
}

/**
 * Claims the next pending, non-DNC contact for a campaign and dials it.
 *
 * Re-checks do_not_call at claim time (not just at seed time) since a
 * contact can be flagged DNC after a campaign is already partway through.
 * `for update skip locked` is the standard Postgres queue-claim idiom — no
 * Durable Object or KV lock needed for a strictly-sequential, one-at-a-time
 * dialer.
 */
export async function dialNextPendingContact(
  campaignId: string,
  origin: string,
  failuresSoFar = 0,
): Promise<void> {
  if (failuresSoFar >= MAX_SYNCHRONOUS_FAILURES) return;

  // A missing carrier credential is a whole-campaign problem, not a
  // per-contact one — checking it here (a plain env read, no DB round trip)
  // stops the chain in one shot instead of burning a DB query and a failed
  // fetch per contact until MAX_SYNCHRONOUS_FAILURES, which was enough on its
  // own to exhaust Cloudflare's per-invocation subrequest limit.
  if (!env.signalwireProjectId || !env.signalwireApiToken || !env.signalwireSpaceName) {
    await sql`
      update campaigns set status = 'Paused', updated_at = now() where id = ${campaignId} and status = 'Active'
    `;
    console.warn(`[campaign-dialer] ${campaignId} paused — SignalWire REST credentials not configured`);
    return;
  }

  await ensureSchema();
  const [campaign] = await sql`
    select tenant_id, status, ai_prompt, ai_settings from campaigns where id = ${campaignId} limit 1
  `;
  if (!campaign || campaign.status !== "Active") return; // paused or gone — stop the chain

  const tenantId = campaign.tenant_id as string;

  try {
    await requireCanCreate(tenantId, "calls");
  } catch (err) {
    await sql`
      update campaigns set status = 'Paused', updated_at = now()
      where id = ${campaignId} and status = 'Active'
    `;
    console.warn(`[campaign-dialer] ${campaignId} paused — plan limit reached`, err);
    return;
  }

  const [claimed] = await sql`
    update campaign_calls set status = 'calling', attempts = attempts + 1, updated_at = now()
    where id = (
      select cc.id from campaign_calls cc
      join contacts ct on ct.id = cc.contact_id
      where cc.campaign_id = ${campaignId} and cc.status = 'pending' and ct.do_not_call = false
      order by cc.created_at asc limit 1
      for update skip locked
    )
    returning id, contact_id
  `;
  if (!claimed) return; // nothing left to dial — campaign is done

  const [contact] = await sql`
    select person, company, phone from contacts where id = ${claimed.contact_id} limit 1
  `;
  if (!contact) {
    await sql`update campaign_calls set status = 'skipped', updated_at = now() where id = ${claimed.id}`;
    return dialNextPendingContact(campaignId, origin, failuresSoFar);
  }

  const fromNumber = await primaryOutboundNumber(tenantId);
  if (!fromNumber) {
    await sql`
      update campaigns set status = 'Paused', updated_at = now() where id = ${campaignId} and status = 'Active'
    `;
    console.warn(`[campaign-dialer] ${campaignId} paused — no usable outbound number (none configured, or all at their daily limit or resting)`);
    return;
  }

  // The settings in force are kept on the call: the action webhooks read them back.
  const settings = sanitizeAiSettings(campaign.ai_settings);
  const [{ id: callId }] = await sql`
    insert into calls (tenant_id, campaign_id, direction, to_number, from_number, contact_id, status, handled_by, ai_settings)
    values (${tenantId}, ${campaignId}, 'outbound', ${contact.phone}, ${fromNumber}, ${claimed.contact_id}, 'ringing', 'ai',
            ${JSON.stringify(settings)}::jsonb)
    returning id
  `;
  await sql`update campaign_calls set call_id = ${callId} where id = ${claimed.id}`;

  const result = await originateAiCall({
    to: contact.phone,
    from: fromNumber,
    webhookUrl: `${origin}${CAMPAIGN_AI_WEBHOOK_PATH}?campaignCallId=${claimed.id}`,
    statusCallbackUrl: `${origin}${CAMPAIGN_AI_WEBHOOK_PATH}?campaignCallId=${claimed.id}&event=status`,
    machineDetection:
      settings.voicemail === "talk" ? undefined : settings.voicemail === "message" ? "DetectMessageEnd" : "Enable",
  });

  if (!result.ok) {
    console.error(`[campaign-dialer] ${campaignId} dial failed for ${claimed.id} — ${result.error}`);
    await sql`update campaign_calls set status = 'failed', updated_at = now() where id = ${claimed.id}`;
    await sql`update calls set status = 'failed', error = ${result.error ?? "Dial failed"}, ended_at = now() where id = ${callId}`;
    return dialNextPendingContact(campaignId, origin, failuresSoFar + 1);
  }

  // SignalWire's own call id, so a stuck or disputed call can be cross-referenced
  // against their Voice Logs directly instead of guessing which entry it is.
  const sid = (result.body as { sid?: string } | null)?.sid;
  if (sid) {
    await sql`update calls set provider_call_id = ${sid} where id = ${callId}`;
  }
}

/** The tenant's own number to dial out from — an AI campaign needs a SignalWire-provisioned number, same as any other outbound leg. */
async function primaryOutboundNumber(tenantId: string): Promise<string | null> {
  return pickOutboundNumber(tenantId);
}

/**
 * Handles both the SWML-request hit (answering the call) and the
 * end-of-call status callback (same path, `?event=status`) — mirrors how
 * inbound-signalwire.ts dispatches on a `step` query param.
 */
export async function handleCampaignAiWebhook(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const raw = await request.text();
  const params: Record<string, string> = {};
  for (const [k, v] of new URLSearchParams(raw)) params[k] = v;

  const verdict = await verifySignalWireSignature(
    request.url,
    params,
    request.headers.get("x-signalwire-signature"),
  );
  if (verdict === "invalid") {
    return new Response("Invalid signature", { status: 403 });
  }

  const sampleCallId = url.searchParams.get("sampleCallId");
  if (sampleCallId) {
    return url.searchParams.get("event") === "status"
      ? handleSampleStatus(sampleCallId, params)
      : handleSampleAnswer(sampleCallId, originForRequest(request));
  }

  const campaignCallId = url.searchParams.get("campaignCallId");
  if (!campaignCallId) return new Response("Missing campaignCallId", { status: 400 });

  if (url.searchParams.get("event") === "status") {
    return handleStatusCallback(campaignCallId, params, originForRequest(request));
  }

  return handleAnswer(campaignCallId, params, originForRequest(request));
}

/** True when the carrier says an answering machine (or a fax) picked up rather than a person. */
function isMachine(answeredBy: string | undefined): boolean {
  const a = (answeredBy ?? "").toLowerCase();
  return a.startsWith("machine") || a === "fax";
}

async function handleAnswer(campaignCallId: string, params: Record<string, string>, origin: string): Promise<Response> {
  await ensureSchema();
  const [row] = await sql`
    select cc.campaign_id, cc.call_id, cc.tenant_id, cc.contact_id, ct.person, ct.company, ct.first_name, ct.last_name, ct.location, ct.country, c.ai_prompt, c.ai_settings
    from campaign_calls cc
    join contacts ct on ct.id = cc.contact_id
    join campaigns c on c.id = cc.campaign_id
    where cc.id = ${campaignCallId} limit 1
  `;
  // A missing row (deleted campaign mid-chain) is a silent stop, not an error —
  // hang up politely rather than 500ing back at the carrier.
  if (!row || !row.ai_prompt) {
    return swml({ sections: { main: [{ hangup: {} }] } });
  }

  const saved = sanitizeAiSettings(row.ai_settings);
  const settings = { ...saved, voice: await voiceForPlan(row.tenant_id as string, saved.voice) };
  const person = {
    person: row.person as string | null,
    company: row.company as string | null,
    firstName: row.first_name as string | null,
    lastName: row.last_name as string | null,
    location: row.location as string | null,
    country: row.country as string | null,
  };

  // A voicemail greeting is not a conversation: hang up, or leave the message once the beep is done.
  if (isMachine(params["AnsweredBy"])) {
    if (row.call_id) await tagCall(row.call_id as string, "voicemail");
    const beepDone = (params["AnsweredBy"] ?? "").toLowerCase().startsWith("machine_end");
    if (settings.voicemail === "message" && settings.voicemailMessage.trim() && beepDone) {
      const message = interpolate(settings.voicemailMessage, person);
      return swml({
        version: "1.0.0",
        sections: { main: [{ answer: {} }, { sleep: 400 }, { play: { url: `say:${message}` } }, { hangup: {} }] },
      });
    }
    return swml({ version: "1.0.0", sections: { main: [{ hangup: {} }] } });
  }

  const brief = await contactBrief(row.tenant_id as string, row.contact_id as string);
  const ai = await buildAiVerb({
    kind: "campaign",
    settings,
    role: interpolate(row.ai_prompt, person),
    brief,
    callId: row.call_id as string,
    origin,
    greeting: campaignGreeting((row.first_name as string | null) || (row.person as string | null)),
    postPrompt: summaryPrompt("the person who runs this campaign"),
  });
  console.log(`[campaign-ai] answered ${campaignCallId}: AnsweredBy=${params["AnsweredBy"] ?? "(not checked)"} voice=${settings.voice} model=${settings.model} style=${settings.style}`);
  return swml({ version: "1.0.0", sections: { main: [{ answer: {} }, { ai }, { hangup: {} }] } });
}

async function handleStatusCallback(
  campaignCallId: string,
  params: Record<string, string>,
  origin: string,
): Promise<Response> {
  const callStatus = (params["CallStatus"] ?? "").toLowerCase();
  const duration = Number(params["CallDuration"] ?? 0);
  console.log(`[campaign-ai] finished ${campaignCallId}: status=${callStatus} seconds=${duration} error=${params["ErrorCode"] ?? ""} ${params["ErrorMessage"] ?? ""}`);

  await ensureSchema();
  const [tagged] = await sql`
    select c.ai_outcome from campaign_calls cc left join calls c on c.id = cc.call_id where cc.id = ${campaignCallId}
  `;
  const aiOutcome = (tagged?.["ai_outcome"] as string | null | undefined) ?? null;
  // A voicemail greeting is a connected call to the carrier but not a conversation.
  const answered = callStatus === "completed" && duration > 0 && aiOutcome !== "voicemail";

  // A carrier-level failure (rate limited, invalid destination, etc.) is a
  // different thing from a genuine no-answer/busy — worth keeping distinct
  // in Call History rather than flattening every non-completed call to the
  // same generic label.
  const errorMessage = params["ErrorMessage"];
  const { status: callRowStatus, outcome } = answered
    ? { status: "completed", outcome: aiOutcomeLabel(aiOutcome) ?? "Connected" }
    : aiOutcome === "voicemail"
      ? { status: "no_answer", outcome: "Voicemail" }
      : callStatus === "busy"
      ? { status: "busy", outcome: "Busy" }
      : callStatus === "failed" || callStatus === "canceled"
        ? { status: "failed", outcome: errorMessage ?? "Call failed" }
        : { status: "no_answer", outcome: "No answer" };

  const [row] = await sql`
    select campaign_id, call_id from campaign_calls where id = ${campaignCallId} and status = 'calling'
  `;
  if (!row) return new Response(null, { status: 204 }); // already handled — redelivered webhook, no-op

  // Conditional UPDATE: only this delivery (the one that actually finds the
  // row still 'calling') gets to advance the chain. A redelivered webhook
  // finds nothing to update and stops here.
  const [claimed] = await sql`
    update campaign_calls set status = ${answered ? "completed" : "failed"}, updated_at = now()
    where id = ${campaignCallId} and status = 'calling'
    returning id, campaign_id
  `;
  if (!claimed) return new Response(null, { status: 204 });

  if (row.call_id) {
    await sql`
      update calls set
        status = ${callRowStatus},
        outcome = ${outcome},
        error = ${callRowStatus === "failed" ? outcome : null},
        answered_at = case when ${answered} then now() else answered_at end,
        ended_at = now(),
        duration_seconds = ${Number.isFinite(duration) ? duration : null}
      where id = ${row.call_id}
    `;
  }

  await dialNextPendingContact(row.campaign_id, origin);
  return new Response(null, { status: 204 });
}

function swml(doc: unknown): Response {
  return new Response(JSON.stringify(doc), { status: 200, headers: { "content-type": "application/json" } });
}

/** For a campaign's own detail view — flips rows stuck mid-flight (accepted but never got a status callback) so the chain doesn't stall forever. There's no cron here, so this only runs when someone's actually looking at the campaign. */
export async function reconcileCampaign(data: { token: string; campaignId: string; origin: string }) {
  const tenantId = await requireTenant(data.token);
  const stalled = await sql`
    update campaign_calls set status = 'failed', updated_at = now()
    where campaign_id = ${data.campaignId} and tenant_id = ${tenantId}
      and status = 'calling' and updated_at < now() - (${STALL_TIMEOUT_MINUTES}::int) * interval '1 minute'
    returning id
  `;
  if (stalled.length > 0) {
    await dialNextPendingContact(data.campaignId, data.origin);
  }
  return { ok: true as const, reconciled: stalled.length };
}

export const reconcileCampaignFn = createServerFn({ method: "POST" })
  .validator((data: { token: string; campaignId: string; origin: string }) => data)
  .handler(async ({ data }) => reconcileCampaign(data));

export interface CampaignCallLogRow {
  id: string;
  contact_name: string | null;
  phone: string | null;
  status: string;
  attempts: number;
  outcome: string | null;
  duration_seconds: number | null;
  updated_at: string;
}

/** Per-contact dial log for a campaign's detail view — what actually happened, not just a count. */
export async function getCampaignCallLog(data: { token: string; campaignId: string }) {
  const tenantId = await requireTenant(data.token);

  const rows = await sql`
    select cc.id, coalesce(ct.company, ct.person) as contact_name, ct.phone,
           cc.status, cc.attempts, c.outcome, c.duration_seconds, cc.updated_at
    from campaign_calls cc
    join contacts ct on ct.id = cc.contact_id
    left join calls c on c.id = cc.call_id
    where cc.campaign_id = ${data.campaignId} and cc.tenant_id = ${tenantId}
    order by cc.updated_at desc
    limit 200
  `;
  return { ok: true as const, log: rows as unknown as CampaignCallLogRow[] };
}

export const getCampaignCallLogFn = createServerFn({ method: "POST" })
  .validator((data: { token: string; campaignId: string }) => data)
  .handler(async ({ data }) => getCampaignCallLog(data));

/** Kicks off (or resumes) an AI-agent campaign's dial chain. */
export async function startCampaignDialing(data: { token: string; campaignId: string; origin: string }) {
  const tenantId = await requireTenant(data.token);

  const [campaign] = await sql`
    select mode, ai_prompt, compliance_ack, list_id
    from campaigns where id = ${data.campaignId} and tenant_id = ${tenantId} limit 1
  `;
  if (!campaign) throw new Error("Campaign not found.");
  if (campaign.mode !== "ai_agent") throw new Error("This campaign isn't set up for AI dialing.");
  if (!campaign.compliance_ack) {
    throw new Error("Confirm the consent/disclosure checkbox before starting this campaign.");
  }
  if (!campaign.ai_prompt?.trim()) throw new Error("Write a prompt before starting this campaign.");
  if (!campaign.list_id) throw new Error("Choose a contact list before starting this campaign.");
  if (!env.signalwireProjectId || !env.signalwireApiToken || !env.signalwireSpaceName) {
    throw new Error("AI calling isn't set up yet — SignalWire REST credentials are missing.");
  }

  // Idempotent — seeding a campaign that's already partway through just
  // adds any contacts appended to the list since; it never resets progress.
  await sql`
    insert into campaign_calls (tenant_id, campaign_id, contact_id)
    select ${tenantId}, ${data.campaignId}, c.id
    from contacts c
    where c.tenant_id = ${tenantId} and c.list_id = ${campaign.list_id} and c.do_not_call = false
    on conflict (campaign_id, contact_id) do nothing
  `;

  await sql`update campaigns set status = 'Active', updated_at = now() where id = ${data.campaignId}`;
  await dialNextPendingContact(data.campaignId, data.origin);
  return { ok: true as const };
}

export const startCampaignDialingFn = createServerFn({ method: "POST" })
  .validator((data: { token: string; campaignId: string; origin: string }) => data)
  .handler(async ({ data }) => startCampaignDialing(data));

/** Pausing just stops the chain from advancing — dialNextPendingContact checks campaigns.status before every claim. */
export async function pauseCampaignDialing(data: { token: string; campaignId: string }) {
  const tenantId = await requireTenant(data.token);
  await sql`
    update campaigns set status = 'Paused', updated_at = now()
    where id = ${data.campaignId} and tenant_id = ${tenantId}
  `;
  return { ok: true as const };
}

export const pauseCampaignDialingFn = createServerFn({ method: "POST" })
  .validator((data: { token: string; campaignId: string }) => data)
  .handler(async ({ data }) => pauseCampaignDialing(data));

// ---------------------------------------------------------------------------
// Hear a voice: a short call to your own phone
// ---------------------------------------------------------------------------

const SAMPLES_PER_DAY = 5;

const SAMPLE_GREETING =
  "Hi, this is how I sound on a call. If you like this voice, you can use it for your calls. " +
  "Go ahead and say something back, and I will answer.";

/** Rings the given number with the chosen voice and style, so it can be judged by ear before it is used on real people. */
export async function sampleAiCall(data: { token: string; settings: unknown; to: string; origin: string }) {
  const tenantId = await requireTenant(data.token);
  await ensureSchema();
  if (!env.signalwireProjectId || !env.signalwireApiToken || !env.signalwireSpaceName) {
    throw new Error("AI calling isn't set up yet — SignalWire REST credentials are missing.");
  }

  const settings = sanitizeAiSettings(data.settings);
  await requirePremiumVoice(tenantId, settings.voice);
  const parsed = parsePhone(data.to, await workspaceDialCode(tenantId));
  if ("error" in parsed) throw new Error(`${parsed.error}.`);

  const [{ n }] = (await sql`
    select count(*)::int as n from calls
    where tenant_id = ${tenantId} and handled_by = 'ai_sample' and started_at > now() - interval '1 day'
  `) as unknown as { n: number }[];
  if (n >= SAMPLES_PER_DAY) throw new Error(`You can place ${SAMPLES_PER_DAY} sample calls a day. Try again tomorrow.`);

  const fromNumber = await pickOutboundNumber(tenantId);
  if (!fromNumber) throw new Error("Add a phone number first. A sample call needs a number to ring from.");

  const [{ id: callId }] = await sql`
    insert into calls (tenant_id, direction, to_number, from_number, status, handled_by, ai_settings)
    values (${tenantId}, 'outbound', ${parsed.phone}, ${fromNumber}, 'ringing', 'ai_sample', ${JSON.stringify(settings)}::jsonb)
    returning id
  `;
  const result = await originateAiCall({
    to: parsed.phone,
    from: fromNumber,
    webhookUrl: `${data.origin}${CAMPAIGN_AI_WEBHOOK_PATH}?sampleCallId=${callId}`,
    statusCallbackUrl: `${data.origin}${CAMPAIGN_AI_WEBHOOK_PATH}?sampleCallId=${callId}&event=status`,
  });
  if (!result.ok) {
    await sql`update calls set status = 'failed', error = ${result.error ?? "Dial failed"}, ended_at = now() where id = ${callId}`;
    throw new Error(result.error ?? "The sample call could not be placed.");
  }
  return { ok: true as const, to: parsed.phone };
}

export const sampleAiCallFn = createServerFn({ method: "POST" })
  .validator((data: { token: string; settings: unknown; to: string; origin: string }) => data)
  .handler(async ({ data }) => sampleAiCall(data));

async function handleSampleAnswer(callId: string, origin: string): Promise<Response> {
  const [call] = await sql`select ai_settings from calls where id = ${callId} and handled_by = 'ai_sample' limit 1`;
  if (!call) return swml({ version: "1.0.0", sections: { main: [{ hangup: {} }] } });
  const ai = await buildAiVerb({
    kind: "sample",
    settings: sanitizeAiSettings(call["ai_settings"]),
    role:
      "You are demonstrating your voice to a business owner who is trying voices before choosing one. " +
      "Chat briefly and naturally with whatever they say. After a few exchanges, say a warm goodbye.",
    callId,
    origin,
    greeting: SAMPLE_GREETING,
    hardStop: "40s",
  });
  return swml({ version: "1.0.0", sections: { main: [{ answer: {} }, { ai }, { hangup: {} }] } });
}

async function handleSampleStatus(callId: string, params: Record<string, string>): Promise<Response> {
  const status = (params["CallStatus"] ?? "").toLowerCase();
  const duration = Number(params["CallDuration"] ?? 0);
  const answered = status === "completed" && duration > 0;
  await sql`
    update calls set
      status = ${answered ? "completed" : status === "busy" ? "busy" : status === "failed" ? "failed" : "no_answer"},
      outcome = ${answered ? "Voice sample" : "Voice sample not answered"},
      answered_at = case when ${answered} then now() else answered_at end,
      ended_at = now(),
      duration_seconds = ${Number.isFinite(duration) ? duration : null}
    where id = ${callId} and handled_by = 'ai_sample'
  `;
  return new Response(null, { status: 204 });
}

// ---------------------------------------------------------------------------
// Calling people back, by how the last call went
// ---------------------------------------------------------------------------

/** Outcomes it makes sense to dial again. Do-not-call, wrong numbers and transfers are never offered. */
const RECALLABLE = ["no_answer", "voicemail", "call_back", "no_decision", "interested", "not_interested", "untagged"] as const;

const RECALL_LABELS: Record<string, string> = {
  no_answer: "No answer",
  untagged: "Connected, no tag",
  ...Object.fromEntries(AI_OUTCOMES.map((o) => [o.id, o.label])),
};

/** How one queue row ended: the tag the agent gave it, else whether it connected at all. */
const RESULT_KEY_SQL = `coalesce((select c.ai_outcome from calls c where c.id = cc.call_id), case when cc.status = 'failed' then 'no_answer' else 'untagged' end)`;

/** How the calls so far ended, for choosing who to call again. */
export async function getCampaignOutcomes(data: { token: string; campaignId: string }) {
  const tenantId = await requireTenant(data.token);
  const rows = await sqlQuery(
    `select ${RESULT_KEY_SQL} as key, count(*)::int as n
     from campaign_calls cc
     where cc.campaign_id = $1 and cc.tenant_id = $2 and cc.status in ('completed','failed')
     group by 1`,
    [data.campaignId, tenantId],
  );
  const [pending] = await sql`
    select count(*)::int as n from campaign_calls where campaign_id = ${data.campaignId} and tenant_id = ${tenantId} and status = 'pending'
  `;
  return {
    ok: true as const,
    pending: Number(pending?.["n"] ?? 0),
    outcomes: rows
      .map((r) => ({ key: String(r["key"]), label: RECALL_LABELS[String(r["key"])] ?? String(r["key"]), count: Number(r["n"]) }))
      .filter((o) => (RECALLABLE as readonly string[]).includes(o.key))
      .sort((a, b) => b.count - a.count),
  };
}

export const getCampaignOutcomesFn = createServerFn({ method: "POST" })
  .validator((data: { token: string; campaignId: string }) => data)
  .handler(async ({ data }) => getCampaignOutcomes(data));

/** Puts the chosen contacts back in the queue. Press Start dialing to call them. */
export async function recallCampaign(data: { token: string; campaignId: string; outcomes: string[] }) {
  const tenantId = await requireTenant(data.token);
  const keys = (Array.isArray(data.outcomes) ? data.outcomes : []).filter((k) => (RECALLABLE as readonly string[]).includes(k));
  if (keys.length === 0) throw new Error("Choose who to call again.");
  const rows = await sqlQuery(
    `update campaign_calls cc set status = 'pending', updated_at = now()
     where cc.campaign_id = $1 and cc.tenant_id = $2 and cc.status in ('completed','failed')
       and ${RESULT_KEY_SQL} = any($3::text[])
       and exists (select 1 from contacts ct where ct.id = cc.contact_id and ct.do_not_call = false)
     returning cc.id`,
    [data.campaignId, tenantId, keys],
  );
  return { ok: true as const, requeued: rows.length };
}

export const recallCampaignFn = createServerFn({ method: "POST" })
  .validator((data: { token: string; campaignId: string; outcomes: string[] }) => data)
  .handler(async ({ data }) => recallCampaign(data));

// ---------------------------------------------------------------------------
// Appointments the agent noted, for the owner to confirm
// ---------------------------------------------------------------------------

export interface AppointmentRow {
  id: string;
  name: string | null;
  phone: string | null;
  when_text: string;
  reason: string | null;
  status: "requested" | "confirmed" | "dismissed";
  created_at: string;
}

export async function listAppointments(data: { token: string }) {
  const tenantId = await requireTenant(data.token);
  await ensureSchema();
  const rows = await sql`
    select id, name, phone, when_text, reason, status, created_at from appointments
    where tenant_id = ${tenantId} order by (status = 'requested') desc, created_at desc limit 100
  `;
  return { ok: true as const, appointments: rows as unknown as AppointmentRow[] };
}

export const listAppointmentsFn = createServerFn({ method: "POST" })
  .validator((data: { token: string }) => data)
  .handler(async ({ data }) => listAppointments(data));

export async function setAppointmentStatus(data: { token: string; id: string; status: string }) {
  const tenantId = await requireTenant(data.token);
  if (data.status !== "confirmed" && data.status !== "dismissed" && data.status !== "requested") {
    throw new Error("Unknown status.");
  }
  await ensureSchema();
  await sql`update appointments set status = ${data.status} where id = ${data.id} and tenant_id = ${tenantId}`;
  return { ok: true as const };
}

export const setAppointmentStatusFn = createServerFn({ method: "POST" })
  .validator((data: { token: string; id: string; status: string }) => data)
  .handler(async ({ data }) => setAppointmentStatus(data));
