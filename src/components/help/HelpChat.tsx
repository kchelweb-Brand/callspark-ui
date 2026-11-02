import { Link, useRouterState } from "@tanstack/react-router";
import { ArrowRight, BookOpen, Loader2, MessageCircleQuestion, SendHorizontal, Sparkles, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { ShotImage } from "@/components/manual/ManualParts";
import { askHelp, isSignedIn, sendChatToSupport, type ChatMessage, type GuideCard, type UpgradeCard } from "@/lib/help-api";
import { SLink } from "@/site/blocks";

/** A chat message as shown: the words, plus the guide and plan cards the answer came with. */
type Shown = ChatMessage & { guide?: GuideCard; upgrade?: UpgradeCard };

const STORAGE_KEY = "kchel-help-chat";
const MAX_STORED = 30;

const VISITOR_IDEAS = ["How much does it cost?", "Where do I get SIP credentials?", "What is a voice broadcast?", "Which plan is right for my team?"];
const MEMBER_IDEAS = ["Where do I get SIP credentials?", "How do I import contacts?", "How do I run a voice broadcast?", "Why can't I make calls?"];

const WELCOME =
  "Hi! I'm the Kchel assistant. Ask me anything about setting up or using the platform and I'll give you step-by-step instructions with screenshots. Signed in, I can also look at your plan and phone line to help.";

function load(): Shown[] {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    const parsed = raw ? (JSON.parse(raw) as Shown[]) : [];
    return Array.isArray(parsed) ? parsed.filter((m) => (m.role === "user" || m.role === "assistant") && typeof m.content === "string") : [];
  } catch {
    return [];
  }
}

/** What the server needs back: only the words, never the cards. */
function words(messages: Shown[]): ChatMessage[] {
  return messages.map((m) => ({ role: m.role, content: m.content }));
}

function save(messages: Shown[]) {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(messages.slice(-MAX_STORED)));
  } catch {
    // The chat still works without remembering itself.
  }
}

/**
 * The help assistant: a button in the corner that opens a small chat. It answers
 * how-to questions from Kchel's own guides, and can pass the conversation to the
 * team when it isn't sure.
 */
export function HelpChat() {
  const path = useRouterState({ select: (s) => s.location.pathname });
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Shown[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [offerPerson, setOfferPerson] = useState(false);
  const [handedOver, setHandedOver] = useState<string | null>(null);
  const [signedIn, setSignedIn] = useState(false);
  const bottom = useRef<HTMLDivElement | null>(null);
  const input = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    setMessages(load());
  }, []);

  useEffect(() => {
    if (open) {
      setSignedIn(isSignedIn());
      input.current?.focus();
    }
  }, [open]);

  useEffect(() => {
    bottom.current?.scrollIntoView({ block: "end" });
  }, [messages, busy, offerPerson, handedOver, open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  // The platform owner's console has its own tools; the assistant is for customers.
  if (path.startsWith("/admin")) return null;

  async function send(text: string) {
    const question = text.trim();
    if (!question || busy) return;
    const next: Shown[] = [...messages, { role: "user", content: question.slice(0, 600) }];
    setMessages(next);
    save(next);
    setDraft("");
    setError(null);
    setOfferPerson(false);
    setHandedOver(null);
    setBusy(true);
    try {
      const result = await askHelp(words(next), path);
      const withReply: Shown[] = [
        ...next,
        { role: "assistant", content: result.reply, ...(result.guide ? { guide: result.guide } : {}), ...(result.upgrade ? { upgrade: result.upgrade } : {}) },
      ];
      setMessages(withReply);
      save(withReply);
      setOfferPerson(result.escalate);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function talkToAPerson() {
    setBusy(true);
    setError(null);
    try {
      const result = await sendChatToSupport(words(messages));
      setHandedOver(result.ticketRef);
      setOfferPerson(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't send that to the team.");
    } finally {
      setBusy(false);
    }
  }

  function clear() {
    setMessages([]);
    save([]);
    setOfferPerson(false);
    setHandedOver(null);
    setError(null);
  }

  const ideas = signedIn ? MEMBER_IDEAS : VISITOR_IDEAS;

  return (
    <div className="fixed right-4 bottom-4 z-50 flex flex-col items-end gap-3 print:hidden">
      {open && (
        <section
          role="dialog"
          aria-label="Kchel help assistant"
          className="flex h-[min(40rem,calc(100dvh-6rem))] w-[min(30rem,calc(100vw-2rem))] flex-col overflow-hidden rounded-2xl border border-border bg-card text-card-foreground shadow-2xl"
        >
          <header className="flex items-center justify-between gap-2 border-b border-border bg-primary px-4 py-3 text-primary-foreground">
            <div>
              <p className="text-sm font-semibold">Kchel help</p>
              <p className="text-xs opacity-80">Step-by-step help with screenshots</p>
            </div>
            <div className="flex items-center gap-1">
              {messages.length > 0 && (
                <button type="button" onClick={clear} className="rounded-md px-2 py-1 text-xs opacity-80 hover:bg-white/15 hover:opacity-100">
                  New chat
                </button>
              )}
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close help"
                className="rounded-md p-1.5 hover:bg-white/15"
              >
                <X className="size-4" />
              </button>
            </div>
          </header>

          <div className="flex-1 space-y-3 overflow-y-auto px-4 py-4 text-sm" aria-live="polite">
            <Bubble role="assistant" text={WELCOME} />
            {messages.length === 0 && (
              <div className="flex flex-wrap gap-2 pt-1">
                {ideas.map((idea) => (
                  <button
                    key={idea}
                    type="button"
                    onClick={() => void send(idea)}
                    className="rounded-full border border-border bg-background px-3 py-1.5 text-left text-xs hover:bg-accent"
                  >
                    {idea}
                  </button>
                ))}
              </div>
            )}
            {messages.map((m, i) => (
              <div key={i} className="space-y-3">
                <Bubble role={m.role} text={m.content} />
                {m.guide && <GuideView guide={m.guide} />}
                {m.upgrade && <UpgradeView plan={m.upgrade} />}
              </div>
            ))}
            {busy && (
              <p className="flex items-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="size-3.5 animate-spin" /> Thinking…
              </p>
            )}
            {error && (
              <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                {error}
              </p>
            )}
            {offerPerson && !busy && (
              <div className="rounded-lg border border-border bg-muted/50 p-3 text-xs">
                {signedIn ? (
                  <>
                    <p className="mb-2">Want a person to look at this? I'll send them this conversation.</p>
                    <button
                      type="button"
                      onClick={() => void talkToAPerson()}
                      className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90"
                    >
                      Talk to a person
                    </button>
                  </>
                ) : (
                  <p>
                    To talk to a person, <Link to="/login" className="font-semibold text-primary hover:underline">sign in</Link> or{" "}
                    <Link to="/signup" className="font-semibold text-primary hover:underline">create an account</Link>, then ask again.
                  </p>
                )}
              </div>
            )}
            {handedOver && (
              <p className="rounded-lg border border-border bg-muted/50 px-3 py-2 text-xs">
                Sent to the team ({handedOver}). Their reply will appear in{" "}
                <Link to="/support" className="font-semibold text-primary hover:underline">
                  Support
                </Link>
                .
              </p>
            )}
            <div ref={bottom} />
          </div>

          <form
            className="border-t border-border p-3"
            onSubmit={(e) => {
              e.preventDefault();
              void send(draft);
            }}
          >
            <div className="flex items-end gap-2">
              <textarea
                ref={input}
                value={draft}
                rows={1}
                maxLength={600}
                placeholder="Type your question…"
                aria-label="Your question"
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    void send(draft);
                  }
                }}
                className="max-h-28 min-h-9 flex-1 resize-none rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-1 focus-visible:ring-ring"
              />
              <button
                type="submit"
                disabled={busy || !draft.trim()}
                aria-label="Send"
                className="flex size-9 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground disabled:opacity-50"
              >
                <SendHorizontal className="size-4" />
              </button>
            </div>
            <p className="mt-2 text-[11px] leading-snug text-muted-foreground">
              AI assistant: it can make mistakes. Never share passwords, sign-in codes or card numbers here.{" "}
              <SLink to="/manual" className="font-semibold text-primary hover:underline">
                Browse the full manual
              </SLink>
              .
            </p>
          </form>
        </section>
      )}

      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label={open ? "Close help" : "Open help"}
        aria-expanded={open}
        className="flex h-12 items-center gap-2 rounded-full bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-lg transition hover:bg-primary/90"
      >
        {open ? <X className="size-5" /> : <MessageCircleQuestion className="size-5" />}
        <span className={open ? "sr-only" : "hidden sm:inline"}>Help</span>
      </button>
    </div>
  );
}

function Bubble({ role, text }: { role: "user" | "assistant"; text: string }) {
  const mine = role === "user";
  return (
    <div className={`flex ${mine ? "justify-end" : "justify-start"}`}>
      <p
        className={`max-w-[88%] rounded-2xl px-3 py-2 leading-relaxed whitespace-pre-wrap ${
          mine ? "rounded-br-sm bg-primary text-primary-foreground" : "rounded-bl-sm bg-muted text-foreground"
        }`}
      >
        {text}
      </p>
    </div>
  );
}

/** The numbered steps of a manual guide, with its screenshots. Pictures open full size when pressed. */
function GuideView({ guide }: { guide: GuideCard }) {
  return (
    <section className="rounded-xl border border-border bg-background" aria-label={`Guide: ${guide.title}`}>
      <header className="flex items-start gap-2 border-b border-border px-3 py-2.5">
        <BookOpen className="mt-0.5 size-4 shrink-0 text-primary" />
        <div className="min-w-0">
          <p className="text-[11px] font-semibold tracking-wide text-primary uppercase">Step-by-step guide</p>
          <p className="text-sm leading-snug font-semibold">{guide.title}</p>
          <p className="text-xs text-muted-foreground">{guide.time}</p>
        </div>
      </header>
      <ol className="space-y-4 px-3 py-3">
        {guide.steps.map((step, i) => (
          <li key={i} className="grid grid-cols-[1.5rem_1fr] gap-2">
            <span className="flex size-6 items-center justify-center rounded-full bg-primary text-[11px] font-bold text-primary-foreground">{i + 1}</span>
            <div className="min-w-0">
              <p className="text-[13px] leading-relaxed">{step.text}</p>
              {step.note && <p className="mt-1.5 rounded-md bg-muted px-2 py-1.5 text-xs text-muted-foreground">{step.note}</p>}
              {step.shot && <ShotImage id={step.shot.id} compact className="mt-2" />}
            </div>
          </li>
        ))}
      </ol>
      <footer className="flex flex-col gap-2 border-t border-border px-3 py-2.5">
        <SLink to={guide.href} className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary hover:underline">
          Open the full guide <ArrowRight className="size-3.5" />
        </SLink>
        {guide.related.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {guide.related.map((r) => (
              <SLink key={r.slug} to={r.href} className="rounded-full border border-border px-2.5 py-1 text-[11px] hover:bg-accent">
                {r.title}
              </SLink>
            ))}
          </div>
        )}
      </footer>
    </section>
  );
}

/** A plan that fits what the question ran into, with the real reasons and a link to act on it. */
function UpgradeView({ plan }: { plan: UpgradeCard }) {
  return (
    <section className="rounded-xl border border-primary/40 bg-primary/5 px-3 py-3" aria-label={`Suggested plan: ${plan.planName}`}>
      <p className="flex items-center gap-1.5 text-[11px] font-semibold tracking-wide text-primary uppercase">
        <Sparkles className="size-3.5" /> Suggested plan
      </p>
      <p className="mt-1 text-sm font-semibold">{plan.planName}</p>
      <p className="text-xs text-muted-foreground">{plan.priceLine}</p>
      <ul className="mt-2 list-disc space-y-1 pl-4 text-xs leading-relaxed">
        {plan.points.map((p, i) => (
          <li key={i}>{p}</li>
        ))}
      </ul>
      <p className="mt-2 text-xs font-semibold">What you get</p>
      <ul className="mt-1 list-disc space-y-0.5 pl-4 text-xs leading-relaxed text-muted-foreground">
        {plan.includes.map((p, i) => (
          <li key={i}>{p}</li>
        ))}
      </ul>
      <SLink to={plan.href} className="mt-3 inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:bg-primary/90">
        {plan.cta} <ArrowRight className="size-3.5" />
      </SLink>
    </section>
  );
}
