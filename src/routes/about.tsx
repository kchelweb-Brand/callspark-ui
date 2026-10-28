import { createFileRoute } from "@tanstack/react-router";

import { LogoMark } from "@/components/brand/Logo";
import { Container, CtaBand, Section, SectionHead, TextPageHead } from "@/site/blocks";
import { SiteLayout } from "@/site/Layout";

export const Route = createFileRoute("/about")({
  head: () => ({
    meta: [
      { title: "About — Kchel Dialer" },
      { name: "description", content: "What Kchel Dialer is for, how we think about calling software, and the principles we build by." },
    ],
  }),
  component: AboutPage,
});

const PRINCIPLES = [
  { title: "A dialer, not just a phone system", body: "Most phone systems are built to receive calls. Kchel is built around the person who spends the day making them, and the logo says so: a K that also reads as fast-forward." },
  { title: "Keep your carrier, keep your rates", body: "We do not mark up your minutes unless you ask us to supply the line. Bring your own provider, and your call charges stay between you and them." },
  { title: "Say what it does, and only that", body: "Plans list real limits. AI features say what they can and cannot do. If something is not supported, the product and this website say so." },
  { title: "People stay in charge", body: "Automation handles the first pass, the missed call and the after-hours message. Owners decide what an agent or an AI agent is allowed to do, and every action is recorded." },
  { title: "Small enough to answer", body: "When you write to us, a person reads it. Help is a click away in the app, and a human is one step behind the assistant." },
];

function AboutPage() {
  return (
    <SiteLayout>
      <TextPageHead
        trail={[{ label: "Home", to: "/" }, { label: "About" }]}
        title="Calling software for people who live on the phone."
        lede="Kchel Dialer brings the phone line, the list, the dialer, the AI agent and the team into one workspace, so a small team can work like a much larger one."
      />

      <Section tone="white">
        <div className="grid items-start gap-12 lg:grid-cols-[1fr_1.3fr]">
          <div className="flex items-center gap-6 rounded-2xl border border-rule bg-mist p-10">
            <LogoMark className="size-28 shrink-0" />
            <p className="text-[15.5px] leading-relaxed text-slate">
              The mark is a K made from a stem and two forward chevrons: a letter that also means <span className="font-bold text-ink">go</span>.
            </p>
          </div>
          <div>
            <SectionHead title="What we are building" />
            <div className="mt-5 space-y-4 text-[17px] leading-relaxed text-slate">
              <p>
                A sales floor, a clinic front desk and a collections team all need the same few things: a line that works, a list to work through, a record of what happened, and a way to keep the team organised. They rarely need five separate products to get them.
              </p>
              <p>
                So Kchel puts those parts together, and adds the things that are newly possible: an AI voice agent that can make the first pass on a long list, and a receptionist that answers when nobody can, written to be honest about being automated.
              </p>
            </div>
          </div>
        </div>
      </Section>

      <Section tone="mist">
        <SectionHead eyebrow="How we work" title="Five things we hold to." />
        <dl className="mt-12 grid gap-px overflow-hidden rounded-2xl border border-rule bg-rule md:grid-cols-2">
          {PRINCIPLES.map((p, i) => (
            <div key={p.title} className={`bg-white p-8 ${i === PRINCIPLES.length - 1 ? "md:col-span-2" : ""}`}>
              <dt className="text-[1.25rem] font-extrabold tracking-tight">{p.title}</dt>
              <dd className="mt-2 max-w-2xl text-[16px] leading-relaxed text-slate">{p.body}</dd>
            </div>
          ))}
        </dl>
      </Section>

      <section className="bg-white">
        <Container className="py-16 text-center">
          <p className="mx-auto max-w-2xl text-[19px] leading-relaxed text-slate">
            Want to see whether it fits? The fastest way to find out is to use it. The trial is free for seven days.
          </p>
        </Container>
      </section>
      <CtaBand />
    </SiteLayout>
  );
}
