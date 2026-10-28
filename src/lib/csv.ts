/**
 * CSV reading for contact imports.
 *
 * Built for the files people actually have: exported from Excel (which adds an
 * invisible byte-order mark and, in many countries, separates with semicolons
 * instead of commas), saved in Windows encodings, with or without a header
 * row, with "First name" and "Last name" in separate columns.
 */

export interface DecodedText {
  text: string;
  encoding: "utf-8" | "utf-16" | "windows-1252";
}

/** Decodes an uploaded file, falling back from UTF-8 to the encodings Excel really writes. */
export function decodeCsvBuffer(buffer: ArrayBuffer): DecodedText {
  const bytes = new Uint8Array(buffer);
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) {
    return { text: new TextDecoder("utf-16le").decode(bytes.subarray(2)), encoding: "utf-16" };
  }
  if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
    return { text: new TextDecoder("utf-16be").decode(bytes.subarray(2)), encoding: "utf-16" };
  }
  try {
    return { text: new TextDecoder("utf-8", { fatal: true }).decode(bytes), encoding: "utf-8" };
  } catch {
    // Not valid UTF-8: an older Excel "CSV" is Windows-1252, which keeps é, ñ and ü intact.
    return { text: new TextDecoder("windows-1252").decode(bytes), encoding: "windows-1252" };
  }
}

/** True for spreadsheets and other binary files that were picked by mistake. */
export function looksBinary(buffer: ArrayBuffer): boolean {
  const b = new Uint8Array(buffer.slice(0, 4));
  // .xlsx/.docx/.zip start with "PK"; old .xls starts with the OLE signature.
  if (b[0] === 0x50 && b[1] === 0x4b) return true;
  if (b[0] === 0xd0 && b[1] === 0xcf && b[2] === 0x11 && b[3] === 0xe0) return true;
  const sample = new Uint8Array(buffer.slice(0, 2000));
  return sample.includes(0) && !(sample[0] === 0xff || sample[0] === 0xfe);
}

/** Picks the separator by counting candidates in the first line, outside quotes. */
export function detectDelimiter(text: string): string {
  const first = text.split(/\r\n|\n|\r/, 1)[0] ?? "";
  const counts: Record<string, number> = { ",": 0, ";": 0, "\t": 0, "|": 0 };
  let quoted = false;
  for (const ch of first) {
    if (ch === '"') quoted = !quoted;
    else if (!quoted && ch in counts) counts[ch] = (counts[ch] ?? 0) + 1;
  }
  let best = ",";
  for (const d of [";", "\t", "|"]) if ((counts[d] ?? 0) > (counts[best] ?? 0)) best = d;
  return best;
}

interface Table {
  rows: string[][];
  /** The line each row started on in the file, for pointing at a problem. */
  lines: number[];
}

function parseTable(input: string, delimiter: string): Table {
  const rows: string[][] = [];
  const lines: number[] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  let line = 1;
  let rowLine = 1;

  const clean = input.replace(/^﻿/, "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");

  const endRow = () => {
    row.push(field);
    if (row.some((c) => c.trim() !== "")) {
      rows.push(row);
      lines.push(rowLine);
    }
    row = [];
    field = "";
    rowLine = line;
  };

  for (let i = 0; i < clean.length; i += 1) {
    const char = clean[i]!;

    if (inQuotes) {
      if (char === '"') {
        if (clean[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        if (char === "\n") line += 1;
        field += char;
      }
      continue;
    }

    if (char === '"' && field === "") {
      inQuotes = true;
    } else if (char === delimiter) {
      row.push(field);
      field = "";
    } else if (char === "\n") {
      line += 1;
      endRow();
    } else {
      field += char;
    }
  }

  if (field !== "" || row.length > 0) endRow();
  return { rows, lines };
}

/** Plain parse: quoted fields, escaped quotes, separators and newlines inside quotes. */
export function parseCsv(text: string, delimiter?: string): string[][] {
  return parseTable(text, delimiter ?? detectDelimiter(text)).rows;
}

/** Maps header spellings (after tidying) to our contact fields. */
const HEADER_ALIASES: Record<string, string> = {
  company: "company",
  "company name": "company",
  organization: "company",
  organisation: "company",
  business: "company",
  "business name": "company",
  account: "company",
  "account name": "company",
  employer: "company",
  firm: "company",
  name: "person",
  "full name": "person",
  fullname: "person",
  "contact name": "person",
  "customer name": "person",
  person: "person",
  contact: "person",
  "first name": "first",
  firstname: "first",
  first: "first",
  "given name": "first",
  "last name": "last",
  lastname: "last",
  last: "last",
  surname: "last",
  "family name": "last",
  phone: "phone",
  "phone number": "phone",
  "phone no": "phone",
  "phone 1": "phone",
  "phone number 1": "phone",
  "primary phone": "phone",
  "mobile phone": "phone",
  "work phone": "phone",
  "business phone": "phone",
  number: "phone",
  mobile: "phone",
  "mobile number": "phone",
  "mobile no": "phone",
  cell: "phone",
  "cell phone": "phone",
  telephone: "phone",
  "telephone number": "phone",
  tel: "phone",
  whatsapp: "phone",
  msisdn: "phone",
  gsm: "phone",
  contact_number: "phone",
  "contact number": "phone",
  email: "email",
  "email address": "email",
  "email 1": "email",
  "e mail": "email",
  "e mail address": "email",
  mail: "email",
  tags: "tags",
  tag: "tags",
  labels: "tags",
  label: "tags",
  groups: "tags",
  location: "location",
  city: "location",
  town: "location",
  "city town": "location",
  address: "location",
  "street address": "location",
  "home address": "location",
  state: "location",
  region: "location",
  province: "location",
  "state province": "location",
  area: "location",
  locality: "location",
  suburb: "location",
  district: "location",
  country: "country",
  "country name": "country",
  nation: "country",
};

function tidyHeader(h: string): string {
  return h
    .replace(/^﻿/, "")
    .toLowerCase()
    .replace(/[_\-.]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const looksLikePhone = (cell: string) => {
  const t = cell.trim();
  const digits = t.replace(/\D/g, "");
  return digits.length >= 7 && digits.length <= 16 && /^[+()\d\s.\-/]+(?:e\+?\d+)?$/i.test(t);
};
const looksLikeEmail = (cell: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cell.trim());

export interface ParsedContactRow {
  company?: string;
  person?: string;
  firstName?: string;
  lastName?: string;
  /** City, state or address: whatever the file says about where the person is. */
  location?: string;
  country?: string;
  phone: string;
  email?: string;
  tags?: string[];
  /** The line in the file, echoed back by the server when a row is rejected. */
  line?: number;
}

export interface CsvParseResult {
  rows: ParsedContactRow[];
  /** Which of our fields each recognised column fed, e.g. `{ phone: "Mobile" }`. */
  detectedColumns: Record<string, string>;
  /** Columns in the file we didn't use. */
  ignoredColumns: string[];
  skippedNoPhone: number;
  delimiter: string;
  hadHeader: boolean;
  totalRows: number;
}

const EMPTY: CsvParseResult = {
  rows: [],
  detectedColumns: {},
  ignoredColumns: [],
  skippedNoPhone: 0,
  delimiter: ",",
  hadHeader: true,
  totalRows: 0,
};

/**
 * Turns CSV text into contact rows, matching columns loosely so people don't
 * have to rename anything first. A file with no header row is read by looking
 * at what is in each column.
 */
export function csvToContacts(input: string): CsvParseResult {
  const delimiter = detectDelimiter(input);
  const { rows: table, lines } = parseTable(input, delimiter);
  if (table.length === 0) return { ...EMPTY, delimiter };

  const firstRow = table[0] ?? [];
  const width = Math.max(...table.slice(0, 50).map((r) => r.length), firstRow.length);

  // A header row has no phone-like cells. A first row full of numbers is data.
  const firstIsData = firstRow.some(looksLikePhone) && !firstRow.some((c) => HEADER_ALIASES[tidyHeader(c)] === "phone");
  const hadHeader = !firstIsData;

  const fieldOf: (string | undefined)[] = new Array(width).fill(undefined);
  const labels: string[] = new Array(width).fill("");
  const detectedColumns: Record<string, string> = {};

  if (hadHeader) {
    firstRow.forEach((raw, i) => {
      labels[i] = raw.trim();
      const field = HEADER_ALIASES[tidyHeader(raw)];
      if (field) fieldOf[i] = field;
    });
  } else {
    // No header: judge each column by its first rows.
    const sample = table.slice(0, 25);
    const score = (i: number, test: (c: string) => boolean) => sample.filter((r) => test(r[i] ?? "")).length / sample.length;
    let bestPhone = -1;
    let bestScore = 0;
    for (let i = 0; i < width; i += 1) {
      labels[i] = `Column ${i + 1}`;
      const s = score(i, looksLikePhone);
      if (s > bestScore) {
        bestScore = s;
        bestPhone = i;
      }
    }
    if (bestPhone >= 0) fieldOf[bestPhone] = "phone";
    for (let i = 0; i < width; i += 1) {
      if (fieldOf[i]) continue;
      if (score(i, looksLikeEmail) > 0.5) fieldOf[i] = "email";
    }
    const firstText = Array.from({ length: width }, (_, i) => i).find((i) => !fieldOf[i] && sample.some((r) => /[a-z]/i.test(r[i] ?? "")));
    if (firstText !== undefined) fieldOf[firstText] = "person";
  }

  // A header row we couldn't read at all: fall back to whichever column holds phone numbers.
  if (!fieldOf.includes("phone")) {
    const sample = table.slice(hadHeader ? 1 : 0, 26);
    let best = -1;
    let bestScore = 0;
    for (let i = 0; i < width; i += 1) {
      if (fieldOf[i]) continue;
      const s = sample.length ? sample.filter((r) => looksLikePhone(r[i] ?? "")).length / sample.length : 0;
      if (s > bestScore) {
        bestScore = s;
        best = i;
      }
    }
    if (best >= 0 && bestScore >= 0.5) fieldOf[best] = "phone";
  }

  const columns = (field: string) => fieldOf.flatMap((f, i) => (f === field ? [i] : []));
  const phoneCols = columns("phone");
  const emailCols = columns("email");
  const companyCols = columns("company");
  const personCols = columns("person");
  const firstCols = columns("first");
  const lastCols = columns("last");
  const tagCols = columns("tags");
  const locationCols = columns("location");
  const countryCols = columns("country");

  const firstLabel = (idx: number[]) => (idx[0] !== undefined ? labels[idx[0]] || `Column ${idx[0] + 1}` : "");
  for (const [field, idx] of [
    ["phone", phoneCols],
    ["email", emailCols],
    ["company", companyCols],
    ["person", personCols.length ? personCols : firstCols],
    ["tags", tagCols],
  ] as [string, number[]][]) {
    if (idx.length) detectedColumns[field] = firstLabel(idx);
  }
  if (firstCols.length && lastCols.length && !personCols.length) {
    detectedColumns["person"] = `${firstLabel(firstCols)} + ${firstLabel(lastCols)}`;
  }
  if (firstCols.length) detectedColumns["first name"] = firstLabel(firstCols);
  if (lastCols.length) detectedColumns["last name"] = firstLabel(lastCols);
  if (locationCols.length) detectedColumns["location"] = locationCols.map((i) => labels[i] || `Column ${i + 1}`).join(" + ");
  if (countryCols.length) detectedColumns["country"] = firstLabel(countryCols);

  const used = new Set<number>([...phoneCols, ...emailCols, ...companyCols, ...personCols, ...firstCols, ...lastCols, ...tagCols, ...locationCols, ...countryCols]);
  const ignoredColumns = labels.filter((l, i) => !used.has(i) && l.trim() !== "");

  const cell = (r: string[], idx: number[]) => {
    for (const i of idx) {
      const v = (r[i] ?? "").trim();
      if (v) return v;
    }
    return "";
  };

  const out: ParsedContactRow[] = [];
  let skippedNoPhone = 0;
  const start = hadHeader ? 1 : 0;

  for (let n = start; n < table.length; n += 1) {
    const r = table[n]!;
    const phone = cell(r, phoneCols);
    if (!phone) {
      skippedNoPhone += 1;
      continue;
    }
    const row: ParsedContactRow = { phone, line: lines[n] ?? n + 1 };
    const company = cell(r, companyCols);
    const firstName = cell(r, firstCols);
    const lastName = cell(r, lastCols);
    const person = personCols.length ? cell(r, personCols) : [firstName, lastName].filter(Boolean).join(" ");
    // A city and a state in two columns read as "Lagos, Lagos State"; the same value twice is kept once.
    const places: string[] = [];
    for (const i of locationCols) {
      const v = (r[i] ?? "").trim();
      if (v && !places.some((p) => p.toLowerCase() === v.toLowerCase())) places.push(v);
    }
    const location = places.join(", ");
    const country = cell(r, countryCols);
    const email = cell(r, emailCols);
    const rawTags = tagCols.map((i) => (r[i] ?? "").trim()).filter(Boolean).join(";");
    if (company) row.company = company;
    if (person) row.person = person;
    if (firstName) row.firstName = firstName;
    if (lastName) row.lastName = lastName;
    if (location) row.location = location;
    if (country) row.country = country;
    if (email) row.email = email;
    if (rawTags) {
      const tags = rawTags
        .split(/[;|,]/)
        .map((t) => t.trim())
        .filter(Boolean);
      if (tags.length) row.tags = tags;
    }
    out.push(row);
  }

  return {
    rows: out,
    detectedColumns,
    ignoredColumns,
    skippedNoPhone,
    delimiter,
    hadHeader,
    totalRows: table.length - start,
  };
}
