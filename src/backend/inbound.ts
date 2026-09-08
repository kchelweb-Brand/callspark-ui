// Inbound calling: the IVR engine that actually answers the phone.
//
// A call is a state machine driven entirely by webhooks. Telnyx tells us what
// happened, we issue the next command, and the position in the flow rides
// along in `client_state` so nothing needs to be remembered between requests.
//
// The flow, end to end:
//
//   call.initiated  → look up which tenant owns the dialled number, open a
//                     `calls` row, answer
//   call.answered   → business hours decide open vs after-hours, then either
//                     play an IVR menu, ring the team, or take a voicemail
//   call.gather.ended → the caller pressed a key; run that option's action
//   call.answered(B)  → an agent picked up: bridge, mark connected, record
//   call.hangup(B)    → agent didn't answer: try the next one, else voicemail
//   call.recording.saved → attach the audio to the call row
//   call.hangup(A)    → close the call row
//
// Every path writes to `calls`, so Call History, Analytics and Recordings
// fill from real traffic without any further wiring.

import { sql } from "./db";
import {
  decodeClientState,
  encodeClientState,
  telnyxCommand,
  telnyxDial,
  verifyTelnyxSignature,
  type CallState,
} from "./telnyx";
import { isOpenAt, type BusinessHoursConfig } from "./business-hours";
import { findContactByPhone } from "./phone-numbers";
import {
  FALLBACK_MENU_GREETING,
  FALLBACK_VOICEMAIL_GREETING,
  dialableTarget,
  findMenu,
  findTenantByNumber,
  greetingAudioUrl,
  loadConfig,
  menuIdForNumber,
  ringTargetsFromRouting,
  targetsForExtension,
  type IvrMenu,
  type IvrOption,
  type TenantPhoneConfig,
} from "./call-flow";

// ---------------------------------------------------------------------------
// Config shapes (mirror src/lib/phone-system-data.ts, which writes them)
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Webhook payloads
// ---------------------------------------------------------------------------

interface TelnyxPayload {
  call_control_id?: string;
  call_leg_id?: string;
  call_session_id?: string;
  connection_id?: string;
  from?: string;
  to?: string;
  direction?: string;
  state?: string;
  client_state?: string | null;
  digits?: string;
  status?: string;
  hangup_cause?: string;
  recording_started_at?: string;
  recording_ended_at?: string;
  recording_urls?: { mp3?: string; wav?: string } | null;
  public_recording_urls?: { mp3?: string; wav?: string } | null;
}

const DEFAULT_VOICE = "female";
const DEFAULT_LANGUAGE = "en-US";
const VOICEMAIL_MAX_SECONDS = 300;


// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

export async function handleTelnyxVoiceWebhook(request: Request): Promise<Response> {
  // The signature covers the exact bytes received, so the body must be read
  // as text and parsed afterwards — re-serializing JSON would never verify.
  const raw = await request.text();

  const verdict = await verifyTelnyxSignature(
    raw,
    request.headers.get("telnyx-signature-ed25519"),
    request.headers.get("telnyx-timestamp"),
  );
  if (verdict === "invalid") {
    console.warn("[inbound] rejected webhook with bad signature");
    return new Response("Invalid signature", { status: 401 });
  }
  if (verdict === "unconfigured") {
    // Deliberate: calls still route before TELNYX_PUBLIC_KEY is pasted in, so
    // setup can be tested end to end. Loud, because it must not stay this way.
    console.warn(
      "[inbound] TELNYX_PUBLIC_KEY is not set — webhook accepted WITHOUT signature verification",
    );
  }

  let event: { event_type?: string; payload?: TelnyxPayload };
  try {
    event = (JSON.parse(raw) as { data?: typeof event }).data ?? {};
  } catch {
    return new Response("Bad JSON", { status: 400 });
  }

  const eventType = event.event_type ?? "";
  const payload = event.payload ?? {};

  try {
    await route(eventType, payload, new URL(request.url).origin);
  } catch (err) {
    // Never 500: Telnyx retries non-2xx, and a replayed call.initiated would
    // answer the same call twice. Log it and swallow — the call may still be
    // salvageable on the next event.
    console.error(`[inbound] ${eventType} failed`, err);
  }

  return new Response("ok", { status: 200 });
}

async function route(eventType: string, payload: TelnyxPayload, origin: string): Promise<void> {
  const state = decodeClientState(payload.client_state);

  switch (eventType) {
    case "call.initiated":
      // Outbound legs we created to ring agents also emit this; they carry
      // our state and must not be treated as new inbound calls.
      if (payload.direction === "incoming" && !state) await onInbound(payload);
      return;

    case "call.answered":
      if (!state) return;
      if (state.leg === "b") await onAgentAnswered(state, payload);
      else await onCallerAnswered(state, payload, origin);
      return;

    case "call.gather.ended":
      if (state) await onGatherEnded(state, payload, origin);
      return;

    case "call.speak.ended":
    case "call.playback.ended":
      // The only playback we don't follow with a gather is the voicemail
      // greeting — that's the cue to start recording.
      if (state?.step === "voicemail") await startRecording(state);
      return;

    case "call.recording.saved":
      if (state) await onRecordingSaved(state, payload);
      return;

    case "call.hangup":
      if (!state) return;
      if (state.leg === "b") await onAgentHangup(state, payload, origin);
      else await onCallerHangup(state, payload);
      return;

    default:
      // call.dtmf.received, call.bridged, machine detection, … — the events
      // we act on are handled above; the rest are noise for this flow.
      return;
  }
}

// ---------------------------------------------------------------------------
// Call setup
// ---------------------------------------------------------------------------

async function onInbound(payload: TelnyxPayload): Promise<void> {
  const callControlId = payload.call_control_id;
  if (!callControlId) return;

  const to = payload.to ?? "";
  const from = payload.from ?? "";

  const owner = await findTenantByNumber(to);
  if (!owner) {
    // Answering a call for a number we don't recognise would leave the caller
    // in silence. Rejecting is honest and costs nothing.
    console.warn(`[inbound] no tenant owns ${to} — rejecting`);
    await telnyxCommand(callControlId, "reject", { cause: "UNALLOCATED_NUMBER" });
    return;
  }

  // Telnyx retries webhooks; without this a retry opens a second call row and
  // answers a call that is already in the IVR.
  const existing = await sql`
    select id from calls where provider_call_id = ${callControlId} limit 1
  `;
  if (existing.length > 0) return;

  const contactId = await findContactByPhone(owner.tenantId, from);

  const rows = await sql`
    insert into calls (
      tenant_id, direction, from_number, to_number, contact_id, status, provider_call_id
    )
    values (
      ${owner.tenantId}, 'inbound', ${from || null}, ${to || null},
      ${contactId}, 'ringing', ${callControlId}
    )
    returning id
  `;
  const callId = (rows[0] as { id: string }).id;

  const state: CallState = {
    t: owner.tenantId,
    c: callId,
    a: callControlId,
    leg: "a",
    step: "menu",
  };

  const result = await telnyxCommand(callControlId, "answer", {
    client_state: encodeClientState(state),
  });
  if (!result.ok) {
    console.error(`[inbound] answer failed for ${callId}: ${result.error}`);
    await failCall(callId, result.error ?? "Could not answer the call.");
  }
}

/** The caller is connected — decide where they go. */
async function onCallerAnswered(
  state: CallState,
  payload: TelnyxPayload,
  origin: string,
): Promise<void> {
  const config = await loadConfig(state.t);
  const openNow = isOpenAt(config.businessHours, new Date());

  if (!openNow.open) {
    console.log(`[inbound] ${state.c}: after hours (${openNow.reason})`);
    const afterHoursMenu = config.routing.afterHoursToMenu
      ? findMenu(config, config.routing.afterHoursMenuId)
      : null;
    if (afterHoursMenu) {
      await playMenu(state, afterHoursMenu, origin, 0);
      return;
    }
    await startVoicemail(state, config, origin);
    return;
  }

  // Open. A menu attached to the dialled number wins; otherwise ring the team
  // directly, and failing that take a message.
  const assignedMenuId = await menuIdForNumber(state.t, payload.to ?? "");
  // Falling back to the only menu a tenant has built is deliberate: the
  // number-to-menu assignment is easy to skip, and silently ignoring a menu
  // they configured looks exactly like the IVR being broken.
  const menu =
    findMenu(config, assignedMenuId) ?? (config.menus.length === 1 ? config.menus[0]! : null);

  if (menu) {
    await playMenu(state, menu, origin, 0);
    return;
  }

  const targets = ringTargetsFromRouting(config);
  if (targets.length > 0) {
    await ringNext({ ...state, step: "ring", targets }, payload, config, origin);
    return;
  }

  await startVoicemail(state, config, origin);
}

// ---------------------------------------------------------------------------
// IVR menus
// ---------------------------------------------------------------------------

async function playMenu(
  state: CallState,
  menu: IvrMenu,
  origin: string,
  tries: number,
): Promise<void> {
  const options = (menu.options ?? []).filter((o) => o.key);
  const validDigits = options.map((o) => String(o.key)).join("") || "0123456789";

  const next: CallState = {
    ...state,
    leg: "a",
    step: "menu",
    ...(menu.id ? { menu: menu.id } : {}),
    tries,
  };

  const common = {
    client_state: encodeClientState(next),
    valid_digits: validDigits,
    minimum_digits: 1,
    maximum_digits: 1,
    // One prompt per gather; replays are driven by us so an exhausted menu
    // can fall through to voicemail instead of looping forever.
    maximum_tries: 1,
    timeout_millis: Math.max(1, menu.timeoutSeconds ?? 10) * 1000,
  };

  const audioUrl = greetingAudioUrl(menu.greetingMode, menu.greetingFile, origin);
  const result = audioUrl
    ? await telnyxCommand(state.a, "gather_using_audio", { ...common, audio_url: audioUrl })
    : await telnyxCommand(state.a, "gather_using_speak", {
        ...common,
        payload: menu.greetingText?.trim() || FALLBACK_MENU_GREETING,
        voice: DEFAULT_VOICE,
        language: DEFAULT_LANGUAGE,
      });

  if (!result.ok) {
    console.error(`[inbound] ${state.c}: menu playback failed — ${result.error}`);
    // Don't strand the caller in silence on a bad greeting URL or a rejected
    // command; a voicemail still captures the lead.
    const config = await loadConfig(state.t);
    await startVoicemail(state, config, origin);
  }
}

async function onGatherEnded(
  state: CallState,
  payload: TelnyxPayload,
  origin: string,
): Promise<void> {
  const config = await loadConfig(state.t);
  const menu = findMenu(config, state.menu ?? null);
  if (!menu) {
    await startVoicemail(state, config, origin);
    return;
  }

  const digits = (payload.digits ?? "").trim();
  const option = (menu.options ?? []).find((o) => String(o.key) === digits);

  if (!option) {
    // No input or an unmapped key. Replay up to the menu's repeat count, then
    // stop pestering the caller and take a message.
    const tries = (state.tries ?? 0) + 1;
    const limit = Math.max(1, menu.repeatCount ?? 1);
    if (tries < limit) {
      await playMenu(state, menu, origin, tries);
      return;
    }
    await startVoicemail(state, config, origin);
    return;
  }

  await runOption(state, option, config, payload, origin);
}

async function runOption(
  state: CallState,
  option: IvrOption,
  config: TenantPhoneConfig,
  payload: TelnyxPayload,
  origin: string,
): Promise<void> {
  switch (option.action) {
    case "ring_extension":
    case "ring_department": {
      const targets = targetsForExtension(config, option.target ?? "");
      if (targets.length === 0) {
        console.warn(`[inbound] ${state.c}: extension "${option.target}" has no destination`);
        await startVoicemail(state, config, origin);
        return;
      }
      await ringNext({ ...state, step: "ring", targets }, payload, config, origin);
      return;
    }

    case "goto_menu": {
      const next = findMenu(config, option.target ?? null);
      if (!next) {
        await startVoicemail(state, config, origin);
        return;
      }
      await playMenu(state, next, origin, 0);
      return;
    }

    case "repeat_menu": {
      const menu = findMenu(config, state.menu ?? null);
      if (menu) await playMenu(state, menu, origin, 0);
      return;
    }

    case "hangup":
      await telnyxCommand(state.a, "hangup", {});
      return;

    case "voicemail":
    default:
      await startVoicemail(state, config, origin);
  }
}

// ---------------------------------------------------------------------------
// Ringing agents
// ---------------------------------------------------------------------------

/**
 * Rings the next destination in the hunt list.
 *
 * This uses `dial` + `link_to` rather than `transfer` on purpose. A transfer
 * that isn't answered hangs up the caller — so "ring Sales, then voicemail"
 * would be impossible. Dialling a second leg linked to the caller keeps the
 * caller parked, so an unanswered agent falls through to the next one.
 */
async function ringNext(
  state: CallState,
  payload: TelnyxPayload,
  config: TenantPhoneConfig,
  origin: string,
): Promise<void> {
  const [target, ...rest] = state.targets ?? [];
  if (!target) {
    await startVoicemail(state, config, origin);
    return;
  }

  const connectionId = payload.connection_id ?? (await connectionIdForCall(state.c));
  if (!connectionId) {
    console.error(`[inbound] ${state.c}: no connection_id available to dial ${target}`);
    await startVoicemail(state, config, origin);
    return;
  }

  const ringSeconds = Math.min(600, Math.max(5, config.routing.timeoutSeconds ?? 30));
  const callerId = await primaryNumberFor(state.t, state.c);

  const bState: CallState = { ...state, leg: "b", step: "ring", targets: rest };

  const result = await telnyxDial({
    connection_id: connectionId,
    to: target,
    from: callerId,
    link_to: state.a,
    // Keeps the caller alive when the agent leg ends, which is what makes
    // fall-through to the next agent (or voicemail) possible at all.
    park_after_unbridge: "self",
    timeout_secs: ringSeconds,
    client_state: encodeClientState(bState),
  });

  if (!result.ok) {
    console.error(`[inbound] ${state.c}: dial ${target} failed — ${result.error}`);
    // Treat an un-dialable destination exactly like a no-answer.
    if (rest.length > 0) {
      await ringNext({ ...state, targets: rest }, payload, config, origin);
      return;
    }
    await startVoicemail(state, config, origin);
  }
}

async function onAgentAnswered(state: CallState, _payload: TelnyxPayload): Promise<void> {
  // Telnyx bridges the legs automatically because the dial was link_to'd, so
  // there's nothing to command here — just record the connect.
  await sql`
    update calls set status = 'active', answered_at = coalesce(answered_at, now())
    where id = ${state.c} and tenant_id = ${state.t}
  `;

  // Record the conversation from the caller's leg so both sides are captured.
  await telnyxCommand(state.a, "record_start", {
    format: "mp3",
    channels: "single",
    client_state: encodeClientState({ ...state, leg: "a" }),
  });
}

async function onAgentHangup(
  state: CallState,
  payload: TelnyxPayload,
  origin: string,
): Promise<void> {
  // Whether the agent leg ever connected is recorded on the call row, which
  // is more reliable than trying to keep that flag inside client_state across
  // a bridge.
  const rows = await sql`
    select answered_at from calls where id = ${state.c} and tenant_id = ${state.t} limit 1
  `;
  const answered = Boolean((rows[0] as { answered_at: string | null } | undefined)?.answered_at);

  if (answered) {
    // They spoke and the agent hung up — end the caller's leg too.
    await telnyxCommand(state.a, "hangup", {});
    return;
  }

  const config = await loadConfig(state.t);
  if ((state.targets ?? []).length > 0) {
    await ringNext({ ...state, leg: "a" }, payload, config, origin);
    return;
  }
  await startVoicemail({ ...state, leg: "a" }, config, origin);
}

// ---------------------------------------------------------------------------
// Voicemail
// ---------------------------------------------------------------------------

async function startVoicemail(
  state: CallState,
  config: TenantPhoneConfig,
  origin: string,
): Promise<void> {
  const vm = config.voicemail ?? {};
  const next: CallState = { ...state, leg: "a", step: "voicemail" };
  const clientState = encodeClientState(next);

  const audioUrl = greetingAudioUrl(vm.greetingMode, vm.greetingFile, origin);
  const result = audioUrl
    ? await telnyxCommand(state.a, "playback_start", {
        audio_url: audioUrl,
        client_state: clientState,
      })
    : await telnyxCommand(state.a, "speak", {
        payload: vm.greetingText?.trim() || FALLBACK_VOICEMAIL_GREETING,
        voice: DEFAULT_VOICE,
        language: DEFAULT_LANGUAGE,
        client_state: clientState,
      });

  if (!result.ok) {
    console.error(`[inbound] ${state.c}: voicemail greeting failed — ${result.error}`);
    // Skip straight to the beep rather than dropping the caller.
    await startRecording(next);
  }
}

/** Fired when the voicemail greeting finishes playing. */
async function startRecording(state: CallState): Promise<void> {
  const result = await telnyxCommand(state.a, "record_start", {
    format: "mp3",
    channels: "single",
    play_beep: true,
    max_length: VOICEMAIL_MAX_SECONDS,
    client_state: encodeClientState({ ...state, leg: "a", step: "voicemail" }),
  });
  if (!result.ok) {
    console.error(`[inbound] ${state.c}: record_start failed — ${result.error}`);
    await telnyxCommand(state.a, "hangup", {});
  }
}

async function onRecordingSaved(state: CallState, payload: TelnyxPayload): Promise<void> {
  // Public URLs are only present when the connection is configured to expose
  // them; the private URL is the dependable one.
  const url =
    payload.recording_urls?.mp3 ??
    payload.recording_urls?.wav ??
    payload.public_recording_urls?.mp3 ??
    payload.public_recording_urls?.wav ??
    null;
  if (!url) return;

  const seconds = durationSeconds(payload.recording_started_at, payload.recording_ended_at);

  await sql`
    update calls
    set recording_url = ${url}, recording_seconds = ${seconds}
    where id = ${state.c} and tenant_id = ${state.t}
  `;
}

function durationSeconds(start?: string, end?: string): number | null {
  if (!start || !end) return null;
  const ms = Date.parse(end) - Date.parse(start);
  return Number.isFinite(ms) && ms > 0 ? Math.round(ms / 1000) : null;
}

// ---------------------------------------------------------------------------
// Teardown
// ---------------------------------------------------------------------------

async function onCallerHangup(state: CallState, payload: TelnyxPayload): Promise<void> {
  const rows = await sql`
    select answered_at, status from calls
    where id = ${state.c} and tenant_id = ${state.t} limit 1
  `;
  const row = rows[0] as { answered_at: string | null; status: string } | undefined;
  if (!row) return;
  // A finished call can still receive a late hangup webhook; don't rewrite it.
  if (row.status !== "ringing" && row.status !== "active") return;

  const talked = Boolean(row.answered_at);
  const leftMessage = state.step === "voicemail";

  const status = talked ? "completed" : leftMessage ? "completed" : "no_answer";
  const outcome = talked ? "Connected" : leftMessage ? "Voicemail" : "No answer";

  await sql`
    update calls set
      status = ${status},
      outcome = ${outcome},
      ended_at = now(),
      error = ${payload.hangup_cause ?? null},
      duration_seconds = case
        when answered_at is not null then greatest(0, extract(epoch from (now() - answered_at))::int)
        else 0
      end
    where id = ${state.c} and tenant_id = ${state.t}
  `;
}

async function failCall(callId: string, error: string): Promise<void> {
  await sql`
    update calls set status = 'failed', outcome = 'Failed', ended_at = now(), error = ${error}
    where id = ${callId}
  `;
}

// ---------------------------------------------------------------------------
// Lookups
// ---------------------------------------------------------------------------
async function primaryNumberFor(tenantId: string, callId: string): Promise<string> {
  const rows = await sql`
    select to_number from calls where id = ${callId} and tenant_id = ${tenantId} limit 1
  `;
  return (rows[0] as { to_number: string | null } | undefined)?.to_number ?? "";
}

async function connectionIdForCall(callId: string): Promise<string | null> {
  const rows = await sql`
    select telnyx_connection_id from sip_connections
    where tenant_id = (select tenant_id from calls where id = ${callId})
    limit 1
  `;
  return (rows[0] as { telnyx_connection_id: string | null } | undefined)?.telnyx_connection_id ?? null;
}
