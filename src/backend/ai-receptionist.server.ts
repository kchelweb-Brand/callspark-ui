// The AI receptionist: an automated agent that answers an inbound call when no
// human can, asks who is calling and why, answers simple questions from the
// business's own description, and takes a message.
//
// It rides on SignalWire's hosted AI agent (the SWML `ai` verb) — the same
// mechanism the outbound AI campaigns use — so no extra service is involved.
// The voice, the style and the actions it can take come from the shared agent
// settings (ai-agent.server.ts). When the conversation ends SignalWire posts the
// summary and the transcript back to us, and they are stored on the call record.
//
// Server-only; imported by the call webhook, never by browser code.

import { sql } from "./db";
import { ensureSchema } from "./schema.server";
import { tenantHasFeature } from "./entitlements";
import { loadAutomations, type Automations } from "./automation.server";
import { sanitizeAiSettings } from "./ai-agent-options";
import { buildAiVerb, contactBrief, summaryPrompt } from "./ai-agent.server";

export { handleAiDone } from "./ai-agent.server";

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
      "If you do not know something, say you will pass the question on rather than guessing.",
    cfg.transferNumber
      ? `For something urgent, tell the caller they can reach the team directly on ${cfg.transferNumber}.`
      : "",
    "Keep every reply short, friendly and natural. Once you have the caller's name, number and reason, " +
      "confirm them back, thank the caller, say goodbye and end the call.",
  ];
  return parts.filter(Boolean).join("\n\n");
}

/** The SWML document that hands the call to the AI agent. */
export async function receptionistResponse(
  cfg: Automations["aiReceptionist"],
  origin: string,
  callId: string,
  situation: NoAnswerReason | "incoming_open",
): Promise<Response> {
  await ensureSchema();
  // The settings in force are kept on the call, because the action webhooks read them back.
  const settings = sanitizeAiSettings({ ...cfg.agent, transferNumber: cfg.transferNumber });
  await sql`update calls set handled_by = 'ai', ai_settings = ${JSON.stringify(settings)}::jsonb where id = ${callId}`;

  const [call] = await sql`select tenant_id, contact_id from calls where id = ${callId} limit 1`;
  const brief = call ? await contactBrief(call["tenant_id"] as string, call["contact_id"] as string | null) : "";

  const ai = await buildAiVerb({
    kind: "receptionist",
    settings,
    role: buildPrompt(cfg, situation),
    brief,
    callId,
    origin,
    postPrompt: summaryPrompt("the business owner"),
  });

  const doc = { version: "1.0.0", sections: { main: [{ answer: {} }, { ai }, { hangup: {} }] } };
  return new Response(JSON.stringify(doc), { status: 200, headers: { "content-type": "application/json" } });
}
