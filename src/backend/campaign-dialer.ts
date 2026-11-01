// Voice-broadcast campaigns: one recording, played to everyone on a contact list who answers.
//
// The carrier (SignalWire) does the dialing and the playing; we only tell it
// who to ring and what to do when someone picks up, using the same cXML the
// inbound phone system already speaks. The dialer chains itself through webhooks:
// place a call, and when its status callback arrives, place the next one. With
// "calls at once" above one, that many chains run side by side. The 15-minute
// schedule (broadcast-sweep.server.ts) only wakes campaigns that are waiting for a
// scheduled start, for calling hours to open, or for a retry to come due.

import { createServerFn } from "@tanstack/react-start";

import { sql, sqlQuery } from "./db";
import { env } from "./env";
import { verifyToken } from "./tokens";
import { requireCanCreate } from "./entitlements";
import { originateCall, sendSms } from "./signalwire-rest";
import { pickOutboundNumber } from "./reputation.server";
import { cxml, dial, gather, hangup, pause, play, say, verifySignalWireSignature } from "./signalwire";
import { ensureSchema } from "./schema.server";
import { parsePhone } from "./contact-import";
import { workspaceDialCode } from "./contacts.server";
import { canCallNow, nextOpenAt, zonesToCheck } from "./calling-window";
import { sanitizeRecordingSettings, toE164, transferTarget, type RecordingSettings } from "./recording-options";

export const CAMPAIGN_WEBHOOK_PATH = "/api/voice/campaign";

/** A row waits this long for its status callback before the reconcile check gives up on it. Long enough for a "press 1" conversation. */
const STALL_TIMEOUT_MINUTES = 20;
/** Caps synchronous dial failures walked in one invocation, so a bad list can't run past the Worker's CPU budget. */
const MAX_SYNCHRONOUS_FAILURES = 5;
/** Test calls a workspace can place in a day. */
const TESTS_PER_DAY = 15;
/** A campaign pauses itself when this many of its last calls failed outright. */
const FAILURE_WINDOW = 8;
const FAILURE_LIMIT = 6;

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

/** How many queued people are looked at per query, and how many queries one step may spend finding someone callable. */
const CANDIDATE_PAGE = 500;
const CANDIDATE_PAGES = 4;

/** Stops a running campaign. `Waiting` resumes by itself at `resumeAt`; `Paused` waits for a person. */
async function stopCampaign(campaignId: string, status: "Paused" | "Waiting", reason: string, resumeAt: Date | null): Promise<void> {
  await sql`
    update campaigns set status = ${status}, pause_reason = ${reason.slice(0, 300)}, resume_at = ${resumeAt ? resumeAt.toISOString() : null},
                         updated_at = now()
    where id = ${campaignId} and status = 'Active'
  `;
}

/** The number to call from: the one chosen for the campaign when it is one of ours, otherwise the automatic pick. */
async function resolveFromNumber(tenantId: string, preferred: string): Promise<string | null> {
  const want = preferred ? toE164(preferred) : null;
  if (want) {
    const own = await sql`select 1 from phone_numbers where tenant_id = ${tenantId} and number = ${want} limit 1`;
    if (own.length > 0) return want;
  }
  return pickOutboundNumber(tenantId);
}

/**
 * Claims the next pending, non-DNC contact who may be called right now and dials them.
 *
 * Who "may be called now" is: not do-not-call (re-checked here, since a contact can be flagged
 * after a campaign is partway through), inside the calling window in their own time zone, and not
 * waiting out a retry delay. When nobody is callable yet the campaign goes to Waiting with the
 * time it should wake. The claim is a conditional update on the queue row, so two chains can
 * never take the same person.
 */
export async function dialNextPendingContact(campaignId: string, origin: string, failuresSoFar = 0): Promise<void> {
  if (failuresSoFar >= MAX_SYNCHRONOUS_FAILURES) return;

  // A missing carrier credential is a whole-campaign problem, not a
  // per-contact one — checking it here (a plain env read, no DB round trip)
  // stops the chain in one shot instead of burning a query and a failed fetch
  // per contact.
  if (!carrierConfigured()) {
    await stopCampaign(campaignId, "Paused", "Calling isn't set up: the carrier credentials are missing.", null);
    console.warn(`[campaign-dialer] ${campaignId} paused — SignalWire REST credentials not configured`);
    return;
  }

  await ensureSchema();
  const [campaign] = (await sql`select tenant_id, status, recording from campaigns where id = ${campaignId} limit 1`) as unknown as {
    tenant_id: string;
    status: string;
    recording: unknown;
  }[];
  if (!campaign || campaign.status !== "Active") return; // paused, waiting or gone — stop the chain

  const tenantId = campaign.tenant_id;
  const settings = sanitizeRecordingSettings(campaign.recording);
  if (!settings.file) {
    await stopCampaign(campaignId, "Paused", "There is no recording to play.", null);
    console.warn(`[campaign-dialer] ${campaignId} paused — no recording`);
    return;
  }

  try {
    await requireCanCreate(tenantId, "calls");
  } catch (err) {
    await stopCampaign(campaignId, "Paused", err instanceof Error ? err.message : "Your plan's call limit was reached.", null);
    console.warn(`[campaign-dialer] ${campaignId} paused — plan limit reached`, err);
    return;
  }

  // Find someone callable now, looking through the queue a page at a time.
  const now = new Date();
  const openNow = new Map<string, boolean>();
  const wakeAt = new Map<string, Date | null>();
  let earliest: Date | null = null;
  let blockedByWindow = false;
  let claimed: { id: string; contact_id: string; phone: string } | null = null;

  for (let page = 0; page < CANDIDATE_PAGES && !claimed; page++) {
    const rows = (await sql`
      select cc.id, cc.contact_id, ct.phone, cc.retry_at
      from campaign_calls cc
      join contacts ct on ct.id = cc.contact_id
      where cc.campaign_id = ${campaignId} and cc.status = 'pending' and ct.do_not_call = false
      order by cc.created_at asc
      limit ${CANDIDATE_PAGE} offset ${page * CANDIDATE_PAGE}
    `) as unknown as { id: string; contact_id: string; phone: string; retry_at: string | null }[];
    if (rows.length === 0) break;

    for (const row of rows) {
      const retryAt = row.retry_at ? new Date(row.retry_at) : null;
      const waitingForRetry = retryAt !== null && retryAt.getTime() > now.getTime();
      // People in the same zone(s) share an answer, so each is worked out once per step.
      const key = zonesToCheck(row.phone, settings.window).join("|");
      const base = waitingForRetry ? (retryAt as Date) : now;
      const wakeKey = `${key}|${base.getTime()}`;

      if (!waitingForRetry) {
        let open = openNow.get(key);
        if (open === undefined) {
          open = canCallNow(now, row.phone, settings.window);
          openNow.set(key, open);
        }
        if (open) {
          const [taken] = (await sql`
            update campaign_calls set status = 'calling', attempts = attempts + 1, updated_at = now()
            where id = ${row.id} and status = 'pending'
            returning id, contact_id
          `) as unknown as { id: string; contact_id: string }[];
          if (taken) {
            claimed = { id: taken.id, contact_id: taken.contact_id, phone: row.phone };
            break;
          }
          continue; // someone else got them first
        }
        blockedByWindow = true;
      }

      let wake = wakeAt.get(wakeKey);
      if (wake === undefined) {
        wake = nextOpenAt(base, row.phone, settings.window);
        wakeAt.set(wakeKey, wake);
      }
      if (wake && (!earliest || wake.getTime() < earliest.getTime())) earliest = wake;
    }
    if (rows.length < CANDIDATE_PAGE) break;
  }

  if (!claimed) {
    if (earliest) {
      const reason = blockedByWindow ? "Outside the calling hours. It will carry on when they open." : "Waiting to try some people again.";
      await stopCampaign(campaignId, "Waiting", reason, earliest);
      console.log(`[campaign-dialer] ${campaignId} waiting until ${earliest.toISOString()} (${blockedByWindow ? "calling hours" : "retry"})`);
      return;
    }
    // Nothing waiting. If nothing is in flight either, the list is finished.
    // (Someone flagged do-not-call after the list was loaded is never dialed, so they don't hold it open.)
    const [open] = await sql`
      select count(*)::int as n
      from campaign_calls cc join contacts ct on ct.id = cc.contact_id
      where cc.campaign_id = ${campaignId}
        and (cc.status = 'calling' or (cc.status = 'pending' and ct.do_not_call = false))
    `;
    if (Number(open?.["n"] ?? 0) === 0) {
      await sql`update campaigns set status = 'Completed', pause_reason = null, resume_at = null, updated_at = now() where id = ${campaignId} and status = 'Active'`;
    }
    return;
  }

  const fromNumber = await resolveFromNumber(tenantId, settings.callerId);
  if (!fromNumber) {
    // Put the contact back; nothing was dialed.
    await sql`update campaign_calls set status = 'pending', attempts = greatest(attempts - 1, 0), updated_at = now() where id = ${claimed.id}`;
    await stopCampaign(campaignId, "Paused", "There is no number to call from. Add one, or check it isn't resting.", null);
    console.warn(`[campaign-dialer] ${campaignId} paused — no usable outbound number (none configured, or all at their daily limit or resting)`);
    return;
  }

  const [created] = (await sql`
    insert into calls (tenant_id, campaign_id, direction, to_number, from_number, contact_id, status, handled_by)
    values (${tenantId}, ${campaignId}, 'outbound', ${claimed.phone}, ${fromNumber}, ${claimed.contact_id}, 'ringing', 'broadcast')
    returning id
  `) as unknown as { id: string }[];
  if (!created) throw new Error("Could not record the call.");
  const callId = created.id;
  await sql`update campaign_calls set call_id = ${callId}, retry_at = null where id = ${claimed.id}`;

  const result = await originateCall({
    to: claimed.phone,
    from: fromNumber,
    webhookUrl: webhookUrl(origin, { campaignCallId: claimed.id }),
    statusCallbackUrl: webhookUrl(origin, { campaignCallId: claimed.id, event: "status" }),
    ...detection(settings),
  });

  if (!result.ok) {
    console.error(`[campaign-dialer] ${campaignId} dial failed for ${claimed.id} — ${result.error}`);
    await sql`update campaign_calls set status = 'failed', updated_at = now() where id = ${claimed.id}`;
    await sql`update calls set status = 'failed', error = ${result.error ?? "Dial failed"}, ended_at = now() where id = ${callId}`;
    // A run of refusals means something is wrong with the account or the list: stop instead of burning through it.
    if (failuresSoFar + 1 >= MAX_SYNCHRONOUS_FAILURES) {
      await stopCampaign(campaignId, "Paused", `The carrier refused the calls: ${result.error ?? "no reason given"}`, null);
      return;
    }
    return dialNextPendingContact(campaignId, origin, failuresSoFar + 1);
  }

  // The carrier's own call id, so a stuck or disputed call can be cross-referenced
  // against their Voice Logs directly instead of guessing which entry it is.
  const sid = (result.body as { sid?: string } | null)?.sid;
  if (sid) {
    await sql`update calls set provider_call_id = ${sid} where id = ${callId}`;
  }
}

/**
 * Pauses a campaign whose recent calls are mostly failing at the carrier (an empty balance, a bad
 * list, a blocked number), so one problem doesn't quietly use up credit on hundreds of failed calls.
 */
async function pauseIfCallsAreFailing(campaignId: string): Promise<boolean> {
  const recent = (await sql`
    select status, error from calls where campaign_id = ${campaignId} and handled_by = 'broadcast'
    order by started_at desc limit ${FAILURE_WINDOW}
  `) as unknown as { status: string; error: string | null }[];
  if (recent.length < FAILURE_WINDOW) return false;
  const failed = recent.filter((r) => r.status === "failed");
  if (failed.length < FAILURE_LIMIT) return false;
  const why = failed.find((r) => r.error)?.error ?? "no reason given";
  await stopCampaign(campaignId, "Paused", `Most recent calls failed (${failed.length} of ${FAILURE_WINDOW}): ${why}`, null);
  console.warn(`[campaign-dialer] ${campaignId} paused — ${failed.length} of the last ${FAILURE_WINDOW} calls failed: ${why}`);
  return true;
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
  const [row] = (await sql`
    select cc.campaign_id, cc.call_id, cc.attempts, cc.contact_id, cc.tenant_id, c.broadcast_result, c.from_number, ca.recording
    from campaign_calls cc
    join campaigns ca on ca.id = cc.campaign_id
    left join calls c on c.id = cc.call_id
    where cc.id = ${campaignCallId} and cc.status = 'calling'
  `) as unknown as {
    campaign_id: string;
    call_id: string | null;
    attempts: number;
    contact_id: string;
    tenant_id: string;
    broadcast_result: Result | null;
    from_number: string | null;
    recording: unknown;
  }[];
  if (!row) return new Response(null, { status: 204 }); // already handled — redelivered webhook, no-op

  const settings = sanitizeRecordingSettings(row.recording);
  const tagged = row.broadcast_result;
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

  // Try again later? Only for people who didn't pick up (or, if asked, got voicemail), never for a
  // carrier failure, and only while tries are left.
  const retryable = callRowStatus === "no_answer" || callRowStatus === "busy";
  const retryLater =
    !reached &&
    retryable &&
    settings.retry.max > 0 &&
    row.attempts <= settings.retry.max &&
    (result !== "voicemail" || settings.retry.includeVoicemail);

  // Conditional UPDATE: only this delivery (the one that actually finds the
  // row still 'calling') gets to advance the chain. A redelivered webhook
  // finds nothing to update and stops here.
  const [claimed] = retryLater
    ? await sql`
        update campaign_calls set status = 'pending', retry_at = now() + (${settings.retry.delayMinutes}::int) * interval '1 minute', updated_at = now()
        where id = ${campaignCallId} and status = 'calling'
        returning id, campaign_id
      `
    : await sql`
        update campaign_calls set status = ${reached ? "completed" : "failed"}, updated_at = now()
        where id = ${campaignCallId} and status = 'calling'
        returning id, campaign_id
      `;
  if (!claimed) return new Response(null, { status: 204 });

  if (row.call_id) {
    await sql`
      update calls set
        status = ${callRowStatus},
        outcome = ${outcome},
        broadcast_result = ${result},
        error = ${callRowStatus === "failed" ? outcome : null},
        answered_at = case when ${reached} then now() else answered_at end,
        ended_at = now(),
        duration_seconds = ${Number.isFinite(duration) ? duration : null}
      where id = ${row.call_id}
    `;
  }

  if (reached) await maybeSendFollowUp(row.tenant_id, row.contact_id, row.call_id, row.from_number, result, settings);

  const stopped = await pauseIfCallsAreFailing(row.campaign_id);
  if (!stopped) await dialNextPendingContact(row.campaign_id, origin);
  return new Response(null, { status: 204 });
}

/** The text sent after a call to people who responded, when the campaign has one. Never throws: a failed text is a log line. */
async function maybeSendFollowUp(
  tenantId: string,
  contactId: string,
  callId: string | null,
  fromNumber: string | null,
  result: Result,
  settings: RecordingSettings,
): Promise<void> {
  try {
    const f = settings.followUp;
    if (!f.enabled || !f.message.trim() || !fromNumber) return;
    const wanted = f.when === "pressed_1" ? result === "transferred" : result === "played" || result === "transferred";
    if (!wanted) return;

    const [contact] = (await sql`
      select phone, person, company, first_name, do_not_call, do_not_sms from contacts where id = ${contactId} and tenant_id = ${tenantId}
    `) as unknown as { phone: string; person: string | null; company: string | null; first_name: string | null; do_not_call: boolean; do_not_sms: boolean }[];
    if (!contact || contact.do_not_call || contact.do_not_sms) return;

    const first = contact.first_name?.trim() || contact.person?.trim().split(/\s+/)[0] || "there";
    const body = f.message.replaceAll("{first_name}", first).replaceAll("{company}", contact.company?.trim() || "").slice(0, 320);
    const sent = await sendSms({ to: contact.phone, from: fromNumber, body });
    await sql`
      insert into auto_texts (tenant_id, call_id, kind, to_number, from_number, body, status, error)
      values (${tenantId}, ${callId}, 'broadcast_followup', ${contact.phone}, ${fromNumber}, ${body},
              ${sent.ok ? "sent" : "failed"}, ${sent.ok ? null : (sent.error ?? "Send failed")})
    `;
    if (!sent.ok) console.warn(`[campaign] follow-up text to ${contact.phone} failed: ${sent.error}`);
  } catch (err) {
    console.error("[campaign] follow-up text failed", err);
  }
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
  /** When a retry is due, for someone who is waiting to be tried again. */
  retry_at: string | null;
}

/** Per-contact dial log for a campaign's detail view — what actually happened, not just a count. */
export async function getCampaignCallLog(data: { token: string; campaignId: string }) {
  const tenantId = await requireTenant(data.token);

  const rows = await sql`
    select cc.id, coalesce(ct.company, ct.person) as contact_name, ct.phone,
           cc.status, cc.attempts, c.outcome, c.duration_seconds, cc.updated_at, cc.retry_at
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

// ---------------------------------------------------------------------------
// Results: a summary, a cost estimate and a spreadsheet
// ---------------------------------------------------------------------------

/** Seconds a call costs beyond the recording itself: ringing, the pause before it plays, hanging up. */
const CALL_OVERHEAD_SECONDS = 10;
/** What a call is assumed to last when the recording's length isn't known. */
const GUESSED_RECORDING_SECONDS = 30;

export interface CampaignSummary {
  status: string;
  pauseReason: string | null;
  startAt: string | null;
  resumeAt: string | null;
  /** People in the queue, by how they ended: key, label, count. */
  results: { key: string; label: string; count: number }[];
  /** People not yet tried, plus those waiting for a retry. */
  remaining: number;
  waitingForRetry: number;
  inFlight: number;
  totalContacts: number;
  /** Calls actually placed so far, counting retries. */
  callsPlaced: number;
  secondsOnCalls: number;
  /** Rough minutes still to come: people left times the length of one call. Retries can add up to `maxMinutes`. */
  estimate: { perCallSeconds: number; minutes: number; maxMinutes: number; exactLength: boolean };
}

/** How the campaign stands: results so far, what is left, and roughly what is left to spend. */
export async function getCampaignSummary(data: { token: string; campaignId: string }): Promise<{ ok: true; summary: CampaignSummary }> {
  const tenantId = await requireTenant(data.token);
  await ensureSchema();
  const [campaign] = (await sql`
    select status, pause_reason, start_at, resume_at, recording, list_id from campaigns
    where id = ${data.campaignId} and tenant_id = ${tenantId} and mode = 'recording'
  `) as unknown as {
    status: string;
    pause_reason: string | null;
    start_at: string | null;
    resume_at: string | null;
    recording: unknown;
    list_id: string | null;
  }[];
  if (!campaign) throw new Error("Campaign not found.");
  const settings = sanitizeRecordingSettings(campaign.recording);

  const rows = await sqlQuery(
    `select ${RESULT_KEY_SQL} as key, count(*)::int as n
     from campaign_calls cc
     where cc.campaign_id = $1 and cc.tenant_id = $2 and cc.status in ('completed','failed')
     group by 1`,
    [data.campaignId, tenantId],
  );
  const results = rows
    .map((r) => ({ key: String(r["key"]), label: RESULT_LABELS[String(r["key"]) as Result] ?? String(r["key"]), count: Number(r["n"]) }))
    .sort((a, b) => b.count - a.count);

  const [queue] = (await sql`
    select
      count(*) filter (where cc.status = 'pending' and ct.do_not_call = false)::int as pending,
      count(*) filter (where cc.status = 'pending' and ct.do_not_call = false and cc.retry_at is not null)::int as retrying,
      count(*) filter (where cc.status = 'calling')::int as calling,
      count(*)::int as total,
      coalesce(sum(cc.attempts), 0)::int as placed
    from campaign_calls cc join contacts ct on ct.id = cc.contact_id
    where cc.campaign_id = ${data.campaignId}
  `) as unknown as { pending: number; retrying: number; calling: number; total: number; placed: number }[];
  const [time] = (await sql`
    select coalesce(sum(duration_seconds), 0)::int as seconds from calls where campaign_id = ${data.campaignId} and handled_by = 'broadcast'
  `) as unknown as { seconds: number }[];

  // A campaign that hasn't started has an empty queue: the list itself is what is left.
  let remaining = Number(queue?.pending ?? 0);
  let totalContacts = Number(queue?.total ?? 0);
  if (totalContacts === 0 && campaign.list_id) {
    const [list] = (await sql`
      select count(*)::int as n from contacts where tenant_id = ${tenantId} and list_id = ${campaign.list_id} and do_not_call = false
    `) as unknown as { n: number }[];
    remaining = Number(list?.n ?? 0);
    totalContacts = remaining;
  }

  const exactLength = !!settings.file?.seconds;
  const perCall = (settings.file?.seconds ?? GUESSED_RECORDING_SECONDS) + CALL_OVERHEAD_SECONDS;
  return {
    ok: true as const,
    summary: {
      status: campaign.status,
      pauseReason: campaign.pause_reason,
      startAt: campaign.start_at,
      resumeAt: campaign.resume_at,
      results,
      remaining,
      waitingForRetry: Number(queue?.retrying ?? 0),
      inFlight: Number(queue?.calling ?? 0),
      totalContacts,
      callsPlaced: Number(queue?.placed ?? 0),
      secondsOnCalls: Number(time?.seconds ?? 0),
      estimate: {
        perCallSeconds: perCall,
        minutes: Math.ceil((remaining * perCall) / 60),
        maxMinutes: Math.ceil((remaining * perCall * (1 + settings.retry.max)) / 60),
        exactLength,
      },
    },
  };
}

export const getCampaignSummaryFn = createServerFn({ method: "POST" })
  .validator((data: { token: string; campaignId: string }) => data)
  .handler(async ({ data }) => getCampaignSummary(data));

/** A cell safe to open in a spreadsheet: quoted, and defanged if it starts like a formula. */
function csvCell(value: unknown): string {
  let t = value instanceof Date ? value.toISOString() : value === null || value === undefined ? "" : String(value);
  // A leading = or @ makes a spreadsheet run the cell as a formula, and so do + and - unless the cell is
  // just a phone number such as +14155550134.
  const phoneLike = /^[+\-][\d\s().-]+$/.test(t);
  if (/^[=@\t\r]/.test(t) || (/^[+\-]/.test(t) && !phoneLike)) t = `'${t}`;
  return /[",\n\r]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
}

/** Every person in the campaign and how it went, as a spreadsheet file. */
export async function exportCampaignCsv(data: { token: string; campaignId: string }) {
  const tenantId = await requireTenant(data.token);
  await ensureSchema();
  const [campaign] = (await sql`
    select name from campaigns where id = ${data.campaignId} and tenant_id = ${tenantId} and mode = 'recording'
  `) as unknown as { name: string }[];
  if (!campaign) throw new Error("Campaign not found.");

  const rows = await sql`
    select coalesce(ct.person, '') as person, coalesce(ct.company, '') as company, ct.phone,
           cc.status as queue_status, coalesce(c.outcome, '') as outcome, cc.attempts,
           coalesce(c.duration_seconds, 0) as seconds, cc.updated_at, ct.do_not_call
    from campaign_calls cc
    join contacts ct on ct.id = cc.contact_id
    left join calls c on c.id = cc.call_id
    where cc.campaign_id = ${data.campaignId} and cc.tenant_id = ${tenantId}
    order by cc.created_at asc
    limit 20000
  `;
  const header = ["Name", "Company", "Phone", "Status", "Result", "Tries", "Seconds on call", "Last updated", "Do not call"];
  const lines = [header.map(csvCell).join(",")];
  for (const r of rows) {
    const status =
      r["queue_status"] === "pending" ? "Not yet called" : r["queue_status"] === "calling" ? "Calling" : r["queue_status"] === "completed" ? "Reached" : "Not reached";
    lines.push(
      [r["person"], r["company"], r["phone"], status, r["outcome"], r["attempts"], r["seconds"], r["updated_at"], r["do_not_call"] ? "Yes" : "No"]
        .map(csvCell)
        .join(","),
    );
  }
  const safeName = campaign.name.replace(/[^\w\- ]+/g, "").trim().replace(/\s+/g, "-").slice(0, 60) || "campaign";
  // A byte order mark so Excel reads accented names correctly.
  return { ok: true as const, filename: `${safeName}-results.csv`, csv: "\uFEFF" + lines.join("\r\n") + "\r\n" };
}

export const exportCampaignCsvFn = createServerFn({ method: "POST" })
  .validator((data: { token: string; campaignId: string }) => data)
  .handler(async ({ data }) => exportCampaignCsv(data));

/**
 * Seeds the queue, marks the campaign Active and fills the free "calls at once" slots. Used by the
 * Start button and by the 15-minute schedule when a scheduled start or a wait comes due.
 */
export async function beginCampaign(campaignId: string, origin: string, maxSlots = MAX_CALLS_AT_ONCE_CAP): Promise<void> {
  const [campaign] = (await sql`
    select tenant_id, recording, list_id from campaigns where id = ${campaignId} limit 1
  `) as unknown as { tenant_id: string; recording: unknown; list_id: string | null }[];
  if (!campaign) return;
  const settings = sanitizeRecordingSettings(campaign.recording);

  // Idempotent — seeding a campaign that's already partway through just
  // adds any contacts appended to the list since; it never resets progress.
  if (campaign.list_id) {
    await sql`
      insert into campaign_calls (tenant_id, campaign_id, contact_id)
      select ${campaign.tenant_id}, ${campaignId}, c.id
      from contacts c
      where c.tenant_id = ${campaign.tenant_id} and c.list_id = ${campaign.list_id} and c.do_not_call = false
      on conflict (campaign_id, contact_id) do nothing
    `;
  }

  await sql`
    update campaigns set status = 'Active', pause_reason = null, resume_at = null, start_at = null, callback_origin = ${origin}, updated_at = now()
    where id = ${campaignId}
  `;

  // Fill the free slots: "calls at once", less what is already ringing from before a pause.
  const [inFlight] = (await sql`
    select count(*)::int as n from campaign_calls where campaign_id = ${campaignId} and status = 'calling'
  `) as unknown as { n: number }[];
  const slots = Math.min(maxSlots, Math.max(1, settings.callsAtOnce - Number(inFlight?.n ?? 0)));
  for (let i = 0; i < slots; i++) {
    await dialNextPendingContact(campaignId, origin);
  }
}

/** How many calls one scheduled wake-up may place: its request budget is small, and the webhooks carry on from there. */
const MAX_CALLS_AT_ONCE_CAP = 5;

/** Kicks off (or resumes) a voice broadcast's dial chain, or schedules it to start later. */
export async function startCampaignDialing(data: { token: string; campaignId: string; origin: string; startAt?: string | null }) {
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

  if (data.startAt) {
    const when = new Date(data.startAt);
    if (Number.isNaN(when.getTime())) throw new Error("That start time isn't a valid date and time.");
    if (when.getTime() > Date.now() + 90 * 24 * 3600 * 1000) throw new Error("Schedule a start within the next 90 days.");
    if (when.getTime() > Date.now() + 60 * 1000) {
      await sql`
        update campaigns set status = 'Scheduled', start_at = ${when.toISOString()}, resume_at = null, pause_reason = null,
                             callback_origin = ${data.origin}, updated_at = now()
        where id = ${data.campaignId} and tenant_id = ${tenantId}
      `;
      return { ok: true as const, scheduledFor: when.toISOString(), status: "Scheduled", resumeAt: null as string | null, reason: null as string | null };
    }
  }

  await beginCampaign(data.campaignId, data.origin);
  // Starting outside calling hours leaves the campaign Waiting; say so, so the owner isn't left guessing.
  const [after] = (await sql`select status, resume_at, pause_reason from campaigns where id = ${data.campaignId}`) as unknown as {
    status: string;
    resume_at: string | null;
    pause_reason: string | null;
  }[];
  return {
    ok: true as const,
    scheduledFor: null as string | null,
    status: after?.status ?? "Active",
    resumeAt: after?.resume_at ?? null,
    reason: after?.pause_reason ?? null,
  };
}

export const startCampaignDialingFn = createServerFn({ method: "POST" })
  .validator((data: { token: string; campaignId: string; origin: string; startAt?: string | null }) => data)
  .handler(async ({ data }) => startCampaignDialing(data));

/** Pausing just stops the chain from advancing — dialNextPendingContact checks campaigns.status before every claim. */
export async function pauseCampaignDialing(data: { token: string; campaignId: string }) {
  const tenantId = await requireTenant(data.token);
  await sql`
    update campaigns set status = 'Paused', pause_reason = null, start_at = null, resume_at = null, updated_at = now()
    where id = ${data.campaignId} and tenant_id = ${tenantId} and status in ('Active', 'Waiting', 'Scheduled')
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

  const fromNumber = await resolveFromNumber(tenantId, settings.callerId);
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
