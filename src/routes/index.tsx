import { createFileRoute } from "@tanstack/react-router";
import { ArrowUpRight } from "lucide-react";
import { useState } from "react";

import { CtaBand, CtaLink, Container, Eyebrow, Facts, FaqList, Section, SectionHead, SLink, Split, TextLink, Ticks } from "@/site/blocks";
import { FAQS, GUIDES, PRODUCTS, SOLUTIONS } from "@/site/content";
import { SiteLayout } from "@/site/Layout";
import { Visual } from "@/site/mocks";
import { PlanCards, TrialStrip } from "@/site/PlanCards";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Kchel Dialer — The phone system your sales floor actually dials with" },
      {
        name: "description",
        content:
          "Calling, campaigns, AI voice agents and a team workspace in one place. Bring your own phone line, import a list and make your first call this afternoon. Free for 7 days.",
      },
      { property: "og:title", content: "Kchel Dialer — The phone system your sales floor actually dials with" },
      { property: "og:description", content: "Power dialer, AI voice agent, AI receptionist and team tools. Free for 7 days." },
    ],
  }),
  component: HomePage,
});

const TABS = ["phone-system", "dialer", "ai-voice-agent", "ai-receptionist"] as const;
const TAB_LABEL: Record<(typeof TABS)[number], string> = {
  "phone-system": "Phone system",
  dialer: "Power dialer",
  "ai-voice-agent": "AI voice agent",
  "ai-receptionist": "AI receptionist",
};

function ProductTabs() {
  const [active, setActive] = useState<(typeof TABS)[number]>("dialer");
  const product = PRODUCTS.find((p) => p.slug === active)!;
  const block = product.blocks[0]!;
  return (
    <div>
      <div role="tablist" aria-label="Products" className="flex gap-1 overflow-x-auto border-b border-rule">
        {TABS.map((t) => (
          <button
            key={t}
            role="tab"
            id={`tab-${t}`}
            aria-selected={active === t}
            aria-controls="tour-panel"
            onClick={() => setActive(t)}
            className={`-mb-px shrink-0 border-b-[3px] px-5 py-3.5 text-[16px] font-bold whitespace-nowrap transition-colors ${
              active === t ? "border-leaf text-ink" : "border-transparent text-slate hover:text-ink"
            }`}
          >
            {TAB_LABEL[t]}
          </button>
        ))}
      </div>
      <div id="tour-panel" role="tabpanel" aria-labelledby={`tab-${active}`} className="mt-10 grid items-center gap-10 lg:grid-cols-[1fr_1.1fr] lg:gap-16">
        <div>
          <h3 className="text-[1.8rem] leading-tight font-extrabold tracking-tight sm:text-[2.2rem]">{product.headline}</h3>
          <p className="mt-4 text-[17px] leading-relaxed text-slate">{product.lede}</p>
          <div className="mt-6">
            <Ticks items={(block.points ?? []).slice(0, 3)} />
          </div>
          <div className="mt-8">
            <TextLink to={`/product/${product.slug}`}>Explore {product.name.toLowerCase()}</TextLink>
          </div>
        </div>
        <Visual name={product.heroVisual} />
      </div>
    </div>
  );
}

const STEPS = [
  { n: "1", title: "Connect your line", body: "Enter your SIP provider's details, or ask for a managed line. The app tells you when it is registered." },
  { n: "2", title: "Bring in your list", body: "Upload a spreadsheet of up to 10,000 contacts, check the preview, and you have a campaign." },
  { n: "3", title: "Start calling", body: "Work the list with the power dialer, or let the AI voice agent make the first pass for you." },
];

function HomePage() {
  const analytics = PRODUCTS.find((p) => p.slug === "analytics")!;
  const team = PRODUCTS.find((p) => p.slug === "team")!;
  const ai = PRODUCTS.find((p) => p.slug === "ai-voice-agent")!;
  return (
    <SiteLayout>
      {/* Hero */}
      <section className="border-b border-rule bg-mist">
        <Container className="grid items-center gap-12 py-14 sm:py-20 lg:grid-cols-[1.02fr_1fr] lg:gap-14 lg:py-24">
          <div>
            <Eyebrow>Calling · Campaigns · AI</Eyebrow>
            <h1 className="mt-4 text-[2.6rem] leading-[1.05] font-extrabold tracking-tight sm:text-[3.6rem] xl:text-[4.1rem]">
              The phone system your sales floor actually dials with.
            </h1>
            <p className="mt-6 max-w-xl text-[19px] leading-relaxed text-slate">
              Place calls, run campaigns, put an AI voice agent on your list and manage your team, all in one workspace. Bring your own phone line, or have one supplied.
            </p>
            <div className="mt-9 flex flex-wrap gap-3">
              <CtaLink to="/signup">Start free trial</CtaLink>
              <CtaLink to="/pricing" kind="secondary">
                See pricing
              </CtaLink>
            </div>
            <p className="mt-5 text-sm text-slate">Free for 7 days · No card needed · Most teams make a first call the same afternoon</p>
          </div>
          <Visual name="dialer" />
        </Container>
      </section>

      {/* Facts */}
      <section className="bg-white">
        <Container className="py-12">
          <Facts
            items={[
              { value: "10,000", label: "contacts imported in a single upload" },
              { value: "12", label: "AI voices to choose from, in three quality tiers" },
              { value: "7 days", label: "free trial, with no card needed" },
              { value: "1", label: "workspace for calls, texts, AI agents and your team" },
            ]}
          />
        </Container>
      </section>

      {/* Product tour */}
      <Section id="tour" tone="white" className="pt-0">
        <SectionHead eyebrow="What you get" title="Everything a calling team needs, without five tools stitched together." />
        <div className="mt-10">
          <ProductTabs />
        </div>
      </Section>

      {/* Solutions */}
      <Section tone="mist">
        <SectionHead eyebrow="Solutions" title="Built around how your team actually works." lede="Pick the one that sounds like you and see which parts of Kchel it leans on." />
        <div className="mt-12 grid gap-px overflow-hidden rounded-2xl border border-rule bg-rule md:grid-cols-2">
          {SOLUTIONS.map((s) => (
            <SLink key={s.slug} to={`/solutions/${s.slug}`} className="group flex items-start justify-between gap-6 bg-white p-8 hover:bg-white/60">
              <div>
                <h3 className="text-[1.4rem] font-extrabold tracking-tight">{s.name}</h3>
                <p className="mt-2 max-w-md text-[16px] leading-relaxed text-slate">{s.short}</p>
              </div>
              <ArrowUpRight className="mt-1 size-6 shrink-0 text-leaf transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
            </SLink>
          ))}
        </div>
      </Section>

      {/* AI spotlight */}
      <Section tone="navy">
        <SectionHead
          onDark
          eyebrow="AI voice agent"
          title="The first pass on a long list, made by an agent that doesn't get tired."
          lede="It speaks first, handles voicemail, writes down how each call went, and hands the good ones to your team."
        />
        <div className="mt-14">
          <Split tone="navy" block={ai.blocks[1]!} />
        </div>
        <div className="mt-10">
          <TextLink onDark to="/product/ai-voice-agent">
            See everything the AI voice agent does
          </TextLink>
        </div>
      </Section>

      {/* Analytics + team */}
      <Section tone="white">
        <div className="space-y-24">
          <Split block={analytics.blocks[0]!} />
          <Split block={team.blocks[0]!} flip />
        </div>
      </Section>

      {/* How it works */}
      <Section tone="mist">
        <SectionHead eyebrow="How it works" title="From sign-up to first call in an afternoon." />
        <ol className="mt-12 grid gap-10 md:grid-cols-3">
          {STEPS.map((s) => (
            <li key={s.n} className="border-t-2 border-ink pt-5">
              <span className="text-sm font-bold tracking-widest text-leaf">STEP {s.n}</span>
              <h3 className="mt-2 text-[1.35rem] font-extrabold tracking-tight">{s.title}</h3>
              <p className="mt-2 text-[16px] leading-relaxed text-slate">{s.body}</p>
            </li>
          ))}
        </ol>
        <div className="mt-10">
          <TextLink to="/resources/get-started">Read the full getting-started guide</TextLink>
        </div>
      </Section>

      {/* Pricing */}
      <Section tone="white" id="pricing" wide>
        <SectionHead
          center
          eyebrow="Pricing"
          title="Per agent while you grow. One flat price when you have a team."
          lede="Bring your own phone line on Starter, Professional and Business, and your call minutes stay on your carrier bill. Managed Enterprise includes the line."
        />
        <div className="mt-12">
          <PlanCards />
        </div>
        <div className="mt-8">
          <TrialStrip />
        </div>
        <p className="mt-6 text-center text-sm text-slate">
          Annual billing includes two months free.{" "}
          <SLink to="/pricing" className="font-bold text-leaf hover:underline">
            Compare every plan
          </SLink>
        </p>
      </Section>

      {/* Guides */}
      <Section tone="mist">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <SectionHead eyebrow="Resources" title="Short guides for the things you'll do first." />
          <TextLink to="/resources">All guides</TextLink>
        </div>
        <div className="mt-10 grid gap-6 md:grid-cols-3">
          {GUIDES.slice(0, 3).map((g) => (
            <SLink key={g.slug} to={`/resources/${g.slug}`} className="group flex flex-col rounded-xl border border-rule bg-white p-7 hover:border-leaf">
              <span className="text-[12px] font-bold tracking-[0.12em] text-slate uppercase">{g.minutes} minute read</span>
              <h3 className="mt-3 text-[1.3rem] leading-snug font-extrabold tracking-tight group-hover:text-leaf">{g.title}</h3>
              <p className="mt-2 flex-1 text-[15.5px] leading-relaxed text-slate">{g.summary}</p>
              <span className="mt-5 text-[15px] font-bold text-leaf">Read the guide</span>
            </SLink>
          ))}
        </div>
      </Section>

      {/* FAQ */}
      <Section tone="white">
        <div className="grid gap-12 lg:grid-cols-[0.8fr_1.4fr]">
          <div>
            <SectionHead eyebrow="Questions" title="Things people ask before they start." />
            <div className="mt-6">
              <TextLink to="/faq">See all questions</TextLink>
            </div>
          </div>
          <FaqList items={[FAQS[0]!.items[0]!, FAQS[1]!.items[0]!, FAQS[2]!.items[1]!, FAQS[3]!.items[0]!, FAQS[1]!.items[2]!]} />
        </div>
      </Section>

      <CtaBand />
    </SiteLayout>
  );
}
