// Telling people about a payment claim: the platform owner (email and phone alert) and the
// customer (we have it, and a person will check it). Leaf module so both the customer's
// "I've paid" and the owner's approval can use it. Server-only; nothing here throws.

import { sql } from "./db";
import { pushToOwners } from "./push.server";
import { sendPaymentReceivedEmail, sendTeamAlertEmail } from "./email";

const money = (n: number | null | undefined) => (n === null || n === undefined || !Number.isFinite(n) ? "—" : `$${Number(n).toLocaleString("en-US", { maximumFractionDigits: 2 })}`);

export interface ClaimSummary {
  claimId: string;
  tenantName: string;
  planName: string;
  methodLabel: string;
  expectedUsd: number | null;
  declaredUsd: number | null;
  cardCount: number;
  ticketRef: string | null;
}

/** Emails every platform owner and alerts their phones that a customer says they have paid. */
export async function announceClaim(c: ClaimSummary): Promise<void> {
  const short = c.declaredUsd !== null && c.expectedUsd !== null && c.declaredUsd + 0.005 < c.expectedUsd;
  const title = `Payment to verify: ${c.tenantName} · ${c.planName}`;
  const lines = [
    `Workspace: ${c.tenantName}`,
    `Plan: ${c.planName}`,
    `Paid by: ${c.methodLabel}`,
    `Price shown: ${money(c.expectedUsd)}`,
    ...(c.cardCount > 0 ? [`Gift cards sent: ${c.cardCount}, totalling ${money(c.declaredUsd)}${short ? " (LESS than the price)" : ""}`] : []),
    ...(c.ticketRef ? [`Support ticket: ${c.ticketRef}`] : []),
    "",
    "Open the admin app to check it and grant access.",
  ];
  try {
    const owners = await sql`select email from users where is_super_admin = true`;
    for (const o of owners) {
      await sendTeamAlertEmail(String(o["email"]), title, {
        heading: title,
        message: lines.join("\n"),
        ctaLabel: "Open the admin app",
        ctaPath: "/admin/app",
      });
    }
  } catch (err) {
    console.error("[claims] could not email the owners", err);
  }
  await pushToOwners({
    title: `Payment to verify · ${money(c.declaredUsd ?? c.expectedUsd)}`,
    body: `${c.tenantName} says they paid for ${c.planName} by ${c.methodLabel}.`,
    url: `/admin/app?claim=${c.claimId}`,
    tag: `claim-${c.claimId}`,
  });
}

/** Tells the customer their payment details arrived and are being checked. */
export async function tellCustomerReceived(to: string, c: ClaimSummary): Promise<void> {
  try {
    await sendPaymentReceivedEmail(to, {
      workspaceName: c.tenantName,
      planName: c.planName,
      methodLabel: c.methodLabel,
      amountText: c.declaredUsd !== null ? money(c.declaredUsd) : money(c.expectedUsd),
      cardCount: c.cardCount,
    });
  } catch (err) {
    console.error("[claims] could not email the customer", err);
  }
}
