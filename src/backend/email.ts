import { env } from "./env";
import { CODE_TTL_MINUTES } from "./codes";

/**
 * Where the app is reachable, for absolute URLs in email.
 *
 * Email clients have no page to resolve a relative path against, so an image
 * or link must be fully qualified or it simply doesn't render.
 */
const PUBLIC_ORIGIN = "https://kchel-dialer.kchelweb.workers.dev";

/**
 * The logo lockup at the top of every email.
 *
 * A PNG rather than the SVG: Gmail and Outlook strip inline SVG entirely, so
 * the raster icon we already ship for favicons is what actually renders. The
 * wordmark stays live text beside it, so the brand still reads when a client
 * blocks images by default — which most do on first contact from a new sender.
 */
function brandHeader(): string {
  return `
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 20px">
      <tr>
        <td style="padding-right:10px;vertical-align:middle">
          <img src="${PUBLIC_ORIGIN}/icon-192.png" width="32" height="32" alt="Kchel Dialer"
               style="display:block;width:32px;height:32px;border-radius:8px;border:0" />
        </td>
        <td style="vertical-align:middle">
          <span style="font-size:15px;font-weight:800;letter-spacing:-.02em;color:#16181d">Kchel Dialer</span>
        </td>
      </tr>
    </table>
  `;
}

const PURPOSE_COPY: Record<string, { subject: string; heading: string }> = {
  login: { subject: "Your Kchel Dialer login code", heading: "Sign in to Kchel Dialer" },
  admin_login: { subject: "Your Kchel admin login code", heading: "Sign in to the Kchel admin console" },
  signup: { subject: "Verify your Kchel Dialer email", heading: "Verify your email" },
};

function renderHtml(code: string, purpose: string): string {
  const copy = PURPOSE_COPY[purpose] ?? PURPOSE_COPY["login"]!;
  return `
    <div style="font-family:-apple-system,Segoe UI,sans-serif;max-width:420px;margin:0 auto;padding:32px 24px">
      ${brandHeader()}
      <h1 style="font-size:20px;margin:12px 0 4px">${copy.heading}</h1>
      <p style="font-size:14px;color:#475569;margin:0 0 24px">Enter this code to continue. It expires in ${CODE_TTL_MINUTES} minutes.</p>
      <p style="font-family:monospace;font-size:32px;font-weight:700;letter-spacing:.3em;background:#f1f5f9;padding:16px 20px;border-radius:10px;text-align:center;margin:0 0 24px">${code}</p>
      <p style="font-size:12px;color:#94a3b8">If you didn't request this, you can ignore this email.</p>
    </div>
  `;
}

export interface SendResult {
  delivered: boolean;
  /** No API key configured — the code was logged instead, on purpose. */
  devMode?: boolean;
  /** Present when delivery failed; phrased for the person who is waiting. */
  error?: string;
}

/**
 * Turns a Resend rejection into something the person staring at the screen can
 * act on. The provider's own text is appended for the operator's benefit but
 * the lead sentence is what matters to a user.
 */
function explainSendFailure(status: number, body: string): string {
  const text = body.toLowerCase();

  if (status === 403 && text.includes("domain is not verified")) {
    return "Email delivery isn't set up yet: the sending domain hasn't been verified, so the provider refused the message. Nothing you did wrong — this needs fixing on our side.";
  }
  if (status === 403 && text.includes("testing emails")) {
    return "Email delivery is still in test mode and can only reach the account owner's address. This needs fixing on our side before other addresses can receive codes.";
  }
  if (status === 422) {
    return "The email provider rejected the message as invalid. Double-check the address, and if it looks right this needs fixing on our side.";
  }
  if (status === 429) {
    return "Too many emails have been sent in a short window. Wait a minute and try again.";
  }
  if (status >= 500) {
    return "The email provider is having trouble right now. Try again in a moment.";
  }
  return `The email couldn't be sent (provider returned ${status}). Try again, and if it keeps happening this needs fixing on our side.`;
}

/**
 * Sends the one-time code by email via Resend. If RESEND_API_KEY isn't set
 * yet, logs the code instead so the flow is fully testable before email is
 * wired up (visible in `wrangler tail` in production, or the terminal in dev).
 *
 * Returns whether it actually went out. Callers decide what to do with that —
 * a signup can say so plainly, while the login flow stays deliberately vague
 * to avoid revealing which addresses have accounts.
 */
export async function sendCodeEmail(
  to: string,
  code: string,
  purpose: string,
): Promise<SendResult> {
  if (!env.resendApiKey) {
    console.log(`[email:dev-mode] ${purpose} code for ${to}: ${code} (expires in ${CODE_TTL_MINUTES}m)`);
    return { delivered: true, devMode: true };
  }

  const copy = PURPOSE_COPY[purpose] ?? PURPOSE_COPY["login"]!;
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.resendApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: env.resendFromEmail,
      to,
      subject: copy.subject,
      html: renderHtml(code, purpose),
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    console.error(
      `[email] Resend rejected ${purpose} code for ${to} (${res.status}): ${body} ` +
        `| from=${JSON.stringify(env.resendFromEmail)}`,
    );
    // Still logged, so an operator can read the code out of the tail and
    // unblock someone by hand while delivery is broken.
    console.log(`[email:fallback] ${purpose} code for ${to}: ${code}`);
    return { delivered: false, error: explainSendFailure(res.status, body) };
  }

  return { delivered: true };
}

// ---------- generic sender ----------

/**
 * Sends one transactional email. Never throws: a failed notification must not
 * fail the operation that triggered it — a support ticket still exists whether
 * or not the email about it went out.
 */
async function send(to: string | string[], subject: string, html: string, label: string) {
  const recipients = Array.isArray(to) ? to.filter(Boolean) : [to];
  if (recipients.length === 0) return;

  if (!env.resendApiKey) {
    console.log(`[email:dev-mode] ${label} -> ${recipients.join(", ")}: ${subject}`);
    return;
  }

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.resendApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ from: env.resendFromEmail, to: recipients, subject, html }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      console.error(`Resend ${label} failed (${res.status}): ${body}`);
    }
  } catch (err) {
    console.error(`Resend ${label} threw:`, err);
  }
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function shell(heading: string, bodyHtml: string): string {
  return `
    <div style="font-family:-apple-system,Segoe UI,sans-serif;max-width:520px;margin:0 auto;padding:32px 24px">
      ${brandHeader()}
      <h1 style="font-size:20px;margin:12px 0 16px">${escapeHtml(heading)}</h1>
      ${bodyHtml}
    </div>
  `;
}

function detailRow(label: string, value: string): string {
  return `<tr>
    <td style="padding:6px 0;font-size:13px;color:#64748b;width:110px">${escapeHtml(label)}</td>
    <td style="padding:6px 0;font-size:13px;font-weight:600;color:#0f172a">${escapeHtml(value)}</td>
  </tr>`;
}

// ---------- support notifications ----------

export interface TicketEmailData {
  ref: string;
  subject: string;
  body?: string | null;
  priority: string;
  status?: string;
  tenantName?: string | null;
  raisedBy?: string | null;
}

/** Tells the platform owner a customer has raised a ticket. */
export async function sendTicketRaisedEmail(to: string[], ticket: TicketEmailData) {
  const details = [
    detailRow("Ticket", ticket.ref),
    detailRow("Workspace", ticket.tenantName ?? "—"),
    detailRow("Priority", ticket.priority),
    detailRow("Raised by", ticket.raisedBy ?? "—"),
  ].join("");

  const body = `
    <p style="font-size:15px;font-weight:600;color:#0f172a;margin:0 0 8px">${escapeHtml(ticket.subject)}</p>
    ${ticket.body ? `<p style="font-size:14px;color:#475569;white-space:pre-wrap;margin:0 0 20px">${escapeHtml(ticket.body)}</p>` : ""}
    <table style="width:100%;border-collapse:collapse;border-top:1px solid #e2e8f0;margin-top:8px">${details}</table>
    <p style="font-size:12px;color:#94a3b8;margin-top:24px">Open the admin Support page to respond.</p>
  `;

  await send(
    to,
    `[${ticket.priority}] ${ticket.ref} — ${ticket.subject}`,
    shell("New support request", body),
    "ticket-raised",
  );
}

/** Tells the customer their ticket moved, so they don't have to keep checking. */
export async function sendTicketStatusEmail(to: string, ticket: TicketEmailData) {
  const body = `
    <p style="font-size:14px;color:#475569;margin:0 0 16px">
      Your request is now <strong style="color:#0f172a">${escapeHtml(ticket.status ?? "updated")}</strong>.
    </p>
    <p style="font-size:15px;font-weight:600;color:#0f172a;margin:0 0 8px">${escapeHtml(ticket.subject)}</p>
    <table style="width:100%;border-collapse:collapse;border-top:1px solid #e2e8f0;margin-top:8px">
      ${detailRow("Ticket", ticket.ref)}
      ${detailRow("Status", ticket.status ?? "—")}
    </table>
    <p style="font-size:12px;color:#94a3b8;margin-top:24px">You can track this on the Support page in your workspace.</p>
  `;

  await send(to, `${ticket.ref} is now ${ticket.status ?? "updated"}`, shell("Support update", body), "ticket-status");
}

export interface TicketMessageEmailData {
  ref: string;
  subject: string;
  message: string;
  /** Who wrote it — a workspace name for customer replies, "Kchel support" otherwise. */
  from: string;
}

/** Support answered: tells the customer there is a reply waiting on their Support page. */
export async function sendSupportReplyEmail(to: string, data: TicketMessageEmailData) {
  const body = `
    <p style="font-size:14px;color:#475569;margin:0 0 12px">${escapeHtml(data.from)} replied to your request.</p>
    <p style="font-size:15px;font-weight:600;color:#0f172a;margin:0 0 8px">${escapeHtml(data.subject)}</p>
    <p style="font-size:14px;color:#0f172a;white-space:pre-wrap;background:#f1f5f9;padding:14px 16px;border-radius:10px;margin:0 0 20px">${escapeHtml(data.message)}</p>
    <p style="font-size:12px;color:#94a3b8">Reply from the Support page in your workspace or the Kchel Dialer app. Ticket ${escapeHtml(data.ref)}.</p>
  `;
  await send(to, `Re: ${data.subject} (${data.ref})`, shell("New reply from support", body), "ticket-reply");
}

/** A customer wrote back: tells the platform owners there is something to answer. */
export async function sendCustomerReplyEmail(to: string[], data: TicketMessageEmailData) {
  const body = `
    <p style="font-size:14px;color:#475569;margin:0 0 12px">${escapeHtml(data.from)} wrote on <strong>${escapeHtml(data.ref)}</strong>.</p>
    <p style="font-size:15px;font-weight:600;color:#0f172a;margin:0 0 8px">${escapeHtml(data.subject)}</p>
    <p style="font-size:14px;color:#0f172a;white-space:pre-wrap;background:#f1f5f9;padding:14px 16px;border-radius:10px;margin:0 0 20px">${escapeHtml(data.message)}</p>
    <p style="font-size:12px;color:#94a3b8">Open Super admin → Support to reply.</p>
  `;
  await send(to, `[Reply] ${data.ref} — ${data.subject}`, shell("Customer reply", body), "ticket-customer-reply");
}

// ---------- team: invites, task and message alerts, announcements ----------

function ctaButton(label: string, url: string): string {
  return `<p style="margin:22px 0 4px"><a href="${escapeHtml(url)}" style="display:inline-block;background:#10a157;color:#ffffff;font-weight:700;font-size:14px;text-decoration:none;padding:12px 22px;border-radius:999px">${escapeHtml(label)}</a></p>`;
}

export interface AgentInviteData {
  agentName: string;
  workspaceName: string;
  workspaceSlug: string;
  invitedBy: string;
}

/** Tells a new agent they've been added, and exactly how to sign in. */
export async function sendAgentInviteEmail(to: string, data: AgentInviteData) {
  const signIn = `${PUBLIC_ORIGIN}/login?workspace=${encodeURIComponent(data.workspaceSlug)}&email=${encodeURIComponent(to)}`;
  const body = `
    <p style="font-size:14px;color:#475569;margin:0 0 14px">Hi ${escapeHtml(data.agentName)}, ${escapeHtml(data.invitedBy)} added you to <strong style="color:#0f172a">${escapeHtml(data.workspaceName)}</strong> on Kchel Dialer.</p>
    <p style="font-size:14px;color:#475569;margin:0 0 6px">To sign in, use:</p>
    <table style="width:100%;border-collapse:collapse;border-top:1px solid #e2e8f0">
      ${detailRow("Workspace", data.workspaceSlug)}
      ${detailRow("Your email", to)}
    </table>
    ${ctaButton("Open your dashboard", signIn)}
    <p style="font-size:12px;color:#94a3b8;margin-top:20px">There is no password. We email you a one-time code each time you sign in. If you weren't expecting this, you can ignore it.</p>
  `;
  await send(to, `${data.invitedBy} added you to ${data.workspaceName} on Kchel Dialer`, shell("You've been added to a team", body), "agent-invite");
}

export interface TeamAlertData {
  heading: string;
  message: string;
  ctaLabel: string;
  ctaPath: string;
}

/** A task or message the recipient hasn't seen because they aren't in the app. */
export async function sendTeamAlertEmail(to: string, subject: string, data: TeamAlertData) {
  const body = `
    <p style="font-size:14px;color:#0f172a;white-space:pre-wrap;background:#f1f5f9;padding:14px 16px;border-radius:10px;margin:0">${escapeHtml(data.message)}</p>
    ${ctaButton(data.ctaLabel, `${PUBLIC_ORIGIN}${data.ctaPath}`)}
  `;
  await send(to, subject, shell(data.heading, body), "team-alert");
}

// ---------- plan renewal ----------

export type RenewalKind = "ending" | "trial_ending" | "grace" | "hold" | "trial_ended" | "held";

export interface RenewalEmailData {
  workspaceName: string;
  /** "Professional", or "free trial". */
  planName: string;
  kind: RenewalKind;
  /** Days until it ends, for the reminder emails. */
  daysLeft: number;
  /** The day it ended, or will end, already written out. */
  endsOn: string;
  /** The day the account goes on hold, while there is still time to avoid it. */
  holdOn: string | null;
  daysToHold: number;
}

/**
 * Tells an owner their plan is ending, has ended, or has put the account on hold,
 * and what to do: renew it, or move to a bigger plan. Plain about the deadline,
 * and about what stays safe, because an email that frightens people gets ignored
 * and one that is vague gets ignored too.
 */
export async function sendRenewalEmail(to: string, d: RenewalEmailData): Promise<void> {
  const days = (n: number) => `${n} day${n === 1 ? "" : "s"}`;
  const trial = d.planName === "free trial";
  const label = trial ? "free trial" : `${d.planName} plan`;

  let subject: string;
  let heading: string;
  let lead: string;
  switch (d.kind) {
    case "ending":
    case "trial_ending":
      subject = `Your ${label} ends in ${days(d.daysLeft)}`;
      heading = `Your ${label} ends in ${days(d.daysLeft)}`;
      lead = `Your ${label} for ${d.workspaceName} ends on ${d.endsOn}. Renew now so nothing is interrupted.`;
      break;
    case "grace":
      subject = `Your ${d.planName} plan has ended: renew within ${days(d.daysToHold)}`;
      heading = "Your plan has ended";
      lead = `Your ${d.planName} plan for ${d.workspaceName} ended on ${d.endsOn}. Everything still works for now, but if it isn't renewed by ${d.holdOn} the account will be put on hold.`;
      break;
    case "hold":
      subject = `${d.workspaceName} is on hold`;
      heading = "Your account is on hold";
      lead = `Your ${d.planName} plan for ${d.workspaceName} ended on ${d.endsOn} and wasn't renewed, so the account is now on hold. You can't place calls, run campaigns or add contacts until it is renewed.`;
      break;
    case "held":
      subject = `${d.workspaceName} has expired and is on hold`;
      heading = "Your account has expired and is on hold";
      lead = `Your ${label} for ${d.workspaceName} has expired, so the account is on hold. You can still sign in, but you can't place calls, run campaigns or add contacts until it is renewed.`;
      break;
    default:
      subject = "Your free trial has ended";
      heading = "Your free trial has ended";
      lead = `The free trial for ${d.workspaceName} ended on ${d.endsOn}, so the account is on hold. Choose a plan to pick up where you left off.`;
  }

  const html = shell(
    heading,
    `
      <p style="font-size:14px;line-height:1.6;color:#334155">${escapeHtml(lead)}</p>
      <p style="font-size:14px;line-height:1.6;color:#334155">
        Your contacts, recordings and history are safe and will be there when you come back.
        ${d.kind === "grace" ? "We'll email you each day until it's renewed." : ""}
      </p>
      ${ctaButton(trial || d.kind === "trial_ended" ? "Choose a plan" : "Renew my plan", `${PUBLIC_ORIGIN}/billing`)}
      <p style="margin:18px 0 0;font-size:13px;line-height:1.6;color:#64748b">
        Want more agents, contacts or features? You can move to a higher plan at the same time:
        <a href="${PUBLIC_ORIGIN}/pricing" style="color:#0b8f4d">compare plans</a>.
        Pay by card with the email you sign in with and your plan switches on within a minute or two.
      </p>
    `,
  );
  await send(to, subject, html, "renewal");
}

export interface AnnouncementEmailData {
  title: string;
  body: string;
  howTo?: string | null;
  linkUrl?: string | null;
  linkLabel?: string | null;
}

function announcementHtml(data: AnnouncementEmailData): string {
  const steps = (data.howTo ?? "")
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean);
  const body = `
    <p style="font-size:14px;color:#0f172a;white-space:pre-wrap;margin:0 0 16px;line-height:1.55">${escapeHtml(data.body)}</p>
    ${
      steps.length
        ? `<p style="font-size:13px;font-weight:700;color:#0f172a;margin:0 0 6px">How to use it</p>
           <ol style="margin:0;padding-left:20px;font-size:14px;color:#475569;line-height:1.6">${steps.map((s) => `<li>${escapeHtml(s)}</li>`).join("")}</ol>`
        : ""
    }
    ${data.linkUrl ? ctaButton(data.linkLabel || "Learn more", data.linkUrl) : ""}
    <p style="font-size:12px;color:#94a3b8;margin-top:24px">You're receiving this because you use Kchel Dialer.</p>
  `;
  return shell(data.title, body);
}

/**
 * One announcement to many people, through Resend's batch endpoint (up to 100
 * messages per request) so a large audience doesn't mean a large number of
 * subrequests. Returns how many went out; never throws.
 */
export async function sendAnnouncementEmails(
  recipients: string[],
  data: AnnouncementEmailData,
): Promise<{ sent: number; failed: number }> {
  const unique = [...new Set(recipients.filter(Boolean))];
  if (unique.length === 0) return { sent: 0, failed: 0 };
  if (!env.resendApiKey) {
    console.log(`[email:dev-mode] announcement "${data.title}" -> ${unique.length} recipients`);
    return { sent: unique.length, failed: 0 };
  }

  const html = announcementHtml(data);
  let sent = 0;
  let failed = 0;
  for (let i = 0; i < unique.length; i += 100) {
    const chunk = unique.slice(i, i + 100);
    try {
      const res = await fetch("https://api.resend.com/emails/batch", {
        method: "POST",
        headers: { Authorization: `Bearer ${env.resendApiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify(chunk.map((to) => ({ from: env.resendFromEmail, to: [to], subject: data.title, html }))),
      });
      if (res.ok) sent += chunk.length;
      else {
        failed += chunk.length;
        console.error(`Resend announcement batch failed (${res.status}): ${await res.text().catch(() => "")}`);
      }
    } catch (err) {
      failed += chunk.length;
      console.error("Resend announcement batch threw:", err);
    }
  }
  return { sent, failed };
}

// ---------- account activation ----------

export interface ActivationEmailData {
  workspaceName: string;
  workspaceSlug: string;
  planName: string;
  /** Null on unlimited plans — the email then simply omits the line. */
  agentLimit: number | null;
  signInUrl: string;
}

/**
 * Sent once a super admin confirms payment and activates the account.
 *
 * Deliberately states the plan and its seat limit: the most common support
 * ticket after an upgrade is "why can't I add another agent?", and answering
 * it before it's asked is cheaper than answering it afterwards.
 */
export async function sendAccountActivatedEmail(
  to: string,
  data: ActivationEmailData,
): Promise<void> {
  const rows = [
    detailRow("Workspace", data.workspaceName),
    detailRow("Plan", data.planName),
    data.agentLimit === null
      ? detailRow("Agents", "Unlimited")
      : detailRow("Agents", `Up to ${data.agentLimit}`),
  ].join("");

  const html = shell(
    "Your account is active",
    `
      <p style="font-size:14px;line-height:1.6;color:#334155">
        Payment confirmed — your Kchel Dialer workspace is live and ready to use.
      </p>
      <table style="width:100%;border-collapse:collapse;margin:16px 0">${rows}</table>
      <p style="margin:24px 0">
        <a href="${escapeHtml(data.signInUrl)}"
           style="display:inline-block;background:#0f766e;color:#fff;text-decoration:none;
                  padding:11px 20px;border-radius:8px;font-size:14px;font-weight:600">
          Sign in to your workspace
        </a>
      </p>
      <p style="font-size:13px;line-height:1.6;color:#64748b">
        Connect your SIP trunk under Phone System &rarr; Connection to start making calls.
        Reply to this email if you need a hand.
      </p>
    `,
  );

  await send(to, `Your Kchel Dialer account is active — ${data.planName}`, html, "activation");
}

export interface PaymentReceiptData {
  receiptNo: string;
  paidOn: string;
  workspaceName: string;
  workspaceSlug: string;
  planName: string;
  methodLabel: string;
  amountUsd: number;
  reference: string | null;
  /** When the paid period now ends, if it has an end. */
  paidUntil: string | null;
  signInUrl: string;
}

/** Sent once a payment is confirmed: a card payment by the webhook, anything else when the owner marks it paid. */
export async function sendPaymentReceiptEmail(to: string, data: PaymentReceiptData): Promise<void> {
  const rows = [
    detailRow("Receipt no.", data.receiptNo),
    detailRow("Date", data.paidOn),
    detailRow("Workspace", data.workspaceName),
    detailRow("Plan", data.planName),
    detailRow("Paid by", data.methodLabel),
    detailRow("Amount", `$${data.amountUsd.toFixed(2)} USD`),
    ...(data.reference ? [detailRow("Reference", data.reference)] : []),
    ...(data.paidUntil ? [detailRow("Paid until", data.paidUntil)] : []),
  ].join("");

  const html = shell(
    "Payment received — thank you",
    `
      <p style="font-size:14px;line-height:1.6;color:#334155">
        We've confirmed your payment and your ${escapeHtml(data.planName)} plan is active. Keep this email as your receipt.
      </p>
      <table style="width:100%;border-collapse:collapse;margin:16px 0">${rows}</table>
      <p style="margin:24px 0">
        <a href="${escapeHtml(data.signInUrl)}"
           style="display:inline-block;background:#0f766e;color:#fff;text-decoration:none;
                  padding:11px 20px;border-radius:8px;font-size:14px;font-weight:600">
          Sign in to your workspace
        </a>
      </p>
      <p style="font-size:13px;line-height:1.6;color:#64748b">
        Quote the receipt number if you ever contact support about this payment.
      </p>
    `,
  );

  await send(to, `Receipt ${data.receiptNo} — Kchel Dialer ${data.planName}`, html, "receipt");
}

export interface PaymentReceivedData {
  workspaceName: string;
  planName: string;
  methodLabel: string;
  amountText: string;
  /** Gift cards sent; 0 for anything else. */
  cardCount: number;
}

/** To the customer straight after "I've paid": it arrived, and a person will check it before the plan is switched on. */
export async function sendPaymentReceivedEmail(to: string, data: PaymentReceivedData): Promise<void> {
  const rows = [
    detailRow("Workspace", data.workspaceName),
    detailRow("Plan", data.planName),
    detailRow("Paid by", data.methodLabel),
    detailRow(data.cardCount > 0 ? "Cards sent" : "Amount", data.cardCount > 0 ? `${data.cardCount} card${data.cardCount === 1 ? "" : "s"}, ${data.amountText} in total` : data.amountText),
  ].join("");
  const html = shell(
    "We've received your payment details",
    `
      <p style="font-size:14px;line-height:1.6;color:#334155">
        Thank you. Our team will now check your payment. <strong>Your plan is switched on only after we have verified it</strong>,
        and we will email you again as soon as that is done, with your receipt.
      </p>
      <table style="width:100%;border-collapse:collapse;margin:16px 0">${rows}</table>
      <p style="font-size:13px;line-height:1.6;color:#64748b">
        Your free trial keeps running meanwhile. If something is missing we will email you what to send. You can follow this under Support in your workspace.
      </p>
    `,
  );
  await send(to, `We've received your payment for ${data.planName}`, html, "payment-received");
}

export interface ClaimRejectedData {
  workspaceName: string;
  planName: string;
  methodLabel: string;
  reason: string;
}

/** To the customer when a payment could not be verified: what was wrong, so they can fix it. */
export async function sendClaimRejectedEmail(to: string, data: ClaimRejectedData): Promise<void> {
  const html = shell(
    "We couldn't verify your payment yet",
    `
      <p style="font-size:14px;line-height:1.6;color:#334155">
        We checked the ${escapeHtml(data.methodLabel)} payment you sent for the ${escapeHtml(data.planName)} plan on ${escapeHtml(data.workspaceName)}, and we could not confirm it.
      </p>
      <p style="font-size:14px;color:#0f172a;white-space:pre-wrap;background:#f1f5f9;padding:14px 16px;border-radius:10px;margin:16px 0">${escapeHtml(data.reason)}</p>
      <p style="font-size:13px;line-height:1.6;color:#64748b">
        Open Billing in your workspace and press "I've paid" again with the missing details, or reply to our support thread. Your plan has not been charged for anything we could not verify.
      </p>
    `,
  );
  await send(to, "We couldn't verify your payment yet", html, "claim-rejected");
}

// ---------- Paid add-ons (Desktop Dialer, Managed SIP — no processor wired up,
// so approval is manual: tenant requests, pays the founder directly, a super
// admin flips it on from the admin console once payment is confirmed) ----------

/** Tells the platform owner a tenant wants to buy a paid add-on. */
export async function sendAddonRequestEmail(
  to: string[],
  data: { addonName: string; price: string; workspaceName: string; workspaceSlug: string; requestedBy: string },
) {
  const rows = [
    detailRow("Workspace", `${data.workspaceName} (${data.workspaceSlug})`),
    detailRow("Requested by", data.requestedBy),
    detailRow("Price", data.price),
  ].join("");

  const html = shell(
    `${data.addonName} requested`,
    `
      <p style="font-size:14px;line-height:1.6;color:#334155">
        A tenant wants to buy the ${escapeHtml(data.addonName)} add-on. Once payment comes in,
        enable it for them from the admin console's Tenants page.
      </p>
      <table style="width:100%;border-collapse:collapse;margin:16px 0">${rows}</table>
    `,
  );

  await send(to, `${data.addonName} requested — ${data.workspaceName}`, html, "addon-requested");
}

/** Tells the tenant their add-on is live, once payment is confirmed and enabled. */
export async function sendAddonActivatedEmail(
  to: string,
  data: { addonName: string; signInUrl: string; note?: string },
) {
  const html = shell(
    `Your ${data.addonName} is ready`,
    `
      <p style="font-size:14px;line-height:1.6;color:#334155">
        Payment confirmed — the ${escapeHtml(data.addonName)} add-on is now enabled on your workspace.
      </p>
      <p style="margin:24px 0">
        <a href="${escapeHtml(data.signInUrl)}"
           style="display:inline-block;background:#0f766e;color:#fff;text-decoration:none;
                  padding:11px 20px;border-radius:8px;font-size:14px;font-weight:600">
          Sign in
        </a>
      </p>
      ${data.note ? `<p style="font-size:13px;line-height:1.6;color:#64748b">${escapeHtml(data.note)}</p>` : ""}
    `,
  );

  await send(to, `Your ${data.addonName} add-on is ready`, html, "addon-activated");
}
