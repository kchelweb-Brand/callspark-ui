import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState, type CSSProperties } from "react";
import {
  ArrowRight,
  AudioLines,
  BarChart3,
  Check,
  Clock,
  Download,
  Headset,
  MessageSquare,
  PhoneCall,
  ShieldCheck,
  Voicemail,
  Workflow,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { listPlans } from "@/lib/billing-api";
import { LogoMark } from "@/components/brand/Logo";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Kchel Dialer — The phone system your sales floor actually dials with" },
      {
        name: "description",
        content:
          "A cloud dialer with IVR menus, call routing, business hours, voicemail and analytics. Bring your own SIP trunk or let us supply one. Free 7-day trial.",
      },
      { property: "og:title", content: "Kchel Dialer — Cloud dialer and phone system" },
      {
        property: "og:description",
        content:
          "IVR, call routing, a browser softphone and real analytics. Start free for 7 days.",
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
    title: "Contacts your team dials",
    body: "Import a list in bulk, tag it, flag do-not-call, and dial straight from a contact record.",
  },
  {
    icon: AudioLines,
    title: "Call history you can search",
    body: "Every call logged against the contact it belongs to, with its outcome, duration and recording.",
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
      <section className="ks-ground">
        <div className="relative mx-auto grid max-w-6xl items-center gap-6 px-6 pb-10 pt-20 sm:pt-24 lg:grid-cols-[1.05fr_0.95fr]">
          <div>
            <span className="ks-rise inline-flex items-center gap-2 rounded-full border border-brand-yellow/40 bg-brand-yellow/15 px-3 py-1 text-xs font-semibold text-brand-yellow">
              <span className="size-1.5 rounded-full bg-brand-yellow" />
              Free for 7 days — no card required
            </span>

            <h1 className="ks-rise ks-rise-2 mt-6 text-4xl font-extrabold leading-[1.06] tracking-tight text-white sm:text-6xl">
              The phone system your sales floor <span className="ks-grad">actually dials with</span>
            </h1>

            <p className="ks-rise ks-rise-3 mt-6 max-w-xl text-lg leading-relaxed text-white/75">
              IVR menus, call routing, business hours and voicemail — plus a real dialer your agents
              run from the browser. Bring your own SIP trunk and keep your carrier rates, or let us
              supply one.
            </p>

            <div className="ks-rise ks-rise-4 mt-9 flex flex-wrap items-center gap-3">
              <Button size="lg" asChild className="ks-glow h-12 px-7 text-base">
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
          </div>

          {/* A dialer, floating over the signal rings. */}
          <div className="ks-stage ks-rise ks-rise-3 hidden lg:block" aria-hidden>
            <div className="ks-phone">
              <div className="ks-phone-status">
                <i /> Registered · Sales line
              </div>
              <div className="ks-phone-number">+1 866 787 9664</div>
              <div className="ks-keys">
                {[
                  ["1", ""],
                  ["2", "ABC"],
                  ["3", "DEF"],
                  ["4", "GHI"],
                  ["5", "JKL"],
                  ["6", "MNO"],
                  ["7", "PQRS"],
                  ["8", "TUV"],
                  ["9", "WXYZ"],
                  ["*", ""],
                  ["0", "+"],
                  ["#", ""],
                ].map(([d, l]) => (
                  <span key={d}>
                    {d}
                    <small>{l || " "}</small>
                  </span>
                ))}
              </div>
              <div className="ks-phone-call">
                <PhoneCall className="size-5" /> Call
              </div>
            </div>

            <div className="ks-float ks-f1">
              <span className="ico bg-brand-yellow text-black">
                <PhoneCall className="size-[18px]" />
              </span>
              <div>
                <strong>Incoming call</strong>
                <span className="sub">Sales line · ringing</span>
              </div>
            </div>

            <div className="ks-float ks-f2">
              <div>
                <strong>AI agent dialing</strong>
                <span className="sub">Spring outreach · 24 of 60 calls</span>
              </div>
              <div className="ks-bar">
                <i />
              </div>
            </div>

            <div className="ks-float ks-f3">
              <span className="ico bg-brand-green text-white">
                <BarChart3 className="size-[18px]" />
              </span>
              <div>
                <strong>68% connect rate</strong>
                <span className="sub">Up 12% this week</span>
              </div>
            </div>
          </div>
        </div>

        <div className="relative mx-auto max-w-6xl px-6 pb-16">
          <dl className="ks-stats ks-rise ks-rise-4 grid grid-cols-2 gap-x-8 gap-y-6 p-6 sm:grid-cols-4 sm:px-8">
            {[
              ["7 days", "free trial"],
              ["Your carrier", "or ours"],
              ["Up to 10", "IVR menus"],
              ["No contract", "cancel anytime"],
            ].map(([big, small]) => (
              <div key={small}>
                <dt className="text-xl font-extrabold text-white">{big}</dt>
                <dd className="mt-0.5 text-sm text-white/60">{small}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      {/* ---------- features ---------- */}
      <section id="features" className="ks-night">
        <div className="mx-auto max-w-6xl px-6 py-24">
          <div className="max-w-2xl">
            <p className="ks-eyebrow">Everything included</p>
            <h2 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">
              A full phone system, not a dialer bolted onto a CRM
            </h2>
            <p className="mt-4 text-lg text-muted-foreground">
              Every plan gets the calling, menus, routing and reporting. Tiers differ by how many
              people and contacts you bring — and, at the top, by who runs the carrier for you.
            </p>
          </div>

          <div className="mt-14 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {FEATURES.map(({ icon: Icon, title, body }, i) => {
              // Cycle the brand across the grid so no single colour dominates.
              const tone = ["var(--g)", "var(--b)", "var(--y)", "var(--ink-2)"][i % 4];
              return (
                <div key={title} className="ks-card" style={{ "--tone": tone } as CSSProperties}>
                  <span className={`ks-icon ${i % 4 === 2 ? "!text-black" : ""}`}>
                    <Icon className="size-5" />
                  </span>
                  <h3 className="relative mt-5 font-bold">{title}</h3>
                  <p className="relative mt-2 text-sm leading-relaxed text-muted-foreground">
                    {body}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ---------- how it works ---------- */}
      <section className="ks-steps border-y border-border">
        <div className="mx-auto max-w-6xl px-6 py-20">
          <p className="ks-eyebrow">How it works</p>
          <h2 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">Live the same day</h2>
          <div className="mt-12 grid gap-10 md:grid-cols-3">
            {STEPS.map((s, i) => (
              <div key={s.n} className="ks-step relative">
                <span
                  className="ks-step-n"
                  style={{ "--tone": ["var(--g)", "var(--b)", "#b8940a"][i] } as CSSProperties}
                >
                  {s.n}
                </span>
                <h3 className="mt-5 text-lg font-bold">{s.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{s.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ---------- pricing ---------- */}
      <section id="pricing" className="ks-tint">
        <div className="mx-auto max-w-6xl px-6 py-24">
          <div className="mx-auto max-w-2xl text-center">
            <p className="ks-eyebrow">Pricing</p>
            <h2 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">
              Per agent as you grow. Flat once you scale.
            </h2>
            <p className="mt-4 text-lg text-muted-foreground">
              On Starter and Professional you bring your own SIP trunk, so your call minutes stay on
              your carrier bill at your rates. On Managed Enterprise we supply the trunk, run the
              carrier relationship, and charge one flat fee however large your team gets.
            </p>
          </div>

          <div className="mt-14 grid gap-6 lg:grid-cols-4">
            {plans.map((p) => {
              const featured = p.id === "professional";
              return (
                <div
                  key={p.id}
                  className={featured ? "ks-featured p-6" : "card-surface rounded-2xl p-6"}
                >
                  {featured && (
                    <span className="ks-glow absolute -top-3 left-6 rounded-full bg-primary px-3 py-1 text-[11px] font-bold uppercase tracking-wide text-primary-foreground">
                      Most popular
                    </span>
                  )}
                  <h3 className="font-semibold">{p.name}</h3>
                  <p className="mt-1 min-h-10 text-sm text-muted-foreground">{p.blurb}</p>

                  <p className="mt-5">
                    <span className="text-3xl font-bold tracking-tight">
                      {p.priceFlatMonthly !== null
                        ? `$${p.priceFlatMonthly.toLocaleString()}`
                        : p.price === 0
                          ? "Free"
                          : `$${p.price}`}
                    </span>
                    {p.priceFlatMonthly !== null ? (
                      <span className="text-sm text-muted-foreground"> /month, any team size</span>
                    ) : (
                      p.price > 0 && (
                        <span className="text-sm text-muted-foreground"> /agent/month</span>
                      )
                    )}
                  </p>

                  <ul className="mt-6 flex flex-col gap-2.5 text-sm">
                    <PlanLine value={p.limits.agents} one="agent" many="agents" />
                    <PlanLine value={p.limits.contacts} one="contact" many="contacts" />
                    <PlanLine value={p.limits.ivrMenus} one="IVR menu" many="IVR menus" />
                    <PlanLine
                      value={p.limits.phoneNumbers}
                      one="phone number"
                      many="phone numbers"
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
                    {/* The flat-priced tier is quoted, not self-serve, so it must
                      not inherit the trial's "Start free" from a zero seat price. */}
                    <Link to="/signup">
                      {p.priceFlatMonthly !== null
                        ? "Talk to us"
                        : p.price === 0
                          ? "Start free"
                          : "Get started"}
                    </Link>
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
        </div>
      </section>

      {/* ---------- desktop app ---------- */}
      <section className="ks-tint border-t border-border py-20">
        <div className="mx-auto grid max-w-6xl items-center gap-10 px-6 md:grid-cols-2">
          <div>
            <p className="ks-eyebrow">Desktop app</p>
            <h2 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">
              Kchel Dialer, off to the side of your browser
            </h2>
            <p className="mt-4 text-lg text-muted-foreground">
              A real Windows app with a native SIP/RTP calling engine — its own window, its own
              taskbar entry, no browser in the way. Closing it keeps you reachable in the tray
              instead of hanging up on a caller.
            </p>
            <ul className="mt-6 flex flex-col gap-2.5 text-sm">
              <li className="flex items-start gap-2.5">
                <Check className="mt-0.5 size-4 shrink-0 text-primary" />
                <span>Native calling engine — no WebRTC, no browser limitations</span>
              </li>
              <li className="flex items-start gap-2.5">
                <Check className="mt-0.5 size-4 shrink-0 text-primary" />
                <span>Stays reachable in the tray when the window is closed</span>
              </li>
              <li className="flex items-start gap-2.5">
                <Check className="mt-0.5 size-4 shrink-0 text-primary" />
                <span>Same account, same workspace — sign in once</span>
              </li>
            </ul>
            <div className="mt-8 flex flex-wrap items-center gap-4">
              <Button size="lg" asChild className="h-12 px-7 text-base">
                <Link to="/signup">
                  <Download className="size-4" /> Add it to your workspace — $500
                </Link>
              </Button>
              <span className="text-xs text-muted-foreground">
                One-time add-on · request it from Billing once signed in · Windows 10/11
              </span>
            </div>
          </div>
          <div className="ks-win" aria-hidden>
            <div className="ks-win-bar">
              <i className="bg-[#ff6159]" />
              <i className="bg-[#ffbd2e]" />
              <i className="bg-[#28c840]" />
              <span className="ml-2">Kchel Dialer</span>
            </div>
            <div className="ks-win-body">
              <div className="ks-win-side">
                <b />
                <b />
                <b />
                <b />
              </div>
              <div className="ks-win-main">
                <div className="ks-win-card">
                  <div className="num">+1 866 787 9664</div>
                  <div className="k">
                    {Array.from({ length: 12 }).map((_, i) => (
                      <i key={i} />
                    ))}
                  </div>
                  <div className="go" />
                </div>
                <div className="ks-win-list">
                  {["var(--g)", "var(--b)", "var(--y)", "var(--g)", "var(--b)"].map((c, i) => (
                    <div key={i} className="ks-win-row">
                      <i style={{ background: c }} />
                      <u />
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="mx-auto mt-10 flex max-w-6xl flex-wrap items-center justify-between gap-4 rounded-xl border border-dashed border-border px-6 py-5">
          <div>
            <p className="text-sm font-semibold">Just want a taskbar shortcut? That's free.</p>
            <p className="text-sm text-muted-foreground">
              Kchel Desktop is the plain website in its own window — same features, no native
              calling engine, no charge.
            </p>
          </div>
          <Button variant="outline" asChild>
            <a href="/dl/downloads/Kchel-Desktop-Setup-1.0.0.exe">
              <Download className="size-4" /> Download Kchel Desktop — free
            </a>
          </Button>
        </div>
      </section>

      {/* ---------- closing CTA ---------- */}
      <section className="ks-ground">
        <div className="relative mx-auto flex max-w-6xl flex-col items-start gap-6 px-6 py-24 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-3xl font-extrabold tracking-tight text-white sm:text-4xl">
              Put your team on the phone <span className="ks-grad">today</span>
            </h2>
            <p className="mt-3 max-w-xl text-white/70">
              Fourteen days free. Bring your own SIP trunk and you can be dialling within the hour.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Button size="lg" asChild className="ks-glow h-12 px-7 text-base">
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
function PlanLine({ value, one, many }: { value: number | null; one: string; many: string }) {
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
    <header className="ks-header">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
        <Link to="/" className="flex items-center gap-2.5">
          <LogoMark className="size-9" />
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
          <Button variant="ghost" asChild className="text-white hover:bg-white/10 hover:text-white">
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
    <footer className="ks-foot">
      <div className="mx-auto flex max-w-6xl flex-col gap-6 border-t border-white/10 px-6 py-10 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2.5">
          <LogoMark className="size-8" />
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
