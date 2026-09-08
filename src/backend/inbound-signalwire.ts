// Inbound calling over SignalWire's Compatibility API (cXML).
//
// Same phone system as the Telnyx adapter — same menus, business hours,
// extensions and voicemail, all read through call-flow.ts — but driven the
// other way round. SignalWire POSTs an event and the XML we return *is* the
// instruction, so there are no commands to issue and no API key needed.
//
// Flow position travels in the query string of each action URL rather than in
// a carrier-held state blob, which means every step is inspectable in a log
// line and reproducible with curl.
//
// Written against cXML, which is a drop-in for Twilio's TwiML — so this same
// handler serves Twilio and other compatible carriers without changes.

import { sql } from "./db";
import { findContactByPhone } from "./phone-numbers";
import { isOpenAt } from "./business-hours";
import {
  FALLBACK_MENU_GREETING,
  FALLBACK_VOICEMAIL_GREETING,
  VOICEMAIL_MAX_SECONDS,
  findMenu,
  findTenantByNumber,
  greetingAudioUrl,
  loadConfig,
  menuIdForNumber,
  ringTargetsFromRouting,
  targetsForExtension,
  type IvrMenu,
  type TenantPhoneConfig,
} from "./call-flow";
import {
  cxml,
  dial,
  gather,
  hangup,
  play,
  record,
  reject,
  say,
  verifySignalWireSignature,
} from "./signalwire";

export const SIGNALWIRE_WEBHOOK_PATH = "/api/voice/signalwire";

/** Every step the flow can be waiting on, carried in the action URL. */
type Step = "answer" | "menu" | "ring" | "voicemail" | "recorded" | "status";

export async function handleSignalWireVoiceWebhook(request: Request): Promise<Response> {
  const url = new URL(request.url);

  // cXML webhooks are form-encoded, not JSON.
  const raw = await request.text();
  const params: Record<string, string> = {};
  for (const [k, v] of new URLSearchParams(raw)) params[k] = v;

  const verdict = await verifySignalWireSignature(
    request.url,
    params,
    request.headers.get("x-signalwire-signature"),
  );
  if (verdict === "invalid") {
    console.warn("[signalwire] rejected webhook with a bad signature");
    return new Response("Invalid signature", { status: 403 });
  }
  if (verdict === "unconfigured") {
    // Deliberate, so a number can be pointed here and tested before the
    // signing key is set. Loud, because it must not stay this way.
    console.warn(
      "[signalwire] SIGNALWIRE_SIGNING_KEY is not set — webhook accepted WITHOUT signature verification",
    );
  }

  const step = (url.searchParams.get("step") ?? "answer") as Step;
  const origin = url.origin;

  try {
    return await route(step, url, params, origin);
  } catch (err) {
    console.error(`[signalwire] ${step} failed`, err);
    // Never leave a caller in silence on an internal error.
    return cxml(
      say("Sorry, we're having trouble taking your call right now. Please try again later.") +
        hangup(),
    );
  }
}

async function route(
  step: Step,
  url: URL,
  params: Record<string, string>,
  origin: string,
): Promise<Response> {
  switch (step) {
    case "answer":
      return onIncoming(params, origin);
    case "menu":
      return onDigits(url, params, origin);
    case "ring":
      return onDialEnded(url, params, origin);
    case "voicemail":
      return onVoicemailRecorded(url, params);
    case "recorded":
      return onRecordingReady(url, params);
    case "status":
      return onCallStatus(url, params);
    default:
      return cxml(hangup());
  }
}

/** Builds an action URL that carries the flow position forward. */
function actionUrl(origin: string, step: Step, extra: Record<string, string> = {}): string {
  const u = new URL(SIGNALWIRE_WEBHOOK_PATH, origin);
  u.searchParams.set("step", step);
  for (const [k, v] of Object.entries(extra)) if (v) u.searchParams.set(k, v);
  return u.toString();
}

// ---------------------------------------------------------------------------
// A call arrives
// ---------------------------------------------------------------------------

async function onIncoming(params: Record<string, string>, origin: string): Promise<Response> {
  const to = params["To"] ?? "";
  const from = params["From"] ?? "";
  const callSid = params["CallSid"] ?? "";

  const owner = await findTenantByNumber(to);
  if (!owner) {
    console.warn(`[signalwire] no tenant owns ${to} — rejecting`);
    return cxml(reject());
  }

  const callId = await openCallRecord(owner.tenantId, callSid, from, to);
  const config = await loadConfig(owner.tenantId);
  const openNow = isOpenAt(config.businessHours, new Date());

  if (!openNow.open) {
    console.log(`[signalwire] ${callId}: after hours (${openNow.reason})`);
    const afterHours = config.routing.afterHoursToMenu
      ? findMenu(config, config.routing.afterHoursMenuId ?? null)
      : null;
    return afterHours
      ? cxml(menuXml(afterHours, origin, callId, 0))
      : cxml(voicemailXml(config, origin, callId));
  }

  const assigned = await menuIdForNumber(owner.tenantId, to);
  const menu =
    findMenu(config, assigned) ?? (config.menus.length === 1 ? (config.menus[0] as IvrMenu) : null);

  if (menu) return cxml(menuXml(menu, origin, callId, 0));

  const targets = ringTargetsFromRouting(config);
  if (targets.length > 0) return cxml(ringXml(config, targets, origin, callId, to));

  return cxml(voicemailXml(config, origin, callId));
}

/**
 * Opens the `calls` row.
 *
 * Keyed on the carrier's CallSid so a retried webhook finds the existing row
 * instead of opening a second one for the same call.
 */
async function openCallRecord(
  tenantId: string,
  callSid: string,
  from: string,
  to: string,
): Promise<string> {
  const existing = await sql`
    select id from calls where provider_call_id = ${callSid} limit 1
  `;
  if (existing.length > 0) return (existing[0] as { id: string }).id;

  const contactId = await findContactByPhone(tenantId, from);
  const rows = await sql`
    insert into calls (tenant_id, direction, from_number, to_number, contact_id, status, provider_call_id)
    values (${tenantId}, 'inbound', ${from || null}, ${to || null}, ${contactId}, 'ringing', ${callSid})
    returning id
  `;
  return (rows[0] as { id: string }).id;
}

// ---------------------------------------------------------------------------
// Menus
// ---------------------------------------------------------------------------

function menuXml(menu: IvrMenu, origin: string, callId: string, tries: number): string {
  const audio = greetingAudioUrl(menu.greetingMode, menu.greetingFile, origin);
  const prompt = audio ? play(audio) : say(menu.greetingText?.trim() || FALLBACK_MENU_GREETING);

  return gather({
    action: actionUrl(origin, "menu", {
      call: callId,
      menu: menu.id ?? "",
      tries: String(tries),
    }),
    numDigits: 1,
    timeoutSeconds: Math.max(1, menu.timeoutSeconds ?? 7),
    nested: prompt,
  });
}

async function onDigits(
  url: URL,
  params: Record<string, string>,
  origin: string,
): Promise<Response> {
  const callId = url.searchParams.get("call") ?? "";
  const tenantId = await tenantForCall(callId);
  if (!tenantId) return cxml(hangup());

  const config = await loadConfig(tenantId);
  const menu = findMenu(config, url.searchParams.get("menu"));
  if (!menu) return cxml(voicemailXml(config, origin, callId));

  const digits = (params["Digits"] ?? "").trim();
  const option = (menu.options ?? []).find((o) => String(o.key) === digits);

  if (!option) {
    // No input, or a key the menu doesn't map. Replay up to the menu's repeat
    // count, then stop pestering the caller and take a message.
    const tries = Number(url.searchParams.get("tries") ?? "0") + 1;
    const limit = Math.max(1, menu.repeatCount ?? 1);
    if (tries < limit) return cxml(menuXml(menu, origin, callId, tries));
    return cxml(voicemailXml(config, origin, callId));
  }

  switch (option.action) {
    case "ring_extension":
    case "ring_department": {
      const targets = targetsForExtension(config, option.target ?? "");
      if (targets.length === 0) {
        console.warn(`[signalwire] ${callId}: extension "${option.target}" has no destination`);
        return cxml(voicemailXml(config, origin, callId));
      }
      const dialed = await dialledNumberFor(callId);
      return cxml(ringXml(config, targets, origin, callId, dialed));
    }

    case "goto_menu": {
      const next = findMenu(config, option.target ?? null);
      return cxml(next ? menuXml(next, origin, callId, 0) : voicemailXml(config, origin, callId));
    }

    case "repeat_menu":
      return cxml(menuXml(menu, origin, callId, 0));

    case "hangup":
      return cxml(say("Thanks for calling. Goodbye.") + hangup());

    case "voicemail":
    default:
      return cxml(voicemailXml(config, origin, callId));
  }
}

// ---------------------------------------------------------------------------
// Ringing
// ---------------------------------------------------------------------------

/**
 * Rings the hunt list.
 *
 * All remaining targets go into one `<Dial>`, which rings them together and
 * bridges whoever answers first. The `action` URL is what makes the fallback
 * work: when the dial ends without a conversation, the carrier asks us what to
 * do next and the caller is still on the line.
 */
function ringXml(
  config: TenantPhoneConfig,
  targets: string[],
  origin: string,
  callId: string,
  callerId: string,
): string {
  const timeout = Math.min(600, Math.max(5, config.routing.timeoutSeconds ?? 25));
  return dial(targets, {
    timeoutSeconds: timeout,
    ...(callerId ? { callerId } : {}),
    action: actionUrl(origin, "ring", { call: callId }),
    record: true,
    recordingStatusCallback: actionUrl(origin, "recorded", { call: callId }),
  });
}

/**
 * The dial finished. `DialCallStatus` says whether anyone actually spoke.
 */
async function onDialEnded(
  url: URL,
  params: Record<string, string>,
  origin: string,
): Promise<Response> {
  const callId = url.searchParams.get("call") ?? "";
  const status = params["DialCallStatus"] ?? "";

  if (status === "completed" || status === "answered") {
    // They talked; the caller's leg ends with the conversation.
    await sql`
      update calls set status = 'active', answered_at = coalesce(answered_at, now())
      where id = ${callId}
    `;
    return cxml(hangup());
  }

  const tenantId = await tenantForCall(callId);
  if (!tenantId) return cxml(hangup());
  const config = await loadConfig(tenantId);
  return cxml(voicemailXml(config, origin, callId));
}

// ---------------------------------------------------------------------------
// Voicemail
// ---------------------------------------------------------------------------

function voicemailXml(config: TenantPhoneConfig, origin: string, callId: string): string {
  const vm = config.voicemail ?? {};
  const audio = greetingAudioUrl(vm.greetingMode, vm.greetingFile, origin);
  const prompt = audio ? play(audio) : say(vm.greetingText?.trim() || FALLBACK_VOICEMAIL_GREETING);

  return (
    prompt +
    record({
      action: actionUrl(origin, "voicemail", { call: callId }),
      maxLengthSeconds: VOICEMAIL_MAX_SECONDS,
      playBeep: true,
      recordingStatusCallback: actionUrl(origin, "recorded", { call: callId }),
    })
  );
}

async function onVoicemailRecorded(
  url: URL,
  params: Record<string, string>,
): Promise<Response> {
  const callId = url.searchParams.get("call") ?? "";
  await attachRecording(callId, params["RecordingUrl"], params["RecordingDuration"]);
  await sql`
    update calls set status = 'completed', outcome = 'Voicemail', ended_at = now()
    where id = ${callId} and status in ('ringing','active')
  `;
  return cxml(say("Thanks for your message. Goodbye.") + hangup());
}

/** The carrier's separate "recording is ready" callback. */
async function onRecordingReady(url: URL, params: Record<string, string>): Promise<Response> {
  await attachRecording(
    url.searchParams.get("call") ?? "",
    params["RecordingUrl"],
    params["RecordingDuration"],
  );
  return new Response(null, { status: 204 });
}

async function attachRecording(
  callId: string,
  recordingUrl: string | undefined,
  duration: string | undefined,
): Promise<void> {
  if (!callId || !recordingUrl) return;
  const seconds = Number(duration);
  await sql`
    update calls
    set recording_url = ${recordingUrl},
        recording_seconds = ${Number.isFinite(seconds) && seconds > 0 ? Math.round(seconds) : null}
    where id = ${callId}
  `;
}

// ---------------------------------------------------------------------------
// Teardown
// ---------------------------------------------------------------------------

/** The status callback, if the number is configured to send one. */
async function onCallStatus(url: URL, params: Record<string, string>): Promise<Response> {
  const callId = url.searchParams.get("call") ?? "";
  const status = params["CallStatus"] ?? "";
  if (!callId || (status !== "completed" && status !== "no-answer" && status !== "busy")) {
    return new Response(null, { status: 204 });
  }

  const rows = await sql`select answered_at, status from calls where id = ${callId} limit 1`;
  const row = rows[0] as { answered_at: string | null; status: string } | undefined;
  if (!row || (row.status !== "ringing" && row.status !== "active")) {
    return new Response(null, { status: 204 });
  }

  const talked = Boolean(row.answered_at);
  await sql`
    update calls set
      status = ${talked ? "completed" : status === "busy" ? "busy" : "no_answer"},
      outcome = ${talked ? "Connected" : status === "busy" ? "Busy" : "No answer"},
      ended_at = now(),
      duration_seconds = case
        when answered_at is not null then greatest(0, extract(epoch from (now() - answered_at))::int)
        else 0
      end
    where id = ${callId}
  `;
  return new Response(null, { status: 204 });
}

// ---------------------------------------------------------------------------

async function tenantForCall(callId: string): Promise<string | null> {
  if (!callId) return null;
  const rows = await sql`select tenant_id from calls where id = ${callId} limit 1`;
  return (rows[0] as { tenant_id: string } | undefined)?.tenant_id ?? null;
}

/** The number the caller dialled, reused as caller ID when ringing agents. */
async function dialledNumberFor(callId: string): Promise<string> {
  const rows = await sql`select to_number from calls where id = ${callId} limit 1`;
  return (rows[0] as { to_number: string | null } | undefined)?.to_number ?? "";
}
