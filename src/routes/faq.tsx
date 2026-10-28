import { createFileRoute } from "@tanstack/react-router";

import { CtaBand, FaqList, Section, TextLink, TextPageHead } from "@/site/blocks";
import { FAQS } from "@/site/content";
import { SiteLayout } from "@/site/Layout";

export const Route = createFileRoute("/faq")({
  head: () => ({
    meta: [
      { title: "Frequently asked questions — Kchel Dialer" },
      { name: "description", content: "Answers about the free trial, calling, the AI features, plans and billing." },
    ],
  }),
  component: FaqPage,
});

function FaqPage() {
  return (
    <SiteLayout>
      <TextPageHead
        trail={[{ label: "Home", to: "/" }, { label: "FAQ" }]}
        title="Frequently asked questions."
        lede="The things people ask before they start, and the things they ask in the first week."
      />
      <Section tone="white">
        <div className="space-y-16">
          {FAQS.map((g) => (
            <div key={g.group} className="grid gap-8 lg:grid-cols-[0.6fr_1.4fr]">
              <h2 className="text-[1.6rem] font-extrabold tracking-tight">{g.group}</h2>
              <FaqList items={g.items} />
            </div>
          ))}
        </div>
        <div className="mt-16 flex flex-wrap gap-6 border-t border-rule pt-8">
          <TextLink to="/resources">Step-by-step guides</TextLink>
          <TextLink to="/contact">Ask us something else</TextLink>
        </div>
      </Section>
      <CtaBand />
    </SiteLayout>
  );
}
