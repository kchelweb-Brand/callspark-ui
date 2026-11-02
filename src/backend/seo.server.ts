// The files search engines and AI answer engines ask for by name: sitemap.xml, robots.txt, llms.txt and
// llms-full.txt. They are built from the site's own content on every request, so a new guide or
// product page appears in them without anyone remembering to edit a list, and the address in them is
// the one the visitor used, so they stay right on a custom domain.

import { FAQS, GUIDES, PRODUCTS, SOLUTIONS } from "../site/content";
import { CONTENT_UPDATED, PRIVATE_PREFIXES, SITE_DESCRIPTION, SITE_NAME, SITE_TAGLINE } from "../site/seo";
import { LEVELS, MANUAL, articlePath, plain, type ManualArticle } from "../manual";
import { PLANS, type PlanId } from "./plans";

const PUBLIC_PAGES: { path: string; priority: string }[] = [
  { path: "/", priority: "1.0" },
  { path: "/product", priority: "0.9" },
  { path: "/pricing", priority: "0.9" },
  { path: "/manual", priority: "0.9" },
  { path: "/solutions", priority: "0.8" },
  { path: "/resources", priority: "0.7" },
  { path: "/faq", priority: "0.8" },
  { path: "/download", priority: "0.7" },
  { path: "/signup", priority: "0.8" },
  { path: "/about", priority: "0.5" },
  { path: "/security", priority: "0.6" },
  { path: "/contact", priority: "0.5" },
  { path: "/legal/terms", priority: "0.2" },
  { path: "/legal/privacy", priority: "0.2" },
];

function esc(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function sitemapXml(origin: string): string {
  const urls: { path: string; priority: string }[] = [
    ...PUBLIC_PAGES,
    ...PRODUCTS.map((p) => ({ path: `/product/${p.slug}`, priority: "0.8" })),
    ...SOLUTIONS.map((s) => ({ path: `/solutions/${s.slug}`, priority: "0.7" })),
    ...GUIDES.map((g) => ({ path: `/resources/${g.slug}`, priority: "0.6" })),
    ...MANUAL.map((a) => ({ path: articlePath(a.slug), priority: a.level === "beginner" ? "0.8" : "0.6" })),
  ];
  const body = urls
    .map((u) => `  <url><loc>${esc(origin + (u.path === "/" ? "/" : u.path))}</loc><lastmod>${CONTENT_UPDATED}</lastmod><priority>${u.priority}</priority></url>`)
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</urlset>\n`;
}

/** Search crawlers and the AI crawlers that fetch pages to answer questions or to learn from them. All are welcome on the public pages. */
const WELCOMED_BOTS = [
  "Googlebot",
  "Bingbot",
  "DuckDuckBot",
  "Applebot",
  "GPTBot",
  "OAI-SearchBot",
  "ChatGPT-User",
  "ClaudeBot",
  "Claude-SearchBot",
  "Claude-User",
  "anthropic-ai",
  "PerplexityBot",
  "Perplexity-User",
  "Google-Extended",
  "Applebot-Extended",
  "CCBot",
  "Amazonbot",
  "cohere-ai",
  "Meta-ExternalAgent",
];

export function robotsTxt(origin: string): string {
  const rules = ["Allow: /", ...PRIVATE_PREFIXES.map((p) => `Disallow: ${p}`)].join("\n");
  // A crawler that is named has to repeat the rules, because it follows only its own group.
  const groups = [...WELCOMED_BOTS, "*"].map((ua) => `User-agent: ${ua}\n${rules}`).join("\n\n");
  return `${groups}\n\nSitemap: ${origin}/sitemap.xml\n`;
}

function planLine(id: PlanId): string {
  const p = PLANS[id];
  const l = p.limits;
  const price =
    id === "trial"
      ? `free for ${p.trialDays ?? 7} days, no card needed`
      : p.priceFlatMonthly !== undefined
        ? `$${p.priceFlatMonthly.toLocaleString()} a month, flat for the whole team`
        : `$${p.pricePerAgentMonthly} per agent per month`;
  const bits = [
    `up to ${l.agents} agent${l.agents === 1 ? "" : "s"}`,
    `${l.contacts?.toLocaleString()} contacts`,
    `${l.ivrMenus} phone menu${l.ivrMenus === 1 ? "" : "s"}`,
    `${l.phoneNumbers} number${l.phoneNumbers === 1 ? "" : "s"}`,
  ];
  return `- ${p.name}: ${price}. ${bits.join(", ")}. ${p.managedSip ? "Kchel runs the phone line, the Windows Dialer is included, and support and maintenance are included." : "Runs on your own phone provider."}`;
}

const PLAN_ORDER: PlanId[] = ["trial", "starter", "professional", "business", "managed"];

export function llmsTxt(origin: string): string {
  const lines: string[] = [];
  lines.push(`# ${SITE_NAME}`, "", `> ${SITE_DESCRIPTION}`, "");
  lines.push(
    `${SITE_NAME} (${SITE_TAGLINE.toLowerCase()}) helps a team make and take calls, run calling campaigns and play a recorded message to a whole contact list, from a web workspace or a Windows app.`,
    "Teams bring their own SIP phone provider or ask for Managed SIP credentials. Sign-in uses a one-time email code, with no password.",
    "",
  );
  lines.push("## Product", "");
  for (const p of PRODUCTS) lines.push(`- [${p.name}](${origin}/product/${p.slug}): ${p.headline}`);
  lines.push("", "## Plans and pricing", "", `- [Pricing](${origin}/pricing): every plan, its price and its limits`);
  for (const id of PLAN_ORDER) lines.push(planLine(id));
  lines.push("", "## The manual (step-by-step guides with screenshots)", "");
  for (const l of LEVELS) {
    lines.push(`### ${l.label}`, "");
    for (const a of MANUAL.filter((x) => x.level === l.id)) lines.push(`- [${a.title}](${origin}${articlePath(a.slug)}): ${plain(a.summary)}`);
    lines.push("");
  }
  lines.push("## Solutions", "");
  for (const s of SOLUTIONS) lines.push(`- [${s.name}](${origin}/solutions/${s.slug}): ${s.headline}`);
  lines.push("", "## Answers", "", `- [Frequently asked questions](${origin}/faq)`, `- [Security](${origin}/security)`, `- [Contact](${origin}/contact)`, "");
  lines.push("## Optional", "", `- [Full text of the manual and FAQ for AI tools](${origin}/llms-full.txt)`, `- [Sitemap](${origin}/sitemap.xml)`, "");
  return lines.join("\n");
}

function articleMarkdown(a: ManualArticle, origin: string): string {
  const out: string[] = [`## ${a.title}`, "", `URL: ${origin}${articlePath(a.slug)}  `, `Level: ${a.level}. Time: ${a.time}.`, "", plain(a.summary), ""];
  if (a.steps.length) {
    out.push("Steps:", "");
    a.steps.forEach((s, i) => out.push(`${i + 1}. ${plain(s.text)}${s.note ? ` (${s.note})` : ""}`));
    out.push("");
  }
  for (const s of a.more ?? []) {
    out.push(`### ${s.heading}`, "");
    if (s.text) out.push(plain(s.text), "");
    if (s.copy) out.push(`> ${s.copy}`, "");
    if (s.bullets) out.push(...s.bullets.map((b) => `- ${plain(b)}`), "");
    if (s.steps) out.push(...s.steps.map((st, i) => `${i + 1}. ${plain(st.text)}`), "");
  }
  if (a.tips?.length) out.push("Tips:", "", ...a.tips.map((t) => `- ${t}`), "");
  return out.join("\n");
}

/** Everything an AI tool needs to answer questions about the product, in one file. */
export function llmsFullTxt(origin: string): string {
  const out: string[] = [`# ${SITE_NAME}: full text`, "", `> ${SITE_DESCRIPTION}`, "", "## Plans and pricing", "", ...PLAN_ORDER.map(planLine), ""];
  out.push("## Frequently asked questions", "");
  for (const g of FAQS) {
    out.push(`### ${g.group}`, "");
    for (const f of g.items) out.push(`**${f.q}**`, f.a, "");
  }
  out.push("# The manual", "");
  for (const a of MANUAL) out.push(articleMarkdown(a, origin));
  return out.join("\n");
}

/** The response for one of these files, or null when the path is not one of them. */
export function seoResponse(url: URL): Response | null {
  const origin = url.origin;
  const cache = { "cache-control": "public, max-age=3600" };
  switch (url.pathname) {
    case "/sitemap.xml":
      return new Response(sitemapXml(origin), { headers: { "content-type": "application/xml; charset=utf-8", ...cache } });
    case "/robots.txt":
      return new Response(robotsTxt(origin), { headers: { "content-type": "text/plain; charset=utf-8", ...cache } });
    case "/llms.txt":
      return new Response(llmsTxt(origin), { headers: { "content-type": "text/plain; charset=utf-8", ...cache } });
    case "/llms-full.txt":
      return new Response(llmsFullTxt(origin), { headers: { "content-type": "text/plain; charset=utf-8", ...cache } });
    default:
      return null;
  }
}
