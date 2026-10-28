import { createFileRoute } from "@tanstack/react-router";

import { CtaBand, CtaLink, Container, Section, SectionHead, SLink, Ticks } from "@/site/blocks";
import { SiteLayout } from "@/site/Layout";
import { Visual } from "@/site/mocks";

export const Route = createFileRoute("/download")({
  head: () => ({
    meta: [
      { title: "Windows app — Kchel Dialer" },
      { name: "description", content: "The Kchel Dialer desktop softphone for Windows: connects to your phone line automatically and keeps the whole workspace beside the keypad." },
    ],
  }),
  component: DownloadPage,
});

function DownloadPage() {
  return (
    <SiteLayout>
      <section className="border-b border-rule bg-mist">
        <Container className="grid items-center gap-12 py-14 sm:py-20 lg:grid-cols-[1.05fr_1fr] lg:gap-16">
          <div>
            <p className="text-[13px] font-bold tracking-[0.12em] text-leaf uppercase">Kchel Dialer for Windows</p>
            <h1 className="mt-3 text-[2.4rem] leading-[1.08] font-extrabold tracking-tight sm:text-[3.3rem]">The softphone for people who spend the day on calls.</h1>
            <p className="mt-5 max-w-xl text-[19px] leading-relaxed text-slate">
              A desktop app that registers to your phone line on its own, shows who is calling, and keeps contacts, campaigns and history in one window.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <CtaLink to="/signup">Start free trial</CtaLink>
              <CtaLink to="/login" kind="secondary">
                Sign in to download
              </CtaLink>
            </div>
            <p className="mt-4 text-sm text-slate">For Windows 10 and 11. Download it from Billing, inside your own workspace.</p>
          </div>
          <Visual name="desktop" />
        </Container>
      </section>

      <Section tone="white">
        <div className="grid gap-12 lg:grid-cols-2">
          <div>
            <SectionHead title="What the app gives you" />
            <div className="mt-6">
              <Ticks
                items={[
                  "Connects to your phone line automatically and shows when it is registered",
                  "Type or paste a number, press Enter. Local numbers are completed with your country code",
                  "Incoming calls and team notifications appear on your desktop",
                  "The power dialer, contacts, campaigns, recordings and settings, with the same data as the website",
                  "A WhatsApp chat shortcut on every contact",
                ]}
              />
            </div>
          </div>
          <div>
            <SectionHead title="How to get it" />
            <ol className="mt-6 space-y-5 text-[17px] leading-relaxed text-slate">
              <li>
                <span className="font-extrabold text-ink">1. Create a workspace.</span> The trial is free for seven days.
              </li>
              <li>
                <span className="font-extrabold text-ink">2. Open Billing.</span> The Windows app is an add-on with a one-time payment, included free on Managed Enterprise.
              </li>
              <li>
                <span className="font-extrabold text-ink">3. Download and sign in.</span> Use your workspace name, your email and the code we send you.
              </li>
            </ol>
            <p className="mt-6 text-[16px] text-slate">
              Prefer a browser?{" "}
              <SLink to="/product/phone-system" className="font-bold text-leaf hover:underline">
                You can call from any browser too.
              </SLink>
            </p>
          </div>
        </div>
      </Section>
      <CtaBand />
    </SiteLayout>
  );
}
