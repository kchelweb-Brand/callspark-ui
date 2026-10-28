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

export type PayMethod = "card" | "bank" | "crypto" | "giftcard" | "other";

export const PAY_METHODS: { id: PayMethod; label: string }[] = [
  { id: "card", label: "Card" },
  { id: "bank", label: "Bank transfer" },
  { id: "crypto", label: "Crypto" },
  { id: "giftcard", label: "Gift card" },
  { id: "other", label: "Other" },
];

export interface CheckoutLink {
  planId: PlanId;
  seats: number;
  interval: BillingInterval;
  amountUsd: number;
  url: string;
  method: PayMethod;
  label: string;
  region: PriceRegion;
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

  // The owner's extra links and regional prices live in the database. The public
  // pricing must never depend on it: if it can't be read, the standard prices show.
  let region: PriceRegion = "default";
  let rows: Record<string, unknown>[] = [];
  try {
    await ensureSchema();
    region = tenantId ? await regionForTenant(tenantId) : "default";
    rows = await sql`
      select region, plan_id, seats, interval, method, label, amount_usd, url from payment_links
      where active = true and (region = 'default' or region = ${region})
      order by created_at asc
    `;
  } catch (err) {
    console.warn("[payments] using the standard payment links only", err);
    return { region: "default", options: builtIn };
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
  return { region, options: [...best.values()] };
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
    methods: PAY_METHODS,
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

/**
 * Tells the owner a payment was sent, with the reference needed to find it. It
 * lands in the support inbox as a high-priority thread, next to the customer's
 * plan and details. Crypto and gift cards cannot be checked automatically, so
 * this is how the owner knows which payment to look for.
 */
export async function claimPayment(data: {
  token: string;
  planId: string;
  seats: number;
  interval: string;
  method: string;
  reference: string;
}) {
  const payload = await verifyToken(data.token);
  if (!payload || !payload.tenantId) throw new Error("Not signed in.");
  if (!isPlanId(data.planId) || data.planId === "trial") throw new Error("Choose a plan.");
  if (!PAY_METHODS.some((m) => m.id === data.method)) throw new Error("Choose how you paid.");
  const reference = data.reference.trim().slice(0, 300);
  if (reference.length < 4) {
    throw new Error("Add a reference we can find: a transaction ID, receipt number, or the name you paid with.");
  }
  const plan = getPlan(data.planId);
  const method = PAY_METHODS.find((m) => m.id === data.method)?.label ?? data.method;
  const result = await createMyTicket({
    token: data.token,
    subject: `Payment sent: ${plan.name} (${method})`,
    priority: "High",
    body:
      `We've paid for the ${plan.name} plan (${data.seats} seat${data.seats === 1 ? "" : "s"}, ${data.interval}) by ${method}.\n` +
      `Reference: ${reference}\n\nPlease confirm the payment and activate the plan.`,
  });
  return { ok: true as const, ticketRef: result.ticket.ticket_ref };
}

export const claimPaymentFn = createServerFn({ method: "POST" })
  .validator((data: Parameters<typeof claimPayment>[0]) => data)
  .handler(async ({ data }) => claimPayment(data));
