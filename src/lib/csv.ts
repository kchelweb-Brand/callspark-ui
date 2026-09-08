/**
 * Minimal CSV parser that handles quoted fields, escaped quotes ("") and
 * commas/newlines inside quotes. Enough for contact list imports without
 * pulling in a parsing library.
 */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  const clean = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

  for (let i = 0; i < clean.length; i += 1) {
    const char = clean[i];

    if (inQuotes) {
      if (char === '"') {
        if (clean[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
    } else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += char;
    }
  }

  if (field || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  return rows.filter((r) => r.some((cell) => cell.trim() !== ""));
}

/** Maps common header spellings to our contact fields. */
const HEADER_ALIASES: Record<string, string> = {
  company: "company",
  "company name": "company",
  organization: "company",
  business: "company",
  account: "company",
  name: "person",
  "full name": "person",
  "contact name": "person",
  person: "person",
  "first name": "person",
  contact: "person",
  phone: "phone",
  "phone number": "phone",
  number: "phone",
  mobile: "phone",
  cell: "phone",
  telephone: "phone",
  tel: "phone",
  email: "email",
  "email address": "email",
  "e-mail": "email",
  tags: "tags",
  tag: "tags",
};

export interface ParsedContactRow {
  company?: string;
  person?: string;
  phone: string;
  email?: string;
  tags?: string[];
}

export interface CsvParseResult {
  rows: ParsedContactRow[];
  detectedColumns: Record<string, string>;
  skippedNoPhone: number;
}

/**
 * Turns raw CSV text into contact rows, matching headers loosely so users
 * don't have to rename their columns first.
 */
export function csvToContacts(text: string): CsvParseResult {
  const table = parseCsv(text);
  if (table.length === 0) {
    return { rows: [], detectedColumns: {}, skippedNoPhone: 0 };
  }

  const headerRow = table[0] ?? [];
  const header = headerRow.map((h) => h.trim().toLowerCase());
  const map: Record<number, string> = {};
  const detectedColumns: Record<string, string> = {};

  header.forEach((h, i) => {
    const field = HEADER_ALIASES[h];
    if (field && !Object.values(map).includes(field)) {
      map[i] = field;
      detectedColumns[field] = (headerRow[i] ?? "").trim();
    }
  });

  // No recognizable phone column — fall back to the first column that looks
  // like it holds numbers, so an unlabelled export still imports.
  if (!Object.values(map).includes("phone")) {
    const firstDataRow = table[1] ?? [];
    const candidate = firstDataRow.findIndex((cell) => /\d{7,}/.test(cell.replace(/\D/g, "")));
    if (candidate >= 0) {
      map[candidate] = "phone";
      detectedColumns["phone"] = (headerRow[candidate] ?? "").trim() || `Column ${candidate + 1}`;
    }
  }

  const rows: ParsedContactRow[] = [];
  let skippedNoPhone = 0;

  for (const line of table.slice(1)) {
    const record: Record<string, string> = {};
    Object.entries(map).forEach(([index, field]) => {
      record[field] = (line[Number(index)] ?? "").trim();
    });

    const phone = record["phone"];
    if (!phone) {
      skippedNoPhone += 1;
      continue;
    }

    const parsed: ParsedContactRow = { phone };
    const company = record["company"];
    const person = record["person"];
    const email = record["email"];
    const rawTags = record["tags"];

    if (company) parsed.company = company;
    if (person) parsed.person = person;
    if (email) parsed.email = email;
    if (rawTags) {
      const tags = rawTags
        .split(/[;|]/)
        .map((t) => t.trim())
        .filter(Boolean);
      if (tags.length) parsed.tags = tags;
    }
    rows.push(parsed);
  }

  return { rows, detectedColumns, skippedNoPhone };
}
