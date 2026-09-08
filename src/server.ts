import "./lib/error-capture";

import { consumeLastCapturedError } from "./lib/error-capture";
import { renderErrorPage } from "./lib/error-page";
import { getMediaBucket, setCloudflareEnv } from "./backend/cf-env";
import { handleTelnyxVoiceWebhook } from "./backend/inbound";
import { handleSignalWireVoiceWebhook } from "./backend/inbound-signalwire";

/**
 * Serves greeting audio straight from R2.
 *
 * Deliberately unauthenticated: the carrier's media server fetches this URL
 * when playing a greeting and has no session. Keys embed a random UUID, so
 * URLs are unguessable, and nothing sensitive is ever stored here.
 */
async function serveMedia(pathname: string): Promise<Response> {
  const key = decodeURIComponent(pathname.slice("/media/".length));

  // Defence in depth: only the greetings prefix is publicly readable, and no
  // traversal outside it.
  if (!key.startsWith("greetings/") || key.includes("..")) {
    return new Response("Not found", { status: 404 });
  }

  const bucket = await getMediaBucket();
  if (!bucket) return new Response("Storage unavailable", { status: 503 });

  const object = await bucket.get(key);
  if (!object) return new Response("Not found", { status: 404 });

  return new Response(object.body, {
    headers: {
      "content-type": object.httpMetadata?.contentType ?? "application/octet-stream",
      // Greeting files are immutable — a new upload gets a new key.
      "cache-control": "public, max-age=31536000, immutable",
    },
  });
}

/** Paste this path (on your own origin) into the Telnyx Call Control app. */
export const VOICE_WEBHOOK_PATH = "/api/voice/telnyx";
/** Paste this one into a SignalWire phone number's "when a call comes in". */
export const SIGNALWIRE_VOICE_WEBHOOK_PATH = "/api/voice/signalwire";

type ServerEntry = {
  fetch: (request: Request, env: unknown, ctx: unknown) => Promise<Response> | Response;
};

let serverEntryPromise: Promise<ServerEntry> | undefined;

async function getServerEntry(): Promise<ServerEntry> {
  if (!serverEntryPromise) {
    serverEntryPromise = import("@tanstack/react-start/server-entry").then(
      (m) => (m.default ?? m) as ServerEntry,
    );
  }
  return serverEntryPromise;
}

// h3 swallows in-handler throws into a normal 500 Response with body
// {"unhandled":true,"message":"HTTPError"} — try/catch alone never fires for those.
async function normalizeCatastrophicSsrResponse(response: Response): Promise<Response> {
  if (response.status < 500) return response;
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) return response;

  const body = await response.clone().text();
  if (!isH3SwallowedErrorBody(body)) return response;

  console.error(consumeLastCapturedError() ?? new Error(`h3 swallowed SSR error: ${body}`));
  return new Response(renderErrorPage(), {
    status: 500,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

function isH3SwallowedErrorBody(body: string): boolean {
  try {
    const payload = JSON.parse(body) as { unhandled?: unknown; message?: unknown };
    return payload.unhandled === true && payload.message === "HTTPError";
  } catch {
    return false;
  }
}

export default {
  async fetch(request: Request, env: unknown, ctx: unknown) {
    // Bindings (R2 etc.) arrive here and nowhere else — stash them before
    // anything downstream might need them.
    setCloudflareEnv(env);

    try {
      const url = new URL(request.url);
      if (url.pathname.startsWith("/media/")) {
        return await serveMedia(url.pathname);
      }

      // Inbound calls. This has to be a plain route rather than a server
      // function: the carrier posts its own JSON envelope with no session,
      // and the Ed25519 signature is computed over the raw bytes.
      if (url.pathname === VOICE_WEBHOOK_PATH) {
        if (request.method !== "POST") {
          return new Response("Method not allowed", { status: 405 });
        }
        return await handleTelnyxVoiceWebhook(request);
      }

      // Same phone system, second carrier. Each provider posts to its own
      // path, so the adapter is chosen by the URL rather than by sniffing the
      // request shape.
      if (url.pathname === SIGNALWIRE_VOICE_WEBHOOK_PATH) {
        if (request.method !== "POST") {
          return new Response("Method not allowed", { status: 405 });
        }
        return await handleSignalWireVoiceWebhook(request);
      }

      const handler = await getServerEntry();
      const response = await handler.fetch(request, env, ctx);
      return await normalizeCatastrophicSsrResponse(response);
    } catch (error) {
      console.error(error);
      return new Response(renderErrorPage(), {
        status: 500,
        headers: { "content-type": "text/html; charset=utf-8" },
      });
    }
  },
};
