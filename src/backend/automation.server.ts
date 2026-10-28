// Per-workspace switches for the automations that run without anyone clicking:
// the missed-call text-back, the AI receptionist and number rotation.
//
// Stored inside tenant_settings.preferences under one `automations` key so they
// travel with the rest of the workspace's preferences. Server-only: this file
// reaches the carrier, so it is imported by the native API and the call webhooks
// and never by code that ships to the browser.

import { createServerFn } from "@tanstack/react-start";

import { sql } from "./db";
import { verifyToken } from "./tokens";
import { ensureSchema } from "./schema.server";
import { getTenantPlan, requireFeature, requirePremiumVoice, tenantHasFeature } from "./entitlements";
import { findContactByPhone } from "./phone-numbers";
import { sendSms } from "./signalwire-rest";
import { aiSettingsProblem, sanitizeAiSettings, type AiAgentSettings } from "./ai-agent-options";

export type ReceptionistMode = "after_hours" | "unanswered" | "always";

export interface Automations {
  missedCallTextBack: { enabled: boolean; message: string };
  aiReceptionist: {
    enabled: boolean;
    mode: ReceptionistMode;
    businessName: string;
    about: string;
    transferNumber: string;
    /** How it sounds and what it can do mid-call. */
    agent: AiAgentSettings;
  };
  numberRotation: { enabled: boolean; dailyCap: number };
}

export const DEFAULT_TEXTBACK_MESSAGE =
  "Hi, this is {business}. Sorry we missed your call. What can we help you with? Reply here and we'll get back to you.";

export const DEFAULT_DAILY_CAP = 100;

async function requireTenant(token: string) {
  const payload = await verifyToken(token);
  if (!payload || !payload.tenantId) throw new Error("Not signed in.");
  return payload as typeof payload & { tenantId: string };
}

function str(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

/** Fills every field, so callers never have to guess at a half-saved document. */
export function normalizeAutomations(raw: unknown, tenantName: string): Automations {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, Record<string, unknown> | undefined>;
  const tb = r["missedCallTextBack"] ?? {};
  const ai = r["aiReceptionist"] ?? {};
  const nr = r["numberRotation"] ?? {};
  const mode = str(ai["mode"]);
  const cap = Number(nr["dailyCap"]);
  return {
    missedCallTextBack: {
      enabled: tb["enabled"] === true,
      message: str(tb["message"]).trim() || DEFAULT_TEXTBACK_MESSAGE,
    },
    aiReceptionist: {
      enabled: ai["enabled"] === true,
      mode: mode === "always" || mode === "unanswered" || mode === "after_hours" ? mode : "unanswered",
      businessName: str(ai["businessName"]).trim() || tenantName,
      about: str(ai["about"]).trim(),
      transferNumber: str(ai["transferNumber"]).trim(),
      agent: sanitizeAiSettings(ai["agent"]),
    },
    numberRotation: {
      enabled: nr["enabled"] === true,
      dailyCap: Number.isFinite(cap) && cap >= 10 && cap <= 1000 ? Math.round(cap) : DEFAULT_DAILY_CAP,
    },
  };
}

export async function loadAutomations(tenantId: string): Promise<Automations> {
  const rows = await sql`
    select t.name, ts.preferences -> 'automations' as automations
    from tenants t
    left join tenant_settings ts on ts.tenant_id = t.id
    where t.id = ${tenantId} limit 1
  `;
  const row = rows[0] as { name: string; automations: unknown } | undefined;
  return normalizeAutomations(row?.automations, row?.name ?? "our team");
}

export async function getAutomations(data: { token: string }) {
  const user = await requireTenant(data.token);
  const [automations, plan] = await Promise.all([loadAutomations(user.tenantId), getTenantPlan(user.tenantId)]);
  return {
    ok: true as const,
    automations,
    features: plan.plan.features,
    planName: plan.plan.name,
  };
}

export async function saveAutomations(data: { token: string; automations: unknown }) {
  const user = await requireTenant(data.token);
  const rows = await sql`select name from tenants where id = ${user.tenantId} limit 1`;
  const next = normalizeAutomations(data.automations, (rows[0] as { name: string } | undefined)?.name ?? "our team");

  if (next.missedCallTextBack.message.length > 320) throw new Error("Keep the text-back message under 320 characters.");
  if (next.aiReceptionist.about.length > 1500) throw new Error("Keep the business description under 1,500 characters.");
  if (next.aiReceptionist.transferNumber && !/^\+?[0-9]{7,15}$/.test(next.aiReceptionist.transferNumber.replace(/[\s()-]/g, ""))) {
    throw new Error("The transfer number should be a phone number, e.g. +14155550134.");
  }

  const agentProblem = aiSettingsProblem({ ...next.aiReceptionist.agent, transferNumber: next.aiReceptionist.transferNumber });
  if (agentProblem) throw new Error(agentProblem);
  await requirePremiumVoice(user.tenantId, next.aiReceptionist.agent.voice);

  // Turning something off is always allowed; turning it on needs the plan for it.
  if (next.missedCallTextBack.enabled) await requireFeature(user.tenantId, "missedCallTextBack");
  if (next.aiReceptionist.enabled) await requireFeature(user.tenantId, "aiReceptionist");
  if (next.numberRotation.enabled) await requireFeature(user.tenantId, "numberRotation");

  await sql`
    insert into tenant_settings (tenant_id, workspace, preferences, billing, updated_at)
    values (${user.tenantId}, '{}'::jsonb, ${JSON.stringify({ automations: next })}::jsonb, '{}'::jsonb, now())
    on conflict (tenant_id) do update set
      preferences = tenant_settings.preferences || excluded.preferences,
      updated_at = now()
  `;
  return { ok: true as const, automations: next };
}

// ---------------------------------------------------------------------------
// Missed-call text-back
// ---------------------------------------------------------------------------

const TEXTBACK_COOLDOWN_HOURS = 6;

/**
 * Texts the caller back after a call nobody answered.
 *
 * Called from the inbound webhook, so it must never throw and must never hold
 * the caller up for long — a failed text is a log line, not a failed call.
 * One text per caller per few hours, so someone redialling in frustration
 * doesn't get a stack of identical messages. Contacts marked do-not-call are
 * never texted.
 */
export async function maybeSendMissedCallText(input: {
  tenantId: string;
  callId: string;
  from: string;
  to: string;
}): Promise<void> {
  try {
    const { tenantId, callId, from, to } = input;
    // Withheld or non-numeric caller IDs can't be texted.
    if (!/^\+?[0-9]{7,15}$/.test(from.replace(/[\s()-]/g, "")) || !to) return;

    await ensureSchema();
    const automations = await loadAutomations(tenantId);
    if (!automations.missedCallTextBack.enabled) return;
    if (!(await tenantHasFeature(tenantId, "missedCallTextBack"))) return;

    const contactId = await findContactByPhone(tenantId, from);
    if (contactId) {
      const dnc = await sql`select do_not_call from contacts where id = ${contactId} limit 1`;
      if ((dnc[0] as { do_not_call: boolean } | undefined)?.do_not_call) return;
    }

    const recent = await sql`
      select 1 from auto_texts
      where tenant_id = ${tenantId} and to_number = ${from} and status = 'sent'
        and created_at > now() - (${TEXTBACK_COOLDOWN_HOURS} || ' hours')::interval
      limit 1
    `;
    if (recent.length > 0) return;

    const nameRows = await sql`select name from tenants where id = ${tenantId} limit 1`;
    const business = (nameRows[0] as { name: string } | undefined)?.name ?? "our team";
    const body = automations.missedCallTextBack.message.replace(/\{business\}/gi, business).slice(0, 320);

    const result = await sendSms({ to: from, from: to, body });
    await sql`
      insert into auto_texts (tenant_id, call_id, kind, to_number, from_number, body, status, error)
      values (${tenantId}, ${callId || null}, 'missed_call', ${from}, ${to}, ${body},
              ${result.ok ? "sent" : "failed"}, ${result.ok ? null : (result.error ?? "Send failed")})
    `;
    if (!result.ok) console.warn(`[textback] ${tenantId} could not text ${from}: ${result.error}`);
  } catch (err) {
    console.error("[textback] failed", err);
  }
}

export async function listAutoTexts(data: { token: string }) {
  const user = await requireTenant(data.token);
  await ensureSchema();
  const rows = await sql`
    select id, kind, to_number, from_number, body, status, error, created_at
    from auto_texts where tenant_id = ${user.tenantId}
    order by created_at desc limit 50
  `;
  return { ok: true as const, texts: rows as unknown as AutoTextRow[] };
}

export interface AutoTextRow {
  id: string;
  kind: string;
  to_number: string;
  from_number: string | null;
  body: string;
  status: string;
  error: string | null;
  created_at: string;
}

export const getAutomationsFn = createServerFn({ method: "POST" })
  .validator((data: Parameters<typeof getAutomations>[0]) => data)
  .handler(async ({ data }) => getAutomations(data));

export const saveAutomationsFn = createServerFn({ method: "POST" })
  .validator((data: Parameters<typeof saveAutomations>[0]) => data)
  .handler(async ({ data }) => saveAutomations(data));

export const listAutoTextsFn = createServerFn({ method: "POST" })
  .validator((data: Parameters<typeof listAutoTexts>[0]) => data)
  .handler(async ({ data }) => listAutoTexts(data));
