// The public "contact us" form. A message is saved, then emailed to the platform
// owners so it reaches an inbox. It is open to anyone, so it is limited per
// person and in total, and every field is checked and trimmed.
//
// Server-only.

import { createServerFn } from "@tanstack/react-start";

import { sql } from "./db";
import { sendTeamAlertEmail } from "./email";
import { ensureSchema } from "./schema.server";

export interface ContactInput {
  name: string;
  email: string;
  company?: string;
  teamSize?: string;
  message: string;
  /** A hidden field real people leave empty; filled in by form-stuffing bots. */
  website?: string;
  clientKey?: string;
}

const PER_PERSON_PER_HOUR = 4;
const ALL_PER_HOUR = 120;

const TEAM_SIZES = ["Just me", "2–5", "6–20", "21–100", "More than 100"];

async function withinAllowance(bucket: string, allowed: number): Promise<boolean> {
  const rows = await sql`
    insert into help_chat_usage (bucket, hour, n) values (${bucket}, date_trunc('hour', now()), 1)
    on conflict (bucket, hour) do update set n = help_chat_usage.n + 1
    returning n
  `;
  return Number((rows[0] as { n: number }).n) <= allowed;
}

export async function submitContact(data: ContactInput) {
  // Bots fill every field. Pretend it worked, and send nothing.
  if (data.website && data.website.trim()) return { ok: true as const };

  const name = (data.name ?? "").trim().slice(0, 120);
  const email = (data.email ?? "").trim().toLowerCase().slice(0, 200);
  const company = (data.company ?? "").trim().slice(0, 160);
  const message = (data.message ?? "").trim().slice(0, 4000);
  const teamSize = TEAM_SIZES.includes(data.teamSize ?? "") ? (data.teamSize as string) : "";

  if (!name) throw new Error("Please tell us your name.");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) throw new Error("That email address doesn't look right.");
  if (message.length < 10) throw new Error("Please tell us a little about what you need.");

  await ensureSchema();
  const person = `contact:${(data.clientKey || email).slice(0, 64)}`;
  if (!(await withinAllowance(person, PER_PERSON_PER_HOUR)) || !(await withinAllowance("contact-all", ALL_PER_HOUR))) {
    throw new Error("We've had several messages from you already. We'll reply as soon as we can.");
  }

  await sql`
    insert into contact_requests (name, email, company, team_size, message)
    values (${name}, ${email}, ${company || null}, ${teamSize || null}, ${message})
  `;

  // The email is how it reaches a person. If it can't be sent the message is
  // still saved, so a mail outage never loses a customer's enquiry.
  try {
    const owners = await sql`select email from users where is_super_admin = true`;
    const lines = [`From: ${name} <${email}>`];
    if (company) lines.push(`Company: ${company}`);
    if (teamSize) lines.push(`Team size: ${teamSize}`);
    lines.push("", message);
    const text = lines.join("\n");
    for (const o of owners) {
      await sendTeamAlertEmail(String(o["email"]), `New enquiry from ${name}`, {
        heading: "New enquiry from the website",
        message: text,
        ctaLabel: "Open the admin console",
        ctaPath: "/admin",
      });
    }
  } catch (err) {
    console.error("[contact] could not email the owners", err);
  }
  return { ok: true as const };
}

export const submitContactFn = createServerFn({ method: "POST" })
  .validator((data: Omit<ContactInput, "clientKey">) => data)
  .handler(async ({ data }) => {
    let clientKey = "";
    try {
      const server = await import("@tanstack/react-start/server");
      clientKey = server.getRequestHeader("cf-connecting-ip") ?? server.getRequestHeader("x-forwarded-for") ?? "";
    } catch {
      // Without an address the sender's email is the key instead.
    }
    return submitContact({ ...data, clientKey });
  });
