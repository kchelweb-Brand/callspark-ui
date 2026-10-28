import { createFileRoute, notFound } from "@tanstack/react-router";

import { Breadcrumb, Container, CtaBand, SLink, TextLink } from "@/site/blocks";
import { GUIDES } from "@/site/content";
import { SiteLayout } from "@/site/Layout";

export const Route = createFileRoute("/resources/$slug")({
  loader: ({ params }) => {
    if (!GUIDES.some((g) => g.slug === params.slug)) throw notFound();
    return null;
  },
  head: ({ params }) => {
    const g = GUIDES.find((x) => x.slug === params.slug);
    return {
      meta: [
        { title: `${g?.title ?? "Guide"} — Kchel Dialer` },
        { name: "description", content: g?.summary ?? "A Kchel Dialer guide." },
      ],
    };
  },
  component: GuidePage,
});

function GuidePage() {
  const { slug } = Route.useParams();
  const g = GUIDES.find((x) => x.slug === slug)!;
  const next = GUIDES[(GUIDES.findIndex((x) => x.slug === slug) + 1) % GUIDES.length]!;
  return (
    <SiteLayout>
      <section className="border-b border-rule bg-mist">
        <Container className="py-14 sm:py-20">
          <Breadcrumb trail={[{ label: "Home", to: "/" }, { label: "Resources", to: "/resources" }, { label: g.title }]} />
          <h1 className="max-w-3xl text-[2.3rem] leading-[1.1] font-extrabold tracking-tight sm:text-[3rem]">{g.title}</h1>
          <p className="mt-4 text-[18px] text-slate">
            {g.summary} <span className="text-ink/60">· {g.minutes} minute read</span>
          </p>
        </Container>
      </section>

      <Container className="grid gap-12 py-14 lg:grid-cols-[1fr_17rem] lg:py-20">
        <ol className="max-w-3xl space-y-9">
          {g.steps.map((s, i) => (
            <li key={s.title} className="grid grid-cols-[2.75rem_1fr] gap-4">
              <span className="flex size-11 items-center justify-center rounded-full bg-navy text-[17px] font-extrabold text-white">{i + 1}</span>
              <div>
                <h2 className="text-[1.3rem] font-extrabold tracking-tight">{s.title}</h2>
                <p className="mt-2 text-[17px] leading-relaxed text-slate">{s.body}</p>
              </div>
            </li>
          ))}
          {g.tips.length > 0 && (
            <li className="rounded-xl border border-rule bg-mist p-6">
              <p className="text-sm font-bold tracking-[0.12em] text-leaf uppercase">Good to know</p>
              <ul className="mt-3 list-disc space-y-2 pl-5 text-[16px] leading-relaxed text-slate">
                {g.tips.map((t) => (
                  <li key={t}>{t}</li>
                ))}
              </ul>
            </li>
          )}
        </ol>

        <aside className="lg:sticky lg:top-32 lg:self-start">
          <p className="text-sm font-bold tracking-[0.12em] text-slate uppercase">More guides</p>
          <ul className="mt-3 divide-y divide-rule border-y border-rule">
            {GUIDES.filter((x) => x.slug !== slug).map((x) => (
              <li key={x.slug}>
                <SLink to={`/resources/${x.slug}`} className="block py-3 text-[15px] font-semibold hover:text-leaf">
                  {x.title}
                </SLink>
              </li>
            ))}
          </ul>
          <div className="mt-8">
            <TextLink to={`/resources/${next.slug}`}>Next: {next.title}</TextLink>
          </div>
        </aside>
      </Container>

      <CtaBand />
    </SiteLayout>
  );
}
