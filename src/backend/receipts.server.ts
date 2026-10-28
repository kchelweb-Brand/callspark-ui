// Payment receipts: the screenshot or PDF a customer attaches to "I've paid", so the
// owner can check a crypto, gift-card or bank payment against it.
//
// A receipt is kept in the database and opened through an address that carries a
// signature only this server can make. The address goes into the support ticket the
// customer's claim creates, so the owner (and the customer who made it) can open it
// and nobody can guess another one. Server-only.

import { env } from "./env";
import { sql } from "./db";
import { bytesToBase64url } from "./base64";
import { ensureSchema } from "./schema.server";

export const RECEIPT_PATH = "/api/payments/receipt";

/** What a receipt may be, with the first bytes each kind of file starts with. */
const KINDS: { type: string; starts: number[][] }[] = [
  { type: "image/jpeg", starts: [[0xff, 0xd8, 0xff]] },
  { type: "image/png", starts: [[0x89, 0x50, 0x4e, 0x47]] },
  { type: "image/webp", starts: [[0x52, 0x49, 0x46, 0x46]] },
  { type: "application/pdf", starts: [[0x25, 0x50, 0x44, 0x46]] },
];

export const MAX_RECEIPT_BYTES = 2_000_000;

export interface ReceiptUpload {
  name: string;
  type: string;
  /** The file's bytes, base64 (no "data:" prefix). */
  data: string;
}

async function signature(id: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(env.authSecret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`receipt:${id}`));
  return bytesToBase64url(new Uint8Array(mac)).slice(0, 32);
}

/** The path that opens one receipt. */
export async function receiptPath(id: string): Promise<string> {
  return `${RECEIPT_PATH}?id=${id}&k=${await signature(id)}`;
}

function fromBase64(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** Checks the file is what it says it is, then keeps it. Returns the path to open it. */
export async function saveReceipt(tenantId: string, upload: ReceiptUpload): Promise<string> {
  const kind = KINDS.find((k) => k.type === upload.type);
  if (!kind) throw new Error("Attach the receipt as a picture (JPG, PNG, WebP) or a PDF.");
  // Rough size first, so a huge upload is never decoded.
  if (typeof upload.data !== "string" || upload.data.length > MAX_RECEIPT_BYTES * 1.4) {
    throw new Error("That receipt is too large. Use a screenshot under 2 MB.");
  }
  let bytes: Uint8Array;
  try {
    bytes = fromBase64(upload.data);
  } catch {
    throw new Error("That receipt couldn't be read. Try attaching it again.");
  }
  if (bytes.length === 0) throw new Error("That receipt is empty.");
  if (bytes.length > MAX_RECEIPT_BYTES) throw new Error("That receipt is too large. Use a screenshot under 2 MB.");
  if (!kind.starts.some((s) => s.every((b, i) => bytes[i] === b))) {
    throw new Error("That file isn't really a picture or PDF. Attach the screenshot or PDF of your receipt.");
  }

  await ensureSchema();
  const filename = String(upload.name ?? "receipt").replace(/[^\w.\- ]+/g, "").slice(0, 80) || "receipt";
  const rows = await sql`
    insert into payment_receipts (tenant_id, filename, content_type, size, data)
    values (${tenantId}, ${filename}, ${upload.type}, ${bytes.length}, decode(${upload.data}, 'base64'))
    returning id
  `;
  return receiptPath(String((rows[0] as { id: string }).id));
}

/** Answers a request for /api/payments/receipt?id=…&k=…. */
export async function serveReceipt(url: URL): Promise<Response> {
  const id = url.searchParams.get("id") ?? "";
  const k = url.searchParams.get("k") ?? "";
  if (!/^[0-9a-f-]{36}$/i.test(id) || k.length !== 32 || k !== (await signature(id))) {
    return new Response("Not found", { status: 404 });
  }
  await ensureSchema();
  const rows = await sql`select content_type, filename, encode(data, 'base64') as data from payment_receipts where id = ${id} limit 1`;
  const row = rows[0] as { content_type: string; filename: string; data: string } | undefined;
  if (!row) return new Response("Not found", { status: 404 });
  return new Response(fromBase64(row.data) as unknown as BodyInit, {
    headers: {
      "content-type": row.content_type,
      "content-disposition": `inline; filename="${row.filename.replace(/"/g, "")}"`,
      // A receipt is only ever shown, never run: no sniffing, no scripts, not stored by caches.
      "x-content-type-options": "nosniff",
      "content-security-policy": "default-src 'none'; img-src data:; style-src 'unsafe-inline'; sandbox",
      "cache-control": "private, no-store",
    },
  });
}
