// Telnyx Call Control client + webhook authentication.
//
// This is the carrier side of inbound calling. Everything here is stateless
// HTTP and Web Crypto, so it runs unchanged in the Workers runtime.

import { env } from "./env";

const API_BASE = "https://api.telnyx.com/v2";

export interface TelnyxResult {
  ok: boolean;
  status: number;
  /** Carrier-supplied error text, already flattened for logging. */
  error?: string;
  body?: unknown;
}

/**
 * Issues a Call Control command against a live call leg.
 *
 * Commands are fire-and-forget from the caller's point of view: the result of
 * a command arrives later as another webhook, not in this response. We still
 * surface failures because a rejected command means the caller is sitting in
 * silence, and that needs to show up in the logs.
 */
export async function telnyxCommand(
  callControlId: string,
  action: string,
  body: Record<string, unknown> = {},
): Promise<TelnyxResult> {
  return telnyxFetch(
    `${API_BASE}/calls/${encodeURIComponent(callControlId)}/actions/${action}`,
    body,
  );
}

/** Creates a new outbound leg (used to ring agents and bridge them to the caller). */
export async function telnyxDial(body: Record<string, unknown>): Promise<TelnyxResult> {
  return telnyxFetch(`${API_BASE}/calls`, body);
}

async function telnyxFetch(url: string, body: Record<string, unknown>): Promise<TelnyxResult> {
  const apiKey = env.telnyxApiKey;
  if (!apiKey) {
    return { ok: false, status: 0, error: "TELNYX_API_KEY is not configured." };
  }

  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: {
        authorization: `Bearer ${apiKey}`,
        "content-type": "application/json",
        accept: "application/json",
      },
      body: JSON.stringify(body),
    });
  } catch (err) {
    return { ok: false, status: 0, error: err instanceof Error ? err.message : "Network error" };
  }

  const text = await response.text();
  let parsed: unknown;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    parsed = text;
  }

  if (!response.ok) {
    return { ok: false, status: response.status, error: flattenErrors(parsed) || text, body: parsed };
  }
  return { ok: true, status: response.status, body: parsed };
}

/** Telnyx returns `{ errors: [{ detail, title }] }` — collapse it to one line. */
function flattenErrors(payload: unknown): string {
  const errors = (payload as { errors?: { detail?: string; title?: string }[] } | null)?.errors;
  if (!Array.isArray(errors)) return "";
  return errors.map((e) => e.detail || e.title || "").filter(Boolean).join("; ");
}

// ---------------------------------------------------------------------------
// Client state
// ---------------------------------------------------------------------------

/**
 * Where a call is in the IVR flow.
 *
 * Telnyx echoes `client_state` back on every webhook that results from a
 * command, so the whole flow position travels with the call. That means no
 * session table and no cleanup job — a call that dies mid-flow takes its
 * state with it. Keys are short because this rides on every command.
 */
export interface CallState {
  /** tenant id */
  t: string;
  /** our calls.id row */
  c: string;
  /** the caller's (A) leg, so a B leg can still command the caller */
  a: string;
  /** which leg this webhook belongs to */
  leg: "a" | "b";
  /** what we're waiting for */
  step: "menu" | "ring" | "voicemail";
  /** current IVR menu id, when step === "menu" */
  menu?: string;
  /** how many times the current menu has replayed after no/invalid input */
  tries?: number;
  /** remaining ring targets, tried in order */
  targets?: string[];
  /** true once a B leg answered, so an unbridge isn't treated as no-answer */
  bridged?: boolean;
}

export function encodeClientState(state: CallState): string {
  return btoa(JSON.stringify(state));
}

export function decodeClientState(raw: string | null | undefined): CallState | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(atob(raw)) as CallState;
    // A state we can't route on is worse than none — it would send the call
    // down a branch keyed on undefined.
    if (!parsed || typeof parsed.t !== "string" || typeof parsed.c !== "string") return null;
    return parsed;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Webhook authentication
// ---------------------------------------------------------------------------

let publicKeyPromise: Promise<CryptoKey | null> | undefined;

async function importPublicKey(): Promise<CryptoKey | null> {
  const encoded = env.telnyxPublicKey;
  if (!encoded) return null;

  let raw: Uint8Array;
  try {
    raw = Uint8Array.from(atob(encoded.trim()), (c) => c.charCodeAt(0));
  } catch {
    return null;
  }

  // workerd exposes Ed25519 under the standard name; older runtimes only
  // accept the legacy "NODE-ED25519" algorithm. Try both before giving up.
  for (const algorithm of [{ name: "Ed25519" }, { name: "NODE-ED25519", namedCurve: "NODE-ED25519" }]) {
    try {
      return await crypto.subtle.importKey("raw", raw as BufferSource, algorithm, false, ["verify"]);
    } catch {
      // Try the next algorithm name.
    }
  }
  return null;
}

/** Tolerance for clock drift between Telnyx and the edge. */
const MAX_TIMESTAMP_AGE_SECONDS = 5 * 60;

export type SignatureVerdict = "valid" | "invalid" | "unconfigured";

/**
 * Verifies a Telnyx webhook signature.
 *
 * The signed message is `${timestamp}|${rawBody}`, so the body must be the
 * exact bytes received — re-serializing parsed JSON changes key order and
 * whitespace and would fail every time.
 *
 * Returns "unconfigured" rather than throwing when no public key is set, so
 * the caller can decide whether to run in a permissive mode. That distinction
 * matters: a missing key is a setup problem, a bad signature is an attack.
 */
export async function verifyTelnyxSignature(
  rawBody: string,
  signature: string | null,
  timestamp: string | null,
): Promise<SignatureVerdict> {
  if (!publicKeyPromise) publicKeyPromise = importPublicKey();
  const key = await publicKeyPromise;
  if (!key) return "unconfigured";

  if (!signature || !timestamp) return "invalid";

  // Without this check a captured webhook could be replayed forever.
  const age = Math.abs(Date.now() / 1000 - Number(timestamp));
  if (!Number.isFinite(age) || age > MAX_TIMESTAMP_AGE_SECONDS) return "invalid";

  let signatureBytes: Uint8Array;
  try {
    signatureBytes = Uint8Array.from(atob(signature), (c) => c.charCodeAt(0));
  } catch {
    return "invalid";
  }

  const message = new TextEncoder().encode(`${timestamp}|${rawBody}`);
  try {
    const valid = await crypto.subtle.verify(
      key.algorithm.name,
      key,
      signatureBytes as BufferSource,
      message as BufferSource,
    );
    return valid ? "valid" : "invalid";
  } catch {
    return "invalid";
  }
}
