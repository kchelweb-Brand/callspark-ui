// Payment receipts by email.
//
// A card payment is matched and switched on by the webhook; a crypto, gift-card or
// bank payment is marked as paid by the platform owner. Either way the customer gets
// a receipt once the payment is confirmed, with a number they can quote in support.
// Server-only.

import { sql } from "./db";
import { getPlan } from "./plans";
import { sendPaymentReceiptEmail } from "./email";
import { ensureSchema } from "./schema.server";

export type ReceiptMethod = "card" | "crypto" | "giftcard" | "bank" | "other";

export const RECEIPT_METHODS: { id: ReceiptMethod; label: string }[] = [
  { id: "card", label: "Card or bank (Flutterwave)" },
  { id: "crypto", label: "Crypto" },
  { id: "giftcard", label: "Apple gift card (USA)" },
  { id: "bank", label: "Bank transfer" },
  { id: "other", label: "Other" },
];

/** The number printed on a receipt: short enough to read out, unique per payment. */
export function receiptNumber(paymentId: string): string {
  return `KR-${paymentId.replace(/-/g, "").slice(0, 8).toUpperCase()}`;
}

export interface ManualPaymentInput {
  tenantId: string;
  planId: string;
  method: string;
  amountUsd: number;
  reference?: string | undefined;
  interval?: "monthly" | "annual" | undefined;
}

/** Keeps a record of a payment the owner confirmed by hand. Returns the payment's id. */
export async function recordManualPayment(input: ManualPaymentInput): Promise<string> {
  await ensureSchema();
  const method = RECEIPT_METHODS.find((m) => m.id === input.method);
  if (!method) throw new Error("Choose how the customer paid.");
  const amount = Number(input.amountUsd);
  if (!Number.isFinite(amount) || amount <= 0 || amount > 100000) throw new Error("Enter the amount paid, in US dollars.");
  const reference = (input.reference ?? "").trim().slice(0, 300);

  const owner = await sql`
    select email from users where tenant_id = ${input.tenantId}
    order by (role = 'tenant_owner') desc, created_at asc limit 1
  `;
  const rows = await sql`
    insert into payments (provider, provider_tx_id, tx_ref, tenant_id, email, amount, currency, plan_id, interval, status, note)
    values ('manual', ${`manual-${crypto.randomUUID()}`}, ${reference || null}, ${input.tenantId},
            ${(owner[0] as { email: string } | undefined)?.email ?? null}, ${amount}, 'USD', ${input.planId},
            ${input.interval ?? "monthly"}, 'activated', ${`${method.label}${reference ? ` · ${reference}` : ""}`})
    returning id
  `;
  return String((rows[0] as { id: string }).id);
}

/**
 * Emails the receipt for one recorded payment. Never throws: the money has already
 * been taken, so a mail failure must not undo or block the activation.
 */
export async function sendReceiptFor(paymentId: string, options: { to?: string | undefined; signInUrl?: string | undefined } = {}): Promise<boolean> {
  try {
    const rows = await sql`
      select p.provider, p.tx_ref, p.email, p.amount::float as amount, p.plan_id, p.note, p.created_at,
             t.name, t.workspace_slug, t.paid_until
      from payments p join tenants t on t.id = p.tenant_id where p.id = ${paymentId}
    `;
    const p = rows[0] as
      | { provider: string; tx_ref: string | null; email: string | null; amount: number; plan_id: string | null; note: string | null; created_at: string; name: string; workspace_slug: string; paid_until: string | null }
      | undefined;
    const to = options.to || p?.email;
    if (!p || !to) return false;

    // For a manual payment the note starts with how it was paid; a card payment is by definition a card.
    const methodLabel = p.provider === "flutterwave" ? "Card or bank (Flutterwave)" : String(p.note ?? "").split(" · ")[0] || "Payment";
    await sendPaymentReceiptEmail(to, {
      receiptNo: receiptNumber(paymentId),
      paidOn: new Date(p.created_at).toLocaleDateString("en-US", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }),
      workspaceName: p.name,
      workspaceSlug: p.workspace_slug,
      planName: getPlan(p.plan_id).name,
      methodLabel,
      amountUsd: p.amount,
      reference: p.tx_ref,
      paidUntil: p.paid_until
        ? new Date(p.paid_until).toLocaleDateString("en-US", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" })
        : null,
      signInUrl: options.signInUrl || "/login",
    });
    return true;
  } catch (err) {
    console.error("[receipt] could not email the receipt", err);
    return false;
  }
}
