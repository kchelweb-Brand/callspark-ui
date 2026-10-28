// What the help assistant knows: short guides on how Kchel Dialer works, written
// against the real menus and screens. The assistant answers only from these (and
// the live plan table), so when a screen changes, change its guide here.
//
// Server-only: it is read when a question arrives, never shipped to the browser.

import { FEATURE_LABELS, PLANS, type PlanFeatures } from "./plans";

export interface HelpArticle {
  id: string;
  title: string;
  /** Words a person might use that the guide itself does not. */
  keywords: string[];
  body: string;
}

/** Always given to the assistant: what the product is and the ground rules for where things live. */
export const PRODUCT_BRIEF =
  "Kchel Dialer is a call center platform for teams and solo operators. It has a website (sign in at the workspace page with " +
  "your email and a one-time code, there is no password) and a Windows desktop app also called Kchel Dialer. Both show the same " +
  "workspace: contacts, campaigns, call history, recordings, phone system settings, agents, billing and support. " +
  "Website menu: Overview, Campaigns, Contacts, SMS, Live Calls, Agents, Team, Call History, Recordings, Analytics, Phone System, " +
  "Automations, Settings, Billing, Support. Desktop app menu: Notifications, Team tasks, Messages, Overview, Live calls, Agents, " +
  "Analytics, Dialer, Contacts, Campaigns, SMS, Call history, Recordings, IVR menus, Extensions, Voicemail, Numbers, Number health, " +
  "Automations, Billing, Support, Settings, SIP configuration.";

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
      ].join(", ");
      const feats = featureList(p.features);
      return `${p.name}: ${price}. Includes up to ${lim}.${feats ? ` Extras: ${feats}.` : ""}`;
    });
  const trial = PLANS.trial;
  return (
    `Every new workspace starts with a ${trial.trialDays ?? 7}-day free trial. ` +
    "When the trial ends the workspace is paused until a plan is bought; the data stays safe and can be exported. " +
    lines.join(" ")
  );
}

export const ARTICLES: HelpArticle[] = [
  {
    id: "start",
    title: "Create an account and sign in",
    keywords: ["signup", "register", "create", "account", "trial", "login", "log in", "password", "code", "workspace"],
    body:
      "To create an account, open Sign up. Choose Business or Individual, then enter your name, company (for business), country, city, " +
      "mobile phone, email and a workspace name. A 6-digit code is sent to your email and, when texting is on, another to your phone. " +
      "Enter both to finish. The workspace is live straight away and the free trial starts then. " +
      "There is no password. To sign in, open Sign in, enter your workspace name and email, then the 6-digit code emailed to you. " +
      "Agents invited by the owner sign in the same way with the email they were invited on.",
  },
  {
    id: "desktop",
    title: "The Windows desktop app",
    keywords: ["download", "install", "windows", "desktop", "app", "softphone", "exe", "dialer"],
    body:
      "Kchel Dialer for Windows is a desktop app for making and taking calls. It is an add-on (a one-time payment, shown on the Billing page). " +
      "Once it is enabled, download it from Billing, run the installer, then sign in with your workspace name, email and the emailed code. " +
      "It connects to your phone line automatically and shows when it is registered. To place a call open Dialer, type or paste a number " +
      "(or press +) and press Call or Enter. Numbers typed without a country code are completed with your default country code.",
  },
  {
    id: "browser-calling",
    title: "Calling from the website",
    keywords: ["browser", "web", "online", "microphone", "live calls", "softphone", "go online", "call from"],
    body:
      "You can call from the website too. Open Live Calls and go online; this connects your browser to your phone line. " +
      "Once you are online, the call button next to each contact on the Contacts page works. Your browser asks for microphone permission the first time: allow it. " +
      "A phone line (SIP connection) must be set up first under Phone System, Connection.",
  },
  {
    id: "sip",
    title: "Connecting your phone line (SIP)",
    keywords: ["sip", "connection", "trunk", "carrier", "registered", "register", "credentials", "provider", "line", "managed", "byo"],
    body:
      "Calls travel over a SIP connection. In the website open Phone System, then the Connection tab (in the desktop app: SIP configuration). " +
      "You can bring your own provider by entering its SIP host, username and password and the transport, or use the Managed SIP add-on where Kchel provides the line. " +
      "If the Dialer says it is not registered, the credentials are usually wrong or missing: re-enter the SIP password and save. " +
      "Nothing can be dialed until the connection shows as registered.",
  },
  {
    id: "numbers",
    title: "Phone numbers",
    keywords: ["number", "numbers", "caller id", "buy", "add number", "did", "limit"],
    body:
      "Your numbers are listed under Phone System, Numbers (desktop: Numbers). The number of numbers you can hold depends on your plan. " +
      "The number a call shows to the person you call is set by your SIP provider. Number health (desktop: Number health, website: Automations) scores each number from your own call results " +
      "and rests numbers whose answer rate collapses.",
  },
  {
    id: "ivr",
    title: "IVR menus, routing, hours, extensions and voicemail",
    keywords: ["ivr", "menu", "press 1", "routing", "route", "hours", "business hours", "extension", "voicemail", "greeting", "inbound", "ring group"],
    body:
      "Everything about incoming calls is under Phone System. IVR Menus builds the \"press 1 for sales\" menu. Call Routing decides where calls ring and sets your default country code. " +
      "Business Hours says when you are open. Extensions gives each agent a short number. Voicemail sets the greeting and where messages go. " +
      "Inbound and Outbound tabs hold the general settings. The number of IVR menus you can create depends on your plan.",
  },
  {
    id: "import",
    title: "Importing contacts from a CSV file",
    keywords: ["import", "csv", "upload", "excel", "spreadsheet", "contacts", "list", "xlsx", "bulk", "10,000", "duplicate", "limit"],
    body:
      "Open Contacts and press Import. Choose a CSV file (in Excel or Google Sheets use File, Save as, CSV). The file needs a phone column; " +
      "names, company, email and tags are picked up when the columns have recognisable names like Name, Company, Email, Phone, Mobile. " +
      "You see a preview of the columns found before anything is saved and can name the list. Up to 10,000 contacts can be imported at once. " +
      "Numbers without a country code are completed with your default country code. Numbers already in your workspace are skipped as duplicates, and rows that are not valid numbers " +
      "are listed with the reason so you can fix and re-import them. Your plan holds a maximum number of contacts: an import fills up to that limit and skips the rest, with no error.",
  },
  {
    id: "contacts",
    title: "Working with contacts and lists",
    keywords: ["contact", "contacts", "dnc", "do not call", "tag", "tags", "list", "lists", "add contact", "delete", "whatsapp", "search"],
    body:
      "Contacts holds your people and lists. Search by name or number, add one contact with Add, or import many. Each row has a call button (you must be online) " +
      "and a WhatsApp button that opens a WhatsApp chat with that number; calling through WhatsApp itself is not supported. " +
      "A contact marked do-not-call is never dialed by campaigns or texted by automations. Select rows to delete them.",
  },
  {
    id: "campaigns",
    title: "Campaigns and the power dialer",
    keywords: ["campaign", "campaigns", "power dial", "power dialer", "dial list", "create campaign", "human", "manual", "progressive", "auto dial", "ring", "wait between"],
    body:
      "Campaigns are lists you work through. Press Create campaign, name it, choose a contact list and an owner. A human-dialed campaign is worked with the power dialer: " +
      "in the desktop app press Power dial on the campaign. It takes one contact at a time, counts down, places the call, then asks how it went (Connected, Call back, Not interested, Voicemail, Busy, Wrong number, Do not call) " +
      "and moves to the next. You can set how long to wait between calls (or none) and when to stop ringing. It never calls ahead of an agent who is still on a call. Power dialing is included on the plans that list it.",
  },
  {
    id: "ai-campaigns",
    title: "AI voice agent campaigns",
    keywords: ["ai agent", "voice agent", "robot", "bot calls", "ai campaign", "ai call", "ai calls", "script", "prompt", "voicemail", "voice", "sound", "human like", "call again", "outbound ai", "start dialing"],
    body:
      "An AI voice agent calls your list for you. Create a campaign and choose AI voice agent, write what it should say (use {{first_name}} and {{company}} to personalise), pick a contact list, " +
      "and tick the box confirming your contacts consented and the call discloses it is automated. Under Voice and behaviour choose the voice, speaking style (Natural, Calm, Quick) and how smart it is, " +
      "and choose what happens on voicemail: hang up, leave a short message, or always talk. Press Call me to hear the voice on your own phone first. " +
      "The agent speaks first when someone answers. It can tag how the call went, note an appointment request for you to confirm, text the person once, and hand over to a human on the transfer number. " +
      "Press Start dialing to begin and Pause to stop. Use Call people again to put people who did not answer, got voicemail or asked for a call back into the queue. " +
      "Outcomes show in Call History. Premium voices are included on the Business plan and above. Check your local laws on automated calls before you start.",
  },
  {
    id: "ai-receptionist",
    title: "AI receptionist",
    keywords: ["receptionist", "after hours", "answer calls", "ai answer", "answer my phone", "answering", "closed", "when i'm closed", "missed", "front desk", "take a message"],
    body:
      "The AI receptionist answers incoming calls when nobody can, asks who is calling and why, answers simple questions from the description of your business, and takes a message. " +
      "Turn it on under Automations, AI receptionist. Choose when it answers: only when closed, when closed or nobody picks up, or every call. Fill in the business name and what it should know " +
      "(hours, services, prices you are happy to share). An urgent line is where a call is connected when someone asks for a person. You get a written summary on each call. " +
      "It is included on the plans that list the AI receptionist.",
  },
  {
    id: "automations",
    title: "Missed-call text-back and number rotation",
    keywords: ["text back", "text-back", "missed call", "auto text", "rotation", "rotate", "daily cap", "number health", "spam", "automations"],
    body:
      "Automations has three switches. Missed-call text-back texts the caller right after a call nobody answered, from the number they called (one text per caller every 6 hours, never to do-not-call contacts); edit the message and use {business} for your name. " +
      "AI receptionist is described separately. Number rotation spreads automated outbound calls across your numbers, caps each at a daily number, and rests numbers whose answer rate collapses. " +
      "Which plan includes each one is in the plans list.",
  },
  {
    id: "history",
    title: "Call history, summaries and recordings",
    keywords: ["history", "call log", "recording", "recordings", "summary", "summaries", "transcript", "outcome", "filter", "listen", "retention"],
    body:
      "Call History lists every call with who, when, how long and the outcome; filter by outcome or agent and search by name or number. Open a call that was recorded to see it in Recordings, where you can listen. " +
      "Call summaries (on the plans that include them) turn a recording into a short written summary and transcript. Calls handled by the AI show their summary and an outcome tag such as Interested or Call back. " +
      "How long recordings are kept depends on your plan.",
  },
  {
    id: "sms",
    title: "SMS",
    keywords: ["sms", "text", "texting", "message campaign", "bulk sms", "us sms"],
    body:
      "The SMS page is where you write and send text message campaigns and save drafts. SMS is for US numbers. Contacts marked do-not-call or do-not-text are skipped.",
  },
  {
    id: "agents",
    title: "Adding agents and choosing what they can do",
    keywords: ["agent", "agents", "invite", "team member", "permission", "permissions", "access", "limit what", "extension", "supervisor", "seat", "add user", "employee", "staff"],
    body:
      "Open Agents and add an agent with their name and email. They are invited by email and sign in with the same one-time code. You, as the owner, control what each agent can do: place calls, use the power dialer, " +
      "see no contacts, only the contacts on their open tasks, or all contacts, edit contacts, see only their own call history or everyone's, and listen to recordings. There are ready-made presets for a caller, a senior agent and a supervisor, " +
      "and you can disable an agent at any time. How many agents you can have depends on your plan.",
  },
  {
    id: "team",
    title: "Tasks, messages and notifications",
    keywords: ["task", "tasks", "assign", "message", "chat", "notification", "notifications", "bell", "direct message", "my day"],
    body:
      "Team (website) or Team tasks and Messages (desktop) is where the owner assigns tasks to agents and chats with them directly. Agents see their own day under My day. " +
      "The bell shows new tasks, messages and announcements; in the desktop app a pop-up appears, and an email is sent if someone has been away from the app for a while.",
  },
  {
    id: "billing",
    title: "Plans, paying and upgrading",
    keywords: ["billing", "price", "pricing", "plan", "plans", "pay", "payment", "upgrade", "cost", "how much", "crypto", "gift card", "bank", "card", "invoice", "annual", "yearly", "regional", "discount", "activate"],
    body:
      "Open Billing to see your plan, usage and ways to pay. Press upgrade, pick a plan and a number of seats, and pay with the link shown (card or bank; some regions also have crypto or gift card links, and some countries have regional prices). " +
      "Annual billing gives two months free. A card payment made with the same email you sign in with switches the plan on by itself within a minute or two, and you get a confirmation email; other methods are confirmed by the team. " +
      "After you pay, use I've paid and add a transaction ID, receipt number or the name you paid with so the payment can be found. Never type a card or gift card number. " +
      "If your plan has no payment link (for example Managed Enterprise), request it from Billing and the team replies in Support.",
  },
  {
    id: "support",
    title: "Contacting support",
    keywords: ["support", "help", "ticket", "contact us", "human", "person", "complain", "problem", "report", "bug"],
    body:
      "Open Support to message the team. Start a new conversation, describe the problem, and replies arrive in the same thread. " +
      "This assistant can answer how-to questions; for anything about your account, payments or a fault, talk to a person.",
  },
  {
    id: "settings",
    title: "Settings and workspace profile",
    keywords: ["settings", "profile", "company", "recording", "preferences", "default country", "country code", "rename"],
    body:
      "Settings holds your workspace profile (company, contact details) and call preferences such as recording defaults. " +
      "Your default country code is under Phone System, Call Routing: it is used to complete local-format numbers when you dial and import.",
  },
  {
    id: "troubleshooting",
    title: "I can't make or hear calls",
    keywords: ["can't call", "cannot call", "no audio", "no sound", "can't hear", "not working", "failed", "error", "doesn't ring", "not registered", "one way", "mute", "microphone"],
    body:
      "Check these in order. 1) Is the phone line connected? The Dialer or Live Calls must show it as registered; if not, fix the details under Phone System, Connection. " +
      "2) Is the number in full international form, or is your default country code set? 3) Did the trial end or a plan limit get reached? Billing shows this. " +
      "4) No sound: allow the microphone for the browser or app, check the right headset is chosen in Windows sound settings, and make sure nothing else is using it. " +
      "5) A caller who hears nothing may be blocked by their network: ask for another number. If it still fails, talk to a person and say what you see on screen.",
  },
  {
    id: "security",
    title: "Security and sign-in",
    keywords: ["security", "safe", "secure", "privacy", "data", "export", "delete account", "forgot", "lost access", "two factor"],
    body:
      "Kchel Dialer has no passwords: every sign-in uses a one-time code sent to your email, so access depends on your email account. " +
      "Agents only see what the owner allows. Your data stays yours and can be exported, even after a trial ends. For account deletion or a lost email address, talk to a person.",
  },
];

// ---------------------------------------------------------------------------
// Finding the right guides for a question
// ---------------------------------------------------------------------------

const STOP = new Set([
  "the", "a", "an", "to", "of", "and", "or", "is", "it", "in", "on", "for", "how", "do", "does", "i", "my", "me", "can", "you",
  "what", "where", "when", "why", "with", "this", "that", "are", "be", "we", "our", "your", "get", "have", "has", "if", "at", "as", "from", "by",
]);

function words(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s'-]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 1 && !STOP.has(w));
}

function stem(w: string): string {
  return w.replace(/(ing|ed|es|s)$/, "");
}

/** The guides most related to what was asked (and, a little, to what was asked just before), best first. */
export function pickArticles(question: string, earlier: string[] = [], count = 4): HelpArticle[] {
  const asked = words(question).map(stem);
  const before = words(earlier.join(" ")).map(stem);
  const phrase = question.toLowerCase();

  const scored = ARTICLES.map((a) => {
    const title = words(a.title).map(stem);
    const bodyWords = new Set(words(a.body).map(stem));
    let score = 0;
    for (const k of a.keywords) {
      const kl = k.toLowerCase();
      if (kl.includes(" ") ? phrase.includes(kl) : asked.includes(stem(kl))) score += 4;
    }
    for (const w of asked) {
      if (title.includes(w)) score += 3;
      if (bodyWords.has(w)) score += 1;
    }
    for (const w of before) {
      if (title.includes(w)) score += 1;
      if (a.keywords.some((k) => stem(k.toLowerCase()) === w)) score += 1;
    }
    return { a, score };
  })
    .filter((s) => s.score > 0)
    .sort((x, y) => y.score - x.score);

  return scored.slice(0, count).map((s) => s.a);
}

/** Whether the question is about plans or money, which brings the live plan table into the answer. */
export function wantsPlanFacts(question: string): boolean {
  return /\b(price|prices|pricing|cost|plans?|trial|free|upgrade|how much|includes?|included|limits?|per agent|how many)\b/i.test(question);
}
