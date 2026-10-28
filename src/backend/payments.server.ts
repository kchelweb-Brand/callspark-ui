// How a customer can pay, and what the price is where they live.
//
// Payment links are fixed-amount pages at an outside provider (Flutterwave for
// cards and bank transfer, a crypto checkout, a gift-card seller). Paying
// activates nothing by itself: the owner sees the money and activates the plan.
// Besides the original Flutterwave links, the owner adds more here: a cheaper
// link for emerging markets, a crypto link, a gift-card link. A customer sees
// the links for their own region, and the regional one wins where both exist.
//
// Server-only; the browser reaches it through the server functions below.

import { createServerFn } from "@tanstack/react-start";

import { sql } from "./db";
import { verifyToken } from "./tokens";
import { ensureSchema } from "./schema.server";
import { CHECKOUT_OPTIONS, getPlan, isPlanId, type BillingInterval, type PlanId } from "./plans";
import { PRICE_REGIONS, countryByCode, countryByDial, regionForCountry, type PriceRegion } from "./countries";
import { callingCodeFromE164 } from "./phone-numbers";
import { createMyTicket } from "./workspace.server";
import { saveReceipt, type ReceiptUpload } from "./receipts.server";
import { announceClaim, tellCustomerReceived } from "./claim-notify.server";

export type PayMethod = "card" | "bank" | "crypto" | "giftcard" | "other";

export const PAY_METHODS: { id: PayMethod; label: string }[] = [
  { id: "card", label: "Card" },
  { id: "bank", label: "Bank transfer" },
  { id: "crypto", label: "Crypto" },
  { id: "giftcard", label: "Gift card" },
  { id: "other", label: "Other" },
];

/** Crypto adds this to every plan price, shown to the customer as VAT. */
export const CRYPTO_VAT_USD = 10;

/** What an Apple gift card (USA) must be worth for each plan, per month. Cards resell below face value. */
export const GIFTCARD_PRICES: Partial<Record<PlanId, number>> = {
  starter: 100,
  professional: 200,
  business: 1500,
  managed: 5000,
};

export const GIFTCARD_LABEL = "Apple gift card (USA only)";

/** A place the owner receives crypto: the coin, the network it must be sent on, and the address. */
export interface CryptoWallet {
  coin: string;
  network: string;
  address: string;
}

export interface GiftCardSettings {
  /** Where the customer sends or redeems the card, if the owner uses a page for it. */
  url: string;
  /** Instructions shown to the customer. */
  note: string;
}

export interface PaymentSettings {
  wallets: CryptoWallet[];
  giftcard: GiftCardSettings;
}

export interface CheckoutLink {
  planId: PlanId;
  seats: number;
  interval: BillingInterval;
  amountUsd: number;
  /** Empty for crypto and for a gift card paid by instructions alone. */
  url: string;
  method: PayMethod;
  label: string;
  region: PriceRegion;
  /** Crypto only: the plan price before the VAT line, and where to send the money. */
  baseUsd?: number;
  vatUsd?: number;
  wallets?: CryptoWallet[];
  /** Gift card only: what the customer is told to do. */
  note?: string;
}

export interface PaymentLinkRow {
  id: string;
  region: PriceRegion;
  plan_id: string;
  seats: number;
  interval: BillingInterval;
  method: PayMethod;
  label: string;
  amount_usd: number;
  url: string;
  active: boolean;
}

const cleanText = (v: unknown, max: number) => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, max);

/** The owner's crypto wallets and gift-card instructions. Never throws: nothing set means nothing offered. */
export async function getPaymentSettings(): Promise<PaymentSettings> {
  const result: PaymentSettings = { wallets: [], giftcard: { url: "", note: "" } };
  try {
    await ensureSchema();
    const rows = await sql`select key, value from payment_settings where key in ('crypto_wallets', 'giftcard')`;
    for (const r of rows) {
      const value = r["value"] as Record<string, unknown> | unknown[] | null;
      if (r["key"] === "crypto_wallets" && Array.isArray(value)) {
        result.wallets = value
          .map((w) => w as Record<string, unknown>)
          .map((w) => ({ coin: cleanText(w["coin"], 40), network: cleanText(w["network"], 60), address: cleanText(w["address"], 200) }))
          .filter((w) => w.coin && w.address);
      }
      if (r["key"] === "giftcard" && value && !Array.isArray(value)) {
        result.giftcard = { url: cleanText(value["url"], 500), note: cleanText(value["note"], 600) };
      }
    }
  } catch (err) {
    console.warn("[payments] could not read the payment settings", err);
  }
  return result;
}

/** Where this workspace is, for prices: the country asked at signup, else what its phone number says. */
async function regionForTenant(tenantId: string): Promise<PriceRegion> {
  const [row] = await sql`
    select t.country, ts.workspace ->> 'phone' as phone
    from tenants t left join tenant_settings ts on ts.tenant_id = t.id
    where t.id = ${tenantId} limit 1
  `;
  const stored = (row?.["country"] as string | null) ?? null;
  if (countryByCode(stored)) return regionForCountry(stored);
  const phone = (row?.["phone"] as string | null) ?? "";
  const guess = phone ? countryByDial(callingCodeFromE164(phone)) : undefined;
  return regionForCountry(guess?.code);
}

/** The ways to pay for each plan, as this customer should see them. */
export async function checkoutFor(tenantId: string | null): Promise<{ region: PriceRegion; options: CheckoutLink[] }> {
  const builtIn = CHECKOUT_OPTIONS.map(
    (o): CheckoutLink => ({ ...o, method: "card", label: "Card or bank (Flutterwave)", region: "default" }),
  );
  const extras = extraMethodOptions(await getPaymentSettings());

  // The owner's extra links and regional prices live in the database. The public
  // pricing must never depend on it: if it can't be read, the standard prices show.
  let region: PriceRegion = "default";
  let rows: Record<string, unknown>[] = [];
  try {
    await ensureSchema();
    region = tenantId ? await regionForTenant(tenantId) : "default";
    rows = await sql`
      select region, plan_id, seats, interval, method, label, amount_usd, url from payment_links
      where active = true and method not in ('crypto', 'giftcard') and (region = 'default' or region = ${region})
      order by created_at asc
    `;
  } catch (err) {
    console.warn("[payments] using the standard payment links only", err);
    return { region: "default", options: [...builtIn, ...extras] };
  }

  const all: CheckoutLink[] = [
    ...builtIn,
    ...rows
      .filter((r) => isPlanId(r["plan_id"] as string))
      .map(
        (r): CheckoutLink => ({
          planId: r["plan_id"] as PlanId,
          seats: Number(r["seats"]),
          interval: r["interval"] as BillingInterval,
          amountUsd: Number(r["amount_usd"]),
          url: String(r["url"]),
          method: r["method"] as PayMethod,
          label: String(r["label"]) || PAY_METHODS.find((m) => m.id === r["method"])?.label || "Pay",
          region: r["region"] as PriceRegion,
        }),
      ),
  ];

  // One link per plan, seat count, interval and method: the regional one wins.
  const best = new Map<string, CheckoutLink>();
  for (const o of all) {
    const key = `${o.planId}|${o.seats}|${o.interval}|${o.method}`;
    const held = best.get(key);
    if (!held || (o.region !== "default" && held.region === "default")) best.set(key, o);
  }
  return { region, options: [...best.values(), ...extras] };
}

/**
 * Crypto and gift-card prices are rules, not links the owner pastes: crypto is the
 * standard plan price plus a VAT line, and a gift card has one fixed amount per plan.
 * Each is offered only once the owner has said where the money goes.
 */
export function extraMethodOptions(settings: PaymentSettings): CheckoutLink[] {
  const out: CheckoutLink[] = [];

  if (settings.wallets.length > 0) {
    const tiers = new Map<string, { planId: PlanId; seats: number; interval: BillingInterval; amountUsd: number }>();
    for (const o of CHECKOUT_OPTIONS) tiers.set(`${o.planId}|${o.seats}|${o.interval}`, o);
    // Managed Enterprise is quoted rather than sold by card, but it is a plan like the others for crypto.
    const managed = getPlan("managed");
    if (managed.priceFlatMonthly !== undefined) {
      const seats = managed.limits.agents ?? 1;
      tiers.set(`managed|${seats}|monthly`, { planId: "managed", seats, interval: "monthly", amountUsd: managed.priceFlatMonthly });
    }
    for (const t of tiers.values()) {
      out.push({
        planId: t.planId,
        seats: t.seats,
        interval: t.interval,
        amountUsd: t.amountUsd + CRYPTO_VAT_USD,
        baseUsd: t.amountUsd,
        vatUsd: CRYPTO_VAT_USD,
        url: "",
        method: "crypto",
        label: "Crypto",
        region: "default",
        wallets: settings.wallets,
      });
    }
  }

  if (settings.giftcard.url || settings.giftcard.note) {
    for (const [planId, amountUsd] of Object.entries(GIFTCARD_PRICES) as [PlanId, number][]) {
      const plan = getPlan(planId);
      out.push({
        planId,
        // The seat count the plan's normal price covers: one agent, or the whole team on a flat plan.
        seats: plan.priceFlatMonthly !== undefined ? (plan.limits.agents ?? 1) : 1,
        interval: "monthly",
        amountUsd,
        url: settings.giftcard.url,
        method: "giftcard",
        label: GIFTCARD_LABEL,
        region: "default",
        note: settings.giftcard.note,
      });
    }
  }
  return out;
}

/** Every price a customer could have paid, in every region, for matching a payment to a plan. */
export async function knownPaidOptions(): Promise<{ planId: PlanId; seats: number; interval: BillingInterval; amountUsd: number }[]> {
  await ensureSchema();
  // Only links paid through Flutterwave can arrive as a webhook; a crypto or gift-card amount must never match one.
  const rows = await sql`select plan_id, seats, interval, amount_usd::float as amount_usd from payment_links where active = true and method not in ('crypto', 'giftcard')`;
  return [
    ...CHECKOUT_OPTIONS.map((o) => ({ planId: o.planId, seats: o.seats, interval: o.interval, amountUsd: o.amountUsd })),
    ...rows
      .filter((r) => isPlanId(String(r["plan_id"])))
      .map((r) => ({
        planId: r["plan_id"] as PlanId,
        seats: Number(r["seats"]),
        interval: r["interval"] as BillingInterval,
        amountUsd: Number(r["amount_usd"]),
      })),
  ];
}

// ---------------------------------------------------------------------------
// The owner's side: manage the links
// ---------------------------------------------------------------------------

async function requireSuperAdmin(token: string) {
  const payload = await verifyToken(token);
  if (!payload || !payload.isSuperAdmin) throw new Error("Not authorized.");
  return payload;
}

export async function listPaymentLinks(data: { token: string }) {
  await requireSuperAdmin(data.token);
  await ensureSchema();
  const rows = await sql`
    select id, region, plan_id, seats, interval, method, label, amount_usd::float as amount_usd, url, active
    from payment_links order by plan_id, region, interval, seats, created_at
  `;
  return {
    ok: true as const,
    links: rows as unknown as PaymentLinkRow[],
    regions: PRICE_REGIONS,
    // Crypto and gift cards have their own sections, so they are not offered as a link type.
    methods: PAY_METHODS.filter((m) => m.id !== "crypto" && m.id !== "giftcard"),
    settings: await getPaymentSettings(),
    rules: { cryptoVatUsd: CRYPTO_VAT_USD, giftcard: GIFTCARD_PRICES, giftcardLabel: GIFTCARD_LABEL },
  };
}

export const listPaymentLinksFn = createServerFn({ method: "POST" })
  .validator((data: { token: string }) => data)
  .handler(async ({ data }) => listPaymentLinks(data));

export interface SavePaymentLinkInput {
  token: string;
  id?: string;
  region: string;
  planId: string;
  seats: number;
  interval: string;
  method: string;
  label?: string;
  amountUsd: number;
  url: string;
  active?: boolean;
}

export async function savePaymentLink(data: SavePaymentLinkInput) {
  await requireSuperAdmin(data.token);
  await ensureSchema();

  if (!isPlanId(data.planId) || data.planId === "trial") throw new Error("Choose a plan.");
  if (!PRICE_REGIONS.some((r) => r.id === data.region)) throw new Error("Choose a region.");
  if (!PAY_METHODS.some((m) => m.id === data.method)) throw new Error("Choose how it is paid.");
  if (data.method === "crypto" || data.method === "giftcard") {
    throw new Error("Crypto and gift cards are set up in their own sections above, not as links.");
  }
  if (data.interval !== "monthly" && data.interval !== "annual") throw new Error("Choose monthly or annual.");
  const seats = Math.round(Number(data.seats));
  if (!Number.isFinite(seats) || seats < 1 || seats > 500) throw new Error("Seats must be between 1 and 500.");
  const amount = Number(data.amountUsd);
  if (!Number.isFinite(amount) || amount <= 0 || amount > 100000) throw new Error("Enter the amount in US dollars.");

  // A customer is sent to this address with their money: it must be a real https page.
  let link: URL;
  try {
    link = new URL(data.url.trim());
  } catch {
    throw new Error("Paste the full payment link, starting with https://");
  }
  if (link.protocol !== "https:") throw new Error("Payment links must start with https://");

  const label = (data.label ?? "").trim().slice(0, 60);
  const active = data.active ?? true;

  if (data.id) {
    const updated = await sql`
      update payment_links set region = ${data.region}, plan_id = ${data.planId}, seats = ${seats},
        interval = ${data.interval}, method = ${data.method}, label = ${label}, amount_usd = ${amount},
        url = ${link.toString()}, active = ${active}
      where id = ${data.id} returning id
    `;
    if (updated.length === 0) throw new Error("That link no longer exists.");
    return { ok: true as const, id: data.id };
  }
  const inserted = await sql`
    insert into payment_links (region, plan_id, seats, interval, method, label, amount_usd, url, active)
    values (${data.region}, ${data.planId}, ${seats}, ${data.interval}, ${data.method}, ${label}, ${amount}, ${link.toString()}, ${active})
    returning id
  `;
  return { ok: true as const, id: (inserted[0] as { id: string }).id };
}

export const savePaymentLinkFn = createServerFn({ method: "POST" })
  .validator((data: SavePaymentLinkInput) => data)
  .handler(async ({ data }) => savePaymentLink(data));

export interface SavePaymentSettingsInput {
  token: string;
  wallets: { coin: string; network: string; address: string }[];
  giftcardUrl: string;
  giftcardNote: string;
}

/** Platform owner only: where crypto should be sent, and what a gift-card payer is told. */
export async function savePaymentSettings(data: SavePaymentSettingsInput) {
  await requireSuperAdmin(data.token);
  await ensureSchema();

  const wallets: CryptoWallet[] = [];
  for (const w of Array.isArray(data.wallets) ? data.wallets : []) {
    const coin = cleanText(w.coin, 40);
    const network = cleanText(w.network, 60);
    const address = cleanText(w.address, 200);
    if (!coin && !network && !address) continue;
    if (!coin) throw new Error("Each wallet needs the coin's name, such as USDT.");
    if (!network) throw new Error(`Say which network ${coin} is on (for example TRC20), so customers don't send it the wrong way.`);
    if (address.length < 10 || /\s/.test(String(w.address).trim())) {
      throw new Error(`The ${coin} address doesn't look right. Paste it exactly, with no spaces.`);
    }
    // Ethereum-style networks (ERC20, BEP20, Polygon…) all use a 0x address of 40 hex characters.
    if (/erc|eth|bep|bsc|polygon|matic|arbitrum|optimism|base/i.test(network) && !/^0x[0-9a-fA-F]{40}$/.test(address)) {
      throw new Error(`That doesn't look like a ${network} address: it should start with 0x and be 42 characters long. Copy it again from your wallet.`);
    }
    wallets.push({ coin, network, address });
  }
  if (wallets.length > 10) throw new Error("Keep it to ten wallets or fewer.");

  let giftUrl = cleanText(data.giftcardUrl, 500);
  if (giftUrl) {
    try {
      const u = new URL(giftUrl);
      if (u.protocol !== "https:") throw new Error("not https");
      giftUrl = u.toString();
    } catch {
      throw new Error("The gift card link must be a full address starting with https://");
    }
  }
  const giftcard: GiftCardSettings = { url: giftUrl, note: cleanText(data.giftcardNote, 600) };

  await sql`
    insert into payment_settings (key, value) values ('crypto_wallets', ${JSON.stringify(wallets)}::jsonb)
    on conflict (key) do update set value = excluded.value, updated_at = now()
  `;
  await sql`
    insert into payment_settings (key, value) values ('giftcard', ${JSON.stringify(giftcard)}::jsonb)
    on conflict (key) do update set value = excluded.value, updated_at = now()
  `;
  return { ok: true as const, settings: { wallets, giftcard } };
}

export const savePaymentSettingsFn = createServerFn({ method: "POST" })
  .validator((data: SavePaymentSettingsInput) => data)
  .handler(async ({ data }) => savePaymentSettings(data));

export async function deletePaymentLink(data: { token: string; id: string }) {
  await requireSuperAdmin(data.token);
  await ensureSchema();
  await sql`delete from payment_links where id = ${data.id}`;
  return { ok: true as const };
}

export const deletePaymentLinkFn = createServerFn({ method: "POST" })
  .validator((data: { token: string; id: string }) => data)
  .handler(async ({ data }) => deletePaymentLink(data));

// ---------------------------------------------------------------------------
// The customer's side: "I've paid"
// ---------------------------------------------------------------------------

/** A gift card the customer photographed, with what it is worth. */
export interface CardUpload extends ReceiptUpload {
  amountUsd: number;
}

const MAX_CARDS = 6;

/**
 * Tells the owner a payment was sent, with what is needed to check it. The claim is
 * kept as its own record the owner's phone app works from, a high-priority support
 * thread is opened beside it, the owner is emailed and alerted, and the customer is
 * told by email that a person will verify it before the plan is switched on.
 *
 * A gift card can come as several cards (a customer who cannot buy one big card sends
 * three of $100): each has its own picture and amount.
 */
export async function claimPayment(data: {
  token: string;
  planId: string;
  seats: number;
  interval: string;
  method: string;
  reference: string;
  amountUsd?: number;
  /** A screenshot or PDF of the receipt, for the owner to check the payment against. */
  receipt?: ReceiptUpload | undefined;
  /** Gift cards: one entry per card. */
  cards?: CardUpload[] | undefined;
}) {
  const payload = await verifyToken(data.token);
  if (!payload || !payload.tenantId) throw new Error("Not signed in.");
  if (!isPlanId(data.planId) || data.planId === "trial") throw new Error("Choose a plan.");
  if (!PAY_METHODS.some((m) => m.id === data.method)) throw new Error("Choose how you paid.");
  const interval = data.interval === "annual" ? "annual" : "monthly";
  const seats = Math.max(1, Math.min(500, Math.round(Number(data.seats) || 1)));
  const reference = String(data.reference ?? "").trim().slice(0, 300);

  const cards = Array.isArray(data.cards) ? data.cards : [];
  if (data.method === "giftcard") {
    if (cards.length === 0) throw new Error("Add a picture of each gift card, with the amount on it.");
    if (cards.length > MAX_CARDS) throw new Error(`Send at most ${MAX_CARDS} cards at a time.`);
    for (const c of cards) {
      const v = Number(c.amountUsd);
      if (!Number.isFinite(v) || v <= 0 || v > 5000) throw new Error("Enter the amount for every card, in US dollars.");
    }
  } else if (reference.length < 4 && !data.receipt) {
    throw new Error("Add a reference we can find (a transaction ID, receipt number, or the name you paid with), or attach your receipt.");
  }

  const plan = getPlan(data.planId);
  const method = PAY_METHODS.find((m) => m.id === data.method)?.label ?? data.method;

  // The price the customer was shown, from our own list rather than from the browser.
  const shown = (await checkoutFor(payload.tenantId)).options.find(
    (o) => o.planId === data.planId && o.method === data.method && o.interval === interval && o.seats === seats,
  );
  const expected = shown?.amountUsd ?? (Number(data.amountUsd) > 0 ? Number(data.amountUsd) : null);
  const declared = cards.length > 0 ? Math.round(cards.reduce((n, c) => n + Number(c.amountUsd), 0) * 100) / 100 : null;

  const tenant = await sql`select name from tenants where id = ${payload.tenantId}`;
  const tenantName = String((tenant[0] as { name: string } | undefined)?.name ?? "Workspace");

  const claim = await sql`
    insert into payment_claims (tenant_id, user_email, plan_id, seats, interval, method, expected_usd, declared_usd, reference)
    values (${payload.tenantId}, ${payload.email}, ${data.planId}, ${seats}, ${interval}, ${data.method}, ${expected}, ${declared}, ${reference || null})
    returning id
  `;
  const claimId = String((claim[0] as { id: string }).id);

  // Kept before the ticket is written, so the ticket can carry the addresses that open them.
  const paths: string[] = [];
  try {
    if (data.receipt) paths.push(await saveReceipt(payload.tenantId, data.receipt, { claimId }));
    for (const c of cards) paths.push(await saveReceipt(payload.tenantId, c, { claimId, amountUsd: Number(c.amountUsd) }));
  } catch (err) {
    await sql`delete from payment_claims where id = ${claimId}`;
    throw err;
  }

  const result = await createMyTicket({
    token: data.token,
    subject: `Payment sent: ${plan.name} (${method})`,
    priority: "High",
    body:
      `We've paid for the ${plan.name} plan (${seats} seat${seats === 1 ? "" : "s"}, ${interval}) by ${method}.\n` +
      (expected ? `Price shown at checkout: $${expected}\n` : "") +
      (declared !== null ? `Gift cards sent: ${cards.length}, totalling $${declared}\n` : "") +
      (reference ? `Reference: ${reference}\n` : "") +
      paths.map((p, i) => `Receipt ${i + 1}${cards[i - (data.receipt ? 1 : 0)] ? ` ($${cards[i - (data.receipt ? 1 : 0)]!.amountUsd})` : ""}: ${p}\n`).join("") +
      `\nPlease verify the payment and activate the plan.`,
  });
  const ticketRef = result.ticket.ticket_ref;
  await sql`update payment_claims set ticket_ref = ${ticketRef} where id = ${claimId}`;

  const summary = { claimId, tenantName, planName: plan.name, methodLabel: method, expectedUsd: expected, declaredUsd: declared, cardCount: cards.length, ticketRef };
  await announceClaim(summary);
  await tellCustomerReceived(payload.email, summary);

  return { ok: true as const, ticketRef, claimId, expectedUsd: expected, declaredUsd: declared };
}

export const claimPaymentFn = createServerFn({ method: "POST" })
  .validator((data: Parameters<typeof claimPayment>[0]) => data)
  .handler(async ({ data }) => claimPayment(data));
