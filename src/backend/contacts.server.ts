import { createServerFn } from "@tanstack/react-start";

import { sql, sqlQuery } from "./db";
import { verifyToken } from "./tokens";
import { getTenantPlan, requireActivePlan, requireCanCreate } from "./entitlements";
import { requireMember } from "./access.server";
import { ensureSchema } from "./schema.server";
import { callingCodeFromE164 } from "./phone-numbers";
import {
  MAX_IMPORT_ROWS,
  cleanEmail,
  cleanTags,
  parsePhone,
  phoneKey,
  prepareRows,
  type InvalidRow,
  type RawImportRow,
} from "./contact-import";

async function requireTenant(token: string): Promise<string> {
  const payload = await verifyToken(token);
  if (!payload || !payload.tenantId) throw new Error("Not signed in.");
  return payload.tenantId;
}

/**
 * Agents reach contacts only as far as the owner allows: 'all' sees the whole
 * book, 'assigned' only the contacts on their open tasks, 'none' nothing.
 */
async function contactScope(token: string, write = false) {
  const member = await requireMember(token);
  if (!member.isAgent) return { tenantId: member.tenantId, onlyForAgent: null as string | null };
  const p = member.permissions!;
  if (p.contacts === "none") throw new Error("You don't have access to contacts.");
  if (write && !p.editContacts) throw new Error("You don't have permission to add contacts.");
  await ensureSchema();
  return { tenantId: member.tenantId, onlyForAgent: p.contacts === "assigned" ? member.userId : null };
}

interface ContactRow {
  id: string;
  company: string | null;
  person: string | null;
  phone: string;
  email: string | null;
  tags: string[];
  do_not_call: boolean;
  do_not_sms: boolean;
  last_touched_at: string | null;
  created_at: string;
  list_id: string | null;
  list_name: string | null;
}

const CONTACT_COLUMNS = `
  c.id, c.company, c.person, c.phone, c.email, c.tags, c.do_not_call, c.do_not_sms,
  c.last_touched_at, c.created_at, c.list_id, l.name as list_name
`;

/** Finds a tenant's contact list by name, creating it if it doesn't exist yet. */
async function findOrCreateList(tenantId: string, name: string): Promise<string> {
  const existing = await sql`select id from contact_lists where tenant_id = ${tenantId} and name = ${name} limit 1`;
  if (existing.length > 0) return (existing[0] as { id: string }).id;
  const created = await sql`insert into contact_lists (tenant_id, name) values (${tenantId}, ${name}) returning id`;
  return (created[0] as { id: string }).id;
}

// ---------- list / meta ----------

export async function listContacts(data: {
  token: string;
  search?: string;
  listId?: string;
  tag?: string;
  page?: number;
  pageSize?: number;
}) {
    const { tenantId, onlyForAgent } = await contactScope(data.token);
    const page = Math.max(1, data.page || 1);
    const pageSize = Math.min(200, Math.max(1, data.pageSize || 50));

    const params: unknown[] = [tenantId];
    let where = "c.tenant_id = $1";
    if (onlyForAgent) {
      params.push(onlyForAgent);
      where += ` and c.id in (select contact_id from agent_tasks where assignee_id = $${params.length} and status <> 'Done' and contact_id is not null)`;
    }

    if (data.search?.trim()) {
      params.push(`%${data.search.trim()}%`);
      const p = params.length;
      where += ` and (c.company ilike $${p} or c.person ilike $${p} or c.phone ilike $${p} or c.email ilike $${p})`;
    }
    if (data.listId) {
      params.push(data.listId);
      where += ` and c.list_id = $${params.length}`;
    }
    if (data.tag) {
      params.push(data.tag);
      where += ` and $${params.length} = any(c.tags)`;
    }

    const countRows = await sqlQuery(`select count(*)::int as total from contacts c where ${where}`, params);
    const total = (countRows[0] as { total: number } | undefined)?.total ?? 0;

    const dataParams = [...params, pageSize, (page - 1) * pageSize];
    const rows = await sqlQuery(
      `select ${CONTACT_COLUMNS} from contacts c left join contact_lists l on l.id = c.list_id
       where ${where} order by c.created_at desc limit $${dataParams.length - 1} offset $${dataParams.length}`,
      dataParams,
    );

    return {
      ok: true as const,
      contacts: rows as unknown as ContactRow[],
      total,
      page,
      pageSize,
    };
}

export const listContactsFn = createServerFn({ method: "POST" })
  .validator(
    (data: { token: string; search?: string; listId?: string; tag?: string; page?: number; pageSize?: number }) => data,
  )
  .handler(async ({ data }) => listContacts(data));

export async function getContactsMeta(data: { token: string }) {
    const { tenantId, onlyForAgent } = await contactScope(data.token);
    // An agent limited to their assigned contacts has no use for the lists.
    if (onlyForAgent) return { ok: true as const, lists: [] as { id: string; name: string; contact_count: number }[], tags: [] as string[] };

    const lists = await sql`
      select l.id, l.name, count(c.id)::int as contact_count
      from contact_lists l
      left join contacts c on c.list_id = l.id
      where l.tenant_id = ${tenantId}
      group by l.id, l.name
      order by l.name
    `;
    const tagRows = await sql`
      select distinct unnest(tags) as tag from contacts where tenant_id = ${tenantId} order by tag
    `;

    return {
      ok: true as const,
      lists: lists as unknown as { id: string; name: string; contact_count: number }[],
      tags: (tagRows as { tag: string }[]).map((r) => r.tag),
    };
}

export const getContactsMetaFn = createServerFn({ method: "POST" })
  .validator((data: { token: string }) => data)
  .handler(async ({ data }) => getContactsMeta(data));

// ---------- create / import / delete ----------

/**
 * The country code national numbers should be read against: the one set in
 * Phone System → Routing, else the one the owner's signup phone number carried.
 */
export async function workspaceDialCode(tenantId: string): Promise<string | null> {
  const routing = await sql`
    select routing ->> 'defaultDialCode' as code from phone_system_settings where tenant_id = ${tenantId} limit 1
  `;
  const set = ((routing[0] as { code: string | null } | undefined)?.code ?? "").replace(/\D/g, "");
  if (set) return set;

  const signup = await sql`
    select phone from signup_requests
    where workspace_slug = (select workspace_slug from tenants where id = ${tenantId}) and phone is not null
    order by created_at asc limit 1
  `;
  const phone = (signup[0] as { phone: string } | undefined)?.phone;
  return phone ? callingCodeFromE164(phone) || null : null;
}

export async function createContact(data: {
  token: string;
  company?: string;
  person?: string;
  phone: string;
  email?: string;
  tags?: string[];
  listName?: string;
}) {
    const { tenantId } = await contactScope(data.token, true);
    await requireCanCreate(tenantId, "contacts");

    const parsed = parsePhone(data.phone, await workspaceDialCode(tenantId));
    if (parsed.error !== undefined) throw new Error(parsed.error);
    const phone = parsed.phone;

    const duplicate = await sql`
      select 1 from contacts
      where tenant_id = ${tenantId} and right(regexp_replace(phone, '\\D', '', 'g'), 10) = ${phoneKey(phone)} limit 1
    `;
    if (duplicate.length > 0) throw new Error("A contact with that phone number already exists.");

    if (data.email?.trim() && !cleanEmail(data.email)) throw new Error("That email address doesn't look right.");

    const listId = data.listName?.trim() ? await findOrCreateList(tenantId, data.listName.trim().slice(0, 100)) : null;

    const inserted = await sql`
      insert into contacts (tenant_id, list_id, company, person, phone, email, tags)
      values (${tenantId}, ${listId}, ${data.company?.trim().slice(0, 200) || null}, ${data.person?.trim().slice(0, 200) || null},
              ${phone}, ${cleanEmail(data.email)}, ${cleanTags(data.tags ?? [])})
      returning id
    `;

    return { ok: true as const, id: (inserted[0] as { id: string }).id };
}

export const createContactFn = createServerFn({ method: "POST" })
  .validator(
    (data: {
      token: string;
      company?: string;
      person?: string;
      phone: string;
      email?: string;
      tags?: string[];
      listName?: string;
    }) => data,
  )
  .handler(async ({ data }) => createContact(data));

export interface ImportResult {
  imported: number;
  /** Numbers that were already in the workspace, or repeated within the file. */
  duplicates: number;
  /** The first rows that could not be imported, each with the reason. */
  invalid: InvalidRow[];
  invalidCount: number;
  droppedEmails: number;
  /** Valid new contacts left out because the plan's contact limit was reached. */
  overLimit: number;
  /** The plan's contact limit, or null when unlimited. */
  planLimit: number | null;
  listName: string | null;
}

/**
 * Imports a batch of contacts in a single statement.
 *
 * One statement means all-or-nothing: a failure leaves nothing half-written for
 * the user to reconcile by hand. (The old loop issued one request per row, which
 * ran into the Worker's request limits on any real-sized file and could stop
 * halfway.) Numbers are normalised against the workspace's country code and
 * repeats are dropped by comparing the last ten digits.
 *
 * The plan limit never makes an import fail: the file fills the plan up to its
 * limit and the remainder is reported as `overLimit` for the caller to show.
 */
export async function importContacts(data: {
  token: string;
  rows: RawImportRow[];
  listName?: string;
}) {
    const tenantId = await requireTenant(data.token);
    if (!Array.isArray(data.rows) || data.rows.length === 0) throw new Error("There are no rows to import.");
    if (data.rows.length > MAX_IMPORT_ROWS) {
      throw new Error(`Import up to ${MAX_IMPORT_ROWS.toLocaleString()} contacts at a time. Split the file and import it in parts.`);
    }

    const dialCode = await workspaceDialCode(tenantId);
    const prepared = prepareRows(data.rows, dialCode);

    const existingRows = await sql`
      select right(regexp_replace(phone, '\\D', '', 'g'), 10) as k from contacts where tenant_id = ${tenantId}
    `;
    const existing = new Set((existingRows as { k: string }[]).map((r) => r.k));
    const newRows = prepared.ready.filter((r) => !existing.has(r.key));
    const duplicates = prepared.duplicatesInFile + (prepared.ready.length - newRows.length);

    // Fill the plan up to its limit; whatever does not fit is skipped, not refused.
    await requireActivePlan(tenantId);
    const { plan } = await getTenantPlan(tenantId);
    const planLimit = plan.limits.contacts;
    const room = planLimit === null ? newRows.length : Math.max(0, planLimit - existingRows.length);
    const fresh = newRows.slice(0, room);
    const overLimit = newRows.length - fresh.length;

    const listName = data.listName?.trim().slice(0, 100) || null;
    let imported = 0;

    if (fresh.length > 0) {
      const listId = listName ? await findOrCreateList(tenantId, listName) : null;
      const payload = fresh.map(({ company, person, phone, email, tags }) => ({ company, person, phone, email, tags }));
      const inserted = await sql`
        insert into contacts (tenant_id, list_id, company, person, phone, email, tags)
        select ${tenantId}, ${listId}, r.company, r.person, r.phone, r.email, coalesce(r.tags, '{}')
        from jsonb_to_recordset(${JSON.stringify(payload)}::jsonb) as r(company text, person text, phone text, email text, tags text[])
        returning id
      `;
      imported = inserted.length;
    }

    const result: ImportResult = {
      imported,
      duplicates,
      invalid: prepared.invalid.slice(0, 100),
      invalidCount: prepared.invalid.length,
      droppedEmails: prepared.droppedEmails,
      overLimit,
      planLimit,
      listName,
    };
    return { ok: true as const, ...result };
}

export const importContactsFn = createServerFn({ method: "POST" })
  .validator(
    (data: { token: string; rows: RawImportRow[]; listName?: string }) => data,
  )
  .handler(async ({ data }) => importContacts(data));

export async function deleteContacts(data: { token: string; ids: string[] }) {
  const tenantId = await requireTenant(data.token);
  if (data.ids.length === 0) return { ok: true as const, deleted: 0 };

  const deleted = await sqlQuery(
    `delete from contacts where tenant_id = $1 and id = any($2::uuid[]) returning id`,
    [tenantId, data.ids],
  );

  return { ok: true as const, deleted: deleted.length };
}

export const deleteContactsFn = createServerFn({ method: "POST" })
  .validator((data: { token: string; ids: string[] }) => data)
  .handler(async ({ data }) => deleteContacts(data));
