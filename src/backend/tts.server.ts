// A voice that does not depend on the phone carrier.
//
// A script campaign can have the carrier read the text aloud, but that only works if the carrier's
// speech voices work for your account. This makes the audio here instead, with Cloudflare's own
// speech model, keeps each piece as a file in the media bucket, and the call just plays the files.
// Pieces are kept by what they say, so a sentence used on many calls is made once.
// Server-only: it uses the AI and storage bindings.

import { getMediaBucket, getWorkersAi } from "./cf-env";

const MODEL = "@cf/myshell-ai/melotts";
/** A piece this long or shorter is spoken in one go. */
const MAX_PIECE = 260;
/** The most pieces one message may need. */
const MAX_PIECES = 10;
const PREFIX = "greetings/tts/";

/** Cuts text into pieces at sentence ends, so each is short enough to be made quickly. */
export function splitForSpeech(text: string): string[] {
  const clean = text.replace(/\s+/g, " ").trim();
  if (!clean) return [];
  const sentences = clean.match(/[^.!?]+[.!?]+["')\]]*\s*|[^.!?]+$/g) ?? [clean];
  const pieces: string[] = [];
  let current = "";
  const push = () => {
    if (current.trim()) pieces.push(current.trim());
    current = "";
  };
  for (const sentence of sentences) {
    let s = sentence;
    // One very long sentence is cut at a space.
    while (s.length > MAX_PIECE) {
      let cut = s.lastIndexOf(" ", MAX_PIECE);
      if (cut < 40) cut = MAX_PIECE;
      if ((current + s.slice(0, cut)).length > MAX_PIECE) push();
      current += s.slice(0, cut) + " ";
      push();
      s = s.slice(cut).trimStart();
    }
    if ((current + s).length > MAX_PIECE) push();
    current += s;
  }
  push();
  return pieces;
}

async function digest(text: string): Promise<string> {
  const bytes = new TextEncoder().encode(`${MODEL}|${text}`);
  const hash = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
  return [...hash.slice(0, 20)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function fromBase64(b64: string): Uint8Array {
  const bin = atob(b64.replace(/\s+/g, ""));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** The model has answered in more than one shape over time: base64 text, an object holding it, or the audio itself. */
async function audioBytes(result: unknown): Promise<Uint8Array> {
  if (typeof result === "string") return fromBase64(result);
  if (result && typeof result === "object") {
    const r = result as { audio?: unknown };
    if (typeof r.audio === "string") return fromBase64(r.audio);
    if (r.audio instanceof ArrayBuffer) return new Uint8Array(r.audio);
    if (ArrayBuffer.isView(r.audio)) return new Uint8Array(r.audio.buffer, r.audio.byteOffset, r.audio.byteLength);
    if (result instanceof ArrayBuffer) return new Uint8Array(result);
    if (ArrayBuffer.isView(result)) return new Uint8Array(result.buffer, result.byteOffset, result.byteLength);
    if (typeof (result as ReadableStream).getReader === "function") {
      return new Uint8Array(await new Response(result as ReadableStream).arrayBuffer());
    }
  }
  throw new Error("The speech model returned something that is not audio.");
}

/**
 * The addresses of audio files that say `text`, in order, making any that do not exist yet.
 * Returns null when this cannot be done (no speech model or storage here, or it failed), so the
 * caller can fall back to the carrier's voice.
 */
export async function speechUrls(text: string, origin: string): Promise<string[] | null> {
  try {
    const pieces = splitForSpeech(text).slice(0, MAX_PIECES);
    if (pieces.length === 0) return null;
    const bucket = await getMediaBucket();
    const ai = await getWorkersAi();
    if (!bucket || !ai) return null;

    return await Promise.all(
      pieces.map(async (piece) => {
        const key = `${PREFIX}${await digest(piece)}.mp3`;
        if (!(await bucket.get(key))) {
          const bytes = await audioBytes(await ai.run(MODEL, { prompt: piece, lang: "en" }));
          if (bytes.length < 400) throw new Error("The speech model returned an empty clip.");
          await bucket.put(key, bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer, { httpMetadata: { contentType: "audio/mpeg" } });
        }
        return `${origin}/media/${key}`;
      }),
    );
  } catch (err) {
    console.error("[tts] could not make the audio", err);
    return null;
  }
}
