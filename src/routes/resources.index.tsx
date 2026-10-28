import { createFileRoute } from "@tanstack/react-router";

import { CtaBand, Section, SectionHead, SLink, TextLink, TextPageHead } from "@/site/blocks";
import { GUIDES } from "@/site/content";
import { SiteLayout } from "@/site/Layout";

export const Route = createFileRoute("/resources/")({
  head: () => ({
    meta: [
      { title: "Guides and resources — Kchel Dialer" },
      {
        name: "description",
        content:
          "Step-by-step guides for setting up your phone line, importing contacts, running campaigns, and using the AI voice agent and receptionist.",
      },
    ],
  }),
  component: ResourcesIndex,
});

function ResourcesIndex() {
  return (
    <SiteLayout>
      <TextPageHead
        trail={[{ label: "Home", to: "/" }, { label: "Resources" }]}
        title="Guides for getting things done."
        lede="Short, step-by-step walkthroughs written against the real screens. Pick the one you need."
      />
      <Section tone="white">
        <div className="grid gap-6 md:grid-cols-2">
          {GUIDES.map((g) => (
            <SLink key={g.slug} to={`/resources/${g.slug}`} className="group flex flex-col rounded-xl border border-rule p-8 hover:border-leaf">
              <span className="text-[12px] font-bold tracking-[0.12em] text-slate uppercase">
                {g.minutes} minute read · {g.steps.length} steps
              </span>
              <h2 className="mt-3 text-[1.45rem] leading-snug font-extrabold tracking-tight group-hover:text-leaf">{g.title}</h2>
              <p className="mt-2 flex-1 text-[16px] leading-relaxed text-slate">{g.summary}</p>
              <span className="mt-5 text-[15px] font-bold text-leaf">Read the guide</span>
            </SLink>
          ))}
        </div>
      </Section>
      <Section tone="mist">
        <SectionHead title="Still stuck?" lede="Read the frequently asked questions, or ask the help assistant in the corner of any page." />
        <div className="mt-6 flex flex-wrap gap-6">
          <TextLink to="/faq">Frequently asked questions</TextLink>
          <TextLink to="/contact">Contact us</TextLink>
        </div>
      </Section>
      <CtaBand />
    </SiteLayout>
  );
}
