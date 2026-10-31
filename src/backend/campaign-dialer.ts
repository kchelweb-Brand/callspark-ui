// Voice-broadcast campaigns: one recording, played to everyone on a contact list who answers.
//
// The carrier (SignalWire) does the dialing and the playing; we only tell it
// who to ring and what to do when someone picks up, using the same cXML the
// inbound phone system already speaks. There is no cron driving this: the
// dialer chains itself through webhooks — place a call, and when its status
// callback arrives, place the next one. With "calls at once" above one, that many
// chains run side by side.

import { createServerFn } from "@tanstack/react-start";

import { sql, sqlQuery } from "./db";
import { env } from "./env";
import { verifyToken } from "./tokens";
import { requireCanCreate } from "./entitlements";
import { originateCall } from "./signalwire-rest";
import { pickOutboundNumber } from "./reputation.server";
import { cxml, dial, gather, hangup, pause, play, say, verifySignalWireSignature } from "./signalwire";
import { ensureSchema } from "./schema.server";
import { parsePhone } from "./contact-import";
import { workspaceDialCode } from "./contacts.server";
import { sanitizeRecordingSettings, transferTarget, type RecordingSettings } from "./recording-options";

export const CAMPAIGN_WEBHOOK_PATH = "/api/voice/campaign";

/** A row waits this long for its status callback before the reconcile check gives up on it. Long enough for a "press 1" conversation. */
const STALL_TIMEOUT_MINUTES = 20;
/** Caps synchronous dial failures walked in one invocation, so a bad list can't run past the Worker's CPU budget. */
const MAX_SYNCHRONOUS_FAILURES = 5;
/** Test calls a workspace can place in a day. */
const TESTS_PER_DAY = 15;

/** How one call ended. Stored on the call so the log and "call again" can tell them apart. */
type Result = "played" | "voicemail" | "voicemail_left" | "transferred" | "opted_out" | "no_answer";

const RESULT_LABELS: Record<Result, string> = {
  played: "Played",
  voicemail: "Voicemail",
  voicemail_left: "Left on voicemail",
  transferred: "Pressed 1, connected",
  opted_out: "Asked not to be called",
  no_answer: "No answer",
};

async function requireTenant(token: string): Promise<string> {
  const payload = await verifyToken(token);
  if (!payload || !payload.tenantId) throw new Error("Not signed in.");
  return payload.tenantId;
}

function carrierConfigured(): boolean {
  return Boolean(env.signalwireProjectId && env.signalwireApiToken && env.signalwireSpaceName);
}

/** Absolute address of a stored recording; the carrier's media server cannot use a relative one. */
function recordingUrl(settings: RecordingSettings, origin: string): string | null {
  const url = settings.file?.url;
  if (!url) return null;
  return url.startsWith("http") ? url : `${origin}${url.startsWith("/") ? "" : "/"}${url}`;
}

/** The carrier option that tells a person from an answering machine, or nothing when we don't check. */
function detection(settings: RecordingSettings): { machineDetection?: "Enable" | "DetectMessageEnd" } {
  if (settings.voicemail === "play") return {};
  return { machineDetection: settings.voicemail === "leave" ? "DetectMessageEnd" : "Enable" };
}

/** True when the carrier says an answering machine (or a fax) picked up rather than a person. */
function isMachine(answeredBy: string | undefined): boolean {
  const a = (answeredBy ?? "").toLowerCase();
  return a.startsWith("machine") || a === "fax";
}

function webhookUrl(origin: string, params: Record<string, string>): string {
  const u = new URL(CAMPAIGN_WEBHOOK_PATH, origin);
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
  return u.toString();
}

async function setResult(callId: string | null | undefined, result: Result): Promise<void> {
  if (!callId) return;
  await sql`update calls set broadcast_result = ${result} where id = ${callId}`;
}

// ---------------------------------------------------------------------------
// The dial chain
// ---------------------------------------------------------------------------

/**
 * Claims the next pending, non-DNC contact for a campaign and dials it.
 *
 * Re-checks do_not_call at claim time (not just at seed time) since a
 * contact can be flagged DNC after a campaign is already partway through.
 * `for update skip locked` is the standard Postgres queue-claim idiom — no
 * Durable Object or KV lock needed.
 */
export async function dialNextPendingContact(campaignId: string, origin: string, failuresSoFar = 0): Promise<void> {
  if (failuresSoFar >= MAX_SYNCHRONOUS_FAILURES) return;

  // A missing carrier credential is a whole-campaign problem, not a
  // per-contact one — checking it here (a plain env read, no DB round trip)
  // stops the chain in one shot instead of burning a query and a failed fetch
  // per contact.
  if (!carrierConfigured()) {
    await sql`update campaigns set status = 'Paused', updated_at = now() where id = ${campaignId} and status = 'Active'`;
    console.warn(`[campaign-dialer] ${campaignId} paused — SignalWire REST credentials not configured`);
    return;
  }

  await ensureSchema();
  const [campaign] = (await sql`select tenant_id, status, recording from campaigns where id = ${campaignId} limit 1`) as unknown as {
    tenant_id: string;
    status: string;
    recording: unknown;
  }[];
  if (!campaign || campaign.status !== "Active") return; // paused or gone — stop the chain

  const tenantId = campaign.tenant_id;
  const settings = sanitizeRecordingSettings(campaign.recording);
  if (!settings.file) {
    await sql`update campaigns set status = 'Paused', updated_at = now() where id = ${campaignId} and status = 'Active'`;
    console.warn(`[campaign-dialer] ${campaignId} paused — no recording`);
    return;
  }

  try {
    await requireCanCreate(tenantId, "calls");
  } catch (err) {
    await sql`update campaigns set status = 'Paused', updated_at = now() where id = ${campaignId} and status = 'Active'`;
    console.warn(`[campaign-dialer] ${campaignId} paused — plan limit reached`, err);
    return;
  }

  const [claimed] = (await sql`
    update campaign_calls set status = 'calling', attempts = attempts + 1, updated_at = now()
    where id = (
      select cc.id from campaign_calls cc
      join contacts ct on ct.id = cc.contact_id
      where cc.campaign_id = ${campaignId} and cc.status = 'pending' and ct.do_not_call = false
      order by cc.created_at asc limit 1
      for update skip locked
    )
    returning id, contact_id
  `) as unknown as { id: string; contact_id: string }[];
  if (!claimed) {
    // Nothing waiting. If nothing is in flight either, the list is finished.
    // (Someone flagged do-not-call after the list was loaded is never dialed, so they don't hold it open.)
    const [open] = await sql`
      select count(*)::int as n
      from campaign_calls cc join contacts ct on ct.id = cc.contact_id
      where cc.campaign_id = ${campaignId}
        and (cc.status = 'calling' or (cc.status = 'pending' and ct.do_not_call = false))
    `;
    if (Number(open?.["n"] ?? 0) === 0) {
      await sql`update campaigns set status = 'Completed', updated_at = now() where id = ${campaignId} and status = 'Active'`;
    }
    return;
  }

  const [contact] = (await sql`select phone from contacts where id = ${claimed.contact_id} limit 1`) as unknown as { phone: string }[];
  if (!contact) {
    await sql`update campaign_calls set status = 'skipped', updated_at = now() where id = ${claimed.id}`;
    return dialNextPendingContact(campaignId, origin, failuresSoFar);
  }

  const fromNumber = await pickOutboundNumber(tenantId);
  if (!fromNumber) {
    // Put the contact back; nothing was dialed.
    await sql`update campaign_calls set status = 'pending', attempts = greatest(attempts - 1, 0), updated_at = now() where id = ${claimed.id}`;
    await sql`update campaigns set status = 'Paused', updated_at = now() where id = ${campaignId} and status = 'Active'`;
    console.warn(`[campaign-dialer] ${campaignId} paused — no usable outbound number (none configured, or all at their daily limit or resting)`);
    return;
  }

  const [created] = (await sql`
    insert into calls (tenant_id, campaign_id, direction, to_number, from_number, contact_id, status, handled_by)
    values (${tenantId}, ${campaignId}, 'outbound', ${contact.phone}, ${fromNumber}, ${claimed.contact_id}, 'ringing', 'broadcast')
    returning id
  `) as unknown as { id: string }[];
  if (!created) throw new Error("Could not record the call.");
  const callId = created.id;
  await sql`update campaign_calls set call_id = ${callId} where id = ${claimed.id}`;

  const result = await originateCall({
    to: contact.phone,
    from: fromNumber,
    webhookUrl: webhookUrl(origin, { campaignCallId: claimed.id }),
    statusCallbackUrl: webhookUrl(origin, { campaignCallId: claimed.id, event: "status" }),
    ...detection(settings),
  });

  if (!result.ok) {
    console.error(`[campaign-dialer] ${campaignId} dial failed for ${claimed.id} — ${result.error}`);
    await sql`update campaign_calls set status = 'failed', updated_at = now() where id = ${claimed.id}`;
    await sql`update calls set status = 'failed', error = ${result.error ?? "Dial failed"}, ended_at = now() where id = ${callId}`;
    return dialNextPendingContact(campaignId, origin, failuresSoFar + 1);
  }

  // The carrier's own call id, so a stuck or disputed call can be cross-referenced
  // against their Voice Logs directly instead of guessing which entry it is.
  const sid = (result.body as { sid?: string } | null)?.sid;
  if (sid) {
    await sql`update calls set provider_call_id = ${sid} where id = ${callId}`;
  }
}

// ---------------------------------------------------------------------------
// Carrier webhooks
// ---------------------------------------------------------------------------

/**
 * One path for everything the carrier asks us during a broadcast call:
 * - answered                       (no event)   -> what to play
 * - ?event=keys                                 -> the person pressed a key
 * - ?event=status                               -> the call is over
 * Test calls carry ?testCallId=&campaignId= instead of ?campaignCallId=.
 */
export async function handleCampaignWebhook(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const raw = await request.text();
  const params: Record<string, string> = {};
  for (const [k, v] of new URLSearchParams(raw)) params[k] = v;

  const verdict = await verifySignalWireSignature(request.url, params, request.headers.get("x-signalwire-signature"));
  if (verdict === "invalid") return new Response("Invalid signature", { status: 403 });

  const origin = url.origin;
  const event = url.searchParams.get("event");

  try {
    const testCallId = url.searchParams.get("testCallId");
    if (testCallId) {
      if (event === "status") return await handleTestStatus(testCallId, params);
      const campaignId = url.searchParams.get("campaignId") ?? "";
      return await handleAnswer({ kind: "test", callId: testCallId, campaignId }, event === "keys", params, origin);
    }

    const campaignCallId = url.searchParams.get("campaignCallId");
    if (!campaignCallId) return new Response("Missing campaignCallId", { status: 400 });
    if (event === "status") return await handleStatusCallback(campaignCallId, params, origin);
    return await handleAnswer({ kind: "campaign", campaignCallId }, event === "keys", params, origin);
  } catch (err) {
    console.error("[campaign] webhook failed", err);
    // Never leave a person in silence on an internal error.
    return cxml(hangup());
  }
}

type AnswerTarget =
  | { kind: "campaign"; campaignCallId: string }
  | { kind: "test"; callId: string; campaignId: string };

interface Loaded {
  settings: RecordingSettings;
  callId: string | null;
  contactId: string | null;
  fromNumber: string | null;
}

async function loadForAnswer(target: AnswerTarget): Promise<Loaded | null> {
  await ensureSchema();
  if (target.kind === "campaign") {
    const [row] = (await sql`
      select cc.call_id, cc.contact_id, c.recording, ca.from_number
      from campaign_calls cc
      join campaigns c on c.id = cc.campaign_id
      left join calls ca on ca.id = cc.call_id
      where cc.id = ${target.campaignCallId} limit 1
    `) as unknown as { call_id: string | null; contact_id: string | null; recording: unknown; from_number: string | null }[];
    if (!row) return null;
    return {
      settings: sanitizeRecordingSettings(row.recording),
      callId: row.call_id ?? null,
      contactId: row.contact_id ?? null,
      fromNumber: row.from_number ?? null,
    };
  }
  // A test call must be one we placed, for the same workspace that owns the campaign.
  const [row] = (await sql`
    select ca.from_number, c.recording
    from calls ca
    join campaigns c on c.tenant_id = ca.tenant_id and c.id = ${target.campaignId}
    where ca.id = ${target.callId} and ca.handled_by = 'broadcast_test' limit 1
  `) as unknown as { from_number: string | null; recording: unknown }[];
  if (!row) return null;
  return {
    settings: sanitizeRecordingSettings(row.recording),
    callId: target.callId,
    contactId: null,
    fromNumber: row.from_number ?? null,
  };
}

function keysEnabled(s: RecordingSettings): boolean {
  return s.connectEnabled || s.optOutEnabled;
}

async function handleAnswer(
  target: AnswerTarget,
  isKeyPress: boolean,
  params: Record<string, string>,
  origin: string,
): Promise<Response> {
  const loaded = await loadForAnswer(target);
  // A missing row (deleted campaign mid-chain) is a silent stop, not an error —
  // hang up politely rather than 500ing back at the carrier.
  if (!loaded) return cxml(hangup());
  const { settings } = loaded;
  const audio = recordingUrl(settings, origin);
  if (!audio) return cxml(hangup());

  if (isKeyPress) return handleKeyPress(target, loaded, params);

  // A voicemail greeting is not a conversation: hang up, or leave the message once the beep is done.
  if (isMachine(params["AnsweredBy"])) {
    const beepDone = (params["AnsweredBy"] ?? "").toLowerCase().startsWith("machine_end");
    if (settings.voicemail === "leave" && beepDone) {
      await setResult(loaded.callId, "voicemail_left");
      console.log(`[campaign] voicemail, leaving the recording: ${describe(target)}`);
      return cxml(pause(1) + play(audio) + hangup());
    }
    await setResult(loaded.callId, "voicemail");
    console.log(`[campaign] voicemail, hanging up: ${describe(target)} AnsweredBy=${params["AnsweredBy"]}`);
    return cxml(hangup());
  }

  console.log(`[campaign] answered ${describe(target)}: AnsweredBy=${params["AnsweredBy"] ?? "(not checked)"} keys=${keysEnabled(settings)}`);

  if (!keysEnabled(settings)) return cxml(pause(1) + play(audio) + hangup());

  // The person may press a key while the recording is still playing. If they press
  // nothing, the carrier comes back with no digits and we hang up.
  const action =
    target.kind === "campaign"
      ? webhookUrl(origin, { campaignCallId: target.campaignCallId, event: "keys" })
      : webhookUrl(origin, { testCallId: target.callId, campaignId: target.campaignId, event: "keys" });
  return cxml(pause(1) + gather({ action, numDigits: 1, timeoutSeconds: 6, nested: play(audio) }) + hangup());
}

function describe(target: AnswerTarget): string {
  return target.kind === "campaign" ? target.campaignCallId : `test ${target.callId}`;
}

async function handleKeyPress(target: AnswerTarget, loaded: Loaded, params: Record<string, string>): Promise<Response> {
  const { settings } = loaded;
  const digit = (params["Digits"] ?? "").trim();

  if (digit === "1" && settings.connectEnabled) {
    const to = transferTarget(settings);
    if (to) {
      await setResult(loaded.callId, "transferred");
      console.log(`[campaign] pressed 1, connecting: ${describe(target)}`);
      return cxml(
        say("Connecting you now. Please hold.") +
          dial([to], { ...(loaded.fromNumber ? { callerId: loaded.fromNumber } : {}), timeoutSeconds: 30 }) +
          hangup(),
      );
    }
  }

  if (digit === "2" && settings.optOutEnabled) {
    // A test call has no contact; a real one is never called again.
    if (loaded.contactId) {
      await sql`update contacts set do_not_call = true where id = ${loaded.contactId}`;
    }
    await setResult(loaded.callId, "opted_out");
    console.log(`[campaign] pressed 2, opted out: ${describe(target)}`);
    return cxml(say("You will not be called again. Goodbye.") + hangup());
  }

  return cxml(hangup());
}

async function handleStatusCallback(campaignCallId: string, params: Record<string, string>, origin: string): Promise<Response> {
  const callStatus = (params["CallStatus"] ?? "").toLowerCase();
  const duration = Number(params["CallDuration"] ?? 0);
  console.log(`[campaign] finished ${campaignCallId}: status=${callStatus} seconds=${duration} error=${params["ErrorCode"] ?? ""} ${params["ErrorMessage"] ?? ""}`);

  await ensureSchema();
  const [row] = await sql`
    select cc.campaign_id, cc.call_id, c.broadcast_result
    from campaign_calls cc left join calls c on c.id = cc.call_id
    where cc.id = ${campaignCallId} and cc.status = 'calling'
  `;
  if (!row) return new Response(null, { status: 204 }); // already handled — redelivered webhook, no-op

  const tagged = (row["broadcast_result"] as Result | null) ?? null;
  const connected = callStatus === "completed" && duration > 0;
  const errorMessage = params["ErrorMessage"];

  // What the log says, and whether the queue counts the contact as reached.
  let result: Result;
  let callRowStatus: string;
  let outcome: string;
  let reached: boolean;
  if (connected && tagged && tagged !== "voicemail" && tagged !== "no_answer") {
    result = tagged;
    callRowStatus = "completed";
    outcome = RESULT_LABELS[tagged];
    reached = true;
  } else if (connected && tagged === "voicemail") {
    result = "voicemail";
    callRowStatus = "no_answer";
    outcome = RESULT_LABELS.voicemail;
    reached = false;
  } else if (connected) {
    result = "played";
    callRowStatus = "completed";
    outcome = RESULT_LABELS.played;
    reached = true;
  } else if (callStatus === "busy") {
    result = "no_answer";
    callRowStatus = "busy";
    outcome = "Busy";
    reached = false;
  } else if (callStatus === "failed" || callStatus === "canceled") {
    // A carrier-level failure (rate limited, invalid destination, etc.) is a different thing from a
    // genuine no-answer, so it keeps its own words in Call History.
    result = "no_answer";
    callRowStatus = "failed";
    outcome = errorMessage ?? "Call failed";
    reached = false;
  } else {
    result = "no_answer";
    callRowStatus = "no_answer";
    outcome = RESULT_LABELS.no_answer;
    reached = false;
  }

  // Conditional UPDATE: only this delivery (the one that actually finds the
  // row still 'calling') gets to advance the chain. A redelivered webhook
  // finds nothing to update and stops here.
  const [claimed] = await sql`
    update campaign_calls set status = ${reached ? "completed" : "failed"}, updated_at = now()
    where id = ${campaignCallId} and status = 'calling'
    returning id, campaign_id
  `;
  if (!claimed) return new Response(null, { status: 204 });

  if (row["call_id"]) {
    await sql`
      update calls set
        status = ${callRowStatus},
        outcome = ${outcome},
        broadcast_result = ${result},
        error = ${callRowStatus === "failed" ? outcome : null},
        answered_at = case when ${reached} then now() else answered_at end,
        ended_at = now(),
        duration_seconds = ${Number.isFinite(duration) ? duration : null}
      where id = ${row["call_id"] as string}
    `;
  }

  await dialNextPendingContact(row["campaign_id"] as string, origin);
  return new Response(null, { status: 204 });
}

// ---------------------------------------------------------------------------
// Starting, pausing and checking on a campaign
// ---------------------------------------------------------------------------

/** For a campaign's own detail view — flips rows stuck mid-flight (accepted but never got a status callback) so the chain doesn't stall forever. There's no cron here, so this only runs when someone's actually looking at the campaign. */
export async function reconcileCampaign(data: { token: string; campaignId: string; origin: string }) {
  const tenantId = await requireTenant(data.token);
  const stalled = await sql`
    update campaign_calls set status = 'failed', updated_at = now()
    where campaign_id = ${data.campaignId} and tenant_id = ${tenantId}
      and status = 'calling' and updated_at < now() - (${STALL_TIMEOUT_MINUTES}::int) * interval '1 minute'
    returning id
  `;
  for (let i = 0; i < stalled.length; i++) {
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

/** Kicks off (or resumes) a voice broadcast's dial chain. */
export async function startCampaignDialing(data: { token: string; campaignId: string; origin: string }) {
  const tenantId = await requireTenant(data.token);
  await ensureSchema();

  const [campaign] = (await sql`
    select mode, recording, compliance_ack, list_id
    from campaigns where id = ${data.campaignId} and tenant_id = ${tenantId} limit 1
  `) as unknown as { mode: string; recording: unknown; compliance_ack: boolean; list_id: string | null }[];
  if (!campaign) throw new Error("Campaign not found.");
  if (campaign.mode !== "recording") throw new Error("This campaign is dialed by people, not as a voice broadcast.");
  const settings = sanitizeRecordingSettings(campaign.recording);
  if (!settings.file) throw new Error("Upload the recording before starting this campaign.");
  if (!campaign.compliance_ack) {
    throw new Error("Confirm the consent checkbox before starting this campaign.");
  }
  if (!campaign.list_id) throw new Error("Choose a contact list before starting this campaign.");
  if (!carrierConfigured()) {
    throw new Error("Calling isn't set up yet — SignalWire REST credentials are missing.");
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

  // Fill the free slots: "calls at once", less what is already ringing from before a pause.
  const [inFlight] = (await sql`
    select count(*)::int as n from campaign_calls where campaign_id = ${data.campaignId} and status = 'calling'
  `) as unknown as { n: number }[];
  const slots = Math.max(1, settings.callsAtOnce - Number(inFlight?.n ?? 0));
  for (let i = 0; i < slots; i++) {
    await dialNextPendingContact(data.campaignId, data.origin);
  }
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
// Hear it: a test call to your own phone
// ---------------------------------------------------------------------------

/** Rings the given number with this campaign's recording, exactly as a contact would hear it, so it can be judged before it goes to real people. */
export async function sendTestCall(data: { token: string; campaignId: string; to: string; origin: string }) {
  const tenantId = await requireTenant(data.token);
  await ensureSchema();
  if (!carrierConfigured()) {
    throw new Error("Calling isn't set up yet — SignalWire REST credentials are missing.");
  }

  const [campaign] = (await sql`
    select mode, recording from campaigns where id = ${data.campaignId} and tenant_id = ${tenantId} limit 1
  `) as unknown as { mode: string; recording: unknown }[];
  if (!campaign) throw new Error("Campaign not found.");
  if (campaign.mode !== "recording") throw new Error("Only a voice broadcast has a recording to test.");
  const settings = sanitizeRecordingSettings(campaign.recording);
  if (!settings.file) throw new Error("Upload the recording first.");

  const parsed = parsePhone(data.to, await workspaceDialCode(tenantId));
  if ("error" in parsed) throw new Error(`${parsed.error}.`);

  const [tests] = (await sql`
    select count(*)::int as n from calls
    where tenant_id = ${tenantId} and handled_by = 'broadcast_test' and started_at > now() - interval '1 day'
  `) as unknown as { n: number }[];
  if (Number(tests?.n ?? 0) >= TESTS_PER_DAY) throw new Error(`You can place ${TESTS_PER_DAY} test calls a day. Try again tomorrow.`);

  const fromNumber = await pickOutboundNumber(tenantId);
  if (!fromNumber) throw new Error("Add a phone number first. A test call needs a number to ring from.");

  const [created] = (await sql`
    insert into calls (tenant_id, direction, to_number, from_number, status, handled_by)
    values (${tenantId}, 'outbound', ${parsed.phone}, ${fromNumber}, 'ringing', 'broadcast_test')
    returning id
  `) as unknown as { id: string }[];
  if (!created) throw new Error("Could not record the call.");
  const callId = created.id;
  const result = await originateCall({
    to: parsed.phone,
    from: fromNumber,
    webhookUrl: webhookUrl(data.origin, { testCallId: callId, campaignId: data.campaignId }),
    statusCallbackUrl: webhookUrl(data.origin, { testCallId: callId, campaignId: data.campaignId, event: "status" }),
    ...detection(settings),
  });
  if (!result.ok) {
    await sql`update calls set status = 'failed', error = ${result.error ?? "Dial failed"}, ended_at = now() where id = ${callId}`;
    throw new Error(result.error ?? "The test call could not be placed.");
  }
  const sid = (result.body as { sid?: string } | null)?.sid;
  if (sid) await sql`update calls set provider_call_id = ${sid} where id = ${callId}`;
  return { ok: true as const, to: parsed.phone };
}

export const sendTestCallFn = createServerFn({ method: "POST" })
  .validator((data: { token: string; campaignId: string; to: string; origin: string }) => data)
  .handler(async ({ data }) => sendTestCall(data));

async function handleTestStatus(callId: string, params: Record<string, string>): Promise<Response> {
  const status = (params["CallStatus"] ?? "").toLowerCase();
  const duration = Number(params["CallDuration"] ?? 0);
  const answered = status === "completed" && duration > 0;
  await sql`
    update calls set
      status = ${answered ? "completed" : status === "busy" ? "busy" : status === "failed" ? "failed" : "no_answer"},
      outcome = ${answered ? "Test call" : "Test call not answered"},
      answered_at = case when ${answered} then now() else answered_at end,
      ended_at = now(),
      duration_seconds = ${Number.isFinite(duration) ? duration : null}
    where id = ${callId} and handled_by = 'broadcast_test'
  `;
  return new Response(null, { status: 204 });
}

// ---------------------------------------------------------------------------
// Calling people again, by how the last call went
// ---------------------------------------------------------------------------

/** Results it makes sense to dial again. People who pressed 1 or asked not to be called are never offered. */
const RECALLABLE = ["no_answer", "voicemail", "voicemail_left", "played"] as const;

/** How one queue row ended: what the call recorded, else whether it connected at all. */
const RESULT_KEY_SQL = `coalesce((select c.broadcast_result from calls c where c.id = cc.call_id), case when cc.status = 'failed' then 'no_answer' else 'played' end)`;

/** How the calls so far ended, for choosing who to call again. */
export async function getCampaignOutcomes(data: { token: string; campaignId: string }) {
  const tenantId = await requireTenant(data.token);
  await ensureSchema();
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
      .map((r) => ({ key: String(r["key"]), label: RESULT_LABELS[String(r["key"]) as Result] ?? String(r["key"]), count: Number(r["n"]) }))
      .filter((o) => (RECALLABLE as readonly string[]).includes(o.key))
      .sort((a, b) => b.count - a.count),
  };
}

export const getCampaignOutcomesFn = createServerFn({ method: "POST" })
  .validator((data: { token: string; campaignId: string }) => data)
  .handler(async ({ data }) => getCampaignOutcomes(data));

/** Puts the chosen contacts back in the queue. Press Start broadcast to call them. */
export async function recallCampaign(data: { token: string; campaignId: string; outcomes: string[] }) {
  const tenantId = await requireTenant(data.token);
  await ensureSchema();
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
  // A finished campaign has work again.
  if (rows.length > 0) {
    await sql`update campaigns set status = 'Paused', updated_at = now() where id = ${data.campaignId} and tenant_id = ${tenantId} and status = 'Completed'`;
  }
  return { ok: true as const, requeued: rows.length };
}

export const recallCampaignFn = createServerFn({ method: "POST" })
  .validator((data: { token: string; campaignId: string; outcomes: string[] }) => data)
  .handler(async ({ data }) => recallCampaign(data));
