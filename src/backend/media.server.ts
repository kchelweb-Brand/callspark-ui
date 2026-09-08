import { createServerFn } from "@tanstack/react-start";

import { requireMediaBucket, getMediaBucket } from "./cf-env";
import { verifyToken } from "./tokens";

async function requireTenant(token: string): Promise<string> {
  const payload = await verifyToken(token);
  if (!payload || !payload.tenantId) throw new Error("Not signed in.");
  return payload.tenantId;
}

/** Carriers fetch greeting audio over plain HTTP, so keep files modest. */
const MAX_BYTES = 5 * 1024 * 1024;

const ALLOWED_TYPES = new Set([
  "audio/mpeg",
  "audio/mp3",
  "audio/wav",
  "audio/wave",
  "audio/x-wav",
  "audio/ogg",
  "audio/webm",
]);

function extensionFor(contentType: string): string {
  if (contentType.includes("wav")) return "wav";
  if (contentType.includes("ogg")) return "ogg";
  if (contentType.includes("webm")) return "webm";
  return "mp3";
}

function decodeBase64(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/**
 * Stores a greeting audio file and returns the URL a carrier can fetch.
 *
 * The key embeds a random segment so the URL is unguessable — the carrier
 * fetches it unauthenticated, so obscurity is what keeps one tenant's
 * greetings from being enumerable by another.
 */
export const uploadGreetingFn = createServerFn({ method: "POST" })
  .validator(
    (data: { token: string; fileName: string; contentType: string; base64: string }) => data,
  )
  .handler(async ({ data }) => {
    const tenantId = await requireTenant(data.token);
    const bucket = await requireMediaBucket();

    if (!ALLOWED_TYPES.has(data.contentType)) {
      throw new Error("Unsupported audio format. Use MP3, WAV, OGG or WebM.");
    }

    const bytes = decodeBase64(data.base64);
    if (bytes.byteLength === 0) throw new Error("That file appears to be empty.");
    if (bytes.byteLength > MAX_BYTES) {
      throw new Error(`That file is too large. Maximum is ${MAX_BYTES / 1024 / 1024}MB.`);
    }

    const id = crypto.randomUUID();
    const key = `greetings/${tenantId}/${id}.${extensionFor(data.contentType)}`;

    await bucket.put(key, bytes.buffer as ArrayBuffer, {
      httpMetadata: { contentType: data.contentType },
    });

    return {
      ok: true as const,
      key,
      url: `/media/${key}`,
      fileName: data.fileName,
      bytes: bytes.byteLength,
    };
  });

export const deleteGreetingFn = createServerFn({ method: "POST" })
  .validator((data: { token: string; key: string }) => data)
  .handler(async ({ data }) => {
    const tenantId = await requireTenant(data.token);

    // Scope the delete to the caller's own prefix so a forged key can't reach
    // another tenant's files.
    if (!data.key.startsWith(`greetings/${tenantId}/`)) {
      throw new Error("Not allowed.");
    }

    const bucket = await getMediaBucket();
    if (bucket) await bucket.delete(data.key);
    return { ok: true as const };
  });
