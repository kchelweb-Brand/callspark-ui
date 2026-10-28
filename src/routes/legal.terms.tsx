import { createFileRoute } from "@tanstack/react-router";

import { Container, SLink, TextPageHead } from "@/site/blocks";
import { SiteLayout } from "@/site/Layout";

export const Route = createFileRoute("/legal/terms")({
  head: () => ({
    meta: [
      { title: "Terms of service — Kchel Dialer" },
      { name: "description", content: "The terms for using Kchel Dialer." },
    ],
  }),
  component: TermsPage,
});

const SECTIONS: { title: string; body: string[] }[] = [
  {
    title: "1. Who these terms are between",
    body: [
      "These terms are an agreement between you (the person or business that creates a workspace) and Kchel Dialer (\"we\", \"us\"). By creating a workspace or using the service you agree to them. If you use the service for a business, you confirm you can bind that business.",
    ],
  },
  {
    title: "2. Your workspace and your team",
    body: [
      "You are responsible for everything that happens in your workspace, including what the agents you invite do. Keep your email account secure: it is how you and your agents sign in. Tell us promptly if you think someone has gained access who should not have.",
    ],
  },
  {
    title: "3. Plans, trials and payment",
    body: [
      "A new workspace starts with a free trial. When it ends the workspace is paused until you choose a plan. Plans, limits and prices are shown on the pricing page. You pay using the payment options shown in Billing, and your plan is activated after we confirm the payment. Annual billing is available at the discount shown. Prices may change for new purchases; we will not change what you have already paid for.",
    ],
  },
  {
    title: "4. Calls, texts and the law",
    body: [
      "You are responsible for following the laws that apply to your calling and messaging, including rules on consent, do-not-call lists, call recording, caller identification, and automated or artificial voices, in every place you and your contacts are located.",
      "You must have the consent the law requires before you place automated calls or send text messages. AI voice agent campaigns require you to confirm that your contacts consented and that the call discloses it is automated. You must not use the service for unlawful, deceptive, harassing or fraudulent calls or messages, or to impersonate another person or organisation.",
    ],
  },
  {
    title: "5. Your phone line and carrier",
    body: [
      "On plans where you bring your own phone line, your calls are carried and billed by your own provider under your own agreement with them. We are not responsible for your provider's service or charges. Where we supply a line, its use is also subject to our telephony partner's acceptable-use rules.",
    ],
  },
  {
    title: "6. AI features",
    body: [
      "The AI voice agent, AI receptionist, summaries and the help assistant use automated systems that can make mistakes. Review what matters. Do not rely on them for legal, medical or financial decisions. You are responsible for the script and instructions you give an AI agent and for how its output is used.",
    ],
  },
  {
    title: "7. Your data",
    body: [
      "Your contacts, recordings and call history belong to you. You give us permission to store and process them only to provide the service. You can export your data, including after a trial ends. See the privacy policy for how we handle it.",
    ],
  },
  {
    title: "8. Acceptable use",
    body: [
      "Do not attempt to break, probe or overload the service, to access another workspace, or to use the service in a way that harms others or our systems. We may suspend a workspace that breaks these terms or the law, and will tell you why where we can.",
    ],
  },
  {
    title: "9. Availability and liability",
    body: [
      "We work to keep the service running but cannot promise it will always be available or error-free. To the extent the law allows, we are not liable for indirect or consequential losses, or for losses caused by your carrier, your internet connection or events outside our control. Our total liability for any claim is limited to the amount you paid us in the three months before it arose.",
    ],
  },
  {
    title: "10. Ending the agreement",
    body: [
      "You can stop using the service at any time. We may end or suspend access if you break these terms. When a workspace ends we will keep your data available for export for a reasonable period before deleting it.",
    ],
  },
  {
    title: "11. Changes and contact",
    body: [
      "We may update these terms and will say so on this page, and in the app for material changes. Continuing to use the service after a change means you accept it. Questions about these terms can be sent through the contact page.",
    ],
  },
];

function TermsPage() {
  return (
    <SiteLayout>
      <TextPageHead trail={[{ label: "Home", to: "/" }, { label: "Terms of service" }]} title="Terms of service" lede="Last updated October 2026." />
      <Container className="max-w-[820px] py-14 lg:py-20">
        <div className="space-y-10">
          {SECTIONS.map((s) => (
            <section key={s.title}>
              <h2 className="text-[1.25rem] font-extrabold tracking-tight">{s.title}</h2>
              {s.body.map((p) => (
                <p key={p} className="mt-3 text-[17px] leading-relaxed text-slate">
                  {p}
                </p>
              ))}
            </section>
          ))}
        </div>
        <p className="mt-14 border-t border-rule pt-6 text-[15px] text-slate">
          See also the{" "}
          <SLink to="/legal/privacy" className="font-bold text-leaf hover:underline">
            privacy policy
          </SLink>
          .
        </p>
      </Container>
    </SiteLayout>
  );
}
