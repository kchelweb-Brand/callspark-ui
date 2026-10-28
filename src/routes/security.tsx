import { createFileRoute } from "@tanstack/react-router";

import { CtaBand, Section, SectionHead, SLink, TextPageHead } from "@/site/blocks";
import { SECURITY_POINTS } from "@/site/content";
import { SiteLayout } from "@/site/Layout";

export const Route = createFileRoute("/security")({
  head: () => ({
    meta: [
      { title: "Security — Kchel Dialer" },
      { name: "description", content: "How Kchel Dialer protects sign-in, access, secrets and your data, in plain language." },
    ],
  }),
  component: SecurityPage,
});

function SecurityPage() {
  return (
    <SiteLayout>
      <TextPageHead
        trail={[{ label: "Home", to: "/" }, { label: "Security" }]}
        title="Security that you can read in a minute."
        lede="What we do to protect your workspace, written plainly, with nothing claimed that the product does not do."
      />

      <Section tone="white">
        <div className="grid gap-px overflow-hidden rounded-2xl border border-rule bg-rule md:grid-cols-2">
          {SECURITY_POINTS.map((p) => (
            <div key={p.title} className="bg-white p-8">
              <h2 className="text-[1.25rem] font-extrabold tracking-tight">{p.title}</h2>
              <p className="mt-2 text-[16px] leading-relaxed text-slate">{p.body}</p>
            </div>
          ))}
        </div>
      </Section>

      <Section tone="mist">
        <div className="grid gap-12 lg:grid-cols-2">
          <div>
            <SectionHead title="Where your data lives" />
            <p className="mt-4 text-[17px] leading-relaxed text-slate">
              The website and app run on Cloudflare's network, and your workspace data is kept in a managed PostgreSQL database. Everything travels over encrypted connections. Calls and texts are carried by the phone line you connect, or by our telephony partner on plans where we supply it.
            </p>
          </div>
          <div>
            <SectionHead title="What you control" />
            <p className="mt-4 text-[17px] leading-relaxed text-slate">
              You decide who has access, what each agent may do, how long recordings are kept within your plan, and which contacts are never called or texted. You can switch an agent off at any time, and it takes effect straight away.
            </p>
          </div>
        </div>
        <p className="mt-12 text-[16px] leading-relaxed text-slate">
          Found something that worries you? Tell us through{" "}
          <SLink to="/contact" className="font-bold text-leaf hover:underline">
            the contact form
          </SLink>{" "}
          and we will look at it promptly.
        </p>
      </Section>

      <CtaBand />
    </SiteLayout>
  );
}
