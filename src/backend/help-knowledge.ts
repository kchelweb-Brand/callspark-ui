// What the help assistant knows: the manual (src/manual), written against the real menus and
// screens, plus the live plan table. The assistant answers Kchel-specific questions from these, so
// when a screen changes, change its guide in the manual and both the manual page and the assistant
// follow.
//
// Server-only: it is read when a question arrives, never shipped to the browser.

import { MANUAL, plain, type ManualArticle } from "../manual";
import { FEATURE_LABELS, PLANS, type PlanFeatures } from "./plans";

export interface HelpArticle {
  id: string;
  title: string;
  /** Words a person might use that the guide itself does not. */
  keywords: string[];
  /** Everything in the guide as plain text, for the assistant to read. */
  body: string;
  article: ManualArticle;
}

/** Always given to the assistant: what the product is and the ground rules for where things live. */
export const PRODUCT_BRIEF =
  "Kchel Dialer is a call center platform for teams and solo operators. It has a website (sign in at the workspace page with " +
  "your email and a one-time code, there is no password) and a Windows desktop app also called Kchel Dialer. Both show the same " +
  "workspace: contacts, campaigns, call history, recordings, phone system settings, agents, billing and support. " +
  "Website menu: Overview, Live Calls, Agents, Team, Analytics, Campaigns, Contacts, SMS, Call History, Recordings, Phone System, " +
  "Automations, Settings, Billing, Support, and Manual (step-by-step guides with screenshots, at /manual). " +
  "Phone System tabs: Inbound, Outbound, Connection, Numbers, IVR Menus, Call Routing, Business Hours, Extensions, Voicemail. " +
  "Desktop app menu: Notifications, Team tasks, Messages, Overview, Live calls, Agents, Analytics, Dialer, Contacts, Campaigns, SMS, " +
  "Call history, Recordings, IVR menus, Extensions, Voicemail, Numbers, Number health, Automations, Billing, Support, Settings, SIP configuration. " +
  "Campaigns are either Manual dialing (people call the list, with the power dialer) or Voice broadcast (a recording is played to everyone who answers). " +
  "On most plans the customer brings their own phone provider (carrier) and enters its SIP credentials; on Managed Enterprise Kchel runs the carrier. Anyone can also contact the admin through Support to ask for Managed SIP credentials.";

/**
 * The same, for an agent: their own menu, and nothing about plans, prices or the carrier. Which parts of the
 * menu they actually have depends on what the workspace owner switched on for them.
 */
export const PRODUCT_BRIEF_FOR_AGENTS =
  "Kchel Dialer is a call center platform. This person is an agent invited to a workspace by its owner. They sign in on the website " +
  "with the workspace name, their email and a one-time code (no password). Their menu holds only what the owner allowed: My day " +
  "(calls today, tasks, messages and the softphone, where they press Go online to make and take calls), Contacts, Campaigns (a read-only list), SMS, " +
  "Call History, Recordings (calls and voicemail), My stats (their own numbers) and Phone System (numbers, IVR menus, call routing, business hours, " +
  "extensions and voicemail, either view-only or changeable). They never see Billing, the plan, Settings, Automations, the agents list or the phone line connection. " +
  "If something is missing from their menu, the owner has not switched it on, and they should ask the owner.";

function featureList(features: PlanFeatures): string {
  return (Object.keys(FEATURE_LABELS) as (keyof PlanFeatures)[])
    .filter((k) => features[k])
    .map((k) => FEATURE_LABELS[k])
    .join(", ");
}

/** The current plans, read from the same table that enforces them, so prices and limits here are never stale. */
export function planFacts(): string {
  const lines = Object.values(PLANS)
    .filter((p) => p.id !== "trial")
    .map((p) => {
      const price =
        p.priceFlatMonthly !== undefined
          ? `$${p.priceFlatMonthly.toLocaleString()} a month flat for the whole team`
          : p.pricePerAgentMonthly > 0
            ? `$${p.pricePerAgentMonthly} per agent per month`
            : "quoted individually";
      const l = p.limits;
      const lim = [
        l.agents !== null ? `${l.agents} agents` : "unlimited agents",
        l.contacts !== null ? `${l.contacts.toLocaleString()} contacts` : "unlimited contacts",
        l.ivrMenus !== null ? `${l.ivrMenus} IVR menus` : "unlimited IVR menus",
        l.phoneNumbers !== null ? `${l.phoneNumbers} phone numbers` : "unlimited phone numbers",
        l.recordingRetentionDays ? `${l.recordingRetentionDays} days of recordings` : "",
      ]
        .filter(Boolean)
        .join(", ");
      const feats = featureList(p.features);
      return `${p.name}: ${price}. Includes up to ${lim}.${feats ? ` Extras: ${feats}.` : ""}${p.managedSip ? " Kchel runs the carrier, the Windows Dialer is included, and it comes with full support and maintenance." : " Runs on the customer's own carrier."}`;
    });
  const trial = PLANS.trial;
  return (
    `Every new workspace starts with a ${trial.trialDays ?? 7}-day free trial (1 agent, ${trial.limits.contacts?.toLocaleString()} contacts, ${trial.limits.calls} calls, own carrier). ` +
    "When the trial ends the workspace is paused until a plan is bought; the data stays safe and can be exported. Annual billing gives two months free on the plans that offer it. " +
    lines.join(" ")
  );
}

function articleText(a: ManualArticle): string {
  const out: string[] = [`${a.title}. ${plain(a.summary)}`];
  if (a.steps.length) out.push("Steps:\n" + a.steps.map((s, i) => `${i + 1}. ${plain(s.text)}${s.note ? ` (${s.note})` : ""}`).join("\n"));
  for (const s of a.more ?? []) {
    const bits: string[] = [s.heading + ":"];
    if (s.text) bits.push(plain(s.text));
    if (s.copy) bits.push(`Message to send: "${s.copy}"`);
    if (s.bullets) bits.push(s.bullets.map((b) => `- ${plain(b)}`).join("\n"));
    if (s.steps) bits.push(s.steps.map((st, i) => `${i + 1}. ${plain(st.text)}`).join("\n"));
    out.push(bits.join("\n"));
  }
  if (a.tips?.length) out.push("Tips: " + a.tips.join(" "));
  return out.join("\n\n");
}

export const ARTICLES: HelpArticle[] = MANUAL.map((a) => ({ id: a.slug, title: a.title, keywords: a.keywords, body: articleText(a), article: a }));

// ---------------------------------------------------------------------------
// Finding the right guides for a question
// ---------------------------------------------------------------------------

const STOP = new Set([
  "the", "a", "an", "to", "of", "and", "or", "is", "it", "in", "on", "for", "how", "do", "does", "i", "my", "me", "can", "you",
  "what", "where", "when", "why", "with", "this", "that", "are", "be", "we", "our", "your", "get", "have", "has", "if", "at", "as", "from", "by",
  "please", "need", "want", "would", "like", "know", "tell", "about", "there", "some", "any", "so", "im", "i'm", "ive", "i've", "not", "no", "yes", "its", "it's",
]);

/** Words people write that the guides spell another way. */
const SYNONYMS: Record<string, string> = {
  creds: "credentials", cred: "credential", dialler: "dialer", voip: "sip", telephony: "sip", softphone: "softphone",
  recieve: "receive", numbr: "number", ppl: "people", pw: "password", signin: "sign in", signup: "sign up", login: "log in",
  broadcasts: "broadcast", robocalls: "robocall", autodial: "power dial", autodialer: "power dialer",
};

function words(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s'-]/g, " ")
    .split(/\s+/)
    .map((w) => SYNONYMS[w] ?? w)
    .join(" ")
    .split(/\s+/)
    .filter((w) => w.length > 1 && !STOP.has(w));
}

function stem(w: string): string {
  return w.replace(/(ing|ed|es|s)$/, "");
}

/** Phrasings that say which kind of answer is wanted, which a bag of words cannot. */
const INTENT_BOOSTS: { when: RegExp; slug: string; boost: number }[] = [
  { when: /(where|how).{0,25}(do|can|would|should).{0,6}(i|we).{0,12}(get|find|obtain|buy|create|generate|receive).{0,30}\b(sip|credentials|provider|carrier|trunk)/i, slug: "sip-where-to-get", boost: 14 },
  { when: /\b(sip|credentials?)\b.{0,40}\b(from|where|provider|carrier|signalwire|twilio|telnyx)\b|\b(signalwire|twilio|telnyx)\b/i, slug: "sip-where-to-get", boost: 9 },
  { when: /(don'?t|do not|dont|no|without|haven'?t|have not|never).{0,12}(have|got|had|bought|a|any).{0,12}\b(sip|provider|carrier|credentials|trunk)\b/i, slug: "sip-where-to-get", boost: 10 },
  { when: /\b(set ?up|setting up|add|adding|enter|entering|connect|connecting|configure|configuring|install|save|fill)\b.{0,30}\b(sip|credentials|phone line|connection)\b/i, slug: "sip-setup", boost: 12 },
  { when: /\bsip\b.{0,30}\b(fail|failed|error|not (?:working|registered|connect)|pending|401|unauthori[sz]ed|rejected)\b|\b(not (?:yet )?registered|registration (?:failed|rejected)|connection failed|saved,? not)\b/i, slug: "sip-status", boost: 12 },
  { when: /\b(can'?t|cannot|unable|won'?t|not able|isn'?t|no).{0,15}\b(calls?|dial(?:ing)?|hear|ring(?:ing)?|connect(?:ing)?)\b|no (?:sound|audio)|one[- ]way/i, slug: "troubleshoot-calls", boost: 12 },
  { when: /\b(code|login code|verification|sign[- ]?in).{0,25}\b(not|never|didn'?t|haven'?t|doesn'?t).{0,15}(arriv|come|receiv|work|get)/i, slug: "sign-in", boost: 12 },
  { when: /\bwhat (?:is|does|are)\b.{0,15}\b(sip|trunk|did|ivr|wss|registered|caller id|extension)\b/i, slug: "glossary", boost: 10 },
  { when: /\b(how many|limits?(?! what)|maximum|can i (?:add|have)|too many|upgrade|plan|plans|exceed)\b/i, slug: "plan-limits", boost: 6 },
  { when: /\b(limit|restrict|control|hide|stop|block|prevent)\b.{0,25}\b(agents?|they|them|users?|staff|team)\b.{0,25}\b(see|access|do|view|hear|using|use)\b|\bwhat (?:an |each )?(?:agents?|they|users?) can (?:see|do|access|hear)\b|\bpermissions?\b/i, slug: "permissions", boost: 14 },
  { when: /\b(play|send|blast|broadcast|robocall|mass[- ]call|call everyone|call (?:my|the|a|our) (?:whole |entire )?(?:list|contacts))\b.{0,40}\b(recording|recorded|message|list|contacts)\b|\brecorded (?:message|call)s?\b|\bvoice broadcast|\brobocall/i, slug: "voice-broadcast", boost: 12 },
  { when: /\b(start|pause|resume|stop|schedule|run|launch)\b.{0,25}\bbroadcast|\bbroadcast\b.{0,40}\b(results?|who (?:answered|heard|pressed|picked)|call log|status|progress)|\bcall (?:people|them|contacts) again\b|\bwho (?:answered|heard|pressed)\b/i, slug: "broadcast-run", boost: 14 },
  { when: /\b(miss(?:ed)?|unanswered)\b.{0,25}\bcalls?\b|\btext[- ]?back\b/i, slug: "missed-call-textback", boost: 12 },
  { when: /\b(getting started|where do i (?:start|begin)|where to start|just (?:signed|joined|started|registered)|i(?:'m| am) new|first (?:thing|steps?|day)|new (?:here|user|account))\b/i, slug: "start-here", boost: 10 },
];

/** The guides most related to what was asked (and, a little, to what was asked just before), best first. */
export function rankArticles(question: string, earlier: string[] = []): { a: HelpArticle; score: number }[] {
  const asked = words(question).map(stem);
  const before = words(earlier.join(" ")).map(stem);
  const phrase = question.toLowerCase();

  return ARTICLES.map((a) => {
    const title = new Set(words(a.title).map(stem));
    const summary = new Set(words(a.article.summary).map(stem));
    const bodyWords = new Set(words(a.body).map(stem));
    let score = 0;
    for (const k of a.keywords) {
      const kl = k.toLowerCase();
      if (kl.includes(" ") ? phrase.includes(kl) : asked.includes(stem(kl))) score += kl.includes(" ") ? 6 : 3;
    }
    for (const w of asked) {
      if (title.has(w)) score += 3;
      else if (summary.has(w)) score += 1.5;
      else if (bodyWords.has(w)) score += 0.5;
    }
    for (const w of before) {
      if (title.has(w)) score += 1;
      if (a.keywords.some((k) => stem(k.toLowerCase()) === w)) score += 1;
    }
    for (const b of INTENT_BOOSTS) if (b.slug === a.id && b.when.test(question)) score += b.boost;
    return { a, score };
  })
    .filter((s) => s.score > 0)
    .sort((x, y) => y.score - x.score);
}

export function pickArticles(question: string, earlier: string[] = [], count = 3): HelpArticle[] {
  return rankArticles(question, earlier)
    .slice(0, count)
    .map((s) => s.a);
}

/** How sure we are that the best guide is the one they want: a clear lead, not just a few shared words. */
export function bestGuide(question: string, earlier: string[] = []): HelpArticle | null {
  const ranked = rankArticles(question, earlier);
  const top = ranked[0];
  if (!top || top.a.article.steps.length === 0) return null;
  const second = ranked[1]?.score ?? 0;
  return top.score >= 9 && top.score >= second * 1.15 ? top.a : null;
}

/** Whether the question is about plans or money, which brings the live plan table into the answer. */
export function wantsPlanFacts(question: string): boolean {
  return /\b(price|prices|pricing|cost|plans?|trial|free|upgrade|how much|includes?|included|limits?|per agent|how many|maximum|enterprise|business|professional|starter|bigger|more agents|more contacts)\b/i.test(question);
}
