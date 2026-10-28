import { createServerFn } from "@tanstack/react-start";

import { sql, sqlQuery } from "./db";
import { verifyToken } from "./tokens";
import { findContactByPhone } from "./phone-numbers";
import { parsePhone } from "./contact-import";
import { workspaceDialCode } from "./contacts.server";
import { requireCanCreate } from "./entitlements";
import { ensureSchema } from "./schema.server";

// Agents may use the call functions, within what the owner has switched on.
async function requireSession(token: string) {
  const payload = await verifyToken(token, { allowAgent: true });
  if (!payload || !payload.tenantId) throw new Error("Not signed in.");
  return payload;
}

export interface CallRecord {
  id: string;
  direction: "outbound" | "inbound";
  from_number: string | null;
  to_number: string | null;
  contact_id: string | null;
  contact_name: string | null;
  agent_email: string | null;
  status: string;
  outcome: string | null;
  started_at: string;
  answered_at: string | null;
  ended_at: string | null;
  duration_seconds: number | null;
  has_summary?: boolean;
  has_recording?: boolean;
  handled_by?: string | null;
}

/**
 * Opens a call record the moment dialling starts, so a call that never
 * connects still leaves a trace (that's exactly the data a dialer needs —
 * unanswered and failed attempts matter as much as connected ones).
 */
export async function startCall(data: {
  token: string;
  direction: "outbound" | "inbound";
  toNumber?: string;
  fromNumber?: string;
  contactId?: string;
}) {
    const payload = await requireSession(data.token);
    if (payload.agent && !payload.permissions?.dial) throw new Error("You don't have permission to place calls.");

    // Enforced here, where a person deliberately starts a call. Inbound calls
    // still count toward usage but are never blocked mid-flight — dropping a
    // real caller who already dialled in is not an acceptable way to enforce
    // a quota.
    await requireCanCreate(payload.tenantId!, "calls");

    // An inbound call arrives as a bare number. Resolving it to a contact here
    // is what puts a name (rather than a number) in Call History and links the
    // call to that contact's record.
    const contactId =
      data.contactId ??
      (data.direction === "inbound"
        ? await findContactByPhone(payload.tenantId!, data.fromNumber)
        : null);

    const rows = await sql`
      insert into calls (tenant_id, direction, to_number, from_number, contact_id, agent_email, status)
      values (
        ${payload.tenantId}, ${data.direction}, ${data.toNumber ?? null},
        ${data.fromNumber ?? null}, ${contactId}, ${payload.email}, 'ringing'
      )
      returning id
    `;
    return { ok: true as const, callId: (rows[0] as { id: string }).id };
}

/**
 * Turns what was typed on the keypad into the number the carrier needs.
 *
 * A national number ("0803…", "415 555 0100") is completed with the
 * workspace's country code, so it reaches the carrier in international form
 * instead of being rejected there with nothing explaining why. Extensions and
 * feature codes (*67, 911, a 4-digit extension) go through exactly as typed.
 */
export async function prepareDialNumber(data: { token: string; number: string }) {
    const payload = await requireSession(data.token);
    const typed = String(data.number ?? "").replace(/[^\d+*#]/g, "");
    if (!typed) throw new Error("Enter a number to call.");

    const plain = typed.replace(/\D/g, "");
    if (/^[*#]/.test(typed) || (plain.length < 7 && !typed.startsWith("+"))) {
      return { ok: true as const, number: typed, normalized: false };
    }

    const parsed = parsePhone(typed, await workspaceDialCode(payload.tenantId!));
    if ("error" in parsed) throw new Error(parsed.error + ".");
    return { ok: true as const, number: parsed.phone, normalized: parsed.phone !== typed };
}

export const startCallFn = createServerFn({ method: "POST" })
  .validator(
    (data: {
      token: string;
      direction: "outbound" | "inbound";
      toNumber?: string;
      fromNumber?: string;
      contactId?: string;
    }) => data,
  )
  .handler(async ({ data }) => startCall(data));

/** Marks the moment the far end picked up — this is what separates a connect from a dial. */
export async function answerCall(data: { token: string; callId: string }) {
    const payload = await requireSession(data.token);
    // An agent can only touch their own calls.
    await sql`
      update calls set status = 'active', answered_at = now()
      where id = ${data.callId} and tenant_id = ${payload.tenantId}
        and (${Boolean(payload.agent)}::boolean = false or agent_email = ${payload.email})
    `;
    return { ok: true as const };
}

export const answerCallFn = createServerFn({ method: "POST" })
  .validator((data: { token: string; callId: string }) => data)
  .handler(async ({ data }) => answerCall(data));

/**
 * Closes the record. Duration is measured from answer (not dial), so it
 * reflects actual talk time — which is what carriers bill and what connect
 * rate should be computed from.
 */
export async function endCall(data: {
  token: string;
  callId: string;
  status?: string;
  outcome?: string;
  error?: string;
}) {
    const payload = await requireSession(data.token);

    const rows = await sql`
      select answered_at from calls where id = ${data.callId} and tenant_id = ${payload.tenantId}
        and (${Boolean(payload.agent)}::boolean = false or agent_email = ${payload.email}) limit 1
    `;
    const existing = rows[0] as { answered_at: string | null } | undefined;
    if (!existing) return { ok: true as const };

    // Never answered → it's a no-answer, not a zero-second call.
    const answered = Boolean(existing.answered_at);
    const status = data.status ?? (answered ? "completed" : "no_answer");
    const outcome = data.outcome ?? (answered ? "Connected" : "No answer");

    await sql`
      update calls set
        status = ${status},
        outcome = ${outcome},
        ended_at = now(),
        error = ${data.error ?? null},
        duration_seconds = case
          when answered_at is not null then greatest(0, extract(epoch from (now() - answered_at))::int)
          else 0
        end
      where id = ${data.callId} and tenant_id = ${payload.tenantId}
    `;
    return { ok: true as const };
}

export const endCallFn = createServerFn({ method: "POST" })
  .validator(
    (data: { token: string; callId: string; status?: string; outcome?: string; error?: string }) =>
      data,
  )
  .handler(async ({ data }) => endCall(data));

export async function listCalls(data: {
      token: string;
      search?: string;
      outcome?: string;
      agent?: string;
      page?: number;
      pageSize?: number;
    }) {
    const payload = await requireSession(data.token);
    await ensureSchema();
    // Unless the owner allowed everyone's history, an agent sees only their own calls.
    if (payload.agent && payload.permissions?.callHistory !== "all") data = { ...data, agent: payload.email };
    const page = Math.max(1, data.page || 1);
    const pageSize = Math.min(200, Math.max(1, data.pageSize || 50));

    const params: unknown[] = [payload.tenantId];
    let where = "c.tenant_id = $1";

    if (data.search?.trim()) {
      params.push(`%${data.search.trim()}%`);
      const p = params.length;
      where += ` and (c.to_number ilike $${p} or c.from_number ilike $${p} or ct.company ilike $${p} or ct.person ilike $${p})`;
    }
    if (data.outcome) {
      params.push(data.outcome);
      where += ` and c.outcome = $${params.length}`;
    }
    if (data.agent) {
      params.push(data.agent);
      where += ` and c.agent_email = $${params.length}`;
    }

    const countRows = await sqlQuery(
      `select count(*)::int as total from calls c
       left join contacts ct on ct.id = c.contact_id where ${where}`,
      params,
    );
    const total = (countRows[0] as { total: number } | undefined)?.total ?? 0;

    const listParams = [...params, pageSize, (page - 1) * pageSize];
    const rows = await sqlQuery(
      `select c.id, c.direction, c.from_number, c.to_number, c.contact_id,
              coalesce(ct.company, ct.person) as contact_name,
              c.agent_email, c.status, c.outcome, c.started_at, c.answered_at,
              c.ended_at, c.duration_seconds,
              (c.summary is not null) as has_summary, (c.recording_url is not null) as has_recording,
              c.handled_by
       from calls c
       left join contacts ct on ct.id = c.contact_id
       where ${where}
       order by c.started_at desc
       limit $${listParams.length - 1} offset $${listParams.length}`,
      listParams,
    );

    // Distinct values for the filter dropdowns, scoped to this tenant.
    const outcomes = await sql`
      select distinct outcome from calls
      where tenant_id = ${payload.tenantId} and outcome is not null order by outcome
    `;
    const agents = payload.agent
      ? []
      : await sql`
          select distinct agent_email from calls
          where tenant_id = ${payload.tenantId} and agent_email is not null order by agent_email
        `;

    return {
      ok: true as const,
      calls: rows as unknown as CallRecord[],
      total,
      page,
      pageSize,
      outcomes: (outcomes as { outcome: string }[]).map((o) => o.outcome),
      agents: (agents as { agent_email: string }[]).map((a) => a.agent_email),
    };
  }

export const listCallsFn = createServerFn({ method: "POST" })
  .validator((data: Parameters<typeof listCalls>[0]) => data)
  .handler(async ({ data }) => listCalls(data));
