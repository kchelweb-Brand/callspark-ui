import { Link, useRouterState } from "@tanstack/react-router";
import { Loader2, MessageCircleQuestion, SendHorizontal, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { askHelp, isSignedIn, sendChatToSupport, type ChatMessage } from "@/lib/help-api";

const STORAGE_KEY = "kchel-help-chat";
const MAX_STORED = 30;

const VISITOR_IDEAS = ["How much does it cost?", "How do I get started?", "What can the AI voice agent do?", "Can I use my own phone line?"];
const MEMBER_IDEAS = ["How do I import contacts?", "How do I add an agent?", "How do I set up the AI receptionist?", "Why can't I make calls?"];

const WELCOME = "Hi! I can answer questions about using Kchel Dialer. What do you need help with?";

function load(): ChatMessage[] {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    const parsed = raw ? (JSON.parse(raw) as ChatMessage[]) : [];
    return Array.isArray(parsed) ? parsed.filter((m) => (m.role === "user" || m.role === "assistant") && typeof m.content === "string") : [];
  } catch {
    return [];
  }
}

function save(messages: ChatMessage[]) {
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
  const [messages, setMessages] = useState<ChatMessage[]>([]);
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
    const next: ChatMessage[] = [...messages, { role: "user", content: question.slice(0, 600) }];
    setMessages(next);
    save(next);
    setDraft("");
    setError(null);
    setOfferPerson(false);
    setHandedOver(null);
    setBusy(true);
    try {
      const result = await askHelp(next, path);
      const withReply: ChatMessage[] = [...next, { role: "assistant", content: result.reply }];
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
      const result = await sendChatToSupport(messages);
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
          className="flex h-[min(34rem,calc(100dvh-6rem))] w-[min(24rem,calc(100vw-2rem))] flex-col overflow-hidden rounded-2xl border border-border bg-card text-card-foreground shadow-2xl"
        >
          <header className="flex items-center justify-between gap-2 border-b border-border bg-primary px-4 py-3 text-primary-foreground">
            <div>
              <p className="text-sm font-semibold">Kchel help</p>
              <p className="text-xs opacity-80">Ask how to do anything</p>
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
              <Bubble key={i} role={m.role} text={m.content} />
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
              AI assistant: it can make mistakes. Never share passwords, sign-in codes or card numbers here.
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
