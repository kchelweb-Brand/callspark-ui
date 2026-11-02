// Search and AI-search visibility: the facts about the site that crawlers, Google, and AI answer engines read.
//
// Three things are served from here:
//  - SEO: the canonical address, social-preview tags and which pages must not be indexed.
//  - AEO (answer engines): structured data (FAQ, How-to steps, breadcrumbs) so a direct answer can be lifted from a page.
//  - GEO (generative engines): clear entity facts (Organization, SoftwareApplication with real plan prices).
// Pure data and no I/O, so both the pages and the server (sitemap, llms.txt) can use it.

import { PLANS, type PlanId } from "../backend/plans";
import type { Faq } from "./content";

/**
 * The public address of the site. Set VITE_SITE_URL when the site moves to its own domain and every
 * canonical link, preview tag and structured-data address follows. The sitemap and robots.txt use
 * the address a visitor actually asked for, so they are right on any domain.
 */
export const SITE_URL: string = ((import.meta.env["VITE_SITE_URL"] as string | undefined) || "https://kchel-dialer.kchelweb.workers.dev").replace(/\/+$/, "");

export const SITE_NAME = "Kchel Dialer";
export const SITE_TAGLINE = "Cloud calling, campaigns and voice broadcasts for sales and support teams";
export const SITE_DESCRIPTION =
  "Kchel Dialer is a call center platform: power dialer, voice broadcast campaigns, phone menus, call routing, SMS, recordings and analytics in one workspace. Bring your own phone line or get Managed SIP. Free for 7 days.";
export const OG_IMAGE_PATH = "/og-image.jpg";

/** The last time the public content changed in a way worth telling search engines about. */
export const CONTENT_UPDATED = "2026-11-02";

/** The signed-in app and the owner console: useful to people, never to a search results page. */
export const PRIVATE_PREFIXES = [
  "/dashboard",
  "/agent",
  "/agents",
  "/analytics",
  "/automations",
  "/billing",
  "/call-history",
  "/campaigns",
  "/contacts",
  "/live-calls",
  "/phone-system",
  "/recordings",
  "/settings",
  "/sms",
  "/support",
  "/team",
  "/admin",
  "/login",
  "/api",
  "/media",
  "/dl",
];

export function isPrivatePath(pathname: string): boolean {
  return PRIVATE_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + "/"));
}

export function absoluteUrl(path: string, origin: string = SITE_URL): string {
  const clean = path === "/" || path === "" ? "/" : "/" + path.replace(/^\/+/, "").replace(/\/+$/, "");
  return origin + clean;
}

type Json = Record<string, unknown>;

/** A JSON-LD block for a page's head. The "<" is escaped so page text can never close the script tag. */
export function ldScript(data: Json): { type: string; children: string } {
  return { type: "application/ld+json", children: JSON.stringify(data).replace(/</g, "\\u003c") };
}

const ORG_ID = `${SITE_URL}/#organization`;
const SITE_ID = `${SITE_URL}/#website`;

export function organizationLd(): Json {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    "@id": ORG_ID,
    name: SITE_NAME,
    url: SITE_URL,
    logo: `${SITE_URL}/icon-512.png`,
    description: SITE_DESCRIPTION,
  };
}

export function websiteLd(): Json {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    "@id": SITE_ID,
    url: SITE_URL,
    name: SITE_NAME,
    description: SITE_TAGLINE,
    inLanguage: "en",
    publisher: { "@id": ORG_ID },
  };
}

function offerFor(id: PlanId): Json {
  const plan = PLANS[id];
  const flat = plan.priceFlatMonthly !== undefined;
  const price = id === "trial" ? 0 : flat ? plan.priceFlatMonthly : plan.pricePerAgentMonthly;
  const agents = plan.limits.agents;
  return {
    "@type": "Offer",
    name: plan.name,
    price: String(price),
    priceCurrency: "USD",
    url: absoluteUrl("/pricing"),
    availability: "https://schema.org/InStock",
    description:
      id === "trial"
        ? `${plan.trialDays ?? 7}-day free trial, no card needed. ${plan.blurb}`
        : `${flat ? "Flat monthly price for the whole team" : "Per agent per month"}. Up to ${agents} agents and ${plan.limits.contacts?.toLocaleString()} contacts. ${plan.blurb}`,
    priceSpecification: {
      "@type": "UnitPriceSpecification",
      price: String(price),
      priceCurrency: "USD",
      unitText: flat || id === "trial" ? "month" : "agent per month",
      referenceQuantity: { "@type": "QuantitativeValue", value: 1, unitCode: "MON" },
    },
  };
}

export function softwareLd(): Json {
  return {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    "@id": `${SITE_URL}/#software`,
    name: SITE_NAME,
    url: SITE_URL,
    description: SITE_DESCRIPTION,
    applicationCategory: "BusinessApplication",
    applicationSubCategory: "Call center software",
    operatingSystem: "Web browser, Windows",
    inLanguage: "en",
    image: absoluteUrl(OG_IMAGE_PATH),
    publisher: { "@id": ORG_ID },
    featureList: [
      "Power dialer for outbound calling teams",
      "Voice broadcast campaigns that play a recording to a whole contact list",
      "Phone menus (IVR), call routing, business hours, extensions and voicemail",
      "Bring your own SIP provider or use Managed SIP",
      "Call from the browser or the Windows desktop app",
      "SMS, missed-call text-back and number rotation",
      "Recordings, call summaries and analytics",
    ],
    offers: (["trial", "starter", "professional", "business", "managed"] as PlanId[]).map(offerFor),
  };
}

export function faqLd(items: Faq[]): Json {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: items.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })),
  };
}

export function breadcrumbLd(trail: { name: string; path?: string }[]): Json {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: trail.map((t, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: t.name,
      ...(t.path !== undefined ? { item: absoluteUrl(t.path) } : {}),
    })),
  };
}

/** "10 minutes" or "5 minutes to read" as an ISO 8601 duration, or nothing when it is not a number of minutes. */
export function isoMinutes(text: string): string | undefined {
  const m = text.match(/(\d+)\s*minutes?/i);
  return m ? `PT${m[1]}M` : undefined;
}

export function howToLd(args: {
  name: string;
  description: string;
  path: string;
  time?: string;
  steps: { name?: string; text: string; image?: string | undefined }[];
}): Json {
  const total = args.time ? isoMinutes(args.time) : undefined;
  return {
    "@context": "https://schema.org",
    "@type": "HowTo",
    name: args.name,
    description: args.description,
    url: absoluteUrl(args.path),
    ...(total ? { totalTime: total } : {}),
    step: args.steps.map((s, i) => ({
      "@type": "HowToStep",
      position: i + 1,
      ...(s.name ? { name: s.name } : {}),
      text: s.text,
      url: `${absoluteUrl(args.path)}#step-${i + 1}`,
      ...(s.image ? { image: absoluteUrl(s.image) } : {}),
    })),
  };
}

export function itemListLd(name: string, items: { name: string; path: string }[]): Json {
  return {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name,
    itemListElement: items.map((it, i) => ({ "@type": "ListItem", position: i + 1, name: it.name, url: absoluteUrl(it.path) })),
  };
}

