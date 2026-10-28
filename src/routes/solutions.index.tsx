import { createFileRoute } from "@tanstack/react-router";

import { CtaBand, PageHero, Section, SLink, Split } from "@/site/blocks";
import { SOLUTIONS } from "@/site/content";
import { SiteLayout } from "@/site/Layout";

export const Route = createFileRoute("/solutions/")({
  head: () => ({
    meta: [
      { title: "Solutions — Kchel Dialer" },
      { name: "description", content: "How sales teams, small businesses, call centers and remote teams use Kchel Dialer." },
    ],
  }),
  component: SolutionsIndex,
});

function SolutionsIndex() {
  return (
    <SiteLayout>
      <PageHero
        trail={[{ label: "Home", to: "/" }, { label: "Solutions" }]}
        eyebrow="Solutions"
        title="The same platform, set up for the way you work."
        lede="Whether you are one person with a list or a floor of agents, start from the guide that sounds like you."
        visual="team"
      />
      {SOLUTIONS.map((s, i) => (
        <Section key={s.slug} tone={i % 2 === 0 ? "white" : "mist"}>
          <Split flip={i % 2 === 1} block={{ title: s.name, body: s.headline, points: s.needs.map((n) => n.title), visual: s.heroVisual }} />
          <div className="mt-8">
            <SLink to={`/solutions/${s.slug}`} className="text-[15px] font-bold text-leaf hover:underline">
              Kchel for {s.name.toLowerCase()}
            </SLink>
          </div>
        </Section>
      ))}
      <CtaBand />
    </SiteLayout>
  );
}
