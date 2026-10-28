import { Check, Minus } from "lucide-react";

import { PLANS, type Plan, type PlanId } from "@/backend/plans";

import { CtaLink } from "./blocks";

// Straight from the table the app enforces its limits from, so a plan on this
// page can never promise more than the product will deliver.

const PAID: PlanId[] = ["starter", "professional", "business", "managed"];

function money(p: Plan): { big: string; unit: string } {
  if (p.priceFlatMonthly !== undefined) return { big: `$${p.priceFlatMonthly.toLocaleString()}`, unit: "per month, for the whole team" };
  if (p.pricePerAgentMonthly === 0) return { big: "Free", unit: "for 7 days" };
  return { big: `$${p.pricePerAgentMonthly}`, unit: "per agent, per month" };
}

function count(v: number | null, one: string, many: string): string {
  return v === null ? `Unlimited ${many}` : `${v.toLocaleString()} ${v === 1 ? one : many}`;
}

export function limitLines(p: Plan): string[] {
  const l = p.limits;
  const lines = [
    count(l.agents, "agent", "agents"),
    count(l.contacts, "contact", "contacts"),
    count(l.ivrMenus, "IVR menu", "IVR menus"),
    count(l.phoneNumbers, "phone number", "phone numbers"),
  ];
  if (l.recordingRetentionDays === null) lines.push("Call recordings");
  else if (l.recordingRetentionDays > 0) lines.push(`${l.recordingRetentionDays}-day call recordings`);
  return lines;
}

export function featureLines(p: Plan): string[] {
  const f = p.features;
  const lines: string[] = [];
  if (f.powerDialer) lines.push("Power dialer");
  if (f.missedCallTextBack) lines.push("Missed-call text-back");
  if (f.numberHealth || f.numberRotation) lines.push("Number health and rotation");
  if (f.callSummaries) lines.push("AI call summaries and transcripts");
  if (f.aiReceptionist) lines.push("AI receptionist");
  if (f.premiumVoices) lines.push("Premium AI voices");
  if (p.managedSip) lines.push("SIP line supplied and managed");
  return lines;
}

/** Short lines for the website's cards. They are written to the same length so the cards line up. */
const TAGLINE: Partial<Record<PlanId, string>> = {
  starter: "The full dialer on your own phone line. Built for a small team getting going.",
  professional: "More seats, numbers and analytics for a floor that calls all day.",
  business: "One flat price for up to 8 agents, with the AI receptionist included.",
  managed: "We supply and run the phone line, and support your team.",
};

function who(p: Plan): string {
  return p.id === "managed" ? "Talk to us" : "Start free trial";
}

export function PlanCards() {
  return (
    <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-4 xl:gap-7">
      {PAID.map((id) => {
        const p = PLANS[id];
        const featured = id === "business";
        const price = money(p);
        return (
          <article
            key={id}
            className={`relative flex flex-col rounded-2xl bg-white p-7 xl:p-8 ${featured ? "border-2 border-leaf shadow-pane" : "border-2 border-rule"}`}
          >
            <div className="flex h-7 items-center justify-between">
              <h3 className="text-xl font-extrabold tracking-tight">{p.name}</h3>
              {featured && <span className="rounded-full bg-leaf px-3 py-1 text-[11px] font-bold tracking-wide text-white uppercase">Best value</span>}
            </div>
            <p className="mt-3 min-h-[5rem] text-[15.5px] leading-relaxed text-slate">{TAGLINE[id] ?? p.blurb}</p>

            <div className="mt-2 border-t border-rule pt-5">
              <p className="flex items-baseline gap-1.5">
                <span className="text-[2.8rem] leading-none font-extrabold tracking-tight">{price.big}</span>
              </p>
              <p className="mt-1.5 text-sm text-slate">{price.unit}</p>
            </div>

            <CtaLink to={id === "managed" ? "/contact" : "/signup"} kind={featured ? "primary" : "secondary"} className="mt-6 w-full">
              {who(p)}
            </CtaLink>

            <div className="mt-7 flex-1 border-t border-rule pt-6">
              <ul className="space-y-3 text-[15px]">
                {limitLines(p).map((t, i) => (
                  <li key={t} className="flex items-start gap-3">
                    <Check className="mt-0.5 size-4 shrink-0 text-leaf" strokeWidth={3} />
                    <span className={i < 2 ? "font-bold" : ""}>{t}</span>
                  </li>
                ))}
              </ul>
              {featureLines(p).length > 0 && (
                <ul className="mt-5 space-y-3 border-t border-rule pt-5 text-[15px]">
                  {featureLines(p).map((t) => (
                    <li key={t} className="flex items-start gap-3">
                      <Check className="mt-0.5 size-4 shrink-0 text-leaf" strokeWidth={3} />
                      <span>{t}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </article>
        );
      })}
    </div>
  );
}

export function TrialStrip() {
  const t = PLANS.trial;
  return (
    <div className="flex flex-col gap-4 rounded-2xl border border-rule bg-mist px-7 py-6 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <p className="text-lg font-extrabold tracking-tight">Start with the 7-day free trial</p>
        <p className="mt-1 text-[15px] text-slate">
          {t.limits.agents} agent, {t.limits.contacts?.toLocaleString()} contacts, bring your own SIP line. No card needed. Your data carries over when you choose a plan.
        </p>
      </div>
      <CtaLink to="/signup" className="shrink-0">
        Start free trial
      </CtaLink>
    </div>
  );
}

const ROWS: { label: string; cell: (p: Plan) => string | boolean }[] = [
  { label: "Agents", cell: (p) => (p.limits.agents === null ? "Unlimited" : String(p.limits.agents)) },
  { label: "Contacts", cell: (p) => (p.limits.contacts === null ? "Unlimited" : p.limits.contacts.toLocaleString()) },
  { label: "IVR menus", cell: (p) => (p.limits.ivrMenus === null ? "Unlimited" : String(p.limits.ivrMenus)) },
  { label: "Phone numbers", cell: (p) => (p.limits.phoneNumbers === null ? "Unlimited" : String(p.limits.phoneNumbers)) },
  { label: "Call recordings kept", cell: (p) => (p.limits.recordingRetentionDays === 0 ? false : p.limits.recordingRetentionDays === null ? "Unlimited" : `${p.limits.recordingRetentionDays} days`) },
  { label: "Power dialer", cell: (p) => p.features.powerDialer },
  { label: "Missed-call text-back", cell: (p) => p.features.missedCallTextBack },
  { label: "Number health and rotation", cell: (p) => p.features.numberRotation },
  { label: "AI call summaries and transcripts", cell: (p) => p.features.callSummaries },
  { label: "AI receptionist", cell: (p) => p.features.aiReceptionist },
  { label: "Premium AI voices", cell: (p) => p.features.premiumVoices },
  { label: "SIP line supplied", cell: (p) => p.managedSip },
];

export function ComparisonTable() {
  const cols: PlanId[] = ["trial", ...PAID];
  return (
    <div className="overflow-x-auto rounded-xl border border-rule">
      <table className="w-full min-w-[820px] border-collapse text-left text-[15px]">
        <thead>
          <tr className="bg-mist">
            <th scope="col" className="w-[26%] px-5 py-4 text-[13px] font-bold tracking-[0.1em] text-slate uppercase">
              Compare plans
            </th>
            {cols.map((id) => (
              <th key={id} scope="col" className={`px-5 py-4 text-base font-extrabold ${id === "business" ? "text-leaf" : ""}`}>
                {PLANS[id].name}
                <span className="mt-0.5 block text-[13px] font-semibold text-slate">{money(PLANS[id]).big}{PLANS[id].priceFlatMonthly !== undefined ? "/mo" : PLANS[id].pricePerAgentMonthly > 0 ? "/agent" : ""}</span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {ROWS.map((r) => (
            <tr key={r.label} className="border-t border-rule">
              <th scope="row" className="px-5 py-3.5 font-semibold text-ink">
                {r.label}
              </th>
              {cols.map((id) => {
                const v = r.cell(PLANS[id]);
                return (
                  <td key={id} className={`px-5 py-3.5 ${id === "business" ? "bg-leaf/[0.04]" : ""}`}>
                    {v === true ? (
                      <Check className="size-5 text-leaf" strokeWidth={3} aria-label="Included" />
                    ) : v === false ? (
                      <Minus className="size-5 text-ink/25" aria-label="Not included" />
                    ) : (
                      <span className="font-semibold">{v}</span>
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
