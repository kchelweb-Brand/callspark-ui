import { createFileRoute } from "@tanstack/react-router";
import { BellRing, CheckCircle2, ExternalLink, Loader2, LogOut, RefreshCw, Search, ShieldCheck, XCircle } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { ownerApi, type ClaimView } from "@/lib/owner-app-api";

export const Route = createFileRoute("/admin/app")({
  head: () => ({
    meta: [
      { title: "Kchel Admin" },
      { name: "description", content: "Watch payments arrive and grant plans from your phone." },
      { name: "viewport", content: "width=device-width, initial-scale=1, viewport-fit=cover" },
      { name: "theme-color", content: "#0a2540" },
      { name: "apple-mobile-web-app-capable", content: "yes" },
      { name: "mobile-web-app-capable", content: "yes" },
      { name: "apple-mobile-web-app-title", content: "Kchel Admin" },
      { name: "robots", content: "noindex" },
    ],
  }),
  // The router lays this over the raw address, so an unknown value has to be overwritten.
  validateSearch: (search: Record<string, unknown>): { claim?: string | undefined } => {
    const claim = search["claim"];
    return { claim: typeof claim === "string" && /^[0-9a-f-]{36}$/i.test(claim) ? claim : undefined };
  },
  component: OwnerApp,
});

const KEY = "kchel_owner_app";
type Saved = { token: string; email: string };

function readSaved(): Saved | null {
  try {
    const raw = window.localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Saved) : null;
  } catch {
    return null;
  }
}
function writeSaved(v: Saved | null) {
  try {
    if (v) window.localStorage.setItem(KEY, JSON.stringify(v));
    else window.localStorage.removeItem(KEY);
  } catch {
    // Private mode: the sign-in simply lasts until the app is closed.
  }
}

const money = (n: number | null | undefined) =>
  n === null || n === undefined ? "—" : `$${n.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;

function ago(iso: string) {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  return `${Math.floor(s / 86400)} d ago`;
}

function keyToBytes(b64url: string): Uint8Array {
  const pad = "=".repeat((4 - (b64url.length % 4)) % 4);
  const raw = atob((b64url + pad).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

const field = "h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-[16px] text-slate-900";
const btn = "inline-flex h-11 items-center justify-center gap-2 rounded-lg px-4 text-[15px] font-bold disabled:opacity-60";

function OwnerApp() {
  const [saved, setSaved] = useState<Saved | null>(null);
  const [ready, setReady] = useState(false);
  const { claim: focusClaim } = Route.useSearch();

  useEffect(() => {
    setSaved(readSaved());
    setReady(true);
    // This page is installable as its own app: point the browser at the owner app's manifest.
    const link = document.querySelector<HTMLLinkElement>('link[rel="manifest"]');
    if (link) link.href = "/admin-app.webmanifest";
  }, []);

  if (!ready) return <div className="min-h-screen bg-slate-100" />;
  return saved ? (
    <Main
      saved={saved}
      focusClaim={focusClaim}
      onSignOut={() => {
        writeSaved(null);
        setSaved(null);
      }}
    />
  ) : (
    <SignIn
      onDone={(s) => {
        writeSaved(s);
        setSaved(s);
      }}
    />
  );
}

function SignIn({ onDone }: { onDone: (s: Saved) => void }) {
  const [step, setStep] = useState<"email" | "code">("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      if (step === "email") {
        await ownerApi.sendCode(email.trim().toLowerCase());
        setStep("code");
        toast.success("Code sent", { description: `Check ${email} for your sign-in code.` });
      } else {
        const r = await ownerApi.verifyCode(email.trim().toLowerCase(), code.trim());
        if (!r.user.is_super_admin) throw new Error("This app is for the platform owner only.");
        onDone({ token: r.token, email: r.user.email });
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not sign in.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col justify-center bg-[#0a2540] px-6 py-10 text-white">
      <img src="/icon-192.png" alt="" className="mb-5 size-14 rounded-xl" />
      <h1 className="text-[1.7rem] font-extrabold tracking-tight">Kchel Admin</h1>
      <p className="mt-1 text-[15px] text-white/70">Payments and access, from your phone. Platform owners only.</p>
      <form onSubmit={submit} className="mt-8 flex flex-col gap-3">
        {step === "email" ? (
          <input type="email" autoComplete="email" inputMode="email" placeholder="Your admin email" required value={email} onChange={(e) => setEmail(e.target.value)} className={field} />
        ) : (
          <input inputMode="numeric" autoComplete="one-time-code" placeholder="6-digit code from your email" maxLength={6} required value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} className={field} />
        )}
        <button type="submit" disabled={busy} className={`${btn} bg-[#0b8f4d] text-white`}>
          {busy ? <Loader2 className="size-4 animate-spin" /> : null}
          {step === "email" ? "Send me a code" : "Sign in"}
        </button>
        {step === "code" && (
          <button type="button" className="text-sm text-white/70 underline" onClick={() => setStep("email")}>
            Use a different email
          </button>
        )}
      </form>
      <p className="mt-6 text-xs text-white/50">You stay signed in on this phone for two weeks. Sign out any time from the app.</p>
    </div>
  );
}

type Tab = "verify" | "payments" | "accounts";

function Main({ saved, focusClaim, onSignOut }: { saved: Saved; focusClaim?: string | undefined; onSignOut: () => void }) {
  const [tab, setTab] = useState<Tab>("verify");
  const [claims, setClaims] = useState<ClaimView[]>([]);
  const [pending, setPending] = useState(0);
  const [feed, setFeed] = useState<Awaited<ReturnType<typeof ownerApi.feed>>["payments"]>([]);
  const [loading, setLoading] = useState(true);
  const [alerts, setAlerts] = useState<"on" | "off" | "unsupported">("off");
  const [showHistory, setShowHistory] = useState(false);
  const failed = useRef(0);

  const lostSession = useCallback(
    (err: unknown) => {
      const msg = err instanceof Error ? err.message : "";
      if (/not authorized|not signed in|expired|invalid/i.test(msg)) {
        toast.error("Your sign-in ended. Please sign in again.");
        onSignOut();
        return true;
      }
      return false;
    },
    [onSignOut],
  );

  const load = useCallback(async () => {
    try {
      const [c, f] = await Promise.all([ownerApi.claims(saved.token), ownerApi.feed(saved.token)]);
      setClaims(c.claims);
      setPending(c.pending);
      setFeed(f.payments);
      failed.current = 0;
    } catch (err) {
      if (!lostSession(err) && failed.current++ === 0) toast.error("Couldn't refresh. Pull to try again.");
    } finally {
      setLoading(false);
    }
  }, [saved.token, lostSession]);

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(), 30_000);
    const visible = () => document.visibilityState === "visible" && void load();
    document.addEventListener("visibilitychange", visible);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", visible);
    };
  }, [load]);

  // Whether this phone is already set up for alerts.
  useEffect(() => {
    if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
      setAlerts("unsupported");
      return;
    }
    void navigator.serviceWorker
      .getRegistration("/admin/")
      .then((reg) => reg?.pushManager.getSubscription())
      .then((sub) => setAlerts(sub && Notification.permission === "granted" ? "on" : "off"))
      .catch(() => setAlerts("off"));
  }, []);

  async function enableAlerts() {
    try {
      const reg = await navigator.serviceWorker.register("/admin/sw.js", { scope: "/admin/" });
      await navigator.serviceWorker.ready;
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        toast.error("Alerts are blocked. Allow notifications for this app in your phone's settings, then try again.");
        return;
      }
      const { publicKey } = await ownerApi.pushKey(saved.token);
      const sub =
        (await reg.pushManager.getSubscription()) ??
        (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyToBytes(publicKey) as unknown as BufferSource }));
      const json = sub.toJSON();
      if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) throw new Error("This phone did not give a notification address.");
      await ownerApi.savePush(saved.token, { endpoint: json.endpoint, keys: { p256dh: json.keys.p256dh, auth: json.keys.auth } }, navigator.userAgent.slice(0, 70));
      setAlerts("on");
      toast.success("Alerts are on", { description: "You'll be told here the moment a payment arrives." });
    } catch (err) {
      if (!lostSession(err)) toast.error(err instanceof Error ? err.message : "Couldn't turn alerts on.");
    }
  }

  const waiting = claims.filter((c) => c.status === "pending");
  const done = claims.filter((c) => c.status !== "pending");

  return (
    <div className="min-h-screen bg-slate-100 pb-24 text-slate-900" style={{ paddingTop: "env(safe-area-inset-top)" }}>
      <header className="sticky top-0 z-10 bg-[#0a2540] px-4 pb-3 pt-3 text-white shadow">
        <div className="flex items-center gap-3">
          <img src="/icon-192.png" alt="" className="size-9 rounded-lg" />
          <div className="min-w-0 flex-1">
            <p className="text-[17px] font-extrabold leading-tight">Kchel Admin</p>
            <p className="truncate text-xs text-white/60">{saved.email}</p>
          </div>
          <button aria-label="Refresh" className="rounded-lg p-2 hover:bg-white/10" onClick={() => void load()}>
            <RefreshCw className={`size-5 ${loading ? "animate-spin" : ""}`} />
          </button>
          <button aria-label="Sign out" className="rounded-lg p-2 hover:bg-white/10" onClick={onSignOut}>
            <LogOut className="size-5" />
          </button>
        </div>
        {alerts !== "on" && (
          <div className="mt-3 rounded-lg bg-white/10 p-3 text-[13.5px] leading-snug">
            {alerts === "unsupported" ? (
              <p>
                To get alerts on an iPhone, tap Share, choose <strong>Add to Home Screen</strong>, then open Kchel Admin from your Home Screen and turn alerts on there.
              </p>
            ) : (
              <button className="flex w-full items-center gap-2 text-left font-bold" onClick={() => void enableAlerts()}>
                <BellRing className="size-5 shrink-0" /> Turn on payment alerts for this phone
              </button>
            )}
          </div>
        )}
      </header>

      <main className="mx-auto flex max-w-xl flex-col gap-3 px-4 pt-4">
        {tab === "verify" && (
          <>
            {loading && <p className="py-8 text-center text-slate-500">Loading…</p>}
            {!loading && waiting.length === 0 && (
              <div className="rounded-xl bg-white p-6 text-center">
                <ShieldCheck className="mx-auto size-8 text-[#0b8f4d]" />
                <p className="mt-2 font-bold">Nothing waiting</p>
                <p className="text-sm text-slate-500">When a customer says they've paid, it appears here and your phone is alerted.</p>
              </div>
            )}
            {waiting.map((c) => (
              <ClaimCard key={c.id} claim={c} token={saved.token} focus={focusClaim === c.id} onChanged={load} onLost={lostSession} />
            ))}
            {done.length > 0 && (
              <button className="py-2 text-sm font-semibold text-slate-600 underline" onClick={() => setShowHistory((v) => !v)}>
                {showHistory ? "Hide" : "Show"} recently handled ({done.length})
              </button>
            )}
            {showHistory && done.map((c) => <ClaimCard key={c.id} claim={c} token={saved.token} focus={false} onChanged={load} onLost={lostSession} />)}
          </>
        )}

        {tab === "payments" && (
          <>
            {feed.length === 0 && !loading && <p className="py-8 text-center text-slate-500">No payments yet.</p>}
            {feed.map((p) => (
              <div key={p.id} className="rounded-xl bg-white p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate font-bold">{p.workspace ?? p.email ?? "Unknown payer"}</p>
                    <p className="truncate text-sm text-slate-500">
                      {p.planName ?? "No plan matched"} · {p.provider === "flutterwave" ? "Card or bank" : "Confirmed by you"}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-extrabold">{p.currency === "USD" ? money(p.amount) : `${p.currency} ${p.amount}`}</p>
                    <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${p.status === "activated" ? "bg-green-100 text-green-800" : "bg-amber-100 text-amber-900"}`}>
                      {p.status === "activated" ? "Plan on" : "Needs you"}
                    </span>
                  </div>
                </div>
                {p.status !== "activated" && p.note && <p className="mt-2 text-sm text-amber-900">{p.note}</p>}
                <p className="mt-1 text-xs text-slate-400">{ago(p.createdAt)}</p>
              </div>
            ))}
          </>
        )}

        {tab === "accounts" && <Accounts token={saved.token} onLost={lostSession} onGranted={load} />}
      </main>

      <nav className="fixed inset-x-0 bottom-0 z-10 grid grid-cols-3 border-t border-slate-200 bg-white" style={{ paddingBottom: "env(safe-area-inset-bottom)" }}>
        {(
          [
            ["verify", "To verify", pending],
            ["payments", "Payments", 0],
            ["accounts", "Accounts", 0],
          ] as [Tab, string, number][]
        ).map(([id, label, n]) => (
          <button key={id} onClick={() => setTab(id)} className={`relative py-3.5 text-[14px] font-bold ${tab === id ? "text-[#0b8f4d]" : "text-slate-500"}`}>
            {label}
            {n > 0 && <span className="ml-1.5 rounded-full bg-red-600 px-1.5 py-0.5 text-[11px] text-white">{n}</span>}
            {tab === id && <span className="absolute inset-x-6 top-0 h-0.5 bg-[#0b8f4d]" />}
          </button>
        ))}
      </nav>
    </div>
  );
}

function ClaimCard({ claim: c, token, focus, onChanged, onLost }: { claim: ClaimView; token: string; focus: boolean; onChanged: () => Promise<void>; onLost: (e: unknown) => boolean }) {
  const [mode, setMode] = useState<"idle" | "grant" | "reject">("idle");
  const [months, setMonths] = useState(c.interval === "annual" ? 12 : 1);
  const [amount, setAmount] = useState(String(c.declaredUsd ?? c.expectedUsd ?? ""));
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const short = c.declaredUsd !== null && c.expectedUsd !== null && c.declaredUsd + 0.005 < c.expectedUsd;

  useEffect(() => {
    if (focus) ref.current?.scrollIntoView({ block: "center" });
  }, [focus]);

  async function grant() {
    const paid = Number(amount);
    if (!(paid > 0)) {
      toast.error("Enter the amount that actually arrived.");
      return;
    }
    setBusy(true);
    try {
      const r = await ownerApi.approve(token, c.id, months, paid);
      toast.success(`${c.workspace} is now on ${c.planName}`, { description: r.receiptSent ? `Receipt emailed to ${r.ownerEmail}.` : "Access granted." });
      await onChanged();
    } catch (err) {
      if (!onLost(err)) toast.error(err instanceof Error ? err.message : "Couldn't grant access.");
    } finally {
      setBusy(false);
    }
  }

  async function reject() {
    setBusy(true);
    try {
      await ownerApi.reject(token, c.id, reason);
      toast.success("Turned down. The customer has been emailed why.");
      await onChanged();
    } catch (err) {
      if (!onLost(err)) toast.error(err instanceof Error ? err.message : "Couldn't send that.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div ref={ref} className={`rounded-xl bg-white p-4 ${focus ? "ring-2 ring-[#0b8f4d]" : ""}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-[17px] font-extrabold">{c.workspace}</p>
          <p className="truncate text-sm text-slate-500">{c.ownerEmail ?? c.slug}</p>
        </div>
        <span
          className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-bold ${
            c.status === "pending" ? "bg-amber-100 text-amber-900" : c.status === "approved" ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"
          }`}
        >
          {c.status === "pending" ? "To verify" : c.status === "approved" ? "Granted" : "Turned down"}
        </span>
      </div>

      <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-[14px]">
        <dt className="text-slate-500">Wants</dt>
        <dd className="font-semibold">
          {c.planName} · {c.seats} seat{c.seats === 1 ? "" : "s"} · {c.interval}
        </dd>
        <dt className="text-slate-500">Now on</dt>
        <dd className="capitalize">{c.currentPlan}</dd>
        <dt className="text-slate-500">Paid by</dt>
        <dd>{c.methodLabel}</dd>
        <dt className="text-slate-500">Price</dt>
        <dd className="font-semibold">{money(c.expectedUsd)}</dd>
        {c.declaredUsd !== null && (
          <>
            <dt className="text-slate-500">Cards total</dt>
            <dd className={`font-bold ${short ? "text-red-700" : "text-green-700"}`}>
              {money(c.declaredUsd)}
              {short ? ` (short by ${money((c.expectedUsd ?? 0) - c.declaredUsd)})` : ""}
            </dd>
          </>
        )}
        {c.reference && (
          <>
            <dt className="text-slate-500">Reference</dt>
            <dd className="break-all font-mono text-[13px]">{c.reference}</dd>
          </>
        )}
      </dl>

      {c.receipts.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {c.receipts.map((r) => (
            <a key={r.path} href={r.path} target="_blank" rel="noopener noreferrer" className="block w-[30%] min-w-[92px] flex-1 overflow-hidden rounded-lg border border-slate-200 text-center">
              {r.type.startsWith("image/") ? <img src={r.path} alt="Payment proof" loading="lazy" className="h-24 w-full object-cover" /> : <div className="flex h-24 items-center justify-center bg-slate-50 text-sm font-bold">PDF</div>}
              <span className="flex items-center justify-center gap-1 py-1 text-[13px] font-bold">
                {r.amountUsd !== null ? money(r.amountUsd) : "Open"} <ExternalLink className="size-3" />
              </span>
            </a>
          ))}
        </div>
      )}

      {c.note && c.status === "rejected" && <p className="mt-3 rounded-lg bg-red-50 p-3 text-sm text-red-900">Reason sent: {c.note}</p>}

      {c.status === "pending" && mode === "idle" && (
        <div className="mt-4 grid grid-cols-[2fr_1fr] gap-2">
          <button className={`${btn} bg-[#0b8f4d] text-white`} onClick={() => setMode("grant")}>
            <CheckCircle2 className="size-5" /> Grant {c.planName}
          </button>
          <button className={`${btn} border border-slate-300 bg-white text-slate-800`} onClick={() => setMode("reject")}>
            <XCircle className="size-5" /> No
          </button>
        </div>
      )}

      {mode === "grant" && (
        <div className="mt-4 flex flex-col gap-3 rounded-lg bg-slate-50 p-3">
          <p className="text-sm font-semibold">Confirm only after you have seen the money or checked the cards.</p>
          <label className="text-sm font-semibold">
            Amount that arrived (USD)
            <input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} className={`${field} mt-1`} />
          </label>
          <label className="text-sm font-semibold">
            Paid for (months)
            <input inputMode="numeric" value={months} onChange={(e) => setMonths(Math.max(1, Math.min(60, Number(e.target.value.replace(/\D/g, "")) || 1)))} className={`${field} mt-1`} />
          </label>
          <div className="grid grid-cols-2 gap-2">
            <button className={`${btn} bg-[#0b8f4d] text-white`} disabled={busy} onClick={() => void grant()}>
              {busy ? <Loader2 className="size-4 animate-spin" /> : null} Grant access
            </button>
            <button className={`${btn} border border-slate-300 bg-white`} onClick={() => setMode("idle")}>
              Cancel
            </button>
          </div>
          <p className="text-xs text-slate-500">The customer gets a receipt by email and the plan switches on at once.</p>
        </div>
      )}

      {mode === "reject" && (
        <div className="mt-4 flex flex-col gap-3 rounded-lg bg-slate-50 p-3">
          <label className="text-sm font-semibold">
            Tell the customer what's wrong
            <textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="For example: the card was already redeemed, or the amount is short." className={`${field} mt-1 h-auto py-2`} />
          </label>
          <div className="grid grid-cols-2 gap-2">
            <button className={`${btn} bg-red-700 text-white`} disabled={busy} onClick={() => void reject()}>
              {busy ? <Loader2 className="size-4 animate-spin" /> : null} Send and turn down
            </button>
            <button className={`${btn} border border-slate-300 bg-white`} onClick={() => setMode("idle")}>
              Cancel
            </button>
          </div>
        </div>
      )}
      <p className="mt-3 text-xs text-slate-400">{ago(c.createdAt)}{c.ticketRef ? ` · ${c.ticketRef}` : ""}</p>
    </div>
  );
}

const PLAN_OPTIONS = [
  ["starter", "Starter"],
  ["professional", "Professional"],
  ["business", "Business"],
  ["managed", "Managed Enterprise"],
];

function Accounts({ token, onLost, onGranted }: { token: string; onLost: (e: unknown) => boolean; onGranted: () => Promise<void> }) {
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<Awaited<ReturnType<typeof ownerApi.find>>["accounts"]>([]);
  const [open, setOpen] = useState<string | null>(null);
  const [plan, setPlan] = useState("starter");
  const [months, setMonths] = useState(1);
  const [method, setMethod] = useState("crypto");
  const [amount, setAmount] = useState("");
  const [reference, setReference] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const t = window.setTimeout(() => {
      if (q.trim().length < 2) return setRows([]);
      ownerApi
        .find(token, q)
        .then((r) => setRows(r.accounts))
        .catch((err) => void onLost(err));
    }, 300);
    return () => window.clearTimeout(t);
  }, [q, token, onLost]);

  async function grant(id: string, name: string) {
    const paid = Number(amount);
    if (!(paid > 0)) {
      toast.error("Enter the amount they paid.");
      return;
    }
    setBusy(true);
    try {
      const r = await ownerApi.grant(token, id, plan, months, method, paid, reference.trim() || undefined);
      toast.success(`${name} is now on ${plan}`, { description: r.receiptSent ? `Receipt emailed to ${r.ownerEmail}.` : "Access granted." });
      setOpen(null);
      setAmount("");
      setReference("");
      await onGranted();
    } catch (err) {
      if (!onLost(err)) toast.error(err instanceof Error ? err.message : "Couldn't grant access.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-5 -translate-y-1/2 text-slate-400" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Company, workspace or email" className={`${field} pl-10`} />
      </div>
      {q.trim().length >= 2 && rows.length === 0 && <p className="py-6 text-center text-slate-500">No account found.</p>}
      {rows.map((a) => (
        <div key={a.id} className="rounded-xl bg-white p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate font-bold">{a.name}</p>
              <p className="truncate text-sm text-slate-500">{a.ownerEmail ?? a.slug}</p>
              <p className="text-sm capitalize text-slate-600">
                {a.plan}
                {a.status !== "active" ? ` · ${a.status}` : ""}
              </p>
            </div>
            <button className={`${btn} h-10 border border-slate-300 bg-white`} onClick={() => setOpen(open === a.id ? null : a.id)}>
              Grant plan
            </button>
          </div>
          {open === a.id && (
            <div className="mt-3 flex flex-col gap-3 rounded-lg bg-slate-50 p-3">
              <select value={plan} onChange={(e) => setPlan(e.target.value)} className={field} aria-label="Plan">
                {PLAN_OPTIONS.map(([id, label]) => (
                  <option key={id} value={id}>
                    {label}
                  </option>
                ))}
              </select>
              <select value={method} onChange={(e) => setMethod(e.target.value)} className={field} aria-label="How they paid">
                <option value="crypto">Crypto</option>
                <option value="giftcard">Apple gift card (USA)</option>
                <option value="bank">Bank transfer</option>
                <option value="card">Card or bank (Flutterwave)</option>
                <option value="other">Other</option>
              </select>
              <input inputMode="decimal" placeholder="Amount paid, USD" value={amount} onChange={(e) => setAmount(e.target.value)} className={field} />
              <input placeholder="Transaction ID or reference (optional)" value={reference} onChange={(e) => setReference(e.target.value)} className={field} />
              <label className="text-sm font-semibold">
                Paid for (months)
                <input inputMode="numeric" value={months} onChange={(e) => setMonths(Math.max(1, Math.min(60, Number(e.target.value.replace(/\D/g, "")) || 1)))} className={`${field} mt-1`} />
              </label>
              <button className={`${btn} bg-[#0b8f4d] text-white`} disabled={busy} onClick={() => void grant(a.id, a.name)}>
                {busy ? <Loader2 className="size-4 animate-spin" /> : null} Grant access and send receipt
              </button>
            </div>
          )}
        </div>
      ))}
    </>
  );
}
