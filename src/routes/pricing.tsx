import { createFileRoute } from "@tanstack/react-router";

import { CtaBand, Container, FaqList, Section, SectionHead, SLink } from "@/site/blocks";
import { SiteLayout } from "@/site/Layout";
import { ComparisonTable, PlanCards, TrialStrip } from "@/site/PlanCards";

export const Route = createFileRoute("/pricing")({
  head: () => ({
    meta: [
      { title: "Pricing — Kchel Dialer" },
      {
        name: "description",
        content:
          "Kchel Dialer pricing: per-agent plans from $29, one flat price for a team on Business, and Managed Enterprise with the phone line supplied. Free for 7 days.",
      },
    ],
  }),
  component: PricingPage,
});

const PRICING_FAQ = [
  { q: "Do I pay for call minutes through Kchel?", a: "Not on Starter, Professional or Business. You bring your own SIP line, so call charges stay on your carrier bill at your own rates. Managed Enterprise includes the line." },
  { q: "What happens when the free trial ends?", a: "The workspace pauses until you choose a plan. Nothing is deleted, and your data stays exportable." },
  { q: "How do I pay, and when is my plan switched on?", a: "Open Billing, choose a plan and pay with the link shown. Depending on your country there may be bank, crypto or gift card options and regional prices. Once you tell us you have paid, we confirm it and activate your account, usually within a few hours." },
  { q: "Is there a discount for paying yearly?", a: "Yes. Annual billing includes two months free." },
  { q: "Can I change plans later?", a: "Yes. Move up when you need more agents, contacts or features. Nothing you have built is lost." },
  { q: "What does the Windows app cost?", a: "The desktop app is an add-on with a one-time payment, and it is included free on Managed Enterprise." },
];

function PricingPage() {
  return (
    <SiteLayout>
      <section className="border-b border-rule bg-mist">
        <Container className="py-14 text-center sm:py-20">
          <h1 className="mx-auto max-w-3xl text-[2.5rem] leading-[1.08] font-extrabold tracking-tight sm:text-[3.4rem]">Simple pricing that grows with your team.</h1>
          <p className="mx-auto mt-5 max-w-2xl text-[19px] leading-relaxed text-slate">
            Pay per agent while you start, move to one flat price when you have a team, and keep your own phone line and rates unless you want ours.
          </p>
          <p className="mt-4 text-sm text-slate">Prices are in US dollars. Annual billing includes two months free.</p>
        </Container>
      </section>

      <Section tone="white" className="pb-0" wide>
        <PlanCards />
        <div className="mt-8">
          <TrialStrip />
        </div>
      </Section>

      <Section tone="white">
        <SectionHead eyebrow="Compare" title="Every plan, side by side." />
        <div className="mt-10">
          <ComparisonTable />
        </div>
      </Section>

      <Section tone="mist">
        <div className="grid gap-12 lg:grid-cols-[0.8fr_1.4fr]">
          <div>
            <SectionHead eyebrow="Billing" title="Questions about paying." />
            <p className="mt-5 text-[16px] leading-relaxed text-slate">
              Something not covered here?{" "}
              <SLink to="/contact" className="font-bold text-leaf hover:underline">
                Ask us
              </SLink>
              .
            </p>
          </div>
          <FaqList items={PRICING_FAQ} />
        </div>
      </Section>

      <CtaBand />
    </SiteLayout>
  );
}
