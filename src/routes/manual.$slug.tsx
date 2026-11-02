import { createFileRoute, notFound } from "@tanstack/react-router";
import { Clock, Monitor } from "lucide-react";

import { Inline, MoreSection, StepList } from "@/components/manual/ManualParts";
import { Breadcrumb, Container, CtaBand, SLink, TextLink } from "@/site/blocks";
import { SiteLayout } from "@/site/Layout";
import { LEVELS, MANUAL, articlePath, getArticle, getShot, plain } from "@/manual";
import { breadcrumbLd, howToLd, ldScript } from "@/site/seo";

export const Route = createFileRoute("/manual/$slug")({
  loader: ({ params }) => {
    if (!getArticle(params.slug)) throw notFound();
    return null;
  },
  head: ({ params }) => {
    const a = getArticle(params.slug);
    return {
      meta: [
        { title: `${a?.title ?? "Guide"}: Kchel Dialer manual` },
        { name: "description", content: a ? plain(a.summary) : "A Kchel Dialer guide." },
      ],
      scripts: a
        ? [
            ldScript(breadcrumbLd([{ name: "Home", path: "/" }, { name: "Manual", path: "/manual" }, { name: a.title }])),
            ...(a.steps.length > 0
              ? [
                  ldScript(
                    howToLd({
                      name: a.title,
                      description: plain(a.summary),
                      path: articlePath(a.slug),
                      time: a.time,
                      steps: a.steps.map((s) => {
                        const text = plain(s.text);
                        return { name: text.split(/(?<=[.!?])\s/)[0]?.slice(0, 110) ?? text, text, image: getShot(s.shot)?.src };
                      }),
                    }),
                  ),
                ]
              : []),
          ]
        : [],
    };
  },
  component: ManualArticlePage,
});

function ManualArticlePage() {
  const { slug } = Route.useParams();
  const a = getArticle(slug)!;
  const levelLabel = LEVELS.find((l) => l.id === a.level)!.label;
  const index = MANUAL.findIndex((x) => x.slug === slug);
  const next = MANUAL[index + 1];
  const previous = index > 0 ? MANUAL[index - 1] : undefined;
  const related = (a.related ?? []).map((s) => getArticle(s)).filter((x): x is NonNullable<typeof x> => Boolean(x));

  return (
    <SiteLayout>
      <section className="border-b border-rule bg-mist">
        <Container className="py-12 sm:py-16">
          <Breadcrumb trail={[{ label: "Home", to: "/" }, { label: "Manual", to: "/manual" }, { label: a.title }]} />
          <div className="mb-3 flex flex-wrap items-center gap-3 text-[12px] font-bold tracking-[0.1em] text-slate uppercase">
            <span className="rounded-full bg-navy px-3 py-1 text-white">{levelLabel}</span>
            <span className="flex items-center gap-1">
              <Clock className="size-3.5" /> {a.time}
            </span>
            {a.desktop && (
              <span className="flex items-center gap-1">
                <Monitor className="size-3.5" /> Windows Dialer
              </span>
            )}
          </div>
          <h1 className="max-w-3xl text-[2.2rem] leading-[1.1] font-extrabold tracking-tight sm:text-[2.9rem]">{a.title}</h1>
          <p className="mt-4 max-w-3xl text-[18px] leading-relaxed text-slate">
            <Inline text={a.summary} />
          </p>
        </Container>
      </section>

      <Container className="grid gap-12 py-12 lg:grid-cols-[1fr_17rem] lg:py-16">
        <div className="min-w-0 max-w-3xl space-y-10">
          {a.steps.length > 0 && <StepList steps={a.steps} />}
          {(a.more ?? []).map((s) => (
            <MoreSection key={s.heading} section={s} />
          ))}
          {a.tips && a.tips.length > 0 && (
            <div className="rounded-xl border border-rule bg-mist p-6">
              <p className="text-sm font-bold tracking-[0.12em] text-leaf uppercase">Good to know</p>
              <ul className="mt-3 list-disc space-y-2 pl-5 text-[16px] leading-relaxed text-slate">
                {a.tips.map((t) => (
                  <li key={t}>{t}</li>
                ))}
              </ul>
            </div>
          )}
          {related.length > 0 && (
            <div>
              <p className="text-sm font-bold tracking-[0.12em] text-slate uppercase">Read next</p>
              <ul className="mt-3 divide-y divide-rule border-y border-rule">
                {related.map((r) => (
                  <li key={r.slug}>
                    <SLink to={articlePath(r.slug)} className="block py-3 text-[16px] font-semibold hover:text-leaf">
                      {r.title}
                    </SLink>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <div className="rounded-xl border border-rule p-6">
            <p className="text-[16px] font-semibold">Still stuck?</p>
            <p className="mt-1 text-[15.5px] leading-relaxed text-slate">
              Ask the Help button at the bottom right of any page. It reads these guides and answers in your own words. If it cannot solve it, it passes your question to the team.
            </p>
          </div>
          <div className="flex flex-wrap justify-between gap-4 text-[15px]">
            {previous ? <TextLink to={articlePath(previous.slug)}>Previous: {previous.title}</TextLink> : <span />}
            {next && <TextLink to={articlePath(next.slug)}>Next: {next.title}</TextLink>}
          </div>
        </div>

        <aside className="lg:sticky lg:top-32 lg:max-h-[calc(100vh-9rem)] lg:self-start lg:overflow-y-auto">
          {LEVELS.map((l) => (
            <div key={l.id} className="mb-6">
              <p className="text-sm font-bold tracking-[0.12em] text-slate uppercase">{l.label}</p>
              <ul className="mt-2 border-l border-rule">
                {MANUAL.filter((x) => x.level === l.id).map((x) => (
                  <li key={x.slug}>
                    <SLink
                      to={articlePath(x.slug)}
                      className={`block border-l-2 py-1.5 pl-3 text-[14.5px] ${
                        x.slug === slug ? "-ml-px border-leaf font-bold text-ink" : "-ml-px border-transparent text-slate hover:text-leaf"
                      }`}
                    >
                      {x.title}
                    </SLink>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </aside>
      </Container>

      <CtaBand />
    </SiteLayout>
  );
}
