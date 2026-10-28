import { createFileRoute } from "@tanstack/react-router";
import { CircleCheck, Loader2 } from "lucide-react";
import { useState } from "react";

import { Container, SLink, TextPageHead } from "@/site/blocks";
import { SiteLayout } from "@/site/Layout";
import { sendContact } from "@/lib/contact-api";

export const Route = createFileRoute("/contact")({
  head: () => ({
    meta: [
      { title: "Contact us — Kchel Dialer" },
      { name: "description", content: "Talk to a person about your team, a plan, or a problem. Send a message and we will reply by email." },
    ],
  }),
  component: ContactPage,
});

const SIZES = ["Just me", "2–5", "6–20", "21–100", "More than 100"];

const field = "mt-2 w-full rounded-md border border-ink/25 bg-white px-3.5 py-3 text-[16px] text-ink outline-none placeholder:text-ink/40 focus:border-leaf focus:ring-2 focus:ring-leaf/25";

function ContactPage() {
  const [form, setForm] = useState({ name: "", email: "", company: "", teamSize: "", message: "", website: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  const set = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await sendContact({
        name: form.name,
        email: form.email,
        message: form.message,
        website: form.website,
        ...(form.company ? { company: form.company } : {}),
        ...(form.teamSize ? { teamSize: form.teamSize } : {}),
      });
      setSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "That didn't send. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <SiteLayout>
      <TextPageHead
        trail={[{ label: "Home", to: "/" }, { label: "Contact" }]}
        title="Talk to a person."
        lede="Tell us about your team and what you want your phones to do. We reply by email, usually within one working day."
      />
      <Container className="grid gap-14 py-14 lg:grid-cols-[1.25fr_1fr] lg:py-20">
        {sent ? (
          <div className="rounded-2xl border border-rule bg-mist p-10">
            <CircleCheck className="size-10 text-leaf" />
            <h2 className="mt-4 text-[1.6rem] font-extrabold tracking-tight">Thanks, we have it.</h2>
            <p className="mt-2 max-w-lg text-[17px] leading-relaxed text-slate">
              We will reply to {form.email}. In the meantime you can try the product: the trial is free for seven days.
            </p>
            <SLink to="/signup" className="mt-6 inline-flex h-12 items-center rounded-md bg-leaf px-6 text-[15px] font-bold text-white hover:bg-leaf-dark">
              Start free trial
            </SLink>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-6" noValidate>
            <div className="grid gap-6 sm:grid-cols-2">
              <label className="block text-[15px] font-bold">
                Your name
                <input className={field} value={form.name} onChange={(e) => set("name", e.target.value)} autoComplete="name" required />
              </label>
              <label className="block text-[15px] font-bold">
                Work email
                <input className={field} type="email" value={form.email} onChange={(e) => set("email", e.target.value)} autoComplete="email" required />
              </label>
              <label className="block text-[15px] font-bold">
                Company <span className="font-normal text-slate">(optional)</span>
                <input className={field} value={form.company} onChange={(e) => set("company", e.target.value)} autoComplete="organization" />
              </label>
              <label className="block text-[15px] font-bold">
                Team size <span className="font-normal text-slate">(optional)</span>
                <select className={field} value={form.teamSize} onChange={(e) => set("teamSize", e.target.value)}>
                  <option value="">Choose…</option>
                  {SIZES.map((s) => (
                    <option key={s}>{s}</option>
                  ))}
                </select>
              </label>
            </div>
            <label className="block text-[15px] font-bold">
              How can we help?
              <textarea className={`${field} min-h-40 resize-y`} value={form.message} onChange={(e) => set("message", e.target.value)} maxLength={4000} required />
            </label>

            {/* A trap for form-stuffing bots: invisible to people, tempting to scripts. */}
            <div className="absolute -left-[9999px]" aria-hidden>
              <label>
                Website
                <input tabIndex={-1} autoComplete="off" value={form.website} onChange={(e) => set("website", e.target.value)} />
              </label>
            </div>

            {error && (
              <p role="alert" className="rounded-md border border-red-300 bg-red-50 px-4 py-3 text-[15px] text-red-800">
                {error}
              </p>
            )}
            <button
              type="submit"
              disabled={busy}
              className="inline-flex h-12 items-center gap-2 rounded-md bg-leaf px-7 text-[15px] font-bold text-white hover:bg-leaf-dark disabled:opacity-60"
            >
              {busy && <Loader2 className="size-4 animate-spin" />}
              Send message
            </button>
          </form>
        )}

        <aside className="space-y-8">
          <div>
            <h2 className="text-[1.2rem] font-extrabold tracking-tight">Already a customer?</h2>
            <p className="mt-2 text-[16px] leading-relaxed text-slate">
              Sign in and open <span className="font-bold text-ink">Support</span> to message the team inside your workspace, where we can see your plan and setup.
            </p>
            <SLink to="/login" className="mt-3 inline-block text-[15px] font-bold text-leaf hover:underline">
              Sign in
            </SLink>
          </div>
          <div className="border-t border-rule pt-8">
            <h2 className="text-[1.2rem] font-extrabold tracking-tight">Need a quick answer?</h2>
            <p className="mt-2 text-[16px] leading-relaxed text-slate">
              Ask the help assistant, the button in the corner of this page, or read the{" "}
              <SLink to="/faq" className="font-bold text-leaf hover:underline">
                FAQ
              </SLink>
              .
            </p>
          </div>
        </aside>
      </Container>
    </SiteLayout>
  );
}
