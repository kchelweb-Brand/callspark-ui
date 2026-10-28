import { createFileRoute, notFound } from "@tanstack/react-router";

import { PLANS, type PlanId } from "@/backend/plans";
import { CtaBand, CtaLink, PageHero, Section, SectionHead, SLink, TextLink } from "@/site/blocks";
import { PRODUCTS, SOLUTIONS } from "@/site/content";
import { SiteLayout } from "@/site/Layout";
import { Visual } from "@/site/mocks";
import { featureLines, limitLines } from "@/site/PlanCards";

export const Route = createFileRoute("/solutions/$slug")({
  loader: ({ params }) => {
    if (!SOLUTIONS.some((s) => s.slug === params.slug)) throw notFound();
    return null;
  },
  head: ({ params }) => {
    const s = SOLUTIONS.find((x) => x.slug === params.slug);
    return {
      meta: [
        { title: `Kchel Dialer for ${s?.name.toLowerCase() ?? "your team"}` },
        { name: "description", content: s ? `${s.headline} ${s.lede}` : "Kchel Dialer solutions." },
      ],
    };
  },
  component: SolutionPage,
});

function SolutionPage() {
  const { slug } = Route.useParams();
  const s = SOLUTIONS.find((x) => x.slug === slug)!;
  const plan = PLANS[s.plan as PlanId];
  const lead = PRODUCTS.find((p) => p.slug === s.needs[0]?.product);
  return (
    <SiteLayout>
      <PageHero
        trail={[{ label: "Home", to: "/" }, { label: "Solutions", to: "/solutions" }, { label: s.name }]}
        eyebrow={`For ${s.name.toLowerCase()}`}
        title={s.headline}
        lede={s.lede}
        visual={s.heroVisual}
        actions={
          <>
            <CtaLink to="/signup">Start free trial</CtaLink>
            <CtaLink to="/pricing" kind="secondary">
              See pricing
            </CtaLink>
          </>
        }
      />

      <Section tone="white">
        <SectionHead eyebrow="What you get" title="The parts of Kchel that matter most here." />
        <div className="mt-12 grid gap-px overflow-hidden rounded-2xl border border-rule bg-rule md:grid-cols-3">
          {s.needs.map((n) => {
            const product = PRODUCTS.find((p) => p.slug === n.product)!;
            return (
              <div key={n.title} className="flex flex-col bg-white p-8">
                <h3 className="text-[1.3rem] leading-snug font-extrabold tracking-tight">{n.title}</h3>
                <p className="mt-3 flex-1 text-[16px] leading-relaxed text-slate">{n.body}</p>
                <div className="mt-6">
                  <TextLink to={`/product/${product.slug}`}>{product.name}</TextLink>
                </div>
              </div>
            );
          })}
        </div>
      </Section>

      <Section tone="mist">
        <div className="grid items-center gap-12 lg:grid-cols-[1fr_1.1fr]">
          <div>
            <SectionHead eyebrow="A plan to start with" title={`${plan.name} is where most ${s.name.toLowerCase()} begin.`} lede={plan.blurb} />
            <div className="mt-6 flex flex-wrap gap-3">
              <CtaLink to="/signup">Start free trial</CtaLink>
              <CtaLink to="/pricing" kind="secondary">
                Compare plans
              </CtaLink>
            </div>
          </div>
          <div className="rounded-2xl border border-rule bg-white p-7">
            <p className="text-sm font-bold tracking-[0.12em] text-slate uppercase">{plan.name} includes</p>
            <ul className="mt-4 grid gap-x-8 gap-y-2.5 text-[15.5px] sm:grid-cols-2">
              {[...limitLines(plan), ...featureLines(plan)].map((t) => (
                <li key={t} className="flex gap-2.5">
                  <span className="mt-2 size-1.5 shrink-0 rounded-full bg-leaf" />
                  {t}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </Section>

      <Section tone="white">
        <div className="grid items-center gap-12 lg:grid-cols-2">
          <Visual name={lead?.heroVisual ?? "dialer"} />
          <div>
            <SectionHead title="Not sure it fits?" lede="Tell us how your team works and we will say plainly whether Kchel is the right tool, and which plan fits." />
            <div className="mt-6">
              <SLink to="/contact" className="text-[15px] font-bold text-leaf hover:underline">
                Talk to us
              </SLink>
            </div>
          </div>
        </div>
      </Section>

      <CtaBand />
    </SiteLayout>
  );
}
