import { createServerFn } from "@tanstack/react-start";

import { sql, sqlQuery } from "./db";
import { verifyToken } from "./tokens";
import { findContactByPhone } from "./phone-numbers";
import { requireCanCreate } from "./entitlements";

async function requireSession(token: string) {
  const payload = await verifyToken(token);
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
}

/**
 * Opens a call record the moment dialling starts, so a call that never
 * connects still leaves a trace (that's exactly the data a dialer needs —
 * unanswered and failed attempts matter as much as connected ones).
 */
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
  .handler(async ({ data }) => {
    const payload = await requireSession(data.token);

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
  });

/** Marks the moment the far end picked up — this is what separates a connect from a dial. */
export const answerCallFn = createServerFn({ method: "POST" })
  .validator((data: { token: string; callId: string }) => data)
  .handler(async ({ data }) => {
    const payload = await requireSession(data.token);
    await sql`
      update calls set status = 'active', answered_at = now()
      where id = ${data.callId} and tenant_id = ${payload.tenantId}
    `;
    return { ok: true as const };
  });

/**
 * Closes the record. Duration is measured from answer (not dial), so it
 * reflects actual talk time — which is what carriers bill and what connect
 * rate should be computed from.
 */
export const endCallFn = createServerFn({ method: "POST" })
  .validator(
    (data: { token: string; callId: string; status?: string; outcome?: string; error?: string }) =>
      data,
  )
  .handler(async ({ data }) => {
    const payload = await requireSession(data.token);

    const rows = await sql`
      select answered_at from calls where id = ${data.callId} and tenant_id = ${payload.tenantId} limit 1
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
  });

export const listCallsFn = createServerFn({ method: "POST" })
  .validator(
    (data: {
      token: string;
      search?: string;
      outcome?: string;
      agent?: string;
      page?: number;
      pageSize?: number;
    }) => data,
  )
  .handler(async ({ data }) => {
    const payload = await requireSession(data.token);
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
              c.ended_at, c.duration_seconds
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
    const agents = await sql`
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
  });
