import { createFileRoute, notFound } from "@tanstack/react-router";

import { CtaBand, CtaLink, FaqList, Highlights, PageHero, Section, SectionHead, SLink, Split, TextLink } from "@/site/blocks";
import { PRODUCTS } from "@/site/content";
import { SiteLayout } from "@/site/Layout";

export const Route = createFileRoute("/product/$slug")({
  loader: ({ params }) => {
    const product = PRODUCTS.find((p) => p.slug === params.slug);
    if (!product) throw notFound();
    return { slug: product.slug };
  },
  head: ({ params }) => {
    const p = PRODUCTS.find((x) => x.slug === params.slug);
    return {
      meta: [
        { title: `${p?.name ?? "Product"} — Kchel Dialer` },
        { name: "description", content: p ? `${p.headline} ${p.lede}` : "Kchel Dialer product." },
      ],
    };
  },
  component: ProductPage,
});

function ProductPage() {
  const { slug } = Route.useParams();
  const p = PRODUCTS.find((x) => x.slug === slug)!;
  const others = PRODUCTS.filter((x) => x.slug !== slug).slice(0, 3);
  return (
    <SiteLayout>
      <PageHero
        trail={[{ label: "Home", to: "/" }, { label: "Product", to: "/product" }, { label: p.name }]}
        eyebrow={p.from ? `${p.name} · from the ${p.from} plan` : p.name}
        title={p.headline}
        lede={p.lede}
        visual={p.heroVisual}
        actions={
          <>
            <CtaLink to="/signup">Start free trial</CtaLink>
            <CtaLink to="/contact" kind="secondary">
              Talk to us
            </CtaLink>
          </>
        }
      />

      <section className="bg-white">
        <div className="mx-auto max-w-[1200px] px-5 py-10 sm:px-8">
          <Highlights items={p.facts} />
        </div>
      </section>

      {p.blocks.map((b, i) => (
        <Section key={b.title} tone={i % 2 === 0 ? "white" : "mist"} className={i === 0 ? "pt-0" : ""}>
          <Split block={b} flip={i % 2 === 1} />
        </Section>
      ))}

      <Section tone="white">
        <div className="grid gap-12 lg:grid-cols-[0.8fr_1.4fr]">
          <SectionHead eyebrow="Questions" title={`About ${p.name.toLowerCase()}`} />
          <FaqList items={p.faqs} />
        </div>
      </Section>

      <Section tone="mist">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <SectionHead title="Explore more of the platform" />
          <TextLink to="/product">All features</TextLink>
        </div>
        <div className="mt-10 grid gap-6 md:grid-cols-3">
          {others.map((o) => (
            <SLink key={o.slug} to={`/product/${o.slug}`} className="group rounded-xl border border-rule bg-white p-7 hover:border-leaf">
              <h3 className="text-[1.25rem] font-extrabold tracking-tight group-hover:text-leaf">{o.name}</h3>
              <p className="mt-2 text-[15.5px] leading-relaxed text-slate">{o.short}</p>
            </SLink>
          ))}
        </div>
      </Section>

      <CtaBand />
    </SiteLayout>
  );
}
