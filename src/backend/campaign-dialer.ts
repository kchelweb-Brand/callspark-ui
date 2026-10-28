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
import { requireCanCreate } from "./entitlements";
import { originateAiCall } from "./signalwire-rest";
import { pickOutboundNumber } from "./reputation.server";
import { verifySignalWireSignature } from "./signalwire";
import { createServerFn } from "@tanstack/react-start";

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
const OPENING_INSTRUCTION =
  "IMPORTANT: You placed this call and the person has just picked up. Do not wait for them to speak. " +
  "Speak first, right away: say a short greeting, who you are and why you are calling, in one or two sentences, " +
  "then pause and let them answer. If they say hello first, still introduce yourself straight away.";

function interpolate(template: string, contact: { person: string | null; company: string | null }): string {
  const name = contact.person?.trim() || "";
  const firstName = name.split(/\s+/)[0] || "there";
  return template
    .replaceAll("{{first_name}}", firstName)
    .replaceAll("{{name}}", name || "there")
    .replaceAll("{{company}}", contact.company?.trim() || "");
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

  const [campaign] = await sql`
    select tenant_id, status, ai_prompt from campaigns where id = ${campaignId} limit 1
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

  const [{ id: callId }] = await sql`
    insert into calls (tenant_id, campaign_id, direction, to_number, from_number, contact_id, status)
    values (${tenantId}, ${campaignId}, 'outbound', ${contact.phone}, ${fromNumber}, ${claimed.contact_id}, 'ringing')
    returning id
  `;
  await sql`update campaign_calls set call_id = ${callId} where id = ${claimed.id}`;

  const result = await originateAiCall({
    to: contact.phone,
    from: fromNumber,
    webhookUrl: `${origin}${CAMPAIGN_AI_WEBHOOK_PATH}?campaignCallId=${claimed.id}`,
    statusCallbackUrl: `${origin}${CAMPAIGN_AI_WEBHOOK_PATH}?campaignCallId=${claimed.id}&event=status`,
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

  const campaignCallId = url.searchParams.get("campaignCallId");
  if (!campaignCallId) return new Response("Missing campaignCallId", { status: 400 });

  if (url.searchParams.get("event") === "status") {
    return handleStatusCallback(campaignCallId, params, originForRequest(request));
  }

  return handleAnswer(campaignCallId);
}

async function handleAnswer(campaignCallId: string): Promise<Response> {
  const [row] = await sql`
    select cc.campaign_id, ct.person, ct.company, c.ai_prompt
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

  // The model only talks first when told to: with just a role description it
  // sits silent until the person says "hello", so every campaign prompt gets
  // the same opening instruction appended.
  const prompt = `${interpolate(row.ai_prompt, { person: row.person, company: row.company })}\n\n${OPENING_INSTRUCTION}`;
  return swml({
    version: "1.0.0",
    sections: {
      main: [
        { answer: {} },
        {
          ai: {
            prompt: { text: prompt },
            params: { direction: "outbound", wait_for_user: false },
          },
        },
        { hangup: {} },
      ],
    },
  });
}

async function handleStatusCallback(
  campaignCallId: string,
  params: Record<string, string>,
  origin: string,
): Promise<Response> {
  const callStatus = (params["CallStatus"] ?? "").toLowerCase();
  const duration = Number(params["CallDuration"] ?? 0);
  const answered = callStatus === "completed" && duration > 0;

  // A carrier-level failure (rate limited, invalid destination, etc.) is a
  // different thing from a genuine no-answer/busy — worth keeping distinct
  // in Call History rather than flattening every non-completed call to the
  // same generic label.
  const errorMessage = params["ErrorMessage"];
  const { status: callRowStatus, outcome } = answered
    ? { status: "completed", outcome: "Connected" }
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
