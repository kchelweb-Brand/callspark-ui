// Settings for a voice-broadcast campaign: one recording that is played to everyone who answers.
//
// Plain data and pure functions only, so both the Worker and the browser can import it.

export interface RecordingFile {
  /** Storage key, under greetings/<tenant>/. Used to delete the file and to check it belongs to the workspace. */
  key: string;
  /** Site-relative address the carrier fetches, e.g. /media/greetings/<tenant>/<id>.mp3 */
  url: string;
  fileName: string;
  bytes: number;
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
}

export const MAX_CALLS_AT_ONCE = 5;

export const DEFAULT_RECORDING_SETTINGS: RecordingSettings = {
  file: null,
  voicemail: "leave",
  connectEnabled: false,
  transferNumber: "",
  optOutEnabled: false,
  callsAtOnce: 1,
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
  return {
    key,
    url,
    fileName: text(r["fileName"]).trim().slice(0, 200) || "recording",
    bytes: Number.isFinite(bytes) && bytes > 0 ? Math.round(bytes) : 0,
  };
}

function atOnce(value: unknown, fallback: number): number {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n)) return fallback;
  return Math.min(MAX_CALLS_AT_ONCE, Math.max(1, n));
}

/** Fills every field, so a half-saved or hand-edited value can never reach the dialer. */
export function sanitizeRecordingSettings(raw: unknown, fallback: RecordingSettings = DEFAULT_RECORDING_SETTINGS): RecordingSettings {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const voicemail = text(r["voicemail"]);
  return {
    file: "file" in r ? sanitizeFile(r["file"]) : fallback.file,
    voicemail: (RECORDING_VOICEMAIL.some((v) => v.id === voicemail) ? voicemail : fallback.voicemail) as RecordingVoicemail,
    connectEnabled: typeof r["connectEnabled"] === "boolean" ? r["connectEnabled"] : fallback.connectEnabled,
    transferNumber: text(r["transferNumber"] ?? fallback.transferNumber).trim().slice(0, 40),
    optOutEnabled: typeof r["optOutEnabled"] === "boolean" ? r["optOutEnabled"] : fallback.optOutEnabled,
    callsAtOnce: atOnce(r["callsAtOnce"], fallback.callsAtOnce),
  };
}

/**
 * The transfer number in dialable form (+countrycode digits), or null when it can't be made one.
 * A number written with a leading + is taken as it is. A bare 10-digit number (or 11 starting with 1)
 * is read as North American, the same rule the contact importer uses. Anything else needs its + and
 * country code, because a national format like 0803... cannot be turned into a real number here.
 */
export function transferTarget(s: RecordingSettings): string | null {
  const raw = s.transferNumber.trim();
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
  return null;
}
