import { env } from "./env";
import { CODE_TTL_MINUTES } from "./codes";

const PURPOSE_COPY: Record<string, { subject: string; heading: string }> = {
  login: { subject: "Your Kchel Dialer login code", heading: "Sign in to Kchel Dialer" },
  admin_login: { subject: "Your Kchel admin login code", heading: "Sign in to the Kchel admin console" },
  signup: { subject: "Verify your Kchel Dialer email", heading: "Verify your email" },
};

function renderHtml(code: string, purpose: string): string {
  const copy = PURPOSE_COPY[purpose] ?? PURPOSE_COPY["login"]!;
  return `
    <div style="font-family:-apple-system,Segoe UI,sans-serif;max-width:420px;margin:0 auto;padding:32px 24px">
      <p style="font-size:13px;font-weight:700;letter-spacing:.08em;color:#0f766e;text-transform:uppercase">Kchel Dialer</p>
      <h1 style="font-size:20px;margin:12px 0 4px">${copy.heading}</h1>
      <p style="font-size:14px;color:#475569;margin:0 0 24px">Enter this code to continue. It expires in ${CODE_TTL_MINUTES} minutes.</p>
      <p style="font-family:monospace;font-size:32px;font-weight:700;letter-spacing:.3em;background:#f1f5f9;padding:16px 20px;border-radius:10px;text-align:center;margin:0 0 24px">${code}</p>
      <p style="font-size:12px;color:#94a3b8">If you didn't request this, you can ignore this email.</p>
    </div>
  `;
}

/**
 * Sends the one-time code by email via Resend. If RESEND_API_KEY isn't set
 * yet, logs the code instead so the flow is fully testable before email is
 * wired up (visible in `wrangler tail` in production, or the terminal in dev).
 */
export async function sendCodeEmail(to: string, code: string, purpose: string): Promise<void> {
  if (!env.resendApiKey) {
    console.log(`[email:dev-mode] ${purpose} code for ${to}: ${code} (expires in ${CODE_TTL_MINUTES}m)`);
    return;
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
    console.error(`Resend send failed (${res.status}): ${body}`);
    // Don't leak delivery failures to the client — fall back to a log so the
    // requester still gets *a* success response (matches the "don't reveal
    // whether an email exists" behavior below) while we can see it failed.
    console.log(`[email:fallback] ${purpose} code for ${to}: ${code}`);
  }
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
      <p style="font-size:13px;font-weight:700;letter-spacing:.08em;color:#0f766e;text-transform:uppercase">Kchel Dialer</p>
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
