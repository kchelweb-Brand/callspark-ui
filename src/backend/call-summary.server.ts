// Transcripts and written summaries of recorded calls.
//
// On demand rather than automatic: transcription costs compute, and most calls
// don't need it. The first request transcribes the recording with Cloudflare's
// speech model and summarises it; the result is stored on the call, so every
// later view is free and instant. AI-receptionist calls arrive already
// summarised (see ai-receptionist.server.ts).
//
// Server-only — imports the Workers AI binding, which must never reach the
// browser bundle.

import { sql } from "./db";
import { verifyToken } from "./tokens";
import { getWorkersAi, type WorkersAi } from "./cf-env";
import { ensureSchema } from "./schema.server";
import { requireFeature } from "./entitlements";
import { fetchCarrierFile } from "./signalwire-rest";

const MAX_AUDIO_BYTES = 12 * 1024 * 1024;
const MAX_RECORDING_SECONDS = 20 * 60;

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

async function transcribe(ai: WorkersAi, bytes: Uint8Array): Promise<string> {
  const result = (await ai.run("@cf/openai/whisper-large-v3-turbo", { audio: toBase64(bytes) })) as {
    text?: string;
  };
  return (result.text ?? "").trim();
}

function textOf(result: unknown): string {
  const r = result as { response?: unknown } | null;
  return typeof r?.response === "string" ? r.response.trim() : "";
}

async function summarise(ai: WorkersAi, transcript: string): Promise<string> {
  const messages = [
    {
      role: "system",
      content:
        "You write short, factual summaries of business phone calls for the business owner. " +
        "Use only what was said. Format: one or two sentences of summary, then a line 'Next steps:' " +
        "followed by bullet points, or 'Next steps: none' if there are none. Do not invent details.",
    },
    { role: "user", content: transcript.slice(0, 12000) },
  ];
  for (const model of ["@cf/meta/llama-3.1-8b-instruct", "@cf/meta/llama-3.2-3b-instruct"]) {
    try {
      const text = textOf(await ai.run(model, { messages, max_tokens: 400 }));
      if (text) return text;
    } catch (err) {
      console.warn(`[summary] ${model} failed`, err);
    }
  }
  throw new Error("The summary could not be written. Try again in a moment.");
}

export async function summarizeCall(data: { token: string; callId: string }) {
  const user = await verifyToken(data.token);
  if (!user || !user.tenantId) throw new Error("Not signed in.");
  await requireFeature(user.tenantId, "callSummaries");
  await ensureSchema();

  const rows = await sql`
    select id, recording_url, recording_seconds, transcript, summary
    from calls where id = ${data.callId} and tenant_id = ${user.tenantId} limit 1
  `;
  const call = rows[0] as
    | { id: string; recording_url: string | null; recording_seconds: number | null; transcript: string | null; summary: string | null }
    | undefined;
  if (!call) throw new Error("That call wasn't found.");
  if (call.summary) return { ok: true as const, summary: call.summary, transcript: call.transcript ?? "", cached: true };

  if (!call.recording_url) throw new Error("This call has no recording to summarise. Turn on call recording in Settings.");
  if ((call.recording_seconds ?? 0) > MAX_RECORDING_SECONDS) {
    throw new Error("Recordings longer than 20 minutes can't be summarised yet.");
  }

  const ai = await getWorkersAi();
  if (!ai) throw new Error("Summaries aren't available in local development. Deploy to try them.");

  // Without an extension the carrier serves uncompressed WAV, many times larger.
  const url = /\.(mp3|wav)(\?|$)/i.test(call.recording_url) ? call.recording_url : `${call.recording_url}.mp3`;
  const file = await fetchCarrierFile(url);
  if (!file.ok) throw new Error("The recording couldn't be downloaded from the carrier.");
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (bytes.byteLength === 0) throw new Error("The recording is empty.");
  if (bytes.byteLength > MAX_AUDIO_BYTES) throw new Error("That recording is too large to summarise.");

  const transcript = await transcribe(ai, bytes);
  if (!transcript) throw new Error("No speech was found in that recording.");
  const summary = await summarise(ai, transcript);

  await sql`
    update calls set transcript = ${transcript.slice(0, 20000)}, summary = ${summary.slice(0, 2000)}, summary_at = now()
    where id = ${call.id}
  `;
  return { ok: true as const, summary, transcript, cached: false };
}

/** Stored transcript and summary for one call, if there are any. */
export async function getCallSummary(data: { token: string; callId: string }) {
  const user = await verifyToken(data.token);
  if (!user || !user.tenantId) throw new Error("Not signed in.");
  await ensureSchema();
  const rows = await sql`
    select summary, transcript, handled_by, summary_at from calls
    where id = ${data.callId} and tenant_id = ${user.tenantId} limit 1
  `;
  const row = rows[0] as { summary: string | null; transcript: string | null; handled_by: string | null; summary_at: string | null } | undefined;
  if (!row) throw new Error("That call wasn't found.");
  return { ok: true as const, ...row };
}
