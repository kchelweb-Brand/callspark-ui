// The AI voice agent, shared by the receptionist (inbound) and AI campaigns
// (outbound): how it sounds, how it behaves, and what it can do mid-call.
//
// It rides on SignalWire's hosted agent (the SWML `ai` verb), which does the
// listening, thinking and speaking. We decide the voice, the model, the
// turn-taking and the prompt, and give it a few actions it can take: tag the
// call, note an appointment, text the person, or hand the call to a human.
// Each action is a webhook back to us, signed per call so only the call it was
// created for can use it.
//
// Server-only: it reaches the carrier. Browser code imports ai-agent-options.

import { sql } from "./db";
import { env } from "./env";
import { ensureSchema } from "./schema.server";
import { sendSms } from "./signalwire-rest";
import { notify } from "./notifications.server";
import {
  AI_MODELS,
  AI_OUTCOMES,
  aiOutcomeLabel,
  findAiVoice,
  isAiOutcome,
  sanitizeAiSettings,
  type AiAgentSettings,
  type AiStyle,
} from "./ai-agent-options";

export const AI_ACTIONS_PATH = "/api/voice/ai-actions";

// ---------------------------------------------------------------------------
// Signed callback URLs
// ---------------------------------------------------------------------------

/** Signs a per-call callback URL so only SignalWire, handed that URL by us, can use it. */
export async function callbackToken(callId: string, purpose: "done" | "act" = "done"): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(env.authSecret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`ai-${purpose}:${callId}`));
  return Array.from(new Uint8Array(mac))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, 40);
}

// ---------------------------------------------------------------------------
// How it sounds and behaves
// ---------------------------------------------------------------------------

/** Turn-taking. The pause before replying is what makes a voice feel human or robotic. */
const STYLE_PARAMS: Record<AiStyle, Record<string, unknown>> = {
  natural: {
    end_of_speech_timeout: 700,
    attention_timeout: 10000,
    attention_timeout_prompt: "The other person has gone quiet. Check in with a few friendly words, like asking if they are still there.",
    acknowledge_interruptions: true,
  },
  calm: {
    end_of_speech_timeout: 1000,
    attention_timeout: 12000,
    attention_timeout_prompt: "The other person has gone quiet. Gently and patiently ask if they are still there.",
  },
  quick: {
    end_of_speech_timeout: 500,
    attention_timeout: 10000,
    attention_timeout_prompt: "The other person has gone quiet. Briefly ask if they are still there.",
  },
};

export const STYLE_GUIDE: Record<AiStyle, string> = {
  natural:
    "Sound like a relaxed, friendly person on the phone, not a script. Use short sentences and contractions. " +
    "Say one thing at a time and ask only one question at a time. React to what they say the way a person would " +
    "('oh nice', 'got it', 'makes sense'). Never read out lists. Never repeat yourself.",
  calm:
    "Speak slowly, warmly and patiently, like someone with all the time in the world. Short sentences. " +
    "One question at a time. Let silences breathe.",
  quick:
    "Be brief and direct. One or two short sentences per turn. Get to the point, confirm what you heard, and move on.",
};

/** Told to every agent, whatever the style: people must not be misled about who they are talking to. */
export const HONESTY =
  "If anyone sincerely asks whether you are a person, a robot or an AI, say honestly that you are an automated assistant. " +
  "Never ask for card numbers, passwords or ID numbers. Never invent prices, availability or promises.";

/** Outbound agents only talk first when told to; with just a role they sit silent until the person says hello. */
export const OPENING_INSTRUCTION =
  "IMPORTANT: You placed this call and the person has just picked up, and a short hello has already been said out loud for you. " +
  "Do not wait for them to speak. Speak first, right away: now say who you are and why you are calling, " +
  "in one or two sentences, then pause and let them answer. Do not say hello again. " +
  "If they say hello first, still introduce yourself straight away.";

/**
 * The first words of a campaign call, spoken by the carrier itself the moment the person picks up,
 * so a call is never silent even if the model is slow to start. The model carries on from there.
 */
export function campaignGreeting(person: string | null | undefined): string {
  const first = String(person ?? "").trim().split(/\s+/)[0] ?? "";
  return first ? `Hi ${first}, thanks for picking up. I'll be quick.` : "Hi there, thanks for picking up. I'll be quick.";
}

function actionGuide(s: AiAgentSettings): string {
  const lines: string[] = [];
  if (s.actions.outcome) {
    lines.push("Before the call ends, call save_outcome exactly once to record how it went.");
  }
  if (s.actions.book) {
    lines.push(
      "If the person wants a visit, appointment or callback at a particular time, call book_appointment with the time they said. " +
        "You cannot see a calendar, so never promise that the time is free: say the team will confirm it.",
    );
  }
  if (s.actions.text) {
    lines.push(
      "If the person asks for details to be texted to them, and those details are in your instructions, call send_text. " +
        "Only ever text information you were given. Send at most one text.",
    );
  }
  if (s.actions.transfer && transferTarget(s)) {
    lines.push("If the person asks for a human, or it is urgent, tell them you are connecting them and call transfer_to_human.");
  }
  return lines.join("\n");
}

export function transferTarget(s: AiAgentSettings): string | null {
  const digits = s.transferNumber.replace(/[^\d]/g, "");
  return digits.length >= 7 && digits.length <= 15 ? `+${digits}` : null;
}

export interface BuildAiInput {
  kind: "campaign" | "receptionist" | "sample";
  settings: AiAgentSettings;
  /** Who the agent is and what the call is for. */
  role: string;
  /** What is known about the person, from their contact record. */
  brief?: string;
  callId: string;
  origin: string;
  /** Spoken the moment the call connects. */
  greeting?: string;
  postPrompt?: string;
  /** Longest the conversation may run, e.g. "25s". */
  hardStop?: string;
}

/** The SWML `ai` verb for one call. */
export async function buildAiVerb(input: BuildAiInput): Promise<Record<string, unknown>> {
  const s = input.settings;
  const voice = findAiVoice(s.voice);
  const model = AI_MODELS.find((m) => m.id === s.model) ?? AI_MODELS[0]!;
  const outbound = input.kind !== "receptionist";

  const prompt = [
    input.role,
    input.brief ? `What you know about the person:\n${input.brief}` : "",
    STYLE_GUIDE[s.style],
    HONESTY,
    input.kind === "sample" ? "" : actionGuide(s),
    input.kind === "campaign" ? OPENING_INSTRUCTION : "",
  ]
    .filter(Boolean)
    .join("\n\n");

  const params: Record<string, unknown> = {
    ai_model: model.model,
    direction: outbound ? "outbound" : "inbound",
    wait_for_user: false,
    ...STYLE_PARAMS[s.style],
  };
  if (input.greeting) params["static_greeting"] = input.greeting;
  if (input.hardStop) params["hard_stop_time"] = input.hardStop;

  const ai: Record<string, unknown> = {
    prompt: { text: prompt },
    languages: [
      {
        name: "English",
        code: voice.lang,
        voice: voice.voice,
        function_fillers: ["One moment.", "Okay, one second.", "Let me note that."],
      },
    ],
    params,
  };

  const functions = input.kind === "sample" ? [] : await actionFunctions(s, input.callId, input.origin);
  if (functions.length > 0) ai["SWAIG"] = { functions };

  if (input.postPrompt) {
    const doneUrl = new URL("/api/voice/signalwire", input.origin);
    doneUrl.searchParams.set("step", "ai_done");
    doneUrl.searchParams.set("call", input.callId);
    doneUrl.searchParams.set("t", await callbackToken(input.callId, "done"));
    ai["post_prompt"] = { text: input.postPrompt };
    ai["post_prompt_url"] = doneUrl.toString();
  }
  return ai;
}

/** The longest script that is read aloud. */
export const MAX_SCRIPT_CHARS = 2000;

/**
 * The call instructions for a campaign that reads a script instead of holding a conversation: wait a
 * moment after the person picks up, read the script in the chosen voice, optionally offer "press 1" to
 * be connected to a person, then hang up. No AI is involved, so there is no AI cost per call.
 */
export interface ScriptAudio {
  /** Recordings of the script, in order. */
  script: string[];
  press?: string[] | undefined;
  connecting?: string[] | undefined;
}

/** The script as it is spoken: tidy spacing, cut at the limit. */
export function scriptText(script: string): string {
  return script.replace(/\s+/g, " ").trim().slice(0, MAX_SCRIPT_CHARS);
}

export function buildScriptDoc(input: { script: string; settings: AiAgentSettings; fromNumber?: string | null; audio?: ScriptAudio | null | undefined }): Record<string, unknown> {
  const voice = findAiVoice(input.settings.voice);
  const say = { say_voice: voice.voice, say_language: voice.lang };
  const text = scriptText(input.script);
  const target = transferTarget(input.settings);
  const audio = input.audio ?? null;

  const main: Record<string, unknown>[] = [
    { answer: {} },
    { sleep: 800 },
    { play: audio && audio.script.length > 0 ? { urls: audio.script } : { url: `say:${text}`, ...say } },
  ];

  if (input.settings.pressToConnect && target && input.fromNumber) {
    main.push({
      prompt: { play: audio?.press?.length ? audio.press : "say:To speak with someone now, press 1.", max_digits: 1, initial_timeout: 6, digit_timeout: 3, ...say },
    });
    main.push({
      switch: {
        variable: "prompt_value",
        case: {
          "1": [
            { play: audio?.connecting?.length ? { urls: audio.connecting } : { url: "say:Connecting you now. Please hold.", ...say } },
            { connect: { to: target, from: input.fromNumber, timeout: 30 } },
          ],
        },
        default: [{ hangup: {} }],
      },
    });
  }
  main.push({ sleep: 600 }, { hangup: {} });
  return { version: "1.0.0", sections: { main } };
}

export function summaryPrompt(audience: string): string {
  return (
    `Start with one line exactly like "OUTCOME: interested" using one of: ${AI_OUTCOMES.map((o) => o.id).join(", ")}. ` +
    `Then, in two or three sentences, summarise the call for ${audience}: the person's name, their number, ` +
    "what they wanted, anything that was promised, and whether it sounded urgent."
  );
}

async function actionFunctions(s: AiAgentSettings, callId: string, origin: string): Promise<unknown[]> {
  const hook = new URL(AI_ACTIONS_PATH, origin);
  hook.searchParams.set("call", callId);
  hook.searchParams.set("t", await callbackToken(callId, "act"));
  const web_hook_url = hook.toString();
  const fns: unknown[] = [];

  if (s.actions.outcome) {
    fns.push({
      function: "save_outcome",
      description: "Record how the call went. Call this once, right before the call ends.",
      parameters: {
        type: "object",
        properties: {
          outcome: { type: "string", enum: AI_OUTCOMES.map((o) => o.id), description: "How the call went." },
          note: { type: "string", description: "One short line worth remembering about this person." },
          callback_time: { type: "string", description: "When they asked to be called back, in their own words." },
        },
        required: ["outcome"],
      },
      web_hook_url,
    });
  }
  if (s.actions.book) {
    fns.push({
      function: "book_appointment",
      description: "Note that the person wants an appointment or visit at a time. The team confirms it afterwards.",
      parameters: {
        type: "object",
        properties: {
          when: { type: "string", description: "The day and time they asked for, in their own words." },
          name: { type: "string", description: "The person's name." },
          reason: { type: "string", description: "What the appointment is for." },
        },
        required: ["when"],
      },
      web_hook_url,
    });
  }
  if (s.actions.text) {
    fns.push({
      function: "send_text",
      description: "Send the person a text message with details they asked for. Only use information you were given.",
      parameters: {
        type: "object",
        properties: { message: { type: "string", description: "The text to send, under 300 characters." } },
        required: ["message"],
      },
      web_hook_url,
    });
  }
  if (s.actions.transfer && transferTarget(s)) {
    fns.push({
      function: "transfer_to_human",
      description: "Connect the person to a human on the team. Use when they ask for one or it is urgent.",
      parameters: { type: "object", properties: {} },
      web_hook_url,
    });
  }
  return fns;
}

// ---------------------------------------------------------------------------
// What the agent knows about the person
// ---------------------------------------------------------------------------

/** A few lines from the contact record, and how the last call went, so the agent is not starting cold. */
export async function contactBrief(tenantId: string, contactId: string | null | undefined): Promise<string> {
  if (!contactId) return "";
  const [c] = await sql`
    select person, first_name, last_name, location, country, company, email, tags from contacts where id = ${contactId} and tenant_id = ${tenantId} limit 1
  `;
  if (!c) return "";
  const lines: string[] = [];
  const fullName = [c["first_name"], c["last_name"]].filter(Boolean).join(" ") || (c["person"] as string | null);
  if (fullName) lines.push(`Name: ${fullName}`);
  const place = [c["location"], c["country"]].filter(Boolean).join(", ");
  if (place) lines.push(`Location: ${place}`);
  if (c["company"]) lines.push(`Company: ${c["company"]}`);
  if (c["email"]) lines.push(`Email: ${c["email"]}`);
  const tags = c["tags"] as string[] | null;
  if (tags && tags.length > 0) lines.push(`Tags: ${tags.slice(0, 8).join(", ")}`);
  const [last] = await sql`
    select summary, ai_outcome, started_at from calls
    where contact_id = ${contactId} and tenant_id = ${tenantId} and summary is not null
    order by started_at desc limit 1
  `;
  if (last) {
    const when = new Date(last["started_at"] as string).toISOString().slice(0, 10);
    const tag = aiOutcomeLabel(last["ai_outcome"] as string | null);
    lines.push(`Last spoke on ${when}${tag ? ` (${tag})` : ""}: ${String(last["summary"]).slice(0, 400)}`);
  }
  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Tagging calls
// ---------------------------------------------------------------------------

const OUTCOME_LABELS = Object.fromEntries(AI_OUTCOMES.map((o) => [o.id, o.label]));

/** Shows the tag in Call History: the outcome column, and so its filter, carries it. */
async function applyOutcomeLabel(callId: string): Promise<void> {
  await sql`
    update calls set outcome = coalesce(${JSON.stringify(OUTCOME_LABELS)}::jsonb ->> ai_outcome, outcome)
    where id = ${callId} and ai_outcome is not null
  `;
}

export async function tagCall(callId: string, outcome: string, note?: string | null): Promise<void> {
  await ensureSchema();
  await sql`
    update calls set ai_outcome = ${outcome}, ai_note = coalesce(${note ?? null}, ai_note) where id = ${callId}
  `;
  await applyOutcomeLabel(callId);
}

async function notifyOwners(tenantId: string, title: string, body: string): Promise<void> {
  const owners = await sql`select id from users where tenant_id = ${tenantId} and role = 'tenant_owner'`;
  for (const o of owners) {
    await notify({ tenantId, userId: o["id"] as string, kind: "system", title, body, link: "/automations" });
  }
}

// ---------------------------------------------------------------------------
// Actions the agent can take mid-call
// ---------------------------------------------------------------------------

interface CallRow {
  id: string;
  tenant_id: string;
  direction: string;
  to_number: string | null;
  from_number: string | null;
  contact_id: string | null;
  ai_settings: unknown;
}

interface ActionReply {
  response: string;
  action?: unknown[];
}

const MAX_BOOKINGS_PER_CALL = 3;

export async function runAiFunction(callId: string, name: string, args: Record<string, unknown>): Promise<ActionReply> {
  await ensureSchema();
  const [call] = (await sql`
    select id, tenant_id, direction, to_number, from_number, contact_id, ai_settings from calls where id = ${callId} limit 1
  `) as unknown as CallRow[];
  if (!call) return { response: "I could not do that." };

  const s = sanitizeAiSettings(call.ai_settings);
  const outbound = call.direction === "outbound";
  const theirNumber = outbound ? call.to_number : call.from_number;
  const ourNumber = outbound ? call.from_number : call.to_number;
  const text = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

  switch (name) {
    case "save_outcome": {
      if (!s.actions.outcome) return { response: "Okay." };
      const outcome = text(args["outcome"], 40);
      if (!isAiOutcome(outcome)) return { response: "That is not one of the outcomes. Pick the closest one." };
      const callback = text(args["callback_time"], 80);
      const note = [text(args["note"], 300), callback ? `Call back: ${callback}` : ""].filter(Boolean).join(" · ");
      await tagCall(callId, outcome, note || null);
      if (outcome === "do_not_call" && call.contact_id) {
        await sql`update contacts set do_not_call = true, do_not_sms = true where id = ${call.contact_id} and tenant_id = ${call.tenant_id}`;
      }
      if (outcome === "interested" || outcome === "call_back") {
        await notifyOwners(
          call.tenant_id,
          outcome === "interested" ? "A call went well" : "Someone asked for a call back",
          [theirNumber, note].filter(Boolean).join(" · "),
        );
      }
      return { response: "Noted." };
    }

    case "book_appointment": {
      if (!s.actions.book) return { response: "Okay." };
      const when = text(args["when"], 120);
      if (!when) return { response: "Ask what day and time suits them, then try again." };
      const [{ n }] = (await sql`select count(*)::int as n from appointments where call_id = ${callId}`) as unknown as { n: number }[];
      if (n >= MAX_BOOKINGS_PER_CALL) return { response: "I have already noted several requests on this call. The team will follow up." };
      const [contact] = call.contact_id
        ? await sql`select person, company from contacts where id = ${call.contact_id} limit 1`
        : [];
      const who = text(args["name"], 120) || String(contact?.["person"] ?? contact?.["company"] ?? "");
      const reason = text(args["reason"], 300);
      await sql`
        insert into appointments (tenant_id, call_id, contact_id, name, phone, when_text, reason)
        values (${call.tenant_id}, ${callId}, ${call.contact_id}, ${who || null}, ${theirNumber}, ${when}, ${reason || null})
      `;
      await notifyOwners(call.tenant_id, "New appointment request", [who, theirNumber, when, reason].filter(Boolean).join(" · "));
      return { response: "I have noted that. Tell them the team will confirm the time with them." };
    }

    case "send_text": {
      if (!s.actions.text) return { response: "Okay." };
      const message = text(args["message"], 320);
      if (!message) return { response: "There is nothing to send yet." };
      if (!theirNumber || !ourNumber) return { response: "I cannot text from this call." };
      if (call.contact_id) {
        const [c] = await sql`select do_not_sms, do_not_call from contacts where id = ${call.contact_id} limit 1`;
        if (c?.["do_not_sms"] || c?.["do_not_call"]) return { response: "This person asked not to be texted, so I cannot send one." };
      }
      // Claimed first, so a repeated call from the agent can never send twice.
      const claimed = await sql`update calls set ai_text_sent_at = now() where id = ${callId} and ai_text_sent_at is null returning id`;
      if (claimed.length === 0) return { response: "A text was already sent on this call." };
      const sent = await sendSms({ to: theirNumber, from: ourNumber, body: message });
      if (!sent.ok) {
        await sql`update calls set ai_text_sent_at = null where id = ${callId}`;
        return { response: "I could not send the text. Tell them the team will follow up by message." };
      }
      return { response: "The text has been sent." };
    }

    case "transfer_to_human": {
      const target = transferTarget(s);
      if (!s.actions.transfer || !target) return { response: "Nobody is available to take the call right now. Offer to pass on a message." };
      await tagCall(callId, "transferred");
      const connect: Record<string, unknown> = { to: target, timeout: 30 };
      if (ourNumber) connect["from"] = ourNumber;
      return {
        response: "Connecting you now.",
        action: [{ SWML: { version: "1.0.0", sections: { main: [{ connect }] } }, transfer: "true" }],
      };
    }

    default:
      return { response: "I cannot do that." };
  }
}

interface FunctionPayload {
  function?: unknown;
  argument?: { parsed?: unknown[] };
}

export async function handleAiFunction(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const callId = url.searchParams.get("call") ?? "";
  const token = url.searchParams.get("t") ?? "";
  if (!callId || token !== (await callbackToken(callId, "act"))) {
    return new Response("Forbidden", { status: 403 });
  }

  let body: FunctionPayload = {};
  try {
    body = (await request.json()) as FunctionPayload;
  } catch {
    // Treated as an empty call to an unknown function below.
  }
  const args = (body.argument?.parsed?.[0] ?? {}) as Record<string, unknown>;

  let reply: ActionReply;
  try {
    reply = await runAiFunction(callId, String(body.function ?? ""), args);
  } catch (err) {
    // The agent is mid-sentence with a person: it must always get an answer.
    console.error("[ai-actions] failed", err);
    reply = { response: "I could not do that just now." };
  }
  return new Response(JSON.stringify(reply), { status: 200, headers: { "content-type": "application/json" } });
}

// ---------------------------------------------------------------------------
// End of call
// ---------------------------------------------------------------------------

interface AiDonePayload {
  post_prompt_data?: { raw?: unknown; substituted?: unknown; parsed?: unknown } | string;
  call_log?: { role?: string; content?: unknown }[];
}

function asText(value: unknown): string {
  if (typeof value === "string") return value;
  if (value && typeof value === "object") return JSON.stringify(value);
  return "";
}

/** SignalWire's end-of-conversation callback: store the summary, transcript and outcome on the call. */
export async function handleAiDone(request: Request, url: URL): Promise<Response> {
  const callId = url.searchParams.get("call") ?? "";
  const token = url.searchParams.get("t") ?? "";
  if (!callId || token !== (await callbackToken(callId, "done"))) {
    return new Response("Forbidden", { status: 403 });
  }

  let body: AiDonePayload = {};
  try {
    body = (await request.json()) as AiDonePayload;
  } catch {
    // An empty or malformed body still closes the call out below.
  }

  const data = body.post_prompt_data;
  let summary =
    typeof data === "string" ? data : asText(data?.substituted) || asText(data?.raw) || asText(data?.parsed);

  const tagged = /^\s*OUTCOME:\s*([a-z_]+)\s*$/im.exec(summary);
  const outcome = tagged && isAiOutcome(tagged[1]) ? tagged[1] : null;
  summary = summary.replace(/^\s*OUTCOME:.*$/im, "").trim();

  const transcript = (body.call_log ?? [])
    .filter((m) => (m.role === "user" || m.role === "assistant") && asText(m.content).trim())
    .map((m) => `${m.role === "user" ? "Caller" : "Assistant"}: ${asText(m.content).trim()}`)
    .join("\n");

  await ensureSchema();
  // A campaign call's status, length and result belong to the carrier's own
  // status callback, which arrives after this one. Only an inbound call, which
  // has no such callback, is closed out here.
  await sql`
    update calls set
      summary = ${summary.slice(0, 2000) || null},
      transcript = ${transcript.slice(0, 20000) || null},
      summary_at = now(),
      handled_by = 'ai',
      ai_outcome = coalesce(ai_outcome, ${outcome}),
      status = case when campaign_id is null then 'completed' else status end,
      outcome = case when campaign_id is null then 'AI receptionist' else outcome end,
      answered_at = case when campaign_id is null then coalesce(answered_at, started_at) else answered_at end,
      ended_at = case when campaign_id is null then coalesce(ended_at, now()) else ended_at end,
      duration_seconds = case
        when campaign_id is null and coalesce(duration_seconds, 0) = 0
          then greatest(0, extract(epoch from (now() - started_at))::int)
        else duration_seconds
      end
    where id = ${callId}
  `;
  await applyOutcomeLabel(callId);
  return new Response("{}", { status: 200, headers: { "content-type": "application/json" } });
}
