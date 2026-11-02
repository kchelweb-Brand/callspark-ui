import { createFileRoute } from "@tanstack/react-router";
import { Clock, Search } from "lucide-react";
import { useMemo, useState } from "react";

import { CtaBand, Section, SLink, TextPageHead } from "@/site/blocks";
import { SiteLayout } from "@/site/Layout";
import { LEVELS, MANUAL, articlePath, plain, type Level } from "@/manual";
import { breadcrumbLd, itemListLd, ldScript } from "@/site/seo";

export const Route = createFileRoute("/manual/")({
  head: () => ({
    meta: [
      { title: "The Kchel Dialer manual: beginner to expert" },
      {
        name: "description",
        content:
          "Step-by-step guides with screenshots for every part of Kchel Dialer: connecting your SIP line, contacts, campaigns, voice broadcasts, your phone system and more.",
      },
    ],
    scripts: [
      ldScript(breadcrumbLd([{ name: "Home", path: "/" }, { name: "Manual" }])),
      ldScript(itemListLd("The Kchel Dialer manual", MANUAL.map((a) => ({ name: a.title, path: articlePath(a.slug) })))),
    ],
  }),
  component: ManualIndex,
});

const LEVEL_STYLE: Record<Level, string> = {
  beginner: "bg-leaf/10 text-leaf",
  intermediate: "bg-navy/10 text-navy",
  expert: "bg-ink text-white",
};

function ManualIndex() {
  const [query, setQuery] = useState("");
  const [level, setLevel] = useState<Level | "all">("all");

  const shown = useMemo(() => {
    const words = query.toLowerCase().split(/\s+/).filter(Boolean);
    return MANUAL.filter((a) => {
      if (level !== "all" && a.level !== level) return false;
      if (words.length === 0) return true;
      const hay = `${a.title} ${a.summary} ${a.keywords.join(" ")}`.toLowerCase();
      return words.every((w) => hay.includes(w));
    });
  }, [query, level]);

  return (
    <SiteLayout>
      <TextPageHead
        trail={[{ label: "Home", to: "/" }, { label: "Manual" }]}
        title="The Kchel Dialer manual."
        lede="Step-by-step guides with screenshots, from your first sign-in to expert settings. Start at the top, or search for what you need."
      />
      <Section tone="white">
        <div className="mb-8 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="relative w-full max-w-md">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search, for example “SIP credentials”"
              aria-label="Search the manual"
              className="h-11 w-full rounded-lg border border-rule bg-white pr-3 pl-9 text-[15px] outline-none focus:border-leaf"
            />
          </div>
          <div className="flex flex-wrap gap-2" role="tablist" aria-label="Level">
            {[{ id: "all" as const, label: "All guides" }, ...LEVELS].map((l) => (
              <button
                key={l.id}
                type="button"
                role="tab"
                aria-selected={level === l.id}
                onClick={() => setLevel(l.id)}
                className={`rounded-full border px-4 py-1.5 text-[14px] font-semibold transition ${
                  level === l.id ? "border-navy bg-navy text-white" : "border-rule bg-white text-slate hover:border-leaf"
                }`}
              >
                {l.label}
              </button>
            ))}
          </div>
        </div>

        {level === "all" && query === "" ? (
          LEVELS.map((l) => (
            <div key={l.id} className="mb-12">
              <h2 className="text-[1.6rem] font-extrabold tracking-tight">{l.label}</h2>
              <p className="mt-1 text-[16px] text-slate">{l.blurb}</p>
              <Cards items={MANUAL.filter((a) => a.level === l.id)} />
            </div>
          ))
        ) : shown.length > 0 ? (
          <Cards items={shown} />
        ) : (
          <p className="rounded-xl border border-rule p-8 text-center text-[16px] text-slate">
            Nothing matches that. Try fewer words, or ask the Help button at the bottom right.
          </p>
        )}
      </Section>
      <CtaBand />
    </SiteLayout>
  );
}

function Cards({ items }: { items: typeof MANUAL }) {
  return (
    <div className="mt-5 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
      {items.map((a) => (
        <SLink key={a.slug} to={articlePath(a.slug)} className="group flex flex-col rounded-xl border border-rule p-6 hover:border-leaf">
          <div className="flex items-center gap-2 text-[12px] font-bold tracking-[0.1em] uppercase">
            <span className={`rounded-full px-2.5 py-0.5 ${LEVEL_STYLE[a.level]}`}>{a.level}</span>
            <span className="flex items-center gap-1 text-slate">
              <Clock className="size-3.5" /> {a.time}
            </span>
          </div>
          <h3 className="mt-3 text-[1.2rem] leading-snug font-extrabold tracking-tight group-hover:text-leaf">{a.title}</h3>
          <p className="mt-2 flex-1 text-[15.5px] leading-relaxed text-slate">{plain(a.summary)}</p>
          <span className="mt-4 text-[14.5px] font-bold text-leaf">
            {a.steps.length > 0 ? `${a.steps.length} steps` : "Read the guide"}
          </span>
        </SLink>
      ))}
    </div>
  );
}
