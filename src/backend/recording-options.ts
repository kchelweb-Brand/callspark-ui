// Settings for a voice-broadcast campaign: one recording that is played to everyone who answers,
// and the rules around it (when to call, retries, caller ID, a follow-up text).
//
// Plain data and pure functions only, so both the Worker and the browser can import it.

import {
  DEFAULT_CALLING_WINDOW,
  OFF_CALLING_WINDOW,
  callingWindowProblem,
  sanitizeCallingWindow,
  type CallingWindow,
} from "./calling-window";

export type { CallingWindow };

export interface RecordingFile {
  /** Storage key, under greetings/<tenant>/. Used to delete the file and to check it belongs to the workspace. */
  key: string;
  /** Site-relative address the carrier fetches, e.g. /media/greetings/<tenant>/<id>.mp3 */
  url: string;
  fileName: string;
  bytes: number;
  /** How long the recording plays, when known. Only used to estimate how many minutes a run will use. */
  seconds?: number;
}

/**
 * What happens when an answering machine picks up.
 * - hangup: end the call without leaving anything
 * - leave:  wait for the beep, then play the recording
 * - play:   don't check at all; play to whoever answers (fastest to start, may play over a greeting)
 */
export const RECORDING_VOICEMAIL = [
  { id: "leave", label: "Leave the recording after the beep" },
  { id: "hangup", label: "Hang up without leaving a message" },
  { id: "play", label: "Don't check; play it to whoever answers" },
] as const;

export type RecordingVoicemail = (typeof RECORDING_VOICEMAIL)[number]["id"];

/** Try the people who didn't pick up again, automatically. */
export interface RetryRule {
  /** Extra tries after the first call, 0 to 3. Zero means one call per person. */
  max: number;
  delayMinutes: number;
  /** Also try again when voicemail picked up. Off by default: leaving a message once is usually enough. */
  includeVoicemail: boolean;
}

export const RETRY_DELAYS = [
  { minutes: 30, label: "30 minutes" },
  { minutes: 60, label: "1 hour" },
  { minutes: 120, label: "2 hours" },
  { minutes: 240, label: "4 hours" },
  { minutes: 480, label: "8 hours" },
  { minutes: 1440, label: "The next day" },
] as const;

export const MAX_RETRIES = 3;

/** A text message sent after the call, to the people who responded. */
export interface FollowUp {
  enabled: boolean;
  /** "pressed_1": only people who pressed 1. "heard": everyone who listened to the recording. */
  when: "pressed_1" | "heard";
  /** Supports {first_name} and {company}. */
  message: string;
}

export const MAX_FOLLOW_UP_CHARS = 320;

export interface RecordingSettings {
  file: RecordingFile | null;
  voicemail: RecordingVoicemail;
  /** "Press 1" connects the person to transferNumber. The recording itself has to say so. */
  connectEnabled: boolean;
  transferNumber: string;
  /** "Press 2" adds the person to the do-not-call list. The recording itself has to say so. */
  optOutEnabled: boolean;
  /** How many people are rung at the same time. One keeps it calm; more finishes a list sooner. */
  callsAtOnce: number;
  /** When calls may be placed. */
  window: CallingWindow;
  retry: RetryRule;
  /** The number to call from, one of the workspace's own. Empty means pick automatically. */
  callerId: string;
  followUp: FollowUp;
}

export const MAX_CALLS_AT_ONCE = 5;

/** Campaigns saved before the newer options existed: no calling window, no retries, no text, nothing new. */
export const LEGACY_RECORDING_SETTINGS: RecordingSettings = {
  file: null,
  voicemail: "leave",
  connectEnabled: false,
  transferNumber: "",
  optOutEnabled: false,
  callsAtOnce: 1,
  window: OFF_CALLING_WINDOW,
  retry: { max: 0, delayMinutes: 120, includeVoicemail: false },
  callerId: "",
  followUp: { enabled: false, when: "pressed_1", message: "" },
};

/** A brand-new campaign: the safe choices are already on (opt-out key, a 9am to 8pm calling window). */
export const DEFAULT_RECORDING_SETTINGS: RecordingSettings = {
  ...LEGACY_RECORDING_SETTINGS,
  optOutEnabled: true,
  window: DEFAULT_CALLING_WINDOW,
};

/** Carriers fetch these over plain HTTP; MP3 and WAV are the formats they all play. */
export const RECORDING_EXTENSIONS = ["mp3", "wav"] as const;

export function recordingExtension(key: string): string {
  return (key.split(".").pop() ?? "").toLowerCase();
}

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function sanitizeFile(raw: unknown): RecordingFile | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const key = text(r["key"]).trim();
  const url = text(r["url"]).trim();
  if (!key || !url) return null;
  const bytes = Number(r["bytes"]);
  const seconds = Number(r["seconds"]);
  return {
    key,
    url,
    fileName: text(r["fileName"]).trim().slice(0, 200) || "recording",
    bytes: Number.isFinite(bytes) && bytes > 0 ? Math.round(bytes) : 0,
    ...(Number.isFinite(seconds) && seconds > 0 && seconds < 3600 ? { seconds: Math.round(seconds) } : {}),
  };
}

function atOnce(value: unknown, fallback: number): number {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n)) return fallback;
  return Math.min(MAX_CALLS_AT_ONCE, Math.max(1, n));
}

function sanitizeRetry(raw: unknown, fallback: RetryRule): RetryRule {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const max = Math.round(Number(r["max"]));
  const delay = Math.round(Number(r["delayMinutes"]));
  return {
    max: Number.isFinite(max) ? Math.min(MAX_RETRIES, Math.max(0, max)) : fallback.max,
    delayMinutes: RETRY_DELAYS.some((d) => d.minutes === delay) ? delay : fallback.delayMinutes,
    includeVoicemail: typeof r["includeVoicemail"] === "boolean" ? r["includeVoicemail"] : fallback.includeVoicemail,
  };
}

function sanitizeFollowUp(raw: unknown, fallback: FollowUp): FollowUp {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  return {
    enabled: typeof r["enabled"] === "boolean" ? r["enabled"] : fallback.enabled,
    when: r["when"] === "heard" || r["when"] === "pressed_1" ? r["when"] : fallback.when,
    message: "message" in r ? text(r["message"]).slice(0, MAX_FOLLOW_UP_CHARS) : fallback.message,
  };
}

/**
 * Fills every field, so a half-saved or hand-edited value can never reach the dialer.
 *
 * `fallback` is what a missing field becomes. Reading a stored campaign uses the default (legacy:
 * newer options off). Creating one passes DEFAULT_RECORDING_SETTINGS. Saving over an existing one
 * passes the settings already stored, so a screen that doesn't know about a newer option (the
 * Windows Dialer) can save without ever wiping it.
 */
export function sanitizeRecordingSettings(raw: unknown, fallback: RecordingSettings = LEGACY_RECORDING_SETTINGS): RecordingSettings {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const voicemail = text(r["voicemail"]);
  return {
    file: "file" in r ? sanitizeFile(r["file"]) : fallback.file,
    voicemail: (RECORDING_VOICEMAIL.some((v) => v.id === voicemail) ? voicemail : fallback.voicemail) as RecordingVoicemail,
    connectEnabled: typeof r["connectEnabled"] === "boolean" ? r["connectEnabled"] : fallback.connectEnabled,
    transferNumber: text(r["transferNumber"] ?? fallback.transferNumber).trim().slice(0, 40),
    optOutEnabled: typeof r["optOutEnabled"] === "boolean" ? r["optOutEnabled"] : fallback.optOutEnabled,
    callsAtOnce: atOnce(r["callsAtOnce"], fallback.callsAtOnce),
    window: "window" in r ? sanitizeCallingWindow(r["window"], fallback.window) : fallback.window,
    retry: "retry" in r ? sanitizeRetry(r["retry"], fallback.retry) : fallback.retry,
    callerId: "callerId" in r ? text(r["callerId"]).trim().slice(0, 20) : fallback.callerId,
    followUp: "followUp" in r ? sanitizeFollowUp(r["followUp"], fallback.followUp) : fallback.followUp,
  };
}

/**
 * The transfer number in dialable form (+countrycode digits), or null when it can't be made one.
 * A number written with a leading + is taken as it is. A bare 10-digit number (or 11 starting with 1)
 * is read as North American, the same rule the contact importer uses. Anything else needs its + and
 * country code, because a national format like 0803... cannot be turned into a real number here.
 */
export function transferTarget(s: RecordingSettings): string | null {
  return toE164(s.transferNumber);
}

export function toE164(input: string): string | null {
  const raw = input.trim();
  const digits = raw.replace(/[^\d]/g, "");
  if (digits.length < 7 || digits.length > 15) return null;
  if (raw.startsWith("+")) return `+${digits}`;
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  return null;
}

/** What is wrong with the settings, in words the owner can act on, or null when they are fine. Does not require a file. */
export function recordingSettingsProblem(s: RecordingSettings): string | null {
  if (s.file && !RECORDING_EXTENSIONS.includes(recordingExtension(s.file.key) as (typeof RECORDING_EXTENSIONS)[number])) {
    return "Use an MP3 or WAV recording. Other formats don't play reliably on phone calls.";
  }
  if (s.connectEnabled && !transferTarget(s)) {
    return "Enter the number to connect people to when they press 1, with its country code, for example +14155550134.";
  }
  const windowProblem = callingWindowProblem(s.window);
  if (windowProblem) return windowProblem;
  if (s.callerId && !toE164(s.callerId)) return "Choose the number to call from, or leave it on automatic.";
  if (s.followUp.enabled && s.followUp.message.trim().length === 0) return "Write the text to send, or turn the follow-up text off.";
  return null;
}
