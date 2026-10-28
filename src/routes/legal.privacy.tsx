import { createFileRoute } from "@tanstack/react-router";

import { Container, SLink, TextPageHead } from "@/site/blocks";
import { SiteLayout } from "@/site/Layout";

export const Route = createFileRoute("/legal/privacy")({
  head: () => ({
    meta: [
      { title: "Privacy policy — Kchel Dialer" },
      { name: "description", content: "What Kchel Dialer collects, why, who it is shared with, and the choices you have." },
    ],
  }),
  component: PrivacyPage,
});

const SECTIONS: { title: string; body: string[] }[] = [
  {
    title: "What we collect",
    body: [
      "Account details: your name, email address, country, city, mobile number, company name, address and website if you give them, and the workspace name you choose.",
      "Workspace content: contacts and lists you import or add, call records (who, when, how long, outcome), recordings, transcripts and summaries where those features are used, messages, tasks and support conversations.",
      "Technical data: sign-in codes (stored only in a hashed form), basic request information such as network address for abuse prevention, and usage counts used to apply plan limits.",
      "If you use the help assistant, the questions you type are sent to an AI service to produce an answer. Do not type passwords, codes or card numbers into it.",
    ],
  },
  {
    title: "How we use it",
    body: [
      "To run the service you asked for, to sign you in, to apply your plan and its limits, to send the emails and texts that the service needs (such as sign-in codes and invitations), to provide support, to keep the service secure and prevent abuse, and to improve the product.",
      "We do not sell your personal information or your contacts' details.",
    ],
  },
  {
    title: "Who we share it with",
    body: [
      "We use service providers to operate Kchel: cloud hosting and a managed database, an email delivery service, a telephony and messaging provider, an AI processing service for voice agents, summaries and the help assistant, and payment providers when you pay. They process data only to provide those services to us.",
      "Calls and texts also pass through the phone line you connect, under your provider's own policies. We may disclose information if the law requires it.",
    ],
  },
  {
    title: "Your contacts' information",
    body: [
      "You decide which contacts to upload and who to call. For the people in your lists, you are responsible for having a lawful basis, including consent where the law requires it, and for honouring requests such as do-not-call. We process that data on your behalf, to run your workspace.",
    ],
  },
  {
    title: "How long we keep it",
    body: [
      "We keep your workspace data while your workspace exists. Recordings are kept for the period your plan allows. When a workspace ends we keep your data available for export for a reasonable period, then delete it. You can ask us to delete your data sooner.",
    ],
  },
  {
    title: "Your choices",
    body: [
      "You can view and edit your workspace data in the app, export it, and delete contacts and recordings. You can ask us to correct or delete your account information, or to explain what we hold about you, through the contact page. Depending on where you live, you may have further rights under local law, and we will respect them.",
    ],
  },
  {
    title: "Security",
    body: [
      "Sign-in uses one-time codes rather than passwords. Access inside a workspace is limited by the permissions the owner sets and is enforced on our servers. Stored secrets such as SIP passwords are encrypted, and data is sent over encrypted connections. No system is perfectly secure, so please tell us at once if you notice anything wrong.",
    ],
  },
  {
    title: "Children",
    body: ["Kchel Dialer is for businesses and is not intended for children."],
  },
  {
    title: "Changes",
    body: ["We will post any changes to this policy on this page, and tell you in the app if they are significant."],
  },
];

function PrivacyPage() {
  return (
    <SiteLayout>
      <TextPageHead trail={[{ label: "Home", to: "/" }, { label: "Privacy policy" }]} title="Privacy policy" lede="Last updated October 2026." />
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
          Questions about privacy? Use the{" "}
          <SLink to="/contact" className="font-bold text-leaf hover:underline">
            contact page
          </SLink>
          . See also the{" "}
          <SLink to="/legal/terms" className="font-bold text-leaf hover:underline">
            terms of service
          </SLink>
          .
        </p>
      </Container>
    </SiteLayout>
  );
}
