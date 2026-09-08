import { createServerFn } from "@tanstack/react-start";

import { sql, sqlQuery } from "./db";
import { verifyToken } from "./tokens";

async function requireTenant(token: string): Promise<string> {
  const payload = await verifyToken(token);
  if (!payload || !payload.tenantId) throw new Error("Not signed in.");
  return payload.tenantId;
}

/** 10-digit numbers are treated as US; everything else is kept as-is (trimmed to digits + leading +). */
function normalizePhone(raw: string): string {
  const trimmed = raw.trim();
  const digits = trimmed.replace(/[^\d]/g, "");
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  if (trimmed.startsWith("+")) return `+${digits}`;
  return digits ? `+${digits}` : trimmed;
}

function isValidPhone(normalized: string): boolean {
  return /^\+\d{7,15}$/.test(normalized);
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

export const listContactsFn = createServerFn({ method: "POST" })
  .validator(
    (data: { token: string; search?: string; listId?: string; tag?: string; page?: number; pageSize?: number }) => data,
  )
  .handler(async ({ data }) => {
    const tenantId = await requireTenant(data.token);
    const page = Math.max(1, data.page || 1);
    const pageSize = Math.min(200, Math.max(1, data.pageSize || 50));

    const params: unknown[] = [tenantId];
    let where = "c.tenant_id = $1";

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
  });

export const getContactsMetaFn = createServerFn({ method: "POST" })
  .validator((data: { token: string }) => data)
  .handler(async ({ data }) => {
    const tenantId = await requireTenant(data.token);

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
  });

// ---------- create / import / delete ----------

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
  .handler(async ({ data }) => {
    const tenantId = await requireTenant(data.token);
    const phone = normalizePhone(data.phone);
    if (!isValidPhone(phone)) throw new Error("Enter a valid phone number.");

    const listId = data.listName?.trim() ? await findOrCreateList(tenantId, data.listName.trim()) : null;

    const inserted = await sql`
      insert into contacts (tenant_id, list_id, company, person, phone, email, tags)
      values (${tenantId}, ${listId}, ${data.company || null}, ${data.person || null}, ${phone}, ${data.email || null}, ${data.tags || []})
      returning id
    `;

    return { ok: true as const, id: (inserted[0] as { id: string }).id };
  });

export const importContactsFn = createServerFn({ method: "POST" })
  .validator(
    (data: {
      token: string;
      rows: { company?: string; person?: string; phone: string; email?: string; tags?: string[] }[];
      listName?: string;
    }) => data,
  )
  .handler(async ({ data }) => {
    const tenantId = await requireTenant(data.token);
    const listId = data.listName?.trim() ? await findOrCreateList(tenantId, data.listName.trim()) : null;

    const existingRows = await sql`select phone from contacts where tenant_id = ${tenantId}`;
    const existingPhones = new Set((existingRows as { phone: string }[]).map((r) => r.phone));
    const seenInBatch = new Set<string>();

    const invalid: { row: number; phone: string }[] = [];
    let duplicates = 0;
    let imported = 0;

    for (let i = 0; i < data.rows.length; i++) {
      const row = data.rows[i]!;
      const phone = normalizePhone(row.phone);
      if (!isValidPhone(phone)) {
        invalid.push({ row: i + 1, phone: row.phone });
        continue;
      }
      if (existingPhones.has(phone) || seenInBatch.has(phone)) {
        duplicates++;
        continue;
      }
      seenInBatch.add(phone);
      await sql`
        insert into contacts (tenant_id, list_id, company, person, phone, email, tags)
        values (${tenantId}, ${listId}, ${row.company || null}, ${row.person || null}, ${phone}, ${row.email || null}, ${row.tags || []})
      `;
      imported++;
    }

    return {
      ok: true as const,
      imported,
      duplicates,
      invalid,
      invalidCount: invalid.length,
    };
  });

export const deleteContactsFn = createServerFn({ method: "POST" })
  .validator((data: { token: string; ids: string[] }) => data)
  .handler(async ({ data }) => {
    const tenantId = await requireTenant(data.token);
    if (data.ids.length === 0) return { ok: true as const, deleted: 0 };

    const deleted = await sqlQuery(
      `delete from contacts where tenant_id = $1 and id = any($2::uuid[]) returning id`,
      [tenantId, data.ids],
    );

    return { ok: true as const, deleted: deleted.length };
  });
