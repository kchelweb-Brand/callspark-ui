import { Link } from "@tanstack/react-router";
import { ArrowRight, Check, Plus } from "lucide-react";
import type { ReactNode } from "react";

import type { Block, Faq } from "./content";
import { Visual } from "./mocks";

/** A link that takes plain path strings, so page content can name routes as data. */
export function SLink({
  to,
  className,
  children,
  ...rest
}: {
  to: string;
  className?: string;
  children: ReactNode;
} & Omit<React.AnchorHTMLAttributes<HTMLAnchorElement>, "href">) {
  if (/^(https?:|mailto:|tel:)/.test(to)) {
    return (
      <a href={to} className={className} {...rest}>
        {children}
      </a>
    );
  }
  return (
    <Link to={to as never} className={className} {...(rest as object)}>
      {children}
    </Link>
  );
}

export function Container({ children, className = "", wide = false }: { children: ReactNode; className?: string; wide?: boolean }) {
  return <div className={`mx-auto w-full ${wide ? "max-w-[1360px]" : "max-w-[1200px]"} px-5 sm:px-8 ${className}`}>{children}</div>;
}

type Tone = "white" | "mist" | "navy";

const TONES: Record<Tone, string> = {
  white: "bg-white text-ink",
  mist: "bg-mist text-ink",
  navy: "bg-navy text-white",
};

export function Section({
  tone = "white",
  id,
  children,
  className = "",
  wide = false,
}: {
  tone?: Tone;
  id?: string;
  children: ReactNode;
  className?: string;
  wide?: boolean;
}) {
  return (
    <section id={id} className={`${TONES[tone]} ${className}`}>
      <Container wide={wide} className="py-16 sm:py-24">{children}</Container>
    </section>
  );
}

export function Eyebrow({ children, onDark = false }: { children: ReactNode; onDark?: boolean }) {
  return (
    <p className={`text-[13px] font-bold tracking-[0.12em] uppercase ${onDark ? "text-brand-yellow" : "text-leaf"}`}>
      {children}
    </p>
  );
}

export function SectionHead({
  eyebrow,
  title,
  lede,
  center = false,
  onDark = false,
}: {
  eyebrow?: string;
  title: string;
  lede?: string;
  center?: boolean;
  onDark?: boolean;
}) {
  return (
    <div className={`max-w-3xl ${center ? "mx-auto text-center" : ""}`}>
      {eyebrow && <Eyebrow onDark={onDark}>{eyebrow}</Eyebrow>}
      <h2 className={`${eyebrow ? "mt-3" : ""} text-[1.9rem] leading-[1.15] font-extrabold tracking-tight sm:text-[2.5rem]`}>{title}</h2>
      {lede && <p className={`mt-4 text-lg leading-relaxed ${onDark ? "text-white/75" : "text-slate"}`}>{lede}</p>}
    </div>
  );
}

type ButtonKind = "primary" | "secondary" | "ghost";

const BUTTON: Record<ButtonKind, string> = {
  primary: "bg-leaf text-white hover:bg-leaf-dark border border-leaf",
  secondary: "bg-white text-ink border border-ink/25 hover:border-ink",
  ghost: "bg-transparent text-white border border-white/40 hover:border-white hover:bg-white/10",
};

export function CtaLink({
  to,
  kind = "primary",
  children,
  className = "",
}: {
  to: string;
  kind?: ButtonKind;
  children: ReactNode;
  className?: string;
}) {
  return (
    <SLink
      to={to}
      className={`inline-flex h-12 items-center justify-center rounded-md px-6 text-[15px] font-bold transition-colors ${BUTTON[kind]} ${className}`}
    >
      {children}
    </SLink>
  );
}

export function TextLink({ to, children, onDark = false }: { to: string; children: ReactNode; onDark?: boolean }) {
  return (
    <SLink
      to={to}
      className={`group inline-flex items-center gap-1.5 text-[15px] font-bold ${onDark ? "text-white" : "text-leaf"} hover:underline`}
    >
      {children}
      <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
    </SLink>
  );
}

export function Ticks({ items, onDark = false }: { items: string[]; onDark?: boolean }) {
  return (
    <ul className="space-y-3">
      {items.map((t) => (
        <li key={t} className="flex items-start gap-3">
          <span className={`mt-1 flex size-5 shrink-0 items-center justify-center rounded-full ${onDark ? "bg-brand-green/25" : "bg-leaf/12"}`}>
            <Check className={`size-3 ${onDark ? "text-brand-green" : "text-leaf"}`} strokeWidth={3.2} />
          </span>
          <span className={`text-[16px] leading-snug ${onDark ? "text-white/85" : "text-ink/90"}`}>{t}</span>
        </li>
      ))}
    </ul>
  );
}

/** Words on one side, a product picture on the other. */
export function Split({ block, flip = false, tone = "white" }: { block: Block; flip?: boolean; tone?: Tone }) {
  const dark = tone === "navy";
  return (
    <div className="grid items-center gap-10 lg:grid-cols-2 lg:gap-16">
      <div className={`min-w-0 ${flip ? "lg:order-2" : ""}`}>
        <h3 className="text-[1.65rem] leading-tight font-extrabold tracking-tight sm:text-[2rem]">{block.title}</h3>
        <p className={`mt-4 text-[17px] leading-relaxed ${dark ? "text-white/75" : "text-slate"}`}>{block.body}</p>
        {block.points && (
          <div className="mt-6">
            <Ticks items={block.points} onDark={dark} />
          </div>
        )}
      </div>
      <div className={`min-w-0 ${flip ? "lg:order-1" : ""}`}>
        <Visual name={block.visual} />
      </div>
    </div>
  );
}

export function Facts({ items }: { items: { value: string; label: string }[] }) {
  return (
    <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-rule bg-rule lg:grid-cols-4">
      {items.map((f) => (
        <div key={f.label} className="bg-white px-6 py-7">
          <dt className="sr-only">{f.label}</dt>
          <dd className="text-[2.4rem] leading-none font-extrabold tracking-tight text-ink">{f.value}</dd>
          <p className="mt-2 text-sm leading-snug text-slate">{f.label}</p>
        </div>
      ))}
    </dl>
  );
}

/** Three short statements under a page hero, each under its own rule. */
export function Highlights({ items }: { items: string[] }) {
  return (
    <ul className="grid gap-6 md:grid-cols-3">
      {items.map((t) => (
        <li key={t} className="border-t-2 border-ink pt-4 text-[16px] leading-snug font-semibold">
          {t}
        </li>
      ))}
    </ul>
  );
}

export function FaqList({ items }: { items: Faq[] }) {
  return (
    <div className="divide-y divide-rule border-y border-rule">
      {items.map((f) => (
        <details key={f.q} className="group py-5">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-6 text-left text-[17px] font-bold text-ink [&::-webkit-details-marker]:hidden">
            {f.q}
            <Plus className="size-5 shrink-0 text-leaf transition-transform group-open:rotate-45" />
          </summary>
          <p className="mt-3 max-w-3xl text-[16px] leading-relaxed text-slate">{f.a}</p>
        </details>
      ))}
    </div>
  );
}

export function CtaBand({
  title = "Start your free trial today.",
  body = "Seven days, every feature on your plan, no card needed. Set up a line and make a first call this afternoon.",
}: {
  title?: string;
  body?: string;
}) {
  return (
    <section className="bg-navy text-white">
      <Container className="flex flex-col gap-8 py-16 sm:py-20 lg:flex-row lg:items-center lg:justify-between">
        <div className="max-w-2xl">
          <h2 className="text-[1.9rem] leading-tight font-extrabold tracking-tight sm:text-[2.4rem]">{title}</h2>
          <p className="mt-3 text-lg text-white/75">{body}</p>
        </div>
        <div className="flex flex-wrap gap-3">
          <CtaLink to="/signup">Start free trial</CtaLink>
          <CtaLink to="/contact" kind="ghost">
            Talk to us
          </CtaLink>
        </div>
      </Container>
    </section>
  );
}

export function Breadcrumb({ trail }: { trail: { label: string; to?: string }[] }) {
  return (
    <nav aria-label="Breadcrumb" className="mb-6 text-sm text-slate">
      <ol className="flex flex-wrap items-center gap-2">
        {trail.map((t, i) => (
          <li key={t.label} className="flex items-center gap-2">
            {t.to ? (
              <SLink to={t.to} className="hover:text-ink hover:underline">
                {t.label}
              </SLink>
            ) : (
              <span className="font-semibold text-ink">{t.label}</span>
            )}
            {i < trail.length - 1 && <span aria-hidden>/</span>}
          </li>
        ))}
      </ol>
    </nav>
  );
}

/** The top of an inner page: words on the left, a product picture on the right. */
export function PageHero({
  trail,
  eyebrow,
  title,
  lede,
  visual,
  actions,
}: {
  trail?: { label: string; to?: string }[];
  eyebrow?: string;
  title: string;
  lede: string;
  visual?: Block["visual"];
  actions?: ReactNode;
}) {
  return (
    <section className="border-b border-rule bg-mist">
      <Container className="grid items-center gap-12 py-14 sm:py-20 lg:grid-cols-[1.05fr_1fr] lg:gap-16">
        <div>
          {trail && <Breadcrumb trail={trail} />}
          {eyebrow && <Eyebrow>{eyebrow}</Eyebrow>}
          <h1 className="mt-3 text-[2.4rem] leading-[1.08] font-extrabold tracking-tight sm:text-[3.3rem]">{title}</h1>
          <p className="mt-5 max-w-xl text-[19px] leading-relaxed text-slate">{lede}</p>
          {actions && <div className="mt-8 flex flex-wrap gap-3">{actions}</div>}
        </div>
        {visual && <Visual name={visual} />}
      </Container>
    </section>
  );
}

/** A plain heading block for text pages (legal, about). */
export function TextPageHead({ title, lede, trail }: { title: string; lede?: string; trail?: { label: string; to?: string }[] }) {
  return (
    <section className="border-b border-rule bg-mist">
      <Container className="py-14 sm:py-20">
        {trail && <Breadcrumb trail={trail} />}
        <h1 className="max-w-3xl text-[2.4rem] leading-[1.1] font-extrabold tracking-tight sm:text-[3.2rem]">{title}</h1>
        {lede && <p className="mt-5 max-w-2xl text-[19px] leading-relaxed text-slate">{lede}</p>}
      </Container>
    </section>
  );
}
