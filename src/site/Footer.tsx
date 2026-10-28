import { Logo } from "@/components/brand/Logo";

import { CtaLink, Container, SLink } from "./blocks";
import { GUIDES, PRODUCTS, SOLUTIONS } from "./content";

function Column({ title, links }: { title: string; links: { label: string; to: string }[] }) {
  return (
    <div>
      <h3 className="text-[13px] font-bold tracking-[0.12em] text-white/55 uppercase">{title}</h3>
      <ul className="mt-4 space-y-2.5">
        {links.map((l) => (
          <li key={l.to}>
            <SLink to={l.to} className="text-[15px] text-white/85 hover:text-white hover:underline">
              {l.label}
            </SLink>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function SiteFooter() {
  return (
    <footer className="bg-[#071a2e] text-white">
      <Container className="py-16">
        <div className="grid gap-12 lg:grid-cols-[1.3fr_repeat(4,1fr)]">
          <div className="max-w-xs">
            <Logo markClassName="size-9" className="text-[1.15rem] [&_span]:!text-white" />
            <p className="mt-5 text-[15px] leading-relaxed text-white/70">
              The phone system your sales floor actually dials with. Calling, campaigns, AI voice agents and a team workspace in one place.
            </p>
            <div className="mt-6 flex gap-3">
              <CtaLink to="/signup" className="h-11">
                Start free trial
              </CtaLink>
            </div>
          </div>
          <Column title="Product" links={PRODUCTS.map((p) => ({ label: p.name, to: `/product/${p.slug}` }))} />
          <Column title="Solutions" links={SOLUTIONS.map((s) => ({ label: s.name, to: `/solutions/${s.slug}` }))} />
          <Column
            title="Resources"
            links={[
              { label: "All guides", to: "/resources" },
              ...GUIDES.slice(0, 4).map((g) => ({ label: g.title, to: `/resources/${g.slug}` })),
              { label: "FAQ", to: "/faq" },
            ]}
          />
          <Column
            title="Company"
            links={[
              { label: "About", to: "/about" },
              { label: "Pricing", to: "/pricing" },
              { label: "Security", to: "/security" },
              { label: "Windows app", to: "/download" },
              { label: "Contact us", to: "/contact" },
              { label: "Sign in", to: "/login" },
            ]}
          />
        </div>
      </Container>
      <div className="border-t border-white/10">
        <Container className="flex flex-col gap-3 py-6 text-[13.5px] text-white/60 sm:flex-row sm:items-center sm:justify-between">
          <p>© {new Date().getFullYear()} Kchel Dialer. All rights reserved.</p>
          <div className="flex gap-6">
            <SLink to="/legal/terms" className="hover:text-white">
              Terms of service
            </SLink>
            <SLink to="/legal/privacy" className="hover:text-white">
              Privacy policy
            </SLink>
          </div>
        </Container>
      </div>
    </footer>
  );
}
