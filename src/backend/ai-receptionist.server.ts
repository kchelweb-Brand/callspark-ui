// The AI receptionist: an automated agent that answers an inbound call when no
// human can, asks who is calling and why, answers simple questions from the
// business's own description, and takes a message.
//
// It rides on SignalWire's hosted AI agent (the SWML `ai` verb) — the same
// mechanism the outbound AI campaigns already use — so no extra service is
// involved. When the conversation ends SignalWire posts the summary and the
// transcript back to us, and they are stored on the call record.
//
// Server-only; imported by the call webhook, never by browser code.

import { sql } from "./db";
import { env } from "./env";
import { ensureSchema } from "./schema.server";
import { tenantHasFeature } from "./entitlements";
import { loadAutomations, type Automations } from "./automation.server";

export type NoAnswerReason = "closed" | "unanswered";

/** The receptionist's settings when it should handle this situation, else null. */
export async function receptionistFor(
  tenantId: string,
  situation: "incoming_open" | NoAnswerReason,
): Promise<Automations["aiReceptionist"] | null> {
  const { aiReceptionist } = await loadAutomations(tenantId);
  if (!aiReceptionist.enabled) return null;
  if (!(await tenantHasFeature(tenantId, "aiReceptionist"))) return null;

  switch (situation) {
    case "incoming_open":
      return aiReceptionist.mode === "always" ? aiReceptionist : null;
    case "closed":
      // Every mode covers closed hours: nobody is there to answer.
      return aiReceptionist;
    case "unanswered":
      return aiReceptionist.mode === "after_hours" ? null : aiReceptionist;
  }
}

function buildPrompt(cfg: Automations["aiReceptionist"], situation: string): string {
  const parts = [
    `You are the automated virtual receptionist for ${cfg.businessName}. Say plainly that you are an automated assistant.`,
    situation === "closed"
      ? "The office is currently closed."
      : "Nobody on the team is able to take this call right now.",
    cfg.about ? `About the business (this is everything you know, do not add to it):\n${cfg.about}` : "",
    "Your job: greet the caller, find out their name, the best number to reach them, and what they need. " +
      "Answer simple questions only using the business information above. " +
      "If you do not know something, say you will pass the question on rather than guessing. " +
      "Never invent prices, availability, promises or policies. Never ask for card numbers, passwords or ID numbers.",
    cfg.transferNumber
      ? `For something urgent, tell the caller they can reach the team directly on ${cfg.transferNumber}.`
      : "",
    "Keep every reply short, friendly and natural. Once you have the caller's name, number and reason, " +
      "confirm them back, thank the caller, say goodbye and end the call.",
  ];
  return parts.filter(Boolean).join("\n\n");
}

/** Signs the callback URL so only SignalWire, handed that URL by us, can post a summary. */
async function callbackToken(callId: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(env.authSecret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`ai-done:${callId}`));
  return Array.from(new Uint8Array(mac))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, 40);
}

/** The SWML document that hands the call to the AI agent. */
export async function receptionistResponse(
  cfg: Automations["aiReceptionist"],
  origin: string,
  callId: string,
  situation: NoAnswerReason | "incoming_open",
): Promise<Response> {
  await ensureSchema();
  await sql`update calls set handled_by = 'ai' where id = ${callId}`;

  const doneUrl = new URL("/api/voice/signalwire", origin);
  doneUrl.searchParams.set("step", "ai_done");
  doneUrl.searchParams.set("call", callId);
  doneUrl.searchParams.set("t", await callbackToken(callId));

  const doc = {
    version: "1.0.0",
    sections: {
      main: [
        { answer: {} },
        {
          ai: {
            prompt: { text: buildPrompt(cfg, situation) },
            post_prompt: {
              text:
                "Summarize this call in two or three sentences for the business owner. Include the caller's " +
                "name, their callback number, what they wanted, and whether it sounded urgent.",
            },
            post_prompt_url: doneUrl.toString(),
          },
        },
        { hangup: {} },
      ],
    },
  };
  return new Response(JSON.stringify(doc), { status: 200, headers: { "content-type": "application/json" } });
}

interface AiDonePayload {
  post_prompt_data?: { raw?: unknown; substituted?: unknown; parsed?: unknown } | string;
  call_log?: { role?: string; content?: unknown }[];
}

function asText(value: unknown): string {
  if (typeof value === "string") return value;
  if (value && typeof value === "object") return JSON.stringify(value);
  return "";
}

/** SignalWire's end-of-conversation callback: store the summary and transcript on the call. */
export async function handleAiDone(request: Request, url: URL): Promise<Response> {
  const callId = url.searchParams.get("call") ?? "";
  const token = url.searchParams.get("t") ?? "";
  if (!callId || token !== (await callbackToken(callId))) {
    return new Response("Forbidden", { status: 403 });
  }

  let body: AiDonePayload = {};
  try {
    body = (await request.json()) as AiDonePayload;
  } catch {
    // An empty or malformed body still closes the call out below.
  }

  const data = body.post_prompt_data;
  const summary =
    typeof data === "string"
      ? data
      : asText(data?.substituted) || asText(data?.raw) || asText(data?.parsed);

  const transcript = (body.call_log ?? [])
    .filter((m) => (m.role === "user" || m.role === "assistant") && asText(m.content).trim())
    .map((m) => `${m.role === "user" ? "Caller" : "Assistant"}: ${asText(m.content).trim()}`)
    .join("\n");

  await ensureSchema();
  await sql`
    update calls set
      summary = ${summary.trim().slice(0, 2000) || null},
      transcript = ${transcript.slice(0, 20000) || null},
      summary_at = now(),
      handled_by = 'ai',
      status = 'completed',
      outcome = 'AI receptionist',
      answered_at = coalesce(answered_at, started_at),
      ended_at = coalesce(ended_at, now()),
      duration_seconds = case
        when coalesce(duration_seconds, 0) = 0 then greatest(0, extract(epoch from (now() - started_at))::int)
        else duration_seconds
      end
    where id = ${callId}
  `;
  return new Response("{}", { status: 200, headers: { "content-type": "application/json" } });
}
