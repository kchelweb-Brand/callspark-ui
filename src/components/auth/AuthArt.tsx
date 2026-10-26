import { Check, Phone, Sparkles } from "lucide-react";
import type { ReactNode } from "react";

import { LogoMark } from "@/components/brand/Logo";

export function AuthArt({
  headline,
  accent,
  body,
  points,
  footnote,
}: {
  headline: ReactNode;
  accent: string;
  body: string;
  points: string[];
  footnote: string;
}) {
  return (
    <div className="ks-ground hidden flex-col justify-between p-12 text-white lg:flex">
      <div className="flex items-center gap-3">
        <span className="flex size-11 items-center justify-center rounded-xl bg-white shadow-lg">
          <LogoMark className="size-7" />
        </span>
        <span className="text-lg font-bold tracking-tight">Kchel Dialer</span>
      </div>

      <div className="relative max-w-md pb-28 pt-10">
        <div className="ks-float ks-auth-f1">
          <span className="ico bg-brand-yellow text-black">
            <Phone className="size-[18px]" />
          </span>
          <div>
            <strong>Incoming call</strong>
            <span className="sub">Sales line · ringing</span>
          </div>
        </div>

        <h2 className="mt-28 text-4xl font-extrabold leading-[1.05] tracking-tight">
          {headline} <span className="ks-grad">{accent}</span>
        </h2>
        <p className="mt-4 max-w-sm text-[15px] leading-relaxed text-white/80">{body}</p>
        <ul className="mt-6 flex flex-col gap-2.5 text-sm font-semibold">
          {points.map((p) => (
            <li key={p} className="flex items-center gap-3">
              <span className="flex size-5 items-center justify-center rounded-full border border-white/40 bg-white/20">
                <Check className="size-3" strokeWidth={3.4} />
              </span>
              {p}
            </li>
          ))}
        </ul>

        <div className="ks-float ks-auth-f2">
          <div className="flex items-center gap-3">
            <span className="ico bg-brand-green text-white">
              <Sparkles className="size-[18px]" />
            </span>
            <div>
              <strong>AI agent dialing</strong>
              <span className="sub">Spring outreach · 24 of 60 calls</span>
            </div>
          </div>
          <div className="ks-bar">
            <i />
          </div>
        </div>
      </div>

      <p className="text-xs text-white/65">{footnote}</p>
    </div>
  );
}
