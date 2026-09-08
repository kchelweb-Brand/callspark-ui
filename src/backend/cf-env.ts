// Access to Cloudflare bindings (R2, KV, …) from anywhere in the server code.
//
// Bindings are live objects, not strings, so unlike secrets they never appear
// on `process.env`.
//
// The obvious approach — capture the `env` argument in the Worker's fetch
// handler — does NOT work here: Nitro wraps our entry and invokes it without
// that argument (verified in production: the captured env was empty). So we
// read bindings from `cloudflare:workers`, the runtime-provided module that
// exposes `env` to any module in the isolate.
//
// That module only exists inside the Workers runtime. Under local `vite dev`
// (plain Node) the import fails, callers get null, and uploads degrade with a
// clear message instead of crashing.

/** Minimal structural types — avoids pulling in @cloudflare/workers-types. */
export interface R2ObjectBody {
  body: ReadableStream;
  httpMetadata?: { contentType?: string } | undefined;
  size?: number;
}

export interface R2Bucket {
  put(
    key: string,
    value: ArrayBuffer | ReadableStream | string,
    options?: { httpMetadata?: { contentType?: string } },
  ): Promise<unknown>;
  get(key: string): Promise<R2ObjectBody | null>;
  delete(key: string): Promise<void>;
}

let cloudflareEnv: Record<string, unknown> | undefined;
/** undefined = not looked up yet; null = looked up and unavailable. */
let lookupFailed = false;

/** Kept for the Worker entry to call — harmless if Nitro passes nothing. */
export function setCloudflareEnv(env: unknown): void {
  if (env && typeof env === "object" && Object.keys(env).length > 0) {
    cloudflareEnv = env as Record<string, unknown>;
  }
}

async function resolveEnv(): Promise<Record<string, unknown> | null> {
  if (cloudflareEnv) return cloudflareEnv;
  if (lookupFailed) return null;

  try {
    const mod = (await import("cloudflare:workers")) as { env?: Record<string, unknown> };
    if (mod.env && typeof mod.env === "object") {
      cloudflareEnv = mod.env;
      return cloudflareEnv;
    }
  } catch {
    // Not running inside the Workers runtime (local dev).
  }
  lookupFailed = true;
  return null;
}

function isBucket(value: unknown): value is R2Bucket {
  // Duck-type — the R2Bucket class isn't importable for an instanceof check.
  return Boolean(value) && typeof (value as R2Bucket).put === "function";
}

/** The media bucket, or null when running outside the Workers runtime. */
export async function getMediaBucket(): Promise<R2Bucket | null> {
  const env = await resolveEnv();
  const binding = env?.["MEDIA_BUCKET"];
  return isBucket(binding) ? binding : null;
}

export async function requireMediaBucket(): Promise<R2Bucket> {
  const bucket = await getMediaBucket();
  if (!bucket) {
    throw new Error(
      "File storage isn't available in local development. Deploy to test uploads, or use text-to-speech instead.",
    );
  }
  return bucket;
}
