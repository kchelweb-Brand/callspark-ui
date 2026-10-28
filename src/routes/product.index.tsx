import { createFileRoute } from "@tanstack/react-router";

import { CtaBand, CtaLink, PageHero, Section, SLink, Split, TextLink } from "@/site/blocks";
import { PRODUCTS } from "@/site/content";
import { SiteLayout } from "@/site/Layout";

export const Route = createFileRoute("/product/")({
  head: () => ({
    meta: [
      { title: "Product — Kchel Dialer" },
      {
        name: "description",
        content:
          "Everything in the Kchel Dialer workspace: cloud phone system, power dialer, AI voice agent, AI receptionist, messaging, analytics, team tools and a Windows app.",
      },
    ],
  }),
  component: ProductOverview,
});

function ProductOverview() {
  return (
    <SiteLayout>
      <PageHero
        trail={[{ label: "Home", to: "/" }, { label: "Product" }]}
        eyebrow="The platform"
        title="One workspace for every call your business makes and takes."
        lede="Set up a phone line, work a list, put an AI agent on the first pass, and see what happened afterwards. Each part works on its own, and they share the same contacts, history and team."
        visual="queue"
        actions={
          <>
            <CtaLink to="/signup">Start free trial</CtaLink>
            <CtaLink to="/pricing" kind="secondary">
              See pricing
            </CtaLink>
          </>
        }
      />

      {PRODUCTS.map((p, i) => (
        <Section key={p.slug} tone={i % 2 === 0 ? "white" : "mist"}>
          <Split
            flip={i % 2 === 1}
            block={{ title: p.name, body: p.lede, points: p.facts, visual: p.heroVisual }}
          />
          <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-2">
            <TextLink to={`/product/${p.slug}`}>How {p.name.toLowerCase()} works</TextLink>
            {p.from && <span className="text-sm text-slate">Included from the {p.from} plan</span>}
          </div>
        </Section>
      ))}

      <section className="bg-white">
        <div className="mx-auto max-w-[1200px] px-5 py-14 text-center sm:px-8">
          <p className="text-lg text-slate">
            Not sure where to begin?{" "}
            <SLink to="/resources/get-started" className="font-bold text-leaf hover:underline">
              Follow the five-step guide
            </SLink>
            .
          </p>
        </div>
      </section>

      <CtaBand />
    </SiteLayout>
  );
}
