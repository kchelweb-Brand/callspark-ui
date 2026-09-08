// Matching phone numbers across the inconsistent formats carriers and humans
// use. Shared by the inbound IVR engine and the call-record writers so both
// agree on what counts as "the same number".

import { sql } from "./db";

/**
 * Digits only, last 10 kept.
 *
 * A contact saved as "(415) 555-0134" and an inbound call from
 * "+14155550134" are the same person; comparing the last 10 digits makes
 * them match without needing a full E.164 parser. Ten digits is enough to
 * be specific in practice and tolerates a missing or present country code.
 */
export function normalizeNumber(value: string): string {
  const digits = value.replace(/\D/g, "");
  return digits.length > 10 ? digits.slice(-10) : digits;
}

/** The contact this number belongs to, scoped to one tenant. */
export async function findContactByPhone(
  tenantId: string,
  phone: string | null | undefined,
): Promise<string | null> {
  if (!phone) return null;
  const normalized = normalizeNumber(phone);
  // Too short to identify anyone — an extension or a service code, not a
  // caller. Matching on it would attach calls to the wrong contact.
  if (normalized.length < 7) return null;

  const rows = await sql`
    select id from contacts
    where tenant_id = ${tenantId}
      and right(regexp_replace(phone, '\\D', '', 'g'), 10) = ${normalized}
    limit 1
  `;
  return (rows[0] as { id: string } | undefined)?.id ?? null;
}
