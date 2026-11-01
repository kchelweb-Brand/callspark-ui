// Builds the 30 awareness posts: node awareness.cjs <outDir>
// Writes <outDir>/hd (1080x1080), <outDir>/4k (2160x2160) and <outDir>/Kchel-Dialer-Awareness-Posts.pdf
const { chromium } = require("playwright");
const { readFileSync, mkdirSync } = require("node:fs");
const path = require("node:path");
const out = process.argv[2];
const logo = "data:image/svg+xml;base64," + readFileSync(path.join(__dirname, "logo.svg")).toString("base64");

const S = (kicker, h, sub) => ({ k: "s", kicker, h, sub });
const Q = (kicker, h, sub) => ({ k: "q", kicker, h, sub });
const L = (kicker, h, items) => ({ k: "l", kicker, h, items });
const posts = [
  S("Meet Kchel Dialer", "The phone system that works as hard as your team.", "Calls, campaigns, voicemail and messages in one place."),
  Q("Think about it", "How many calls did your business miss this week?", "Every missed call is a customer who tried to reach you."),
  S("Missed calls", "A missed call is a customer who moved on.", "Missed-call text-back sends them a message straight away."),
  L("Getting started", "Set up in an afternoon.", ["Connect your phone line", "Build the menu callers hear", "Choose who rings, and when", "Start taking calls"]),
  S("Your carrier", "Your calls. Your carrier.", "Bring the SIP line you already pay for, or have one supplied."),
  S("Anywhere", "Dial from the desktop. Or from any browser.", "A Windows app and a web app, one account."),
  L("Voicemail", "Never lose a message.", ["Your own greetings", "Voicemail in one inbox", "Text-back when a call is missed"]),
  Q("Sales teams", "Still dialing one number at a time, by hand?", "Campaigns work through your list for you."),
  S("Campaigns", "Work a list. Don't dial ahead of your agents.", "Paced calling keeps your team talking, not waiting."),
  L("Call records", "Every call, on the record.", ["Full call history", "Recordings", "Analytics you can read at a glance"]),
  S("Live view", "Know what is happening on the floor.", "Live calls and analytics, in one view."),
  L("Teams", "Everyone gets exactly the access they need.", ["Logins for every agent", "Permissions you control", "Tasks and direct messages"]),
  S("Menus", "Callers should never get lost.", "IVR menus send every caller to the right person."),
  Q("Opening hours", "Does your phone know when you are closed?", "Set hours and routing so callers hear the right thing at the right time."),
  S("Contacts", "Turn a contact list into conversations.", "Import a CSV, tag your contacts, start calling."),
  L("Import", "Bring your list in minutes.", ["CSV import", "First and last names, location, country", "Do-not-call is respected"]),
  S("Messages", "Call and text from the same place.", "Your SMS inbox sits right beside your calls."),
  S("Free trial", "Try it free for 7 days.", "Bring your own SIP line and see it work for yourself."),
  S("Pricing", "From $29 per agent per month.", "Starter: the full dialer on your own carrier."),
  Q("Value", "Paying for a phone system you barely use?", "Start free, pay per agent, upgrade only when you grow."),
  S("Sales", "Spend the day talking to people.", "Not waiting for the next number to dial."),
  S("Front desks", "Looked after, even when you can't pick up.", "Menus, hours and voicemail keep every caller covered."),
  L("Why teams switch", "One phone system. Less juggling.", ["Calls and messages together", "Simple per-agent pricing", "Windows app and browser", "A free 7-day trial"]),
  S("Growing teams", "Small team? Big phone system.", "Start with one agent and add more as you grow."),
  Q("Think about it", "Where do your customers' calls go when nobody answers?", "With Kchel Dialer: a greeting, voicemail and a text-back."),
  S("Your numbers", "Your phone number is your reputation.", "Keep an eye on how your numbers are doing."),
  L("Day to day", "Simple to run.", ["Add your agents", "Set their permissions", "Watch the live floor", "Review the day"]),
  S("All in one", "Stop juggling five tools for one phone call.", "Dialer, voicemail, texts, history and reports together."),
  S("Help built in", "Stuck? Just ask.", "The in-app help assistant shows you how to do anything."),
  S("Get started", "Ready to try Kchel Dialer?", "Start your free 7-day trial today."),
];
const themes = [
  { bg: "#0b0f14", fg: "#fff", ac: "#3ddc84", mu: "#b9c4d0", g1: "#14a85f", g2: "#2a6ee6", pill: "#3ddc84", pillfg: "#06210f" },
  { bg: "#0b8f4d", fg: "#fff", ac: "#0b0f14", mu: "#d8f5e5", g1: "#3ddc84", g2: "#087a41", pill: "#0b0f14", pillfg: "#fff" },
  { bg: "#f4f7fa", fg: "#0b1d2e", ac: "#0b8f4d", mu: "#465a6e", g1: "#bfe9d2", g2: "#c9dcf7", pill: "#0b8f4d", pillfg: "#fff" },
  { bg: "#0a2540", fg: "#fff", ac: "#f5c32c", mu: "#b8c7da", g1: "#2a6ee6", g2: "#f5c32c", pill: "#f5c32c", pillfg: "#241a00" },
  { bg: "#2a6ee6", fg: "#fff", ac: "#f5c32c", mu: "#dbe7fc", g1: "#0a2540", g2: "#3ddc84", pill: "#fff", pillfg: "#0a2540" },
];
const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");
function html(p, i) {
  const t = themes[i % themes.length];
  const body =
    p.k === "l"
      ? `<h1 class="m">${esc(p.h)}</h1><ul>${p.items.map((x) => `<li><b>✓</b>${esc(x)}</li>`).join("")}</ul>`
      : p.k === "q"
        ? `<h1 class="q">${esc(p.h)}</h1><p class="sub">${esc(p.sub)}</p>`
        : `<h1 class="s">${esc(p.h)}</h1><p class="sub">${esc(p.sub)}</p>`;
  return `<html><head><style>
*{box-sizing:border-box;margin:0}
body{width:1080px;height:1080px;font-family:'Helvetica Neue',Arial,sans-serif;color:${t.fg};background:${t.bg};position:relative;overflow:hidden}
.glow{position:absolute;width:880px;height:880px;border-radius:50%;filter:blur(120px);opacity:.5}
.g1{background:${t.g1};right:-300px;top:-320px}.g2{background:${t.g2};left:-380px;bottom:-440px;opacity:.38}
.wrap{position:relative;padding:84px;height:100%;display:flex;flex-direction:column}
.brand{display:flex;align-items:center;gap:18px;font-weight:700;font-size:34px}
.brand img{width:64px;height:64px;border-radius:16px}
.main{flex:1;display:flex;flex-direction:column;justify-content:center}
.kicker{font-size:30px;font-weight:800;letter-spacing:3px;text-transform:uppercase;color:${t.ac};margin-bottom:28px}
h1{font-weight:800;letter-spacing:-2px;line-height:1.05}
h1.s{font-size:96px}h1.q{font-size:88px}h1.m{font-size:84px}
p.sub{font-size:40px;line-height:1.35;color:${t.mu};margin-top:36px;max-width:880px}
ul{list-style:none;padding:0;margin-top:44px}
li{font-size:44px;font-weight:700;padding:20px 0;border-top:1px solid ${t.mu}55;display:flex;gap:22px;align-items:center}
li:last-child{border-bottom:1px solid ${t.mu}55}li b{color:${t.ac}}
.foot{font-size:28px;color:${t.mu};display:flex;justify-content:space-between;align-items:center}
.pill{background:${t.pill};color:${t.pillfg};font-weight:800;font-size:28px;padding:12px 28px;border-radius:999px}
</style></head><body><div class="glow g1"></div><div class="glow g2"></div><div class="wrap">
<div class="brand"><img src="${logo}"/>Kchel Dialer</div>
<div class="main"><div class="kicker">${esc(p.kicker)}</div>${body}</div>
<div class="foot"><span class="pill">Kchel Dialer</span><span>Built for teams that live on the phone</span></div></div></body></html>`;
}
(async () => {
  mkdirSync(path.join(out, "hd"), { recursive: true });
  mkdirSync(path.join(out, "4k"), { recursive: true });
  const b = await chromium.launch();
  const imgs = [];
  for (const scale of [1, 2]) {
    const ctx = await b.newContext({ viewport: { width: 1080, height: 1080 }, deviceScaleFactor: scale });
    const pg = await ctx.newPage();
    for (let i = 0; i < posts.length; i++) {
      const name = `kchel-awareness-${String(i + 1).padStart(2, "0")}.png`;
      await pg.setContent(html(posts[i], i));
      const f = path.join(out, scale === 1 ? "hd" : "4k", name);
      await pg.screenshot({ path: f });
      if (scale === 2) imgs.push(f);
    }
    await ctx.close();
  }
  const pdfPage = await b.newPage();
  const pages = imgs.map((f) => `<div class="p"><img src="data:image/png;base64,${readFileSync(f).toString("base64")}"/></div>`).join("");
  await pdfPage.setContent(`<html><head><style>@page{size:1080px 1080px;margin:0}*{margin:0}.p{width:1080px;height:1080px;page-break-after:always}img{width:1080px;height:1080px;display:block}</style></head><body>${pages}</body></html>`);
  await pdfPage.pdf({ path: path.join(out, "Kchel-Dialer-Awareness-Posts.pdf"), width: "1080px", height: "1080px", printBackground: true });
  await b.close();
})();
