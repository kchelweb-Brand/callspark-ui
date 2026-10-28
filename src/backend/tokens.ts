// Stateless, HMAC-signed session tokens (no session table needed). Uses Web
// Crypto so it runs unmodified in both Node (local dev) and the Cloudflare
// Workers runtime (deployed).
import { env } from "./env";
import { base64urlToBytes, bytesToBase64url } from "./base64";
import { sql } from "./db";
import { ensureSchema } from "./schema.server";
import { normalizePermissions, type AgentPermissions } from "./permissions";

export interface TokenPayload {
  sub: string;
  email: string;
  role: string;
  tenantId: string | null;
  isSuperAdmin: boolean;
  workspaceSlug: string | null;
  /** True for an invited agent. Such tokens are refused everywhere unless the caller opts in. */
  agent?: boolean;
  /** Present on a verified agent token: the owner's current settings, read fresh from the database. */
  permissions?: AgentPermissions;
  exp: number; // unix seconds
}

async function hmacKey() {
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(env.authSecret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

const TOKEN_TTL_SECONDS = 60 * 60 * 24; // 24h ceiling — the frontend already
// signs users out after 10 minutes idle; this is just an outer bound.

export async function signToken(
  payload: Omit<TokenPayload, "exp" | "permissions">,
  ttlSeconds: number = TOKEN_TTL_SECONDS,
): Promise<string> {
  const full: TokenPayload = { ...payload, exp: Math.floor(Date.now() / 1000) + ttlSeconds };
  const body = bytesToBase64url(new TextEncoder().encode(JSON.stringify(full)));
  const key = await hmacKey();
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body));
  return `${body}.${bytesToBase64url(new Uint8Array(signature))}`;
}

export interface VerifyOptions {
  /**
   * Agent tokens are denied by default. Only the handful of functions an agent
   * is meant to use pass this, so every other function (billing, phone system,
   * settings, team management…) stays owner-only without having to be audited
   * one by one, and any function added later is closed to agents until someone
   * deliberately opens it.
   */
  allowAgent?: boolean;
}

export async function verifyToken(
  token: string | undefined | null,
  options: VerifyOptions = {},
): Promise<TokenPayload | null> {
  if (!token) return null;
  const [body, signature] = token.split(".");
  if (!body || !signature) return null;

  // Derived OUTSIDE the try on purpose. If AUTH_SECRET is missing this throws,
  // and swallowing it below would report a configuration failure as "not
  // signed in" — which sends you hunting for an auth bug that doesn't exist.
  const key = await hmacKey();

  let payload: TokenPayload;
  try {
    const valid = await crypto.subtle.verify(
      "HMAC",
      key,
      base64urlToBytes(signature) as BufferSource,
      new TextEncoder().encode(body),
    );
    if (!valid) return null;

    payload = JSON.parse(new TextDecoder().decode(base64urlToBytes(body))) as TokenPayload;
    if (payload.exp * 1000 < Date.now()) return null;
  } catch {
    // A malformed or tampered token is a genuine auth failure.
    return null;
  }

  if (!payload.agent) return payload;
  if (!options.allowAgent || !payload.tenantId) return null;

  // An agent's access can be switched off or narrowed at any moment, so the
  // 24-hour token is never trusted on its own: the owner's current settings are
  // read on every request.
  await ensureSchema();
  const rows = await sql`
    select status, permissions from users
    where id = ${payload.sub} and tenant_id = ${payload.tenantId} and role = 'agent' limit 1
  `;
  const row = rows[0] as { status: string; permissions: unknown } | undefined;
  if (!row || row.status === "disabled") return null;
  return { ...payload, permissions: normalizePermissions(row.permissions) };
}
