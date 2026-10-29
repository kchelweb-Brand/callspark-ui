// What an AI voice agent can be set up to sound and do. Shared by the AI
// receptionist and AI campaigns, and safe to import from browser code: it holds
// the catalogue and the cleaning rules, nothing that reaches the carrier.

export type AiVoiceTier = "standard" | "natural" | "premium";

export interface AiVoice {
  id: string;
  label: string;
  tier: AiVoiceTier;
  /** SignalWire's `<engine>.<voice>` string. */
  voice: string;
  /** Speech-recognition language that matches the accent. */
  lang: string;
}

export const AI_VOICES: AiVoice[] = [
  { id: "ella", label: "Ella · US English, female", tier: "standard", voice: "gcloud.en-US-Neural2-F", lang: "en-US" },
  { id: "daniel", label: "Daniel · US English, male", tier: "standard", voice: "gcloud.en-US-Neural2-D", lang: "en-US" },
  { id: "amelia", label: "Amelia · British, female", tier: "standard", voice: "gcloud.en-GB-Neural2-A", lang: "en-GB" },
  { id: "oliver", label: "Oliver · British, male", tier: "standard", voice: "gcloud.en-GB-Neural2-B", lang: "en-GB" },
  { id: "matilda", label: "Matilda · Australian, female", tier: "standard", voice: "gcloud.en-AU-Neural2-A", lang: "en-AU" },
  { id: "jack", label: "Jack · Australian, male", tier: "standard", voice: "gcloud.en-AU-Neural2-B", lang: "en-AU" },
  { id: "nova", label: "Nova · warm, female", tier: "natural", voice: "openai.nova", lang: "en-US" },
  { id: "onyx", label: "Onyx · deep, male", tier: "natural", voice: "openai.onyx", lang: "en-US" },
  { id: "alloy", label: "Alloy · neutral", tier: "natural", voice: "openai.alloy", lang: "en-US" },
  { id: "rachel", label: "Rachel · very natural, female", tier: "premium", voice: "elevenlabs.rachel:eleven_flash_v2_5", lang: "en-US" },
  { id: "josh", label: "Josh · very natural, male", tier: "premium", voice: "elevenlabs.josh:eleven_flash_v2_5", lang: "en-US" },
  { id: "bella", label: "Bella · soft, female", tier: "premium", voice: "elevenlabs.bella:eleven_flash_v2_5", lang: "en-US" },
];

export const AI_TIER_NOTE: Record<AiVoiceTier, string> = {
  standard: "Clear and the cheapest to run.",
  natural: "More natural rhythm. Costs a little more per minute.",
  premium: "The most human sounding. Costs the most per minute.",
};

export type AiStyle = "natural" | "calm" | "quick";

export const AI_STYLES: { id: AiStyle; label: string; hint: string }[] = [
  { id: "natural", label: "Natural", hint: "Relaxed and chatty, reacts to what is said, easy to interrupt." },
  { id: "calm", label: "Calm", hint: "Slower and patient, waits a little longer before replying." },
  { id: "quick", label: "Quick", hint: "Short and direct, replies fast. Good for simple calls." },
];

export type AiModel = "fast" | "smart";

export const AI_MODELS: { id: AiModel; label: string; hint: string; model: string }[] = [
  { id: "fast", label: "Fast", hint: "Quickest replies. Best for most calls.", model: "gpt-4o-mini" },
  { id: "smart", label: "Smarter", hint: "Handles harder conversations a little better, slightly slower.", model: "gpt-4.1-mini" },
];

/** Whether a campaign has a conversation (AI) or just reads a script to whoever answers. */
export type AiDelivery = "ai" | "script";

export const AI_DELIVERY: { id: AiDelivery; label: string; hint: string }[] = [
  { id: "ai", label: "Have a conversation (AI)", hint: "An AI voice talks with the person, answers questions and can tag how the call went." },
  { id: "script", label: "Read my script aloud (no AI)", hint: "A voice reads your script word for word to whoever picks up, then ends the call. Optionally offers \"press 1\" to be connected to you." },
];

export type AiVoicemail = "hangup" | "message" | "talk";

export const AI_VOICEMAIL: { id: AiVoicemail; label: string }[] = [
  { id: "hangup", label: "Hang up when it is a voicemail" },
  { id: "message", label: "Leave a short message" },
  { id: "talk", label: "Do not check, always talk" },
];

/** How a call can end. The label is what shows in Call History. */
export const AI_OUTCOMES = [
  { id: "interested", label: "Interested" },
  { id: "call_back", label: "Call back" },
  { id: "no_decision", label: "Undecided" },
  { id: "not_interested", label: "Not interested" },
  { id: "wrong_number", label: "Wrong number" },
  { id: "do_not_call", label: "Do not call" },
  { id: "message_taken", label: "Message taken" },
  { id: "transferred", label: "Transferred" },
  { id: "voicemail", label: "Voicemail" },
] as const;

export type AiOutcomeId = (typeof AI_OUTCOMES)[number]["id"];

export function aiOutcomeLabel(id: string | null | undefined): string | null {
  return AI_OUTCOMES.find((o) => o.id === id)?.label ?? null;
}

export function isAiOutcome(value: unknown): value is AiOutcomeId {
  return AI_OUTCOMES.some((o) => o.id === value);
}

export interface AiAgentSettings {
  delivery: AiDelivery;
  /** Script mode: after reading, offer "press 1 to speak with someone" and connect to the transfer number. */
  pressToConnect: boolean;
  voice: string;
  style: AiStyle;
  model: AiModel;
  voicemail: AiVoicemail;
  voicemailMessage: string;
  /** Who a call can be handed to when the person asks for a human. */
  transferNumber: string;
  actions: {
    /** Tag how the call went (interested, call back, ...). */
    outcome: boolean;
    /** Note a requested appointment for the team to confirm. */
    book: boolean;
    /** Text the person something during the call. */
    text: boolean;
    /** Hand the call to a human. Needs a transfer number. */
    transfer: boolean;
  };
}

export const DEFAULT_AI_SETTINGS: AiAgentSettings = {
  delivery: "ai",
  pressToConnect: false,
  voice: "ella",
  style: "natural",
  model: "fast",
  voicemail: "hangup",
  voicemailMessage: "",
  transferNumber: "",
  actions: { outcome: true, book: true, text: false, transfer: true },
};

export function findAiVoice(id: string): AiVoice {
  return AI_VOICES.find((v) => v.id === id) ?? AI_VOICES[0]!;
}

export const MAX_VOICEMAIL_MESSAGE = 300;

function clean<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return typeof value === "string" && (allowed as readonly string[]).includes(value) ? (value as T) : fallback;
}

/** Any stored or submitted value becomes a complete, valid settings object. */
export function sanitizeAiSettings(raw: unknown, base: AiAgentSettings = DEFAULT_AI_SETTINGS): AiAgentSettings {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const a = (r["actions"] && typeof r["actions"] === "object" ? r["actions"] : {}) as Record<string, unknown>;
  const flag = (key: keyof AiAgentSettings["actions"]) => (typeof a[key] === "boolean" ? (a[key] as boolean) : base.actions[key]);
  const transfer = typeof r["transferNumber"] === "string" ? r["transferNumber"].trim().slice(0, 24) : base.transferNumber;
  return {
    delivery: clean(r["delivery"], AI_DELIVERY.map((d) => d.id), base.delivery),
    pressToConnect: typeof r["pressToConnect"] === "boolean" ? (r["pressToConnect"] as boolean) : base.pressToConnect,
    voice: clean(r["voice"], AI_VOICES.map((v) => v.id), base.voice),
    style: clean(r["style"], AI_STYLES.map((s) => s.id), base.style),
    model: clean(r["model"], AI_MODELS.map((m) => m.id), base.model),
    voicemail: clean(r["voicemail"], AI_VOICEMAIL.map((v) => v.id), base.voicemail),
    voicemailMessage:
      typeof r["voicemailMessage"] === "string" ? r["voicemailMessage"].trim().slice(0, MAX_VOICEMAIL_MESSAGE) : base.voicemailMessage,
    transferNumber: transfer,
    actions: { outcome: flag("outcome"), book: flag("book"), text: flag("text"), transfer: flag("transfer") },
  };
}

/** Problems a person should be told about before saving, or null when it is fine. */
export function aiSettingsProblem(s: AiAgentSettings): string | null {
  if (s.transferNumber && !/^\+?[0-9]{7,15}$/.test(s.transferNumber.replace(/[\s()-]/g, ""))) {
    return "The transfer number should be a phone number, e.g. +14155550134.";
  }
  if (s.voicemail === "message" && !s.voicemailMessage.trim()) {
    return "Write the voicemail message, or choose a different voicemail option.";
  }
  return null;
}
