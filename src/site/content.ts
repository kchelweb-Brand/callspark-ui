// Everything the public website says, in one place. Pages read from here, so a
// feature, a plan or a promise is changed once. Every statement describes what
// the product really does; if a screen changes, change its words here.

export type VisualKey =
  | "dialer"
  | "queue"
  | "aicall"
  | "analytics"
  | "messages"
  | "flow"
  | "team"
  | "desktop"
  | "receptionist";

export interface Link {
  label: string;
  to: string;
  blurb?: string;
}

export interface Block {
  title: string;
  body: string;
  points?: string[];
  visual: VisualKey;
}

export interface Faq {
  q: string;
  a: string;
}

export interface Product {
  slug: string;
  name: string;
  /** One line under the name in menus and cards. */
  short: string;
  headline: string;
  lede: string;
  heroVisual: VisualKey;
  /** Three short facts shown under the hero. */
  facts: string[];
  blocks: Block[];
  faqs: Faq[];
  /** The plan that first includes it, when it isn't in every plan. */
  from?: string;
}

export const PRODUCTS: Product[] = [
  {
    slug: "phone-system",
    name: "Cloud phone system",
    short: "Numbers, menus, routing, hours and voicemail.",
    headline: "A business phone system you can set up in an afternoon.",
    lede:
      "Connect the phone line you already pay for, or have one supplied. Build the menu callers hear, decide who rings and when, and take calls from a browser or the Windows app.",
    heroVisual: "flow",
    facts: ["Bring your own SIP line, or use Managed SIP", "IVR menus, routing, hours, extensions, voicemail", "Calls from any browser or the Windows app"],
    blocks: [
      {
        title: "Your line, your rates",
        body:
          "Kchel does not resell you minutes on the plans where you bring your own line. You connect your provider's SIP details once, and call charges stay on your carrier bill at the rates you negotiated.",
        points: [
          "Enter your SIP host, username, password and transport under Phone System, Connection",
          "The app shows whether the line is registered, so you know before the first call",
          "Prefer not to deal with a carrier? Managed SIP is available as an add-on, and included in Managed Enterprise",
        ],
        visual: "flow",
      },
      {
        title: "Menus, routing and opening hours",
        body:
          "Everything that happens to an incoming call lives in one place. Set it up once and change it whenever the business changes.",
        points: [
          "IVR menus: \"press 1 for sales, press 2 for support\"",
          "Call routing, with a default country code so local numbers dial correctly",
          "Business hours, so after-hours calls go where you decide",
          "Extensions for each agent, and a voicemail greeting you control",
        ],
        visual: "flow",
      },
      {
        title: "Answer from anywhere",
        body:
          "There is no desk phone to buy. Go online in the browser to take and place calls, or install the Windows app for a proper desktop softphone.",
        points: ["Works on a laptop with a headset", "Every contact has a call button next to it", "Agents sign in with an emailed code, so there are no passwords to share"],
        visual: "desktop",
      },
    ],
    faqs: [
      { q: "Can I keep my current phone provider?", a: "Yes. On Starter, Professional and Business you bring your own SIP line, so you keep your carrier and your call rates." },
      { q: "Do I need any hardware?", a: "No. A computer and a headset are enough. Calls run in the browser or in the Windows app." },
      { q: "How many phone numbers and IVR menus can I have?", a: "It depends on the plan. The pricing page lists the number of agents, contacts, IVR menus and phone numbers for each one." },
    ],
  },
  {
    slug: "dialer",
    name: "Power dialer & campaigns",
    short: "Import a list and work it, one contact after another.",
    headline: "Work a list faster, without ever dialing ahead of your agents.",
    lede:
      "Load thousands of contacts from a spreadsheet, build a campaign, and let the power dialer line up the next call the moment the last one is logged.",
    heroVisual: "queue",
    facts: ["Up to 10,000 contacts in one upload", "One call at a time, never ahead of the agent", "Do-not-call respected on every campaign"],
    blocks: [
      {
        title: "From spreadsheet to campaign in minutes",
        body:
          "Export your list as a CSV and import it. Kchel recognises the usual column names, shows you what it found before anything is saved, and tells you exactly which rows it could not use and why.",
        points: [
          "Up to 10,000 contacts per upload",
          "Numbers without a country code are completed with yours",
          "Repeated numbers are skipped, not duplicated",
          "Your plan's contact limit is filled, and the rest is skipped without an error",
        ],
        visual: "queue",
      },
      {
        title: "A dialer that keeps pace with the person using it",
        body:
          "The power dialer takes one contact at a time, counts down, places the call, then asks how it went. Choose how long it waits between calls, including no wait at all, and when it should stop ringing.",
        points: [
          "Results in one tap: connected, call back, not interested, voicemail, busy, wrong number, do not call",
          "Unanswered calls are logged and the next contact comes up on its own",
          "Contacts marked do-not-call are never dialed",
        ],
        visual: "dialer",
      },
      {
        title: "Protect your numbers",
        body:
          "Calling a lot from one number gets it flagged. Number health scores each of your numbers from your own call results, and rotation spreads automated calls across them.",
        points: ["A health score per number, from your real answer rates", "Daily caps per number", "Numbers whose answer rate collapses are rested automatically"],
        visual: "analytics",
      },
    ],
    faqs: [
      { q: "Does it call several people at once?", a: "No. The power dialer works one contact at a time and never dials ahead of an agent who is still on a call. That keeps abandoned calls at zero." },
      { q: "What file formats can I import?", a: "CSV files. In Excel or Google Sheets, use Save as CSV. Files with different delimiters, accents and no header row are handled." },
      { q: "What happens if I go over my contact limit?", a: "The import fills your plan to its limit and skips the rest, with a clear note about how many were left out." },
    ],
  },
  {
    slug: "ai-voice-agent",
    name: "AI voice agent",
    short: "An agent that calls your list and holds a real conversation.",
    headline: "An AI agent that works your list while your team does the work only people can.",
    lede:
      "Write what the call is for. The agent dials each contact, speaks first, listens, answers, and records how it went. It always says it is automated if anyone sincerely asks.",
    heroVisual: "aicall",
    facts: ["12 voices in three quality tiers", "Leaves a message or hangs up on voicemail", "Tags every call so you know who to call next"],
    blocks: [
      {
        title: "A voice you choose, and can hear first",
        body:
          "Pick from twelve voices, from clear and economical to very natural, and a speaking style: natural, calm or quick. Press Call me and the agent rings your own phone so you can hear exactly what your customers will hear.",
        points: ["US, British and Australian accents", "Natural pauses, and it can be interrupted", "Premium voices are included from the Business plan"],
        visual: "aicall",
      },
      {
        title: "It does something with the call",
        body:
          "A conversation that ends with nothing recorded is wasted. The agent can act on the call, within limits you set.",
        points: [
          "Tags how it went: interested, call back, not interested, wrong number, do not call",
          "Notes an appointment request for you to confirm. It never promises a time slot",
          "Sends one text with details you gave it, never to anyone who opted out",
          "Hands the call to a person on your transfer number when someone asks for one",
        ],
        visual: "aicall",
      },
      {
        title: "Voicemail, handled",
        body:
          "Answering machines are detected, so the agent does not talk to a beep. Choose to hang up, or to leave a short message after the tone.",
        points: ["Your message can use the contact's name", "Voicemails are tagged so you can try again later"],
        visual: "queue",
      },
      {
        title: "Call the right people again",
        body:
          "After a run, see how many people did not answer, reached voicemail, or asked for a call back, and queue just those for another pass. Wrong numbers, transfers and do-not-call contacts are never offered.",
        points: ["Outcome tags appear in Call History and can be filtered", "Each call has a written summary and a transcript"],
        visual: "analytics",
      },
    ],
    faqs: [
      { q: "Will people know it is an AI?", a: "The agent is told to say it is an automated assistant whenever someone sincerely asks, and campaigns require you to confirm that your contacts consented and that the call discloses it is automated." },
      { q: "Is it legal to call people with an AI voice?", a: "Rules differ by country. In the United States an AI voice counts as an artificial voice, which needs the person's prior consent. Check the rules where you and your contacts are before you start." },
      { q: "Can I hear a voice before I use it?", a: "Yes. Press Call me and the agent rings your own phone with the voice and style you chose. You can try it up to five times a day." },
    ],
  },
  {
    slug: "ai-receptionist",
    name: "AI receptionist",
    short: "Answers when nobody can, and takes a proper message.",
    headline: "Never let a call go to a dead voicemail again.",
    lede:
      "When you are closed, busy, or the team is on other calls, the receptionist picks up, finds out who is calling and why, answers simple questions about your business, and sends you a written summary.",
    heroVisual: "receptionist",
    facts: ["Answers after hours, when nobody picks up, or on every call", "Hands urgent calls to a person", "A written summary on every call"],
    blocks: [
      {
        title: "Tell it about your business once",
        body:
          "Write what it should know: hours, services, prices you are happy to share, where you are, how to book. It answers only from that, and says it will pass a question on rather than guess.",
        points: ["It always says it is an automated assistant", "It never asks for card numbers or passwords", "Choose its voice and speaking style, and hear it on your phone"],
        visual: "receptionist",
      },
      {
        title: "You decide when it answers",
        body: "Pick the situation that suits you, and change it any time.",
        points: ["Only when you are closed", "When you are closed or nobody picks up", "Every call, as a front desk"],
        visual: "flow",
      },
      {
        title: "Everything it hears, written down",
        body:
          "Each call ends with a short summary of who called, their number and what they wanted, plus the full transcript. Appointment requests are listed for you to confirm, and urgent calls can be connected to your own number.",
        points: ["Tagged outcomes such as message taken or call back", "Appointment requests collected under Automations", "The text-back feature can message callers you missed"],
        visual: "aicall",
      },
    ],
    faqs: [
      { q: "Can it book appointments?", a: "It notes the time someone asks for and lists it for you to confirm. It cannot see your calendar, so it never promises a slot." },
      { q: "Which plans include it?", a: "The AI receptionist is included from the Business plan." },
    ],
    from: "Business",
  },
  {
    slug: "messaging",
    name: "SMS & missed-call text-back",
    short: "Follow up by text, and answer missed calls automatically.",
    headline: "Reach people the way they actually reply.",
    lede:
      "Send text campaigns to your list, and automatically text back anyone whose call you missed, before they ring your competitor.",
    heroVisual: "messages",
    facts: ["US text message campaigns", "Automatic text after a missed call", "Never texts do-not-call contacts"],
    blocks: [
      {
        title: "Text campaigns",
        body: "Write a message, choose a list, and send. Drafts are saved, and contacts marked do-not-call or do-not-text are skipped.",
        points: ["Save drafts and come back to them", "Send from the same workspace you call from"],
        visual: "messages",
      },
      {
        title: "Missed-call text-back",
        body:
          "When a call goes unanswered, the caller gets a text from the number they called, asking how you can help. Edit the message so it sounds like you.",
        points: ["One text per caller every six hours, so nobody is spammed", "Use your business name in the message", "Available from the Starter plan"],
        visual: "messages",
      },
    ],
    faqs: [
      { q: "Can I text outside the US?", a: "SMS campaigns are for US numbers." },
      { q: "Who gets the text-back?", a: "Anyone whose call was missed, once every six hours, except contacts marked do-not-call." },
    ],
    from: "Starter",
  },
  {
    slug: "analytics",
    name: "Call history, recordings & analytics",
    short: "See every call, hear it again, and know what is working.",
    headline: "Know what is happening on the floor, and what to do next.",
    lede:
      "Every call is logged with who, when, how long and how it went. Listen back to recordings, read summaries, and watch the numbers that matter.",
    heroVisual: "analytics",
    facts: ["Every call logged and searchable", "Recordings kept for 30 to 365 days by plan", "Live view of calls in progress"],
    blocks: [
      {
        title: "A call history you can actually use",
        body: "Search by name or number, filter by outcome or agent, and open any call. Calls handled by the AI carry a summary and an outcome tag.",
        points: ["Filter by outcome, such as Interested or Call back", "Agents see their own calls unless you allow more"],
        visual: "analytics",
      },
      {
        title: "Recordings and summaries",
        body: "Recorded calls are kept for as long as your plan allows. Where summaries are included, a recording becomes a short written summary and a transcript.",
        points: ["Retention grows with the plan", "Summaries and transcripts on the Business plan and above"],
        visual: "aicall",
      },
      {
        title: "Live and in numbers",
        body: "See who is on a call right now, and use the analytics pages for call volume, connect rates and agent leaderboards.",
        points: ["Calls today and connect rate on the overview", "Per-agent results", "Number health for every phone number"],
        visual: "analytics",
      },
    ],
    faqs: [
      { q: "How long are recordings kept?", a: "Starter keeps them for 30 days, Professional for 90, Business for 180 and Managed Enterprise for 365." },
      { q: "Can I export my data?", a: "Yes. Your data is yours and stays exportable, even after a trial ends." },
    ],
  },
  {
    slug: "team",
    name: "Agents & team tools",
    short: "Invite people, set what they can do, and keep them on task.",
    headline: "Give every agent exactly the access they need.",
    lede:
      "Invite an agent by email, choose what they can see and do, assign tasks, and talk to them inside the app. You stay in control of the workspace.",
    heroVisual: "team",
    facts: ["Invite by email, sign in with a code", "Per-agent permissions enforced on the server", "Tasks, messages and notifications built in"],
    blocks: [
      {
        title: "Permissions that mean it",
        body: "Start from a preset for a caller, a senior agent or a supervisor, then adjust. What an agent may do is checked on the server on every request, not just hidden in the interface.",
        points: [
          "Place calls, and use the power dialer, or not",
          "See no contacts, only contacts on their open tasks, or all of them",
          "Edit contacts, or only read them",
          "See only their own call history, or everyone's, and listen to recordings or not",
        ],
        visual: "team",
      },
      {
        title: "Tasks and messages",
        body: "Assign an agent a task, such as a list of people to call, and chat with them directly. They see their day in one place.",
        points: ["Agents get a \"My day\" view", "A bell for new tasks and messages", "A desktop pop-up in the Windows app, and an email if they have been away"],
        visual: "team",
      },
    ],
    faqs: [
      { q: "Can I switch an agent off?", a: "Yes, any time. They lose access immediately." },
      { q: "How many agents can I have?", a: "It depends on the plan, from one on the trial to ten on Managed Enterprise." },
    ],
  },
  {
    slug: "desktop-app",
    name: "Windows desktop app",
    short: "A proper softphone for people who spend the day on calls.",
    headline: "The dialer that lives on your desktop.",
    lede:
      "The Kchel Dialer app for Windows connects to your phone line on its own, shows who is calling, and has the whole workspace alongside the keypad.",
    heroVisual: "desktop",
    facts: ["Registers to your line automatically", "Type or paste a number, press Enter", "Notifications that appear on your desktop"],
    blocks: [
      {
        title: "Built for a day of calling",
        body: "Type or paste a number, or tap the keypad. Numbers without a country code are completed with yours, and a number that could never work is refused with the reason.",
        points: ["Call history and recent calls beside the keypad", "Power dialer built in", "A WhatsApp chat shortcut on every contact"],
        visual: "dialer",
      },
      {
        title: "The whole workspace, in one window",
        body: "Contacts, campaigns, recordings, number health, automations, billing and support are all inside the app, with the same data as the website.",
        points: ["Sign in with an emailed code", "Agents see only what the owner allows"],
        visual: "desktop",
      },
    ],
    faqs: [
      { q: "What does the desktop app cost?", a: "It is an add-on with a one-time payment, and it is included free on Managed Enterprise." },
      { q: "Does it work on Mac?", a: "The desktop app is for Windows. On any other computer, use the website in a browser." },
    ],
  },
];

export const SOLUTIONS: {
  slug: string;
  name: string;
  short: string;
  headline: string;
  lede: string;
  heroVisual: VisualKey;
  needs: { title: string; body: string; product: string }[];
  plan: string;
}[] = [
  {
    slug: "sales-teams",
    name: "Sales teams",
    short: "More conversations per hour, and nothing falls through.",
    headline: "Spend the day talking to people, not waiting for the next number to dial.",
    lede: "Reps work a list straight through, log how each call went in one tap, and come back to the people who asked for a call back.",
    heroVisual: "queue",
    needs: [
      { title: "Work a list without the busywork", body: "Import a spreadsheet, start the power dialer, and the next contact is ready as soon as the last call is logged.", product: "dialer" },
      { title: "Hand the first pass to an AI agent", body: "Let the agent qualify a cold list and tag who is interested, so your reps start with warm calls.", product: "ai-voice-agent" },
      { title: "See what works", body: "Outcomes, connect rates and a leaderboard show which lists and which people are producing.", product: "analytics" },
    ],
    plan: "professional",
  },
  {
    slug: "small-business",
    name: "Small businesses",
    short: "Look bigger than you are, and miss fewer calls.",
    headline: "A front desk that never goes home.",
    lede: "Answer every call, even when you are with a customer or the shop is closed, and follow up on the ones you missed.",
    heroVisual: "receptionist",
    needs: [
      { title: "Answer when you can't", body: "The AI receptionist takes a message, answers simple questions and sends you a summary.", product: "ai-receptionist" },
      { title: "Win back missed calls", body: "An automatic text goes to anyone whose call you missed.", product: "messaging" },
      { title: "One line, one place", body: "Menus, hours and routing are set up in an afternoon, without a phone engineer.", product: "phone-system" },
    ],
    plan: "business",
  },
  {
    slug: "call-centers",
    name: "Call centers",
    short: "Control, visibility and accountability for a growing floor.",
    headline: "Run a floor of agents without losing sight of any of them.",
    lede: "Give each agent the right access, watch calls as they happen, and review recordings and results by person.",
    heroVisual: "team",
    needs: [
      { title: "Roles and permissions", body: "Callers, senior agents and supervisors each see what they should, enforced on the server.", product: "team" },
      { title: "Live view and history", body: "See who is on a call now, search every past call, and listen to recordings.", product: "analytics" },
      { title: "Your own carrier relationship", body: "Keep your trunk and your rates, or have Managed SIP supplied.", product: "phone-system" },
    ],
    plan: "managed",
  },
  {
    slug: "remote-teams",
    name: "Remote teams",
    short: "Everyone on the same phone system, wherever they are.",
    headline: "One phone system for a team that is never in the same room.",
    lede: "Agents call from a browser or the Windows app, pick up their tasks, and message the owner without leaving the app.",
    heroVisual: "desktop",
    needs: [
      { title: "Sign in without passwords", body: "An emailed one-time code is all an agent needs, so there are no shared logins to lose.", product: "team" },
      { title: "Call from anywhere", body: "Browser or desktop app, with a headset. No office hardware.", product: "desktop-app" },
      { title: "Stay in touch", body: "Tasks, messages and notifications keep everyone moving together.", product: "team" },
    ],
    plan: "starter",
  },
];

export interface Guide {
  slug: string;
  title: string;
  minutes: number;
  summary: string;
  steps: { title: string; body: string }[];
  tips: string[];
}

export const GUIDES: Guide[] = [
  {
    slug: "get-started",
    title: "Get started in five steps",
    minutes: 10,
    summary: "From a new account to your first call.",
    steps: [
      { title: "Create your workspace", body: "Choose Sign up, pick Business or Individual, and enter your details. You'll get a six-digit code by email, and by text when phone checking is on. Enter them and your workspace is live, with a 7-day free trial." },
      { title: "Connect a phone line", body: "Open Phone System, then Connection, and enter your SIP provider's host, username and password. The app shows when the line is registered." },
      { title: "Set your default country code", body: "Under Phone System, Call Routing, choose your country so that numbers written locally are dialed correctly." },
      { title: "Import your contacts", body: "Open Contacts, press Import, and choose your CSV file. Check the preview, name the list, and confirm." },
      { title: "Make a call", body: "Open Live Calls and go online, then press the call button beside a contact. Or install the Windows app and use the keypad." },
    ],
    tips: ["Add a teammate from Agents once you have made a first call.", "Everything you set up during the trial carries over when you pick a plan."],
  },
  {
    slug: "connect-your-phone-line",
    title: "Connect your phone line",
    minutes: 5,
    summary: "Link your SIP provider so calls can go out and come in.",
    steps: [
      { title: "Get your SIP details", body: "Your provider gives you a host (server address), a username and a password. Some also name the transport, such as UDP, TCP or TLS." },
      { title: "Open the Connection tab", body: "In the website, go to Phone System and choose Connection. In the desktop app, open SIP configuration." },
      { title: "Enter the details and save", body: "Type the host, username, password and transport, then save. The password is stored encrypted." },
      { title: "Check it registered", body: "The app reports whether the line registered. If it did not, re-enter the password: that is the most common cause." },
    ],
    tips: ["Add your numbers under Phone System, Numbers.", "Prefer not to use your own carrier? Ask about Managed SIP."],
  },
  {
    slug: "import-contacts",
    title: "Import your contacts",
    minutes: 5,
    summary: "Bring a spreadsheet in, cleanly, in one upload.",
    steps: [
      { title: "Save your file as CSV", body: "In Excel or Google Sheets use Save as, then choose CSV. Keep a column for the phone number; names, company, email and tags are optional." },
      { title: "Press Import on Contacts", body: "Choose the file. Kchel finds the columns by their names and shows what it found." },
      { title: "Check the preview", body: "Confirm the columns, and name the list the contacts will join." },
      { title: "Confirm the import", body: "Up to 10,000 contacts are added at once. Duplicates are skipped, and any row that could not be used is listed with the reason." },
    ],
    tips: ["Numbers without a country code use your default country code.", "If your plan's contact limit is reached, the import fills it and skips the rest."],
  },
  {
    slug: "run-a-campaign",
    title: "Run your first campaign",
    minutes: 8,
    summary: "Build a campaign and work it with the power dialer.",
    steps: [
      { title: "Create the campaign", body: "Open Campaigns, press Create campaign, give it a name, choose a contact list and an owner." },
      { title: "Choose how it is dialed", body: "Human-dialed campaigns use the power dialer in the desktop app. AI voice agent campaigns call for you." },
      { title: "Start the power dialer", body: "On the campaign, choose Power dial. It counts down, places the call, and asks how it went." },
      { title: "Record each result", body: "Tap connected, call back, not interested, voicemail, busy, wrong number or do not call. The next contact comes up." },
    ],
    tips: ["Set how long the dialer waits between calls, and when it should stop ringing.", "Contacts marked do-not-call are skipped."],
  },
  {
    slug: "set-up-the-ai-voice-agent",
    title: "Set up the AI voice agent",
    minutes: 10,
    summary: "Write the call, choose the voice, and let it work a list.",
    steps: [
      { title: "Create an AI campaign", body: "Press Create campaign and choose AI voice agent. Pick a contact list." },
      { title: "Write what the call is for", body: "Describe who it is, why it is calling and what you want. Use {{first_name}} and {{company}} to personalise." },
      { title: "Choose voice and behaviour", body: "Pick a voice and speaking style, decide what happens on voicemail, and which actions it may take." },
      { title: "Hear it first", body: "Press Call me. The agent rings your own phone with the voice you chose." },
      { title: "Confirm consent and start", body: "Tick the box confirming your contacts consented and the call discloses it is automated, then press Start dialing." },
    ],
    tips: ["Use Call people again to retry the unanswered and voicemail contacts.", "Check the rules on automated calls where you operate before you start."],
  },
  {
    slug: "set-up-the-ai-receptionist",
    title: "Set up the AI receptionist",
    minutes: 6,
    summary: "Have every missed call answered and written down.",
    steps: [
      { title: "Open Automations", body: "Find the AI receptionist panel and switch it on." },
      { title: "Choose when it answers", body: "Only when closed, when closed or nobody picks up, or on every call." },
      { title: "Describe your business", body: "Add hours, services, prices you are happy to share and how to book. It answers only from this." },
      { title: "Add an urgent line", body: "Enter a number for calls that need a person, and keep handover switched on." },
      { title: "Choose a voice and test it", body: "Pick a voice and use Call me to hear it, then save." },
    ],
    tips: ["Appointment requests are listed on the same page for you to confirm.", "The AI receptionist is included from the Business plan."],
  },
  {
    slug: "invite-your-team",
    title: "Invite your team",
    minutes: 4,
    summary: "Add agents and choose what each one can do.",
    steps: [
      { title: "Open Agents", body: "Press Add agent, then enter their name and email." },
      { title: "Choose their access", body: "Start from a caller, senior agent or supervisor preset, then adjust calls, contacts, history and recordings." },
      { title: "They accept by email", body: "The agent gets an invitation and signs in with an emailed code." },
      { title: "Give them something to do", body: "Assign a task from Team, and message them from the same page." },
    ],
    tips: ["You can switch an agent off at any time.", "How many agents you can add depends on your plan."],
  },
];

export const FAQS: { group: string; items: Faq[] }[] = [
  {
    group: "Getting started",
    items: [
      { q: "How does the free trial work?", a: "Every new workspace starts a 7-day free trial the moment you verify your email. You don't need to add a card to start. When the trial ends the workspace pauses until you choose a plan, and your data stays safe." },
      { q: "Do I need a password?", a: "No. You sign in with your email and a six-digit code, every time." },
      { q: "How long does setup take?", a: "Connecting a line, importing a list and making a first call is designed to fit in an afternoon." },
    ],
  },
  {
    group: "Calling",
    items: [
      { q: "Do I have to use your phone numbers or carrier?", a: "No. On Starter, Professional and Business you bring your own SIP line and your calls are billed by your carrier. Managed SIP is available as an add-on and is included in Managed Enterprise." },
      { q: "Can I call from my browser?", a: "Yes. Go online in Live Calls. The Windows app is also available." },
      { q: "Does the dialer call several people at once?", a: "No. The power dialer works one contact at a time and never dials ahead of an agent." },
    ],
  },
  {
    group: "AI features",
    items: [
      { q: "What can the AI voice agent do?", a: "It calls a list, speaks first, holds a conversation, handles voicemail, tags how each call went, notes appointment requests, can text once, and can transfer to a person." },
      { q: "Is the AI always honest about being an AI?", a: "It is instructed to say it is an automated assistant whenever anyone sincerely asks, and you confirm that your contacts consented before a campaign can start." },
      { q: "Which plans include the AI receptionist?", a: "Business and Managed Enterprise." },
    ],
  },
  {
    group: "Plans and billing",
    items: [
      { q: "How do I pay?", a: "Open Billing, choose a plan and pay with the link shown. Depending on your country there may also be bank, crypto or gift card options and regional prices. After paying, tell us from the same page and we activate your plan." },
      { q: "Is there an annual discount?", a: "Yes. Annual billing includes two months free." },
      { q: "What happens to my data if I cancel?", a: "It stays yours and remains exportable." },
    ],
  },
];

export const SECURITY_POINTS: { title: string; body: string }[] = [
  { title: "No passwords to leak", body: "Every sign-in uses a one-time code sent to your email, so there is no password to guess, reuse or share." },
  { title: "Permissions enforced on the server", body: "What an agent may do is checked on every request. Hiding a button is never the only protection." },
  { title: "Secrets stored encrypted", body: "SIP passwords are stored encrypted." },
  { title: "Your data stays yours", body: "Your contacts, recordings and history remain exportable, including after a trial ends." },
  { title: "Consent built into AI campaigns", body: "An AI voice campaign cannot start until the owner confirms the contacts consented and the call discloses it is automated." },
  { title: "Do-not-call that sticks", body: "Contacts marked do-not-call are skipped by campaigns and automations, and an agent can mark someone do-not-call as soon as a call ends." },
];
