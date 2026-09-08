import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  ArrowRight,
  AudioLines,
  BarChart3,
  Check,
  Clock,
  Headset,
  MessageSquare,
  PhoneCall,
  Radio,
  ShieldCheck,
  Voicemail,
  Workflow,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { listPlans } from "@/lib/billing-api";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Kchel Dialer — The phone system your sales floor actually dials with" },
      {
        name: "description",
        content:
          "A cloud dialer with IVR menus, call routing, business hours, voicemail and analytics. Bring your own SIP trunk or let us supply one. Free 14-day trial.",
      },
      { property: "og:title", content: "Kchel Dialer — Cloud dialer and phone system" },
      {
        property: "og:description",
        content:
          "IVR, call routing, a browser softphone and real analytics. Start free for 14 days.",
      },
    ],
  }),
  component: HomePage,
});

const FEATURES = [
  {
    icon: PhoneCall,
    title: "Browser softphone",
    body: "Your agents call from a tab. No handsets, no desktop installs — with hold, transfer, mute and a keypad that doubles as DTMF.",
  },
  {
    icon: Workflow,
    title: "IVR menus that answer",
    body: "Build a menu, record or type a greeting, and map each keypress to a person, a department or voicemail.",
  },
  {
    icon: Clock,
    title: "Business hours",
    body: "Open hours ring your team. After hours and holidays follow whatever fallback you choose, in your own timezone.",
  },
  {
    icon: Headset,
    title: "Smart call routing",
    body: "Ring your team in order. An agent who doesn't pick up falls through to the next one instead of dropping the caller.",
  },
  {
    icon: Voicemail,
    title: "Voicemail and recordings",
    body: "Missed calls leave a message. Answered calls can be recorded, and both land in one searchable place.",
  },
  {
    icon: BarChart3,
    title: "Analytics that mean something",
    body: "Connect rate, talk time, outcome breakdown and an agent leaderboard — from real calls, never sample data.",
  },
  {
    icon: MessageSquare,
    title: "SMS campaigns",
    body: "Follow up in writing from the same contact list your agents are dialling.",
  },
  {
    icon: AudioLines,
    title: "Campaigns and contacts",
    body: "Import a list, launch a campaign, and watch it work through the queue with live progress.",
  },
];

const STEPS = [
  {
    n: "01",
    title: "Create your workspace",
    body: "Sign up with an email address. No card, no sales call.",
  },
  {
    n: "02",
    title: "Connect your SIP trunk",
    body: "Bring credentials from a carrier you already pay, or ask us to supply one.",
  },
  {
    n: "03",
    title: "Start dialling",
    body: "Import contacts, build your IVR, and put your team on the phone the same day.",
  },
];

type Catalog = Awaited<ReturnType<typeof listPlans>>["plans"];

function HomePage() {
  const [plans, setPlans] = useState<Catalog>([]);

  // Pricing comes from the same catalog the app enforces limits from, so the
  // marketing page can never promise something the product won't honour.
  useEffect(() => {
    void listPlans()
      .then((r) => setPlans(r.plans))
      .catch(() => {
        // Non-fatal — the rest of the page is still worth showing.
      });
  }, []);

  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />

      {/* ---------- hero ---------- */}
      <section className="relative overflow-hidden bg-brand-black">
        {/* Brand wash: green and blue bleeding out of a black ground. */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-70"
          style={{
            background:
              "radial-gradient(60rem 32rem at 12% -10%, var(--color-brand-green) 0%, transparent 60%), radial-gradient(50rem 30rem at 90% 0%, var(--color-brand-blue) 0%, transparent 62%)",
          }}
        />
        <div className="relative mx-auto max-w-6xl px-6 py-24 sm:py-32">
          <div className="max-w-3xl">
            <span className="inline-flex items-center gap-2 rounded-full border border-brand-yellow/40 bg-brand-yellow/15 px-3 py-1 text-xs font-semibold text-brand-yellow">
              <span className="size-1.5 rounded-full bg-brand-yellow" />
              Free for 14 days — no card required
            </span>

            <h1 className="mt-6 text-4xl font-bold leading-[1.08] tracking-tight text-white sm:text-6xl">
              The phone system your sales floor{" "}
              <span className="text-brand-yellow">actually dials with</span>
            </h1>

            <p className="mt-6 max-w-2xl text-lg leading-relaxed text-white/75">
              IVR menus, call routing, business hours and voicemail — plus a real dialer your
              agents run from the browser. Bring your own SIP trunk and keep your carrier rates,
              or let us supply one.
            </p>

            <div className="mt-9 flex flex-wrap items-center gap-3">
              <Button size="lg" asChild className="h-12 px-7 text-base">
                <Link to="/signup">
                  Start free <ArrowRight className="size-4" />
                </Link>
              </Button>
              <Button
                size="lg"
                variant="outline"
                asChild
                className="h-12 border-white/25 bg-white/5 px-7 text-base text-white hover:bg-white/10 hover:text-white"
              >
                <a href="#pricing">See pricing</a>
              </Button>
            </div>

            <dl className="mt-14 grid max-w-2xl grid-cols-2 gap-x-8 gap-y-6 sm:grid-cols-4">
              {[
                ["14 days", "free trial"],
                ["Your carrier", "or ours"],
                ["Unlimited", "IVR menus"],
                ["No contract", "cancel anytime"],
              ].map(([big, small]) => (
                <div key={small}>
                  <dt className="text-xl font-bold text-white">{big}</dt>
                  <dd className="mt-0.5 text-sm text-white/60">{small}</dd>
                </div>
              ))}
            </dl>
          </div>
        </div>
      </section>

      {/* ---------- features ---------- */}
      <section id="features" className="mx-auto max-w-6xl px-6 py-24">
        <div className="max-w-2xl">
          <p className="text-sm font-bold uppercase tracking-[0.14em] text-primary">
            Everything included
          </p>
          <h2 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">
            A full phone system, not a dialer bolted onto a CRM
          </h2>
          <p className="mt-4 text-lg text-muted-foreground">
            Every plan gets the whole product. The difference between tiers is how many people and
            contacts you bring, not which features you unlock.
          </p>
        </div>

        <div className="mt-14 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {FEATURES.map(({ icon: Icon, title, body }, i) => {
            // Cycle the brand across the grid so no single colour dominates.
            const tone = [
              "bg-primary/12 text-primary",
              "bg-brand-blue/12 text-brand-blue",
              "bg-brand-yellow/20 text-warning-foreground",
              "bg-foreground/8 text-foreground",
            ][i % 4];
            return (
              <div key={title} className="card-surface p-6">
                <span className={`flex size-11 items-center justify-center rounded-xl ${tone}`}>
                  <Icon className="size-5" />
                </span>
                <h3 className="mt-5 font-semibold">{title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{body}</p>
              </div>
            );
          })}
        </div>
      </section>

      {/* ---------- how it works ---------- */}
      <section className="border-y border-border bg-secondary/50">
        <div className="mx-auto max-w-6xl px-6 py-20">
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">Live the same day</h2>
          <div className="mt-12 grid gap-8 md:grid-cols-3">
            {STEPS.map((s) => (
              <div key={s.n} className="relative">
                <span className="font-mono text-5xl font-bold text-primary/20">{s.n}</span>
                <h3 className="mt-3 text-lg font-semibold">{s.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{s.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ---------- pricing ---------- */}
      <section id="pricing" className="mx-auto max-w-6xl px-6 py-24">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-sm font-bold uppercase tracking-[0.14em] text-primary">Pricing</p>
          <h2 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">
            Priced per agent. Nothing hidden.
          </h2>
          <p className="mt-4 text-lg text-muted-foreground">
            On Starter and Professional you bring your own SIP trunk, so your call minutes stay on
            your carrier bill at your rates. We only charge for the dialer.
          </p>
        </div>

        <div className="mt-14 grid gap-6 lg:grid-cols-4">
          {plans.map((p) => {
            const featured = p.id === "professional";
            return (
              <div
                key={p.id}
                className={
                  featured
                    ? "relative rounded-xl border-2 border-primary bg-card p-6 shadow-lift"
                    : "card-surface p-6"
                }
              >
                {featured && (
                  <span className="absolute -top-3 left-6 rounded-full bg-primary px-3 py-1 text-[11px] font-bold uppercase tracking-wide text-primary-foreground">
                    Most popular
                  </span>
                )}
                <h3 className="font-semibold">{p.name}</h3>
                <p className="mt-1 min-h-10 text-sm text-muted-foreground">{p.blurb}</p>

                <p className="mt-5">
                  <span className="text-3xl font-bold tracking-tight">
                    {p.price === 0 ? "Free" : `$${p.price}`}
                  </span>
                  {p.price > 0 && (
                    <span className="text-sm text-muted-foreground"> /agent/month</span>
                  )}
                </p>

                <ul className="mt-6 flex flex-col gap-2.5 text-sm">
                  <PlanLine value={p.limits.agents} one="agent" many="agents" />
                  <PlanLine value={p.limits.contacts} one="contact" many="contacts" />
                  <PlanLine value={p.limits.ivrMenus} one="IVR menu" many="IVR menus" />
                  <PlanLine value={p.limits.phoneNumbers} one="phone number" many="phone numbers" />
                  <Line
                    on={p.limits.smsCampaigns === null || p.limits.smsCampaigns > 0}
                    text="SMS campaigns"
                  />
                  <Line
                    on={p.limits.recordingRetentionDays !== 0}
                    text={
                      p.limits.recordingRetentionDays === null
                        ? "Call recordings"
                        : p.limits.recordingRetentionDays === 0
                          ? "Call recordings"
                          : `${p.limits.recordingRetentionDays}-day recordings`
                    }
                  />
                  <Line on={p.managedSip} text="SIP trunk included" />
                </ul>

                <Button
                  className="mt-7 w-full"
                  variant={featured ? "default" : "outline"}
                  asChild
                >
                  <Link to="/signup">{p.price === 0 ? "Start free" : "Get started"}</Link>
                </Button>
              </div>
            );
          })}
          {plans.length === 0 && (
            <p className="col-span-full text-center text-sm text-muted-foreground">
              Loading plans…
            </p>
          )}
        </div>

        <p className="mt-8 text-center text-sm text-muted-foreground">
          Annual billing saves two months. Need more seats or a trunk from us?{" "}
          <Link to="/signup" className="font-semibold text-primary hover:underline">
            Get in touch
          </Link>
          .
        </p>
      </section>

      {/* ---------- closing CTA ---------- */}
      <section className="border-t border-border bg-brand-black">
        <div className="mx-auto flex max-w-6xl flex-col items-start gap-6 px-6 py-20 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-3xl font-bold tracking-tight text-white">
              Put your team on the phone today
            </h2>
            <p className="mt-3 max-w-xl text-white/70">
              Fourteen days free. Bring your own SIP trunk and you can be dialling within the hour.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Button size="lg" asChild className="h-12 px-7 text-base">
              <Link to="/signup">
                Create your workspace <ArrowRight className="size-4" />
              </Link>
            </Button>
            <Button
              size="lg"
              variant="outline"
              asChild
              className="h-12 border-white/25 bg-white/5 px-7 text-base text-white hover:bg-white/10 hover:text-white"
            >
              <Link to="/login">Sign in</Link>
            </Button>
          </div>
        </div>
      </section>

      <SiteFooter />
    </div>
  );
}

/** A limit rendered as a benefit — "Up to 25 agents", "Unlimited contacts". */
function PlanLine({
  value,
  one,
  many,
}: {
  value: number | null;
  one: string;
  many: string;
}) {
  const text =
    value === null
      ? `Unlimited ${many}`
      : `Up to ${value.toLocaleString()} ${value === 1 ? one : many}`;
  return <Line on text={text} />;
}

function Line({ on, text }: { on: boolean; text: string }) {
  return (
    <li className="flex items-start gap-2.5">
      <Check
        className={`mt-0.5 size-4 shrink-0 ${on ? "text-primary" : "text-muted-foreground/35"}`}
      />
      <span className={on ? "" : "text-muted-foreground/60 line-through"}>{text}</span>
    </li>
  );
}

function SiteHeader() {
  return (
    <header className="sticky top-0 z-50 border-b border-white/10 bg-brand-black/90 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
        <Link to="/" className="flex items-center gap-2.5">
          <span className="flex size-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Radio className="size-4.5" />
          </span>
          <span className="font-bold tracking-tight text-white">Kchel Dialer</span>
        </Link>

        <nav className="hidden items-center gap-8 md:flex">
          <a href="#features" className="text-sm font-medium text-white/70 hover:text-white">
            Features
          </a>
          <a href="#pricing" className="text-sm font-medium text-white/70 hover:text-white">
            Pricing
          </a>
        </nav>

        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            asChild
            className="text-white hover:bg-white/10 hover:text-white"
          >
            <Link to="/login">Sign in</Link>
          </Button>
          <Button asChild>
            <Link to="/signup">Start free</Link>
          </Button>
        </div>
      </div>
    </header>
  );
}

function SiteFooter() {
  return (
    <footer className="bg-brand-black">
      <div className="mx-auto flex max-w-6xl flex-col gap-6 border-t border-white/10 px-6 py-10 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2.5">
          <span className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Radio className="size-4" />
          </span>
          <span className="text-sm font-semibold text-white">Kchel Dialer</span>
        </div>

        <p className="flex items-center gap-2 text-xs text-white/50">
          <ShieldCheck className="size-3.5" />
          Credentials encrypted at rest · Every workspace isolated
        </p>

        <p className="text-xs text-white/50">
          © {new Date().getFullYear()} Kchel Dialer. All rights reserved.
        </p>
      </div>
    </footer>
  );
}
