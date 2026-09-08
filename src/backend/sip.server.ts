import { createServerFn } from "@tanstack/react-start";

import { sql } from "./db";
import { verifyToken } from "./tokens";
import { encryptSecret } from "./crypto";

async function requireTenant(token: string): Promise<string> {
  const payload = await verifyToken(token);
  if (!payload || !payload.tenantId) throw new Error("Not signed in.");
  return payload.tenantId;
}

export type SipMode = "managed" | "byo";
export type SipStatus = "pending" | "active" | "failed" | "disabled";

/**
 * How the trunk is reached.
 *
 * Only `wss` can be used by the browser softphone — a web page cannot open a
 * UDP or raw TCP socket, so those transports are unreachable from a tab no
 * matter what the carrier supports. They are still worth storing: the carrier
 * can dial them as a SIP destination on our behalf.
 */
export type SipTransport = "wss" | "tls" | "tcp" | "udp";

const TRANSPORTS: SipTransport[] = ["wss", "tls", "tcp", "udp"];

/** Standard SIP ports, used when the carrier didn't specify one. */
const DEFAULT_PORTS: Record<SipTransport, number | null> = {
  wss: null, // carried in the WebSocket URL
  tls: 5061,
  tcp: 5060,
  udp: 5060,
};

/**
 * What the browser is allowed to see. Deliberately excludes the password —
 * callers get `hasPassword` instead so the UI can show a "saved" state
 * without the secret ever crossing the wire.
 */
export interface SipConnectionView {
  id: string;
  mode: SipMode;
  label: string;
  status: SipStatus;
  sip_host: string | null;
  sip_port: number | null;
  sip_username: string | null;
  sip_realm: string | null;
  sip_wss_url: string | null;
  sip_transport: SipTransport;
  /** True when an agent's browser can register with this trunk directly. */
  browserReachable: boolean;
  hasPassword: boolean;
  telnyx_connection_id: string | null;
  last_registered_at: string | null;
  last_error: string | null;
  created_at: string;
}

interface SipRow extends Omit<SipConnectionView, "hasPassword" | "browserReachable"> {
  sip_password_enc: string | null;
}

function toView(row: SipRow): SipConnectionView {
  const { sip_password_enc, ...rest } = row;
  const transport = normalizeTransport(row.sip_transport);
  return {
    ...rest,
    sip_transport: transport,
    browserReachable: transport === "wss" && Boolean(row.sip_wss_url),
    hasPassword: Boolean(sip_password_enc),
  };
}

function normalizeTransport(value: string | null | undefined): SipTransport {
  const lower = (value ?? "").toLowerCase() as SipTransport;
  return TRANSPORTS.includes(lower) ? lower : "wss";
}

/**
 * Browsers can only speak WebRTC, so a bring-your-own trunk is reachable from
 * the dialer only if the carrier exposes SIP over secure WebSocket. Rejecting
 * a plain `sip:` host here saves the tenant from a connection that would look
 * saved but never actually register.
 */
function validateWssUrl(url: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return "Enter a full WebSocket URL, e.g. wss://sip.yourprovider.com:443";
  }
  if (parsed.protocol === "ws:") {
    return "Insecure ws:// is not allowed — browsers block it on HTTPS pages. Use wss://";
  }
  if (parsed.protocol !== "wss:") {
    return "The WebSocket URL must start with wss://";
  }
  return null;
}

/** Everything saveByoSip needs, already validated and defaulted. */
export interface ResolvedByoSip {
  label: string;
  effectiveHost: string;
  username: string;
  wssUrl: string;
  transport: SipTransport;
  realm: string | null;
  port: number | null;
}

export interface ByoSipInputShape {
  label?: string;
  sipHost?: string;
  sipWssUrl?: string;
  sipUsername?: string;
  sipRealm?: string;
  sipPort?: number;
  sipTransport?: string;
}

/**
 * Validates and normalizes bring-your-own SIP details.
 *
 * Kept pure and exported so the rules can be exercised directly — a server
 * function can only run inside the Start runtime, which would otherwise put
 * this logic out of reach of any test.
 */
export function resolveByoSipInput(data: ByoSipInputShape): ResolvedByoSip {
  const label = (data.label ?? "").trim() || "My SIP trunk";
  const host = (data.sipHost ?? "").trim();
  const username = (data.sipUsername ?? "").trim();
  const wssUrl = (data.sipWssUrl ?? "").trim();
  const transport = normalizeTransport(data.sipTransport);

  if (!username) throw new Error("SIP username is required.");

  // WebSocket trunks carry the host inside the URL; every other transport
  // needs an explicit host to dial.
  if (transport === "wss") {
    const wssIssue = validateWssUrl(wssUrl);
    if (wssIssue) throw new Error(wssIssue);
  } else if (!host) {
    throw new Error("SIP host is required for UDP, TCP and TLS trunks.");
  }

  const port = data.sipPort ?? DEFAULT_PORTS[transport];
  if (port !== null && (!Number.isInteger(port) || port < 1 || port > 65535)) {
    throw new Error("Port must be a whole number between 1 and 65535.");
  }

  // A wss trunk derives its host from the URL, so the softphone and the
  // inbound router agree on one SIP domain.
  const effectiveHost = host || (transport === "wss" ? new URL(wssUrl).hostname : "");

  return { label, effectiveHost, username, wssUrl, transport, realm: data.sipRealm?.trim() || null, port };
}

// ---------- read ----------

export const getSipConnectionFn = createServerFn({ method: "POST" })
  .validator((data: { token: string }) => data)
  .handler(async ({ data }) => {
    const tenantId = await requireTenant(data.token);
    const rows = await sql`
      select id, mode, label, status, sip_host, sip_port, sip_username, sip_realm,
             sip_wss_url, sip_transport, sip_password_enc, telnyx_connection_id,
             last_registered_at, last_error, created_at
      from sip_connections where tenant_id = ${tenantId} limit 1
    `;
    const row = rows[0] as unknown as SipRow | undefined;
    return { ok: true as const, connection: row ? toView(row) : null };
  });

// ---------- bring your own ----------

export const saveByoSipFn = createServerFn({ method: "POST" })
  .validator(
    (data: {
      token: string;
      label: string;
      sipHost: string;
      sipWssUrl: string;
      sipUsername: string;
      sipPassword?: string;
      sipRealm?: string;
      sipPort?: number;
      sipTransport?: string;
    }) => data,
  )
  .handler(async ({ data }) => {
    const tenantId = await requireTenant(data.token);

    const { label, effectiveHost, username, wssUrl, transport, realm, port } =
      resolveByoSipInput(data);

    const existing = await sql`
      select id, sip_password_enc from sip_connections where tenant_id = ${tenantId} limit 1
    `;
    const current = existing[0] as { id: string; sip_password_enc: string | null } | undefined;

    // An empty password on edit means "leave the saved one alone" — the UI
    // never receives the old value, so it can't send it back.
    let passwordEnc = current?.sip_password_enc ?? null;
    if (data.sipPassword && data.sipPassword.length > 0) {
      passwordEnc = await encryptSecret(data.sipPassword);
    }
    if (!passwordEnc) throw new Error("SIP password is required.");

    if (current) {
      await sql`
        update sip_connections set
          mode = 'byo', label = ${label}, sip_host = ${effectiveHost},
          sip_wss_url = ${wssUrl || null}, sip_transport = ${transport},
          sip_username = ${username}, sip_password_enc = ${passwordEnc},
          sip_realm = ${realm}, sip_port = ${port},
          status = 'pending', last_error = null, updated_at = now()
        where id = ${current.id}
      `;
    } else {
      await sql`
        insert into sip_connections
          (tenant_id, mode, label, sip_host, sip_wss_url, sip_transport, sip_username,
           sip_password_enc, sip_realm, sip_port, status)
        values
          (${tenantId}, 'byo', ${label}, ${effectiveHost}, ${wssUrl || null}, ${transport},
           ${username}, ${passwordEnc}, ${realm}, ${port}, 'pending')
      `;
    }

    const rows = await sql`
      select id, mode, label, status, sip_host, sip_port, sip_username, sip_realm,
             sip_wss_url, sip_transport, sip_password_enc, telnyx_connection_id,
             last_registered_at, last_error, created_at
      from sip_connections where tenant_id = ${tenantId} limit 1
    `;
    return { ok: true as const, connection: toView(rows[0] as unknown as SipRow) };
  });

export const deleteSipConnectionFn = createServerFn({ method: "POST" })
  .validator((data: { token: string }) => data)
  .handler(async ({ data }) => {
    const tenantId = await requireTenant(data.token);
    await sql`delete from sip_connections where tenant_id = ${tenantId}`;
    return { ok: true as const };
  });

// ---------- wallet (managed mode) ----------

export const getWalletFn = createServerFn({ method: "POST" })
  .validator((data: { token: string }) => data)
  .handler(async ({ data }) => {
    const tenantId = await requireTenant(data.token);

    const rows = await sql`
      select balance_cents, currency, spend_cap_cents
      from tenant_wallets where tenant_id = ${tenantId} limit 1
    `;
    const row = rows[0] as
      | { balance_cents: string | number; currency: string; spend_cap_cents: string | number | null }
      | undefined;

    const recent = await sql`
      select amount_cents, kind, description, created_at
      from wallet_transactions where tenant_id = ${tenantId}
      order by created_at desc limit 10
    `;

    return {
      ok: true as const,
      // bigint columns arrive as strings from the driver — normalise to number.
      balanceCents: Number(row?.balance_cents ?? 0),
      currency: row?.currency ?? "USD",
      spendCapCents: row?.spend_cap_cents == null ? null : Number(row.spend_cap_cents),
      transactions: (
        recent as unknown as {
          amount_cents: string | number;
          kind: string;
          description: string | null;
          created_at: string;
        }[]
      ).map((t) => ({
        amountCents: Number(t.amount_cents),
        kind: t.kind,
        description: t.description,
        createdAt: t.created_at,
      })),
    };
  });
