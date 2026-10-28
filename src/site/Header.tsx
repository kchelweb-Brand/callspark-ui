import { useRouterState } from "@tanstack/react-router";
import { ChevronDown, Menu, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { Logo } from "@/components/brand/Logo";

import { CtaLink, SLink, TextLink } from "./blocks";
import { GUIDES, PRODUCTS, SOLUTIONS } from "./content";

type MenuKey = "product" | "solutions" | "resources" | "company";

const TOP: { key: MenuKey; label: string }[] = [
  { key: "product", label: "Product" },
  { key: "solutions", label: "Solutions" },
  { key: "resources", label: "Resources" },
  { key: "company", label: "Company" },
];

const COMPANY = [
  { label: "About Kchel", to: "/about", blurb: "What we are building, and why." },
  { label: "Security", to: "/security", blurb: "How sign-in, permissions and data are protected." },
  { label: "Contact us", to: "/contact", blurb: "Talk to a person about your team." },
  { label: "Windows app", to: "/download", blurb: "The desktop softphone." },
];

function MenuItem({ to, title, blurb }: { to: string; title: string; blurb: string }) {
  return (
    <SLink to={to} className="group block rounded-lg px-3 py-3 hover:bg-mist">
      <span className="block text-[15px] font-bold text-ink group-hover:text-leaf">{title}</span>
      <span className="mt-0.5 block text-[13.5px] leading-snug text-slate">{blurb}</span>
    </SLink>
  );
}

function Feature({ eyebrow, title, body, to, cta }: { eyebrow: string; title: string; body: string; to: string; cta: string }) {
  return (
    <div className="rounded-xl bg-mist p-6">
      <p className="text-[12px] font-bold tracking-[0.12em] text-leaf uppercase">{eyebrow}</p>
      <p className="mt-2 text-xl leading-snug font-extrabold tracking-tight">{title}</p>
      <p className="mt-2 text-[14.5px] leading-relaxed text-slate">{body}</p>
      <div className="mt-4">
        <TextLink to={to}>{cta}</TextLink>
      </div>
    </div>
  );
}

function Panel({ which }: { which: MenuKey }) {
  if (which === "product") {
    return (
      <div className="grid gap-8 lg:grid-cols-[1fr_20rem]">
        <div>
          <p className="px-3 text-[12px] font-bold tracking-[0.12em] text-slate uppercase">Everything in one workspace</p>
          <div className="mt-2 grid gap-x-4 sm:grid-cols-2">
            {PRODUCTS.map((p) => (
              <MenuItem key={p.slug} to={`/product/${p.slug}`} title={p.name} blurb={p.short} />
            ))}
          </div>
        </div>
        <Feature
          eyebrow="Featured"
          title="An AI agent that works your list"
          body="It dials, speaks first, handles voicemail and tags how every call went."
          to="/product/ai-voice-agent"
          cta="See the AI voice agent"
        />
      </div>
    );
  }
  if (which === "solutions") {
    return (
      <div className="grid gap-8 lg:grid-cols-[1fr_20rem]">
        <div>
          <p className="px-3 text-[12px] font-bold tracking-[0.12em] text-slate uppercase">Built around how you work</p>
          <div className="mt-2 grid gap-x-4 sm:grid-cols-2">
            {SOLUTIONS.map((s) => (
              <MenuItem key={s.slug} to={`/solutions/${s.slug}`} title={s.name} blurb={s.short} />
            ))}
          </div>
        </div>
        <Feature
          eyebrow="Plans"
          title="Per agent, or one flat price"
          body="Start at $29 per agent, or give a team of eight one flat price with the AI receptionist included."
          to="/pricing"
          cta="Compare plans"
        />
      </div>
    );
  }
  if (which === "resources") {
    return (
      <div className="grid gap-8 lg:grid-cols-[1fr_20rem]">
        <div>
          <p className="px-3 text-[12px] font-bold tracking-[0.12em] text-slate uppercase">Guides</p>
          <div className="mt-2 grid gap-x-4 sm:grid-cols-2">
            {GUIDES.slice(0, 6).map((g) => (
              <MenuItem key={g.slug} to={`/resources/${g.slug}`} title={g.title} blurb={`${g.minutes} min · ${g.summary}`} />
            ))}
          </div>
        </div>
        <div className="space-y-4">
          <Feature
            eyebrow="Questions"
            title="Answers, in plain words"
            body="Setup, billing, calling and the AI features, answered."
            to="/faq"
            cta="Read the FAQ"
          />
          <p className="px-1 text-[14px] text-slate">
            Or <span className="font-bold text-ink">ask the help assistant</span>, the button in the corner of every page.
          </p>
        </div>
      </div>
    );
  }
  return (
    <div className="grid gap-x-4 sm:grid-cols-2 lg:max-w-3xl">
      {COMPANY.map((c) => (
        <MenuItem key={c.to} to={c.to} title={c.label} blurb={c.blurb} />
      ))}
    </div>
  );
}

export function SiteHeader() {
  const path = useRouterState({ select: (s) => s.location.pathname });
  const [open, setOpen] = useState<MenuKey | null>(null);
  const [mobile, setMobile] = useState(false);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setOpen(null);
    setMobile(false);
  }, [path]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(null);
        setMobile(false);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    document.body.style.overflow = mobile ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [mobile]);

  const cancelClose = () => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
  };
  const scheduleClose = () => {
    cancelClose();
    closeTimer.current = setTimeout(() => setOpen(null), 140);
  };

  return (
    <header className="sticky top-0 z-40 bg-white" onMouseLeave={scheduleClose} onMouseEnter={cancelClose}>
      <div className="bg-navy text-[13px] text-white/85">
        <div className="mx-auto flex h-9 w-full max-w-[1200px] items-center justify-between px-5 sm:px-8">
          <p className="truncate">
            Free for 7 days. No card needed.{" "}
            <SLink to="/signup" className="font-bold text-white underline-offset-2 hover:underline">
              Start now
            </SLink>
          </p>
          <div className="hidden items-center gap-5 sm:flex">
            <SLink to="/faq" className="hover:text-white">
              Help
            </SLink>
            <SLink to="/contact" className="hover:text-white">
              Contact us
            </SLink>
          </div>
        </div>
      </div>

      <div className="border-b border-rule">
        <div className="mx-auto flex h-[72px] w-full max-w-[1200px] items-center justify-between px-5 sm:px-8">
          <div className="flex items-center gap-10">
            <SLink to="/" className="flex items-center" aria-label="Kchel Dialer home">
              <Logo markClassName="size-9" className="text-[1.15rem] [&_span]:!text-ink" />
            </SLink>
            <nav className="hidden items-center gap-1 lg:flex" aria-label="Main">
              {TOP.slice(0, 2).map((t) => (
                <NavButton key={t.key} t={t} open={open} setOpen={setOpen} cancelClose={cancelClose} />
              ))}
              <SLink to="/pricing" className="rounded-md px-3.5 py-2 text-[15px] font-semibold text-ink hover:bg-mist">
                Pricing
              </SLink>
              {TOP.slice(2).map((t) => (
                <NavButton key={t.key} t={t} open={open} setOpen={setOpen} cancelClose={cancelClose} />
              ))}
            </nav>
          </div>

          <div className="hidden items-center gap-3 lg:flex">
            <SLink to="/login" className="px-3 py-2 text-[15px] font-semibold text-ink hover:text-leaf">
              Sign in
            </SLink>
            <CtaLink to="/signup" className="h-11">
              Start free trial
            </CtaLink>
          </div>

          <button
            type="button"
            className="flex size-11 items-center justify-center rounded-md hover:bg-mist lg:hidden"
            aria-label={mobile ? "Close menu" : "Open menu"}
            aria-expanded={mobile}
            onClick={() => setMobile((m) => !m)}
          >
            {mobile ? <X className="size-6" /> : <Menu className="size-6" />}
          </button>
        </div>
      </div>

      {open && (
        <div className="absolute inset-x-0 top-full hidden border-b border-rule bg-white shadow-[0_28px_40px_-24px_rgba(10,37,64,0.28)] lg:block" onMouseEnter={cancelClose}>
          <div className="mx-auto w-full max-w-[1200px] px-8 py-8">
            <Panel which={open} />
          </div>
        </div>
      )}

      {mobile && (
        <div className="fixed inset-x-0 top-[108px] bottom-0 overflow-y-auto bg-white px-5 pt-2 pb-10 lg:hidden">
          {TOP.map((t) => (
            <details key={t.key} className="border-b border-rule py-1">
              <summary className="flex cursor-pointer list-none items-center justify-between py-3.5 text-[17px] font-bold [&::-webkit-details-marker]:hidden">
                {t.label}
                <ChevronDown className="size-5 text-slate" />
              </summary>
              <div className="pb-3">
                <MobileLinks which={t.key} />
              </div>
            </details>
          ))}
          <SLink to="/pricing" className="block border-b border-rule py-4.5 text-[17px] font-bold">
            Pricing
          </SLink>
          <div className="mt-6 grid gap-3">
            <CtaLink to="/signup">Start free trial</CtaLink>
            <CtaLink to="/login" kind="secondary">
              Sign in
            </CtaLink>
          </div>
        </div>
      )}
    </header>
  );
}

function NavButton({
  t,
  open,
  setOpen,
  cancelClose,
}: {
  t: { key: MenuKey; label: string };
  open: MenuKey | null;
  setOpen: (k: MenuKey | null) => void;
  cancelClose: () => void;
}) {
  const active = open === t.key;
  return (
    <button
      type="button"
      aria-expanded={active}
      aria-haspopup="true"
      onMouseEnter={() => {
        cancelClose();
        setOpen(t.key);
      }}
      onClick={() => setOpen(active ? null : t.key)}
      className={`flex items-center gap-1 rounded-md px-3.5 py-2 text-[15px] font-semibold ${active ? "bg-mist text-leaf" : "text-ink hover:bg-mist"}`}
    >
      {t.label}
      <ChevronDown className={`size-4 transition-transform ${active ? "rotate-180" : ""}`} />
    </button>
  );
}

function MobileLinks({ which }: { which: MenuKey }) {
  const items: { label: string; to: string }[] =
    which === "product"
      ? [{ label: "All features", to: "/product" }, ...PRODUCTS.map((p) => ({ label: p.name, to: `/product/${p.slug}` }))]
      : which === "solutions"
        ? SOLUTIONS.map((s) => ({ label: s.name, to: `/solutions/${s.slug}` }))
        : which === "resources"
          ? [{ label: "All guides", to: "/resources" }, ...GUIDES.map((g) => ({ label: g.title, to: `/resources/${g.slug}` })), { label: "FAQ", to: "/faq" }]
          : COMPANY.map((c) => ({ label: c.label, to: c.to }));
  return (
    <ul>
      {items.map((i) => (
        <li key={i.to}>
          <SLink to={i.to} className="block rounded-md px-2 py-2.5 text-[15.5px] text-ink/85 hover:bg-mist">
            {i.label}
          </SLink>
        </li>
      ))}
    </ul>
  );
}
