// Our own phone AI.
//
// SignalWire's newer "AI agent" call format has been silent on this account, while the classic
// format the IVR menu uses (<Say>, <Play>, <Gather>, <Dial>) works. So the conversation is run here:
// the carrier speaks one line and listens, sends us what the person said as text, our own AI model
// writes the reply, and we send it back to be spoken. That repeats until the call ends. A campaign can
// also just read a script with the same commands, optionally offering "press 1 to speak with someone".
//
// Server-only, but it does not import the AI binding itself: the Worker entry hands the model in
// (setPhoneBrain), the same way the speech maker is handed in, so browser code never reaches it.

import { sql } from "./db";
import { ensureSchema } from "./schema.server";
import { cxml, dial, gather, hangup, play, say, xmlEscape } from "./signalwire";
import { AI_OUTCOMES, findAiVoice, isAiOutcome, type AiAgentSettings } from "./ai-agent-options";
import { HONESTY, STYLE_GUIDE, runAiFunction, scriptText, summaryPrompt, tagCall, transferTarget } from "./ai-agent.server";

// ---------------------------------------------------------------------------
// The model, handed in by the Worker entry
// ---------------------------------------------------------------------------

export interface BrainMessage {
  role: "user" | "assistant";
  content: string;
}
export type PhoneBrain = (system: string, messages: BrainMessage[], maxTokens?: number) => Promise<string | null>;

let brain: PhoneBrain | null = null;

export function setPhoneBrain(fn: PhoneBrain): void {
  brain = fn;
}

// ---------------------------------------------------------------------------
// What a call needs to know about itself
// ---------------------------------------------------------------------------

export interface PhoneCtx {
  kind: "campaign" | "sample";
  callId: string;
  tenantId: string | null;
  settings: AiAgentSettings;
  /** Who the agent is and what the call is for (a script, in script mode), already filled in for this person. */
  role: string;
  /** What is known about the person. */
  brief: string;
  /** First name, for the opening hello. */
  firstName: string | null;
  fromNumber: string | null;
  /** This call's own address on the carrier webhook, to which `&step=…` is added. */
  base: string;
}

const MAX_TURNS = 14;
/** A call longer than this is wound up. */
const MAX_CALL_SECONDS = 270;

/** The carrier's voice for the classic commands. The IVR's own plain voices are used: they are known to work. */
function voiceFor(settings: AiAgentSettings) {
  const v = findAiVoice(settings.voice);
  const male = /^(daniel|oliver|jack|onyx|josh)$/.test(v.id);
  return { voice: male ? "man" : "woman", language: v.lang };
}

function stepUrl(ctx: PhoneCtx, step: string): string {
  return `${ctx.base}&step=${step}`;
}

// ---------------------------------------------------------------------------
// Reading a script (no AI)
// ---------------------------------------------------------------------------

export interface ScriptRecordings {
  script: string[];
  press?: string[] | undefined;
}

export function scriptCall(ctx: PhoneCtx, recordings: ScriptRecordings | null): Response {
  const v = voiceFor(ctx.settings);
  const body = recordings && recordings.script.length > 0 ? recordings.script.map(play).join("") : say(scriptText(ctx.role), v);
  const canPress = ctx.settings.pressToConnect && transferTarget(ctx.settings) && ctx.fromNumber;
  const offer = canPress
    ? gather({
        action: stepUrl(ctx, "press"),
        numDigits: 1,
        timeoutSeconds: 6,
        nested: recordings?.press?.length ? recordings.press.map(play).join("") : say("To speak with someone now, press 1.", v),
      })
    : "";
  return cxml(`<Pause length="1"/>${body}${offer}${hangup()}`);
}

/** The caller pressed a key after the script. */
export function pressStep(ctx: PhoneCtx, digits: string): Response {
  const target = transferTarget(ctx.settings);
  if (digits.trim() === "1" && target && ctx.fromNumber) {
    return cxml(say("Connecting you now. Please hold.", voiceFor(ctx.settings)) + dial([target], { callerId: ctx.fromNumber, timeoutSeconds: 30 }) + hangup());
  }
  return cxml(hangup());
}

// ---------------------------------------------------------------------------
// The conversation
// ---------------------------------------------------------------------------

function systemPrompt(ctx: PhoneCtx): string {
  const s = ctx.settings;
  const target = transferTarget(s);
  const outcomes = AI_OUTCOMES.map((o) => o.id).join(", ");
  const lines = [
    ctx.role,
    ctx.brief ? `What you know about the person:\n${ctx.brief}` : "",
    STYLE_GUIDE[s.style],
    HONESTY,
    "You are on a live phone call, speaking out loud. Write only the words to be said: plain spoken English, no lists, no markdown, no emojis, no stage directions. " +
      "Reply in one or two short sentences, and ask only one question at a time. If you did not catch something, ask them to repeat it.",
    `Reply with ONLY a JSON object, nothing before or after it, like: {"say":"what you say next","end":false,"transfer":false,"outcome":null,"note":null,"book":null,"text":null}.`,
    `Set "end" to true when the conversation is finished or they want to stop, and make "say" a short warm goodbye. Set "outcome" at the end to one of: ${outcomes}. "note" is one short line worth remembering.`,
    s.actions.book ? `If they ask for an appointment or visit, set "book" to {"when":"their words for the day and time","name":"their name","reason":"what for"}. Never promise a slot: say the team will confirm.` : "",
    s.actions.text ? `If they ask you to text them details, set "text" to the message, under 300 characters, using only information you were given.` : "",
    s.actions.transfer && target ? `If they ask for a human, or it is urgent, set "transfer" to true and say you are connecting them.` : "",
  ];
  return lines.filter(Boolean).join("\n\n");
}

interface Turn {
  say: string;
  end: boolean;
  transfer: boolean;
  outcome: string | null;
  note: string | null;
  book: { when?: string; name?: string; reason?: string } | null;
  text: string | null;
}

/** The model is asked for JSON, but may add words around it, or answer in plain text: both are handled. */
export function parseTurn(raw: string): Turn {
  const blank: Turn = { say: "", end: false, transfer: false, outcome: null, note: null, book: null, text: null };
  const start = raw.indexOf("{");
  const stop = raw.lastIndexOf("}");
  if (start >= 0 && stop > start) {
    try {
      const j = JSON.parse(raw.slice(start, stop + 1)) as Record<string, unknown>;
      const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
      const book = j["book"] && typeof j["book"] === "object" ? (j["book"] as Turn["book"]) : null;
      const said = str(j["say"]);
      if (said) {
        return {
          say: said,
          end: j["end"] === true,
          transfer: j["transfer"] === true,
          outcome: isAiOutcome(j["outcome"]) ? (j["outcome"] as string) : null,
          note: str(j["note"]),
          book,
          text: str(j["text"]),
        };
      }
    } catch {
      // Not JSON after all: treated as plain words below.
    }
  }
  const plain = raw.replace(/[{}"]/g, "").replace(/\s+/g, " ").trim();
  return { ...blank, say: plain.slice(0, 400) };
}

/** How many times in a row the person has said nothing when asked, at the end of the call so far. */
export function trailingSilences(transcript: string): number {
  let count = 0;
  const lines = transcript.split("\n");
  for (let i = lines.length - 1; i >= 0; i--) {
    if (/^Caller: \(no answer\)/.test(lines[i]!)) count++;
    else if (/^Assistant:/.test(lines[i]!)) continue;
    else if (/^Caller:/.test(lines[i]!)) break;
  }
  return count;
}

/** What has been said so far, as it is kept on the call: one "Assistant:" or "Caller:" line each. */
function toMessages(transcript: string): BrainMessage[] {
  const out: BrainMessage[] = [];
  for (const line of transcript.split("\n")) {
    const m = /^(Assistant|Caller):\s*(.*)$/.exec(line);
    if (!m || !m[2] || m[2] === "(no answer)") continue;
    out.push({ role: m[1] === "Assistant" ? "assistant" : "user", content: m[2] });
  }
  return out;
}

async function loadTranscript(callId: string): Promise<{ transcript: string; secondsIn: number }> {
  const [row] = await sql`select transcript, greatest(0, extract(epoch from (now() - started_at))::int) as secs from calls where id = ${callId} limit 1`;
  return { transcript: String(row?.["transcript"] ?? ""), secondsIn: Number(row?.["secs"] ?? 0) };
}

async function appendLine(callId: string, who: "Assistant" | "Caller", text: string): Promise<void> {
  const line = `${who}: ${text.replace(/\s+/g, " ").trim().slice(0, 600)}`;
  await sql`update calls set transcript = case when transcript is null or transcript = '' then ${line} else transcript || E'\n' || ${line} end where id = ${callId}`;
}

function listen(ctx: PhoneCtx, words: string): Response {
  const v = voiceFor(ctx.settings);
  return cxml(
    `<Gather input="speech" speechTimeout="auto" timeout="7" language="${xmlEscape(v.language)}" action="${xmlEscape(stepUrl(ctx, "turn"))}" method="POST" actionOnEmptyResult="true">` +
      say(words, v) +
      `</Gather>`,
  );
}

function goodbye(ctx: PhoneCtx, words: string): Response {
  return cxml(say(words, voiceFor(ctx.settings)) + hangup());
}

const TROUBLE = "Sorry, something went wrong on our side. We will try you again later. Goodbye.";

/** The call is answered: say a quick hello at once, then carry on from there. */
export function openConversation(ctx: PhoneCtx): Response {
  const hello = ctx.firstName ? `Hi ${ctx.firstName}, thanks for picking up. I'll be quick.` : "Hi there, thanks for picking up. I'll be quick.";
  return cxml(`<Pause length="1"/>${say(hello, voiceFor(ctx.settings))}<Redirect method="POST">${xmlEscape(stepUrl(ctx, "turn"))}</Redirect>`);
}

/** One turn: what the person said (nothing, on the first turn) goes to the model, and its reply goes back to the phone. */
export async function conversationTurn(ctx: PhoneCtx, speech: string | null): Promise<Response> {
  await ensureSchema();
  if (!brain) {
    console.error("[ai-phone] no model available");
    return goodbye(ctx, TROUBLE);
  }

  const { transcript, secondsIn } = await loadTranscript(ctx.callId);
  const history = toMessages(transcript);
  const heard = speech?.trim() || "";
  // Nothing has been said yet: this is the request that follows the quick hello.
  const isFirst = transcript.trim() === "";

  // Silence: ask once, and let go after the second.
  if (!isFirst && !heard) {
    const alreadyAsked = trailingSilences(transcript) >= 1;
    await appendLine(ctx.callId, "Caller", "(no answer)");
    if (alreadyAsked) {
      await tagCall(ctx.callId, "no_decision", "Did not answer when asked.").catch(() => undefined);
      return goodbye(ctx, "I'll let you go. Thanks for your time. Goodbye.");
    }
    return listen(ctx, "Are you still there?");
  }
  if (heard) await appendLine(ctx.callId, "Caller", heard);

  const turns = history.filter((m) => m.role === "assistant").length;
  if (turns >= MAX_TURNS || secondsIn > MAX_CALL_SECONDS) {
    await tagCall(ctx.callId, "no_decision", "Call wound up at its length limit.").catch(() => undefined);
    return goodbye(ctx, "I don't want to keep you any longer. Thanks so much for your time. Goodbye.");
  }

  const messages: BrainMessage[] = [...history, ...(heard ? [{ role: "user" as const, content: heard }] : [])];
  if (isFirst) messages.push({ role: "user", content: "(The person has just picked up and heard your hello. Now say who you are and why you are calling.)" });

  let raw: string | null = null;
  try {
    raw = await brain(systemPrompt(ctx), messages, 260);
  } catch (err) {
    console.error("[ai-phone] the model failed", err);
  }
  if (!raw) return goodbye(ctx, TROUBLE);

  const turn = parseTurn(raw);
  if (!turn.say) return goodbye(ctx, TROUBLE);
  await appendLine(ctx.callId, "Assistant", turn.say);

  // What the agent decided to do, within what the campaign allows.
  const s = ctx.settings;
  try {
    if (s.actions.outcome && turn.outcome) await tagCall(ctx.callId, turn.outcome, turn.note);
    if (s.actions.book && turn.book?.when) await runAiFunction(ctx.callId, "book_appointment", turn.book as Record<string, unknown>);
    if (s.actions.text && turn.text) await runAiFunction(ctx.callId, "send_text", { message: turn.text });
  } catch (err) {
    console.error("[ai-phone] an action failed", err);
  }

  const target = transferTarget(s);
  if (turn.transfer && s.actions.transfer && target && ctx.fromNumber) {
    await tagCall(ctx.callId, "transferred", turn.note).catch(() => undefined);
    return cxml(say(turn.say, voiceFor(s)) + dial([target], { callerId: ctx.fromNumber, timeoutSeconds: 30 }) + hangup());
  }
  if (turn.end) return goodbye(ctx, turn.say);
  return listen(ctx, turn.say);
}

// ---------------------------------------------------------------------------
// After the call
// ---------------------------------------------------------------------------

/** Writes the summary (and outcome, if the model did not already set one) once the call is over. Never throws. */
export async function summariseCall(callId: string): Promise<void> {
  try {
    if (!brain) return;
    await ensureSchema();
    const [row] = await sql`select transcript, summary from calls where id = ${callId} limit 1`;
    const transcript = String(row?.["transcript"] ?? "").trim();
    if (!transcript || row?.["summary"]) return;
    const raw = await brain(summaryPrompt("the person who runs this campaign"), [{ role: "user", content: transcript.slice(0, 6000) }], 220);
    if (!raw) return;
    const tagged = /^\s*OUTCOME:\s*([a-z_]+)\s*$/im.exec(raw);
    const outcome = tagged && isAiOutcome(tagged[1]) ? (tagged[1] as string) : null;
    const summary = raw.replace(/^\s*OUTCOME:.*$/im, "").trim().slice(0, 2000);
    await sql`update calls set summary = ${summary || null}, summary_at = now(), handled_by = 'ai' where id = ${callId}`;
    const [after] = await sql`select ai_outcome from calls where id = ${callId}`;
    if (outcome && !after?.["ai_outcome"]) await tagCall(callId, outcome);
  } catch (err) {
    console.error("[ai-phone] could not summarise the call", err);
  }
}
