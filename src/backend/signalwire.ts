// SignalWire's Compatibility API: webhook authentication and cXML rendering.
//
// cXML is a drop-in for Twilio's TwiML, so everything here works unchanged
// against Twilio too — which is the point. The dialer isn't tied to one
// carrier's proprietary call-control API.
//
// The model is the opposite of Telnyx's: the carrier POSTs an event and the
// *response body* is the instruction. No API key, no commands, no call state
// to carry — what happens next is whatever XML we return.

import { env } from "./env";

// ---------------------------------------------------------------------------
// Webhook authentication
// ---------------------------------------------------------------------------

/**
 * Verifies the `x-signalwire-signature` header.
 *
 * The algorithm isn't published in the docs — it lives inside their SDK — so
 * this was taken from the source of @signalwire/compatibility-api rather than
 * guessed at: HMAC-SHA1 over the full request URL followed by every POST
 * parameter as `key + value`, sorted by key, then base64.
 *
 * The signing key is the one on the API Credentials page, not the API token.
 */
export type SignatureVerdict = "valid" | "invalid" | "unconfigured";

export async function verifySignalWireSignature(
  url: string,
  params: Record<string, string>,
  signature: string | null,
): Promise<SignatureVerdict> {
  const key = env.signalwireSigningKey;
  if (!key) return "unconfigured";
  if (!signature) return "invalid";

  const data =
    url +
    Object.keys(params)
      .sort()
      .reduce((acc, k) => acc + k + params[k], "");

  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(key),
    { name: "HMAC", hash: "SHA-1" },
    false,
    ["sign"],
  );
  const mac = await crypto.subtle.sign("HMAC", cryptoKey, new TextEncoder().encode(data));
  const expected = btoa(String.fromCharCode(...new Uint8Array(mac)));

  return timingSafeEqual(expected, signature) ? "valid" : "invalid";
}

/** Comparison that doesn't leak how much of the signature matched. */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// ---------------------------------------------------------------------------
// cXML
// ---------------------------------------------------------------------------

/** XML text escaping. A greeting is tenant-authored and can contain anything. */
export function xmlEscape(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export function cxml(body: string): Response {
  return new Response(`<?xml version="1.0" encoding="UTF-8"?>\n<Response>${body}</Response>`, {
    status: 200,
    headers: { "content-type": "text/xml; charset=utf-8" },
  });
}

export interface SayOptions {
  voice?: string;
  language?: string;
}

const DEFAULT_VOICE = "woman";
const DEFAULT_LANGUAGE = "en-US";

export function say(text: string, options: SayOptions = {}): string {
  const voice = options.voice ?? DEFAULT_VOICE;
  const language = options.language ?? DEFAULT_LANGUAGE;
  return `<Say voice="${xmlEscape(voice)}" language="${xmlEscape(language)}">${xmlEscape(text)}</Say>`;
}

export function play(audioUrl: string): string {
  return `<Play>${xmlEscape(audioUrl)}</Play>`;
}

export interface GatherOptions {
  action: string;
  /** Digits the menu accepts; used to size the gather, not to filter. */
  numDigits?: number;
  timeoutSeconds?: number;
  /** Played while waiting — a greeting nested inside the gather. */
  nested: string;
}

/**
 * `actionOnEmptyResult` matters: without it a caller who presses nothing gets
 * silence and the call falls off the end of the document. With it we get a
 * webhook with no digits and can replay the menu or take a message.
 */
export function gather({ action, numDigits = 1, timeoutSeconds = 7, nested }: GatherOptions): string {
  return (
    `<Gather action="${xmlEscape(action)}" method="POST" input="dtmf" ` +
    `numDigits="${numDigits}" timeout="${timeoutSeconds}" actionOnEmptyResult="true">` +
    nested +
    `</Gather>`
  );
}

export interface DialOptions {
  /** Caller ID shown to the person being rung. */
  callerId?: string;
  timeoutSeconds?: number;
  /** Where the carrier reports how the dial went. */
  action?: string;
  record?: boolean;
  recordingStatusCallback?: string;
}

/**
 * Rings a destination and bridges the caller to it.
 *
 * `action` is what makes fall-through possible: when the dial ends without a
 * conversation, the carrier requests it and we decide what happens next —
 * the next agent, or voicemail. Without it the call simply ends.
 */
export function dial(targets: string[], options: DialOptions = {}): string {
  const attrs = [
    `timeout="${options.timeoutSeconds ?? 25}"`,
    options.callerId ? `callerId="${xmlEscape(options.callerId)}"` : "",
    options.action ? `action="${xmlEscape(options.action)}" method="POST"` : "",
    options.record ? `record="record-from-answer-dual"` : "",
    options.recordingStatusCallback
      ? `recordingStatusCallback="${xmlEscape(options.recordingStatusCallback)}" recordingStatusCallbackMethod="POST"`
      : "",
  ]
    .filter(Boolean)
    .join(" ");

  const inner = targets
    .map((t) =>
      t.toLowerCase().startsWith("sip:")
        ? `<Sip>${xmlEscape(t)}</Sip>`
        : `<Number>${xmlEscape(t)}</Number>`,
    )
    .join("");

  return `<Dial ${attrs}>${inner}</Dial>`;
}

export interface RecordOptions {
  action?: string;
  maxLengthSeconds?: number;
  playBeep?: boolean;
  recordingStatusCallback?: string;
}

export function record({
  action,
  maxLengthSeconds = 300,
  playBeep = true,
  recordingStatusCallback,
}: RecordOptions = {}): string {
  const attrs = [
    `maxLength="${maxLengthSeconds}"`,
    `playBeep="${playBeep}"`,
    `finishOnKey="#"`,
    action ? `action="${xmlEscape(action)}" method="POST"` : "",
    recordingStatusCallback
      ? `recordingStatusCallback="${xmlEscape(recordingStatusCallback)}" recordingStatusCallbackMethod="POST"`
      : "",
  ]
    .filter(Boolean)
    .join(" ");
  return `<Record ${attrs} />`;
}

export function hangup(): string {
  return "<Hangup />";
}

export function reject(reason: "rejected" | "busy" = "rejected"): string {
  return `<Reject reason="${reason}" />`;
}
