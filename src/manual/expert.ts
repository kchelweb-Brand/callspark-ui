import { FEATURE_LABELS, PLANS, type FeatureKey, type PlanId } from "../backend/plans";
import type { ManualArticle } from "./types";

/** One line per plan, read from the table that enforces the limits so the manual cannot disagree with it. */
function planBullets(): string[] {
  const order: PlanId[] = ["trial", "starter", "professional", "business", "managed"];
  return order.map((id) => {
    const p = PLANS[id];
    const l = p.limits;
    const price =
      id === "trial"
        ? `free for ${p.trialDays ?? 7} days`
        : p.priceFlatMonthly !== undefined
          ? `$${p.priceFlatMonthly.toLocaleString()} a month flat for the whole team`
          : `$${p.pricePerAgentMonthly} per agent per month`;
    const parts = [
      `${l.agents} agent${l.agents === 1 ? "" : "s"}`,
      `${l.contacts?.toLocaleString()} contacts`,
      l.campaigns === null ? "unlimited campaigns" : `${l.campaigns} campaign${l.campaigns === 1 ? "" : "s"}`,
      `${l.ivrMenus} IVR menu${l.ivrMenus === 1 ? "" : "s"}`,
      `${l.phoneNumbers} number${l.phoneNumbers === 1 ? "" : "s"}`,
      l.calls !== null ? `${l.calls} calls` : "",
      l.recordingRetentionDays ? `${l.recordingRetentionDays} days of recordings` : "",
      l.smsCampaigns === null ? "SMS campaigns" : "",
    ].filter(Boolean);
    const extras = (Object.keys(FEATURE_LABELS) as FeatureKey[])
      .filter((f) => p.features[f] && f !== "powerDialer" && f !== "numberHealth")
      .map((f) => FEATURE_LABELS[f]);
    const tail = p.managedSip ? "Kchel runs the carrier, the Desktop Dialer is included free, and you get full support and maintenance." : "Runs on your own carrier.";
    return `${p.name} (${price}): up to ${parts.join(", ")}.${extras.length ? ` Includes ${extras.join(", ")}.` : ""} ${tail}`;
  });
}

export const EXPERT: ManualArticle[] = [
  {
    slug: "smart-calling",
    title: "Smart calling: hours, retries, caller ID and text follow-up",
    level: "expert",
    summary: "Make a voice broadcast call at sensible hours, try again for you, spread across your numbers and text the people who respond.",
    time: "15 minutes",
    keywords: ["smart calling", "calling hours", "calling window", "only call during set hours", "time zone", "each person's local time", "retry", "try again", "extra tries", "call from", "caller id", "automatic", "text follow-up", "follow up", "calls at once", "waiting", "8am", "9pm", "tcpa", "window"],
    steps: [
      { text: "Open **Campaigns**, open the three dots on a voice broadcast and choose **Recording and options…** (or set these when you create the campaign).", shot: "smart-1-open-options" },
      { text: "Under **When calls are placed**, switch on **Only call during set hours**. Choose **From**, **Until** and the days.", shot: "smart-3-calling-hours" },
      { text: "Choose **Whose clock**: **Each person’s own local time (recommended)** works it out from their phone number, or **One time zone for everybody**." },
      { text: "Under **Try again**, choose **Extra tries** and how long to **Wait** between them. Switch on **Also try again when voicemail answers** only if you want that.", shot: "smart-4-retries" },
      { text: "Under **Call from**, leave **Automatic** to spread calls across your numbers, or choose one number to use every time." },
      { text: "Under **Text follow-up**, switch on **Send a text after the call**, choose who gets it (**Only people who pressed 1** or **Everyone who listened**) and write the message. Use {first_name} and {company}.", shot: "smart-5-follow-up" },
      { text: "Set **People rung at the same time** from 1 to 5, then save." },
    ],
    more: [
      {
        heading: "Calling hours",
        bullets: [
          "Nobody is called outside the hours you set. Calls already ringing finish; the rest wait and carry on when the hours open. The campaign shows Waiting while it waits.",
          "With each person’s own local time, a number that covers two time zones is only called when both are inside your hours.",
          "For numbers whose zone cannot be worked out, Kchel uses the fallback time zone you choose.",
          "With the setting off, calls go out at any hour. The US allows recorded sales calls only between 8am and 9pm the person’s time.",
        ],
      },
      {
        heading: "Retries",
        bullets: [
          "Anyone who answers, presses a key or opts out is never tried again.",
          "Retries use more call minutes. The estimate shown when you start includes the maximum if every retry is used.",
          "Use a wait of at least a couple of hours so people are not called back-to-back.",
        ],
      },
      {
        heading: "Caller ID",
        bullets: [
          "Automatic spreads calls across your numbers and rests any that start to look risky (needs a plan with Number rotation).",
          "Choosing one number uses it for every call, so it is not rested if it starts to look like spam. Watch its health under Automations.",
        ],
      },
      {
        heading: "Text follow-up",
        bullets: [
          "Sent from the number that called, to people who were not marked do-not-text.",
          "Text messaging has its own consent rules, and some carriers require your numbers to be registered for it.",
        ],
      },
      {
        heading: "How the Dialer treats these options",
        text: "The Windows Dialer keeps these website options when it edits a campaign. A campaign created in the Dialer starts with sensible defaults (calling hours 9am to 8pm, no retries) that you can change on the website.",
      },
    ],
    related: ["voice-broadcast", "number-health", "compliance"],
  },
  {
    slug: "number-health",
    title: "Number health and number rotation",
    level: "expert",
    summary: "Keep your caller ID numbers from being flagged as spam.",
    time: "10 minutes",
    keywords: ["number health", "number rotation", "rotate", "spam", "flagged", "answer rate", "daily cap", "calls per number", "rest", "spam likely", "scam likely", "reputation", "automations"],
    steps: [
      { text: "Open **Automations**.", shot: "page-automations" },
      { text: "Under **Number rotation**, switch it on." },
      { text: "Set **Calls per number per day**. Around 75 to 150 is the usual guidance." },
      { text: "Press **Save changes**." },
      { text: "Scroll to **Number health** to see each number’s answer rate and daily volume, and press **Resume** on one you have rested." },
    ],
    more: [
      {
        heading: "How it works",
        bullets: [
          "Rotation spreads automated outbound calls across your numbers, caps each number per day and rests numbers whose answer rate collapses.",
          "It applies to voice broadcast campaign calls. Calls from the desktop softphone use the caller ID your SIP trunk sets.",
          "Number rotation is included on Professional, Business and Managed Enterprise. Number health is on every plan.",
        ],
      },
      {
        heading: "Staying out of spam lists",
        bullets: [
          "Use several numbers instead of one for large lists.",
          "Call during sensible hours and keep your message short and honest.",
          "Remove people who opt out and wrong numbers quickly.",
          "Ask your provider about caller-ID registration (STIR/SHAKEN and similar) for your numbers.",
        ],
      },
    ],
    related: ["smart-calling", "plan-limits"],
  },
  {
    slug: "missed-call-textback",
    title: "Missed-call text-back",
    level: "expert",
    summary: "Text callers automatically when nobody answered, so the lead does not go cold.",
    time: "5 minutes",
    keywords: ["missed call", "missed calls", "miss a call", "miss their call", "when i miss", "text back", "text-back", "auto text", "missed call text", "automatic reply", "automations", "{business}"],
    steps: [
      { text: "Open **Automations**.", shot: "page-automations" },
      { text: "Switch on **Missed-call text-back**." },
      { text: "Edit the **Message**. Use {business} for your workspace name." },
      { text: "Press **Save changes**." },
      { text: "Watch **Recent text-backs** at the bottom to see what was sent." },
    ],
    more: [
      {
        heading: "Rules it follows",
        bullets: [
          "One text per caller every 6 hours.",
          "Never sent to contacts marked do-not-call.",
          "Sent from the number the caller dialled.",
          "Included on every paid plan.",
        ],
      },
    ],
    related: ["sms", "compliance"],
  },
  {
    slug: "sip-advanced",
    title: "Advanced SIP: transports, realm, port and trunks",
    level: "expert",
    summary: "Choose the right transport and settings when your provider is not the usual kind.",
    time: "10 minutes",
    keywords: ["transport", "wss", "tls", "tcp", "udp", "realm", "port", "5060", "5061", "443", "sip over websocket", "trunk", "forward to trunk", "firewall", "stun", "webrtc", "byo", "carrier requirements"],
    steps: [
      { text: "Open **Phone System**, **Connection**, then **Edit**." },
      { text: "Choose the **Transport** your provider documents: WSS, TLS, TCP or UDP." },
      { text: "For WSS, fill in **WebSocket URL**. For the others, fill in **SIP host / domain**." },
      { text: "Set **Realm** only if the provider tells you the authentication realm differs from the host." },
      { text: "Set **Port** only if your provider uses a non-standard one (the defaults are 443 for WSS, 5061 for TLS and 5060 for TCP and UDP)." },
      { text: "Press **Save changes**, then go online to test registration." },
    ],
    more: [
      {
        heading: "Why only WSS works in the browser",
        text: "A web page can only open WebSocket connections, so the on-screen softphone needs WSS. TLS, TCP and UDP trunks are still saved and can receive calls routed to them: set an extension’s Forwards to value to trunk. For click-to-call from the browser, ask your carrier for their SIP-over-WSS (WebRTC) endpoint.",
      },
      {
        heading: "Checklist for a stubborn connection",
        bullets: [
          "Username and password have no spaces at the ends.",
          "The host and the WebSocket URL are not swapped.",
          "The provider allows registration from your location (no IP allow-list blocking it).",
          "Outbound calls are enabled for the destination country.",
          "Another device is not already registered with the same credentials, if the provider allows one registration only.",
        ],
      },
    ],
    related: ["sip-where-to-get", "sip-status", "troubleshoot-calls"],
  },
  {
    slug: "scale-campaigns",
    title: "Running campaigns at scale",
    level: "expert",
    summary: "Organise large lists, protect your numbers and keep results clean.",
    time: "10 minutes",
    keywords: ["scale", "large list", "thousands", "big campaign", "segment", "split list", "10,000", "capacity", "many contacts", "volume", "best practice", "performance"],
    steps: [
      { text: "Split large imports into named lists (for example by region or product) so each campaign targets one group." },
      { text: "Clean the file before importing: one person per row, valid numbers and no duplicates." },
      { text: "Start with a small test list and a **Send me a test call…** before you send to everyone." },
      { text: "Use **Try again** and calling hours so the system does the follow-up for you." },
      { text: "Check **Results and call log** after the first hour and fix problems before the rest go out." },
      { text: "Use several numbers with Number rotation for big sends." },
    ],
    more: [
      {
        heading: "Limits to plan around",
        bullets: [
          "Contacts per plan: see “Plan limits and when to upgrade” for the current figures, or Billing for how many you use.",
          "People rung at the same time: 1 to 5 per broadcast. Use more numbers rather than more calls at once.",
          "Imports are 10,000 rows at a time.",
        ],
      },
      {
        heading: "When you outgrow your plan",
        text: "See “Plan limits and when to upgrade” for what each plan includes and how to move up without losing anything.",
      },
    ],
    related: ["smart-calling", "number-health", "plan-limits"],
  },
  {
    slug: "compliance",
    title: "Compliance basics for calls and texts",
    level: "expert",
    summary: "General guidance on consent, calling hours, opt-outs and recordings. It is not legal advice.",
    time: "5 minutes",
    keywords: ["compliance", "legal", "tcpa", "consent", "opt out", "opt-out", "do not call", "dnc", "recorded calls", "calling hours", "gdpr", "law", "rules", "regulations", "permission", "stop"],
    steps: [
      { text: "Only call and text people who agreed to hear from you, and keep a record of how and when they agreed." },
      { text: "Say who you are and that a message is recorded at the start of every voice broadcast, with a call-back number." },
      { text: "Keep **Press 2 to never be called again** switched on and honour every opt-out." },
      { text: "Use **Only call during set hours** so people are not called too early or late (in the US, 8am to 9pm the person’s time for sales calls)." },
      { text: "Include “Reply STOP to opt out” in marketing texts and respect it." },
      { text: "Tell callers when calls are recorded." },
      { text: "Check the rules where your contacts live, and ask a lawyer if you are unsure." },
    ],
    more: [
      {
        heading: "What Kchel does for you",
        bullets: [
          "Contacts marked do-not-call are never dialled by campaigns or texted by automations.",
          "People who press 2 in a broadcast are marked and never called again.",
          "Calling hours can follow each person’s own local time.",
          "A voice broadcast cannot be created until you confirm your contacts agreed to receive recorded calls.",
        ],
      },
      {
        heading: "What stays your responsibility",
        text: "You decide who is on your lists and what the message says. The platform cannot check that you have consent, so follow the rules for your region.",
      },
    ],
    related: ["voice-broadcast", "smart-calling", "sms"],
  },
  {
    slug: "troubleshoot-calls",
    title: "I cannot make or hear calls: a step-by-step check",
    level: "expert",
    summary: "Work through the usual causes in order, from the phone line to your headset.",
    time: "10 minutes",
    keywords: ["can't call", "cannot call", "no audio", "no sound", "can't hear", "not working", "failed", "error", "doesn't ring", "not registered", "one way audio", "mute", "microphone", "headset", "calls dropping", "busy", "fast busy", "call failed", "no dial tone", "troubleshoot", "problem"],
    steps: [
      { text: "**Is the line connected?** Open Phone System, Connection. It should say Connected with a green Active badge. If it says Failed or Pending, follow “Is my phone line connected?”.", shot: "sip-8-connected" },
      { text: "**Are you online?** On Live Calls the softphone must say Registered. Press **Go online** if it says Offline.", shot: "page-live-calls" },
      { text: "**Is the number in full form?** Use international form such as +14155550134, or set your default country code under Phone System, Call Routing." },
      { text: "**Is your plan active?** Open Billing. An ended trial or an unrenewed plan puts the workspace on hold. Your data stays safe.", shot: "page-billing" },
      { text: "**Provider side:** log in to your provider and check there is credit, outbound calling is on, and the destination country is allowed." },
      { text: "**No sound:** allow the microphone for the browser or app, choose the right headset in Windows sound settings, and close other apps that use it." },
      { text: "**One-way audio:** try a wired network, switch off any VPN and test again. A firewall that blocks audio is the usual cause." },
      { text: "**Still stuck?** Open Support, describe what you see on the screen and include the exact message. We will help." },
    ],
    more: [
      {
        heading: "What the messages mean",
        bullets: [
          "401 or Unauthorized: wrong SIP username or password.",
          "Timeout: the host or WebSocket URL is wrong, or something is blocking it.",
          "Call fails right away: outbound calling is off, the country is not allowed or the account has no credit.",
          "The call rings but nobody answers: the number is wrong or switched off.",
        ],
      },
      {
        heading: "Quick test",
        text: "Call your own mobile from Live Calls. If that works, the problem is with the number you were calling.",
      },
    ],
    related: ["sip-status", "sip-advanced", "first-call"],
  },
  {
    slug: "plan-limits",
    title: "Plan limits and when to upgrade",
    level: "expert",
    summary: "What each plan includes, how to see what you use, and what to choose when you outgrow one.",
    time: "5 minutes",
    keywords: ["limit", "limits", "plan limit", "upgrade", "too many agents", "contact limit", "more agents", "more contacts", "ivr limit", "number limit", "bigger plan", "business plan", "managed enterprise", "enterprise", "professional", "starter", "trial", "how many", "capacity", "seats", "exceeded", "over the limit", "need more"],
    steps: [
      { text: "Open **Billing** and read **Plan usage**. Each bar shows how much of a limit you have used.", shot: "page-billing" },
      { text: "If a bar is nearly full, press **Compare plans**.", shot: "billing-2-plans" },
      { text: "Pick the plan that covers your needs (see the comparison below) and the number of seats." },
      { text: "Pay with the link shown. A card payment with your sign-in email activates the plan within a minute or two." },
      { text: "Nothing is lost when you upgrade: your contacts, campaigns and history stay as they are." },
    ],
    more: [
      {
        heading: "What each plan includes",
        bullets: planBullets(),
      },
      {
        heading: "Choosing",
        bullets: [
          "Growing past 5 agents, or needing more than 5,000 contacts, more numbers or longer recording history: Business.",
          "More than 8 agents or 7,500 contacts, or you want Kchel to run the carrier, the Windows Dialer included and hands-on support: Managed Enterprise.",
          "Running voice broadcasts to large lists with number rotation: Professional or above.",
        ],
      },
      {
        heading: "Good to know",
        text: "If you are over a limit after a downgrade, nothing is deleted. You just cannot add more until you are back under it or upgrade.",
      },
    ],
    related: ["billing-plans", "scale-campaigns"],
  },
  {
    slug: "security",
    title: "Security, data and signing in safely",
    level: "expert",
    summary: "How your account, passwords and data are protected, and what to do if something looks wrong.",
    time: "5 minutes",
    keywords: ["security", "safe", "secure", "privacy", "data", "export", "delete account", "lost access", "email access", "encrypted", "two factor", "hacked", "someone else", "sign out", "gdpr"],
    steps: [
      { text: "Keep your email account secure: Kchel has no passwords, so access depends on your inbox." },
      { text: "Never share a sign-in code. Staff will never ask for it." },
      { text: "Give each person their own agent seat instead of sharing a login." },
      { text: "Use **What they can do** to give agents only what they need." },
      { text: "Turn access off for anyone who leaves (Agents, three dots, Turn access off)." },
      { text: "If you think someone else has signed in, sign out, change your email password and contact support." },
    ],
    more: [
      {
        heading: "Your data",
        bullets: [
          "SIP passwords are encrypted before they are stored and only ever shown as dots.",
          "Your data stays yours and can be exported, even after a trial ends.",
          "For account deletion, or a lost email address, contact support.",
        ],
      },
    ],
    related: ["sign-in", "permissions"],
  },
  {
    slug: "support",
    title: "Get help from a person",
    level: "expert",
    summary: "How to reach the Kchel team and get the fastest answer.",
    time: "3 minutes",
    keywords: ["support", "help", "ticket", "contact", "human", "person", "report", "bug", "problem", "talk to someone", "email support", "reply"],
    steps: [
      { text: "Open **Support** in the left menu.", shot: "page-support" },
      { text: "Press **New request**.", shot: "support-1-new-request" },
      { text: "Say what you were trying to do, what you saw (copy the exact message) and which workspace it is." },
      { text: "Press **Submit request** (in the form that opens). Replies arrive in the same thread, and you get an email." },
    ],
    more: [
      {
        heading: "Get a faster answer",
        bullets: [
          "Include screenshots or the exact wording of any error.",
          "Never include passwords, sign-in codes or card numbers.",
          "The Help button answers how-to questions at once. It can hand your chat to the team when it cannot solve it.",
        ],
      },
    ],
    related: ["troubleshoot-calls", "start-here"],
  },
];
