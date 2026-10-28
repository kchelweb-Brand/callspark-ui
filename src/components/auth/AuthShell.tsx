import { Link } from "@tanstack/react-router";
import { ArrowLeft, Check } from "lucide-react";
import type { ReactNode } from "react";

import { Logo } from "@/components/brand/Logo";
import type { VisualKey } from "@/site/content";
import { Visual } from "@/site/mocks";

/** The shape every sign-in and sign-up field shares, so the forms read as one family. */
export const authField =
  "mt-2 h-12 w-full rounded-md border border-ink/25 bg-white px-3.5 text-[16px] text-ink shadow-none outline-none placeholder:text-ink/40 focus-visible:border-leaf focus-visible:ring-2 focus-visible:ring-leaf/25";

export const authButton =
  "inline-flex h-12 w-full items-center justify-center gap-2 rounded-md bg-leaf px-6 text-[15px] font-bold text-white transition-colors hover:bg-leaf-dark disabled:cursor-not-allowed disabled:opacity-60";

/**
 * The frame around sign-in, sign-up and the admin sign-in: the navy brand panel
 * on the left, the form on the right, in the same type and colours as the public
 * website. The panel is hidden on small screens, where the logo moves above the form.
 */
export function AuthShell({
  headline,
  accent,
  body,
  points,
  visual = "queue",
  footnote,
  children,
}: {
  headline: string;
  accent?: string;
  body: string;
  points: string[];
  visual?: VisualKey;
  footnote?: string;
  children: ReactNode;
}) {
  return (
    <div className="grid min-h-screen w-full bg-white font-sans text-ink antialiased lg:grid-cols-[1.02fr_1fr]">
      <aside className="relative hidden flex-col justify-between overflow-hidden bg-navy p-12 text-white lg:flex xl:p-16">
        <Link to="/" aria-label="Kchel Dialer home" className="w-fit">
          <Logo markClassName="size-10" className="text-[1.25rem] [&_span]:!text-white" />
        </Link>

        <div className="my-12 max-w-xl">
          <h2 className="text-[2.6rem] leading-[1.08] font-extrabold tracking-tight xl:text-[3.1rem]">
            {headline}
            {accent && <span className="text-brand-green"> {accent}</span>}
          </h2>
          <p className="mt-5 max-w-md text-[17px] leading-relaxed text-white/75">{body}</p>
          <ul className="mt-7 space-y-3">
            {points.map((p) => (
              <li key={p} className="flex items-start gap-3 text-[15.5px] text-white/90">
                <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-brand-green/25">
                  <Check className="size-3 text-brand-green" strokeWidth={3.2} />
                </span>
                {p}
              </li>
            ))}
          </ul>
          <div className="mt-10 max-w-lg [@media(max-height:860px)]:hidden">
            <Visual name={visual} />
          </div>
        </div>

        {footnote && <p className="text-[13.5px] text-white/60">{footnote}</p>}
      </aside>

      <div className="flex min-h-screen flex-col">
        <header className="flex items-center justify-between px-5 py-5 sm:px-10">
          <Link to="/" aria-label="Kchel Dialer home" className="lg:hidden">
            <Logo markClassName="size-9" className="text-[1.1rem] [&_span]:!text-ink" />
          </Link>
          <Link to="/" className="ml-auto flex items-center gap-1.5 text-[14px] font-semibold text-slate hover:text-ink lg:ml-0">
            <ArrowLeft className="size-4" /> Back to the website
          </Link>
        </header>

        <main className="flex flex-1 items-center justify-center px-5 pb-12 sm:px-10">
          <div className="w-full max-w-[420px]">{children}</div>
        </main>

        <footer className="flex flex-wrap items-center justify-center gap-x-6 gap-y-1 px-5 py-6 text-[13px] text-slate">
          <Link to="/legal/terms" className="hover:text-ink hover:underline">
            Terms
          </Link>
          <Link to="/legal/privacy" className="hover:text-ink hover:underline">
            Privacy
          </Link>
          <Link to="/faq" className="hover:text-ink hover:underline">
            Help
          </Link>
        </footer>
      </div>
    </div>
  );
}

/** Heading block used at the top of every auth form. */
export function AuthHeading({ title, lede }: { title: string; lede?: ReactNode }) {
  return (
    <div>
      <h1 className="text-[2rem] leading-[1.1] font-extrabold tracking-tight">{title}</h1>
      {lede && <p className="mt-3 text-[16px] leading-relaxed text-slate">{lede}</p>}
    </div>
  );
}
