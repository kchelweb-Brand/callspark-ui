// Cleaning and validating contacts before they reach the database.
//
// Pure functions, no I/O, so every rule can be exercised directly. The same
// rules apply whether a contact is typed in one at a time or imported from a
// spreadsheet of thousands.

/** The most contacts one import may carry: matches the largest plan, and keeps one import a single atomic statement. */
export const MAX_IMPORT_ROWS = 10_000;

export interface RawImportRow {
  company?: string;
  person?: string;
  firstName?: string;
  lastName?: string;
  location?: string;
  country?: string;
  phone?: string;
  email?: string;
  tags?: string[] | string;
  /** The line in the uploaded file, echoed back so an error can point at it. */
  line?: number;
}

export interface CleanContact {
  company: string | null;
  person: string | null;
  firstName: string | null;
  lastName: string | null;
  location: string | null;
  country: string | null;
  phone: string;
  email: string | null;
  tags: string[];
}

export interface InvalidRow {
  row: number;
  phone: string;
  reason: string;
}

export type PhoneResult = { phone: string; error?: undefined } | { phone?: undefined; error: string };

/** The last 10 digits: the same notion of "same number" the call matching already uses. */
export function phoneKey(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  return digits.length > 10 ? digits.slice(-10) : digits;
}

/**
 * Turns whatever a person typed or a spreadsheet held into E.164 (`+2348034064184`).
 *
 * `dialCode` is the workspace's own country code ("234", "1", "44"…). It is what
 * makes a national number like `0803 406 4184` or `8034064184` resolve correctly;
 * without it only numbers that already carry a country code (or ten-digit US
 * numbers, as before) are accepted, rather than guessing and storing a wrong one.
 */
export function parsePhone(raw: unknown, dialCode?: string | null): PhoneResult {
  let text = String(raw ?? "").trim();
  if (!text) return { error: "No phone number" };

  // Spreadsheets quietly turn long numbers into 2.34803E+12 and lose the digits for good.
  if (/^\d(?:\.\d+)?e\+?\d+$/i.test(text.replace(/[\s,]/g, ""))) {
    return { error: "Excel changed this number to scientific notation. Format the column as Text and export again" };
  }

  // "0803 123 4567 / 0805 765 4321" or "… or …": keep the first. Then drop an extension.
  text = (text.split(/\s*(?:\/|;|\||\bor\b)\s*/i)[0] ?? text).trim();
  text = text.replace(/\s*(?:ext\.?|extension|x)\s*\d+\s*$/i, "").trim();

  const hasPlus = text.startsWith("+");
  const digits = text.replace(/\D/g, "");
  if (!digits) return { error: "Not a phone number" };
  if (/[a-z]{3,}/i.test(text.replace(/(?:ext|extension)/gi, ""))) return { error: "Not a phone number" };
  if (/^(\d)\1+$/.test(digits)) return { error: "Not a real phone number" };

  const code = (dialCode ?? "").replace(/\D/g, "");
  let intl: string;

  if (hasPlus) {
    intl = digits;
  } else if (digits.startsWith("00")) {
    intl = digits.replace(/^00/, "");
  } else if (code) {
    if (digits.startsWith("0")) intl = code + digits.replace(/^0+/, "");
    else if (digits.startsWith(code) && digits.length >= code.length + 9) intl = digits;
    else intl = code + digits;
  } else if (digits.length === 10 && !digits.startsWith("0")) {
    intl = `1${digits}`;
  } else if (digits.length === 11 && digits.startsWith("1")) {
    intl = digits;
  } else if (digits.startsWith("0")) {
    return { error: "Missing the country code. Start with + and the country code, or set your default country in Phone System → Routing" };
  } else {
    intl = digits;
  }

  if (intl.startsWith("0")) return { error: "Not a valid phone number" };
  if (intl.length < 8) return { error: "Too short to be a phone number" };
  if (intl.length > 15) return { error: "Too long to be a phone number" };
  return { phone: `+${intl}` };
}

function text(value: unknown, max: number): string | null {
  const s = typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
  return s ? s.slice(0, max) : null;
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function cleanEmail(value: unknown): string | null {
  const s = typeof value === "string" ? value.trim() : "";
  return s && s.length <= 254 && EMAIL.test(s) ? s : null;
}

export function cleanTags(value: unknown): string[] {
  const list = Array.isArray(value) ? value : typeof value === "string" ? value.split(/[;|,]/) : [];
  const out: string[] = [];
  for (const t of list) {
    const tag = typeof t === "string" ? t.trim().slice(0, 40) : "";
    if (tag && !out.some((x) => x.toLowerCase() === tag.toLowerCase())) out.push(tag);
    if (out.length >= 20) break;
  }
  return out;
}

export interface PreparedImport {
  ready: (CleanContact & { key: string })[];
  invalid: InvalidRow[];
  /** Repeats of a number already earlier in the same file. */
  duplicatesInFile: number;
  /** Rows whose email didn't look like one and was left blank. */
  droppedEmails: number;
}

/** Validates and normalises a whole batch, and drops repeats within it. */
export function prepareRows(rows: RawImportRow[], dialCode?: string | null): PreparedImport {
  const ready: PreparedImport["ready"] = [];
  const invalid: InvalidRow[] = [];
  const seen = new Set<string>();
  let duplicatesInFile = 0;
  let droppedEmails = 0;

  rows.forEach((r, i) => {
    const rowNumber = typeof r.line === "number" && r.line > 0 ? r.line : i + 1;
    const parsed = parsePhone(r.phone, dialCode);
    if (parsed.error !== undefined) {
      invalid.push({ row: rowNumber, phone: String(r.phone ?? "").slice(0, 60), reason: parsed.error });
      return;
    }
    const key = phoneKey(parsed.phone);
    if (seen.has(key)) {
      duplicatesInFile++;
      return;
    }
    seen.add(key);
    const email = cleanEmail(r.email);
    if (r.email && String(r.email).trim() && !email) droppedEmails++;
    // First and last name are kept apart. A file with only a full name is split at the first space,
    // and a file with only first and last names gets a full name made from them.
    let firstName = text(r.firstName, 100);
    let lastName = text(r.lastName, 100);
    let person = text(r.person, 200);
    if (!firstName && !lastName && person) {
      const parts = person.split(" ");
      firstName = parts[0] ?? null;
      lastName = parts.slice(1).join(" ") || null;
    }
    if (!person && (firstName || lastName)) person = [firstName, lastName].filter(Boolean).join(" ");
    ready.push({
      company: text(r.company, 200),
      person,
      firstName,
      lastName,
      location: text(r.location, 200),
      country: text(r.country, 100),
      phone: parsed.phone,
      email,
      tags: cleanTags(r.tags),
      key,
    });
  });

  return { ready, invalid, duplicatesInFile, droppedEmails };
}
