// Stateless, HMAC-signed session tokens (no session table needed). Uses Web
// Crypto so it runs unmodified in both Node (local dev) and the Cloudflare
// Workers runtime (deployed).
import { env } from "./env";
import { base64urlToBytes, bytesToBase64url } from "./base64";

export interface TokenPayload {
  sub: string;
  email: string;
  role: string;
  tenantId: string | null;
  isSuperAdmin: boolean;
  workspaceSlug: string | null;
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

export async function signToken(payload: Omit<TokenPayload, "exp">): Promise<string> {
  const full: TokenPayload = { ...payload, exp: Math.floor(Date.now() / 1000) + TOKEN_TTL_SECONDS };
  const body = bytesToBase64url(new TextEncoder().encode(JSON.stringify(full)));
  const key = await hmacKey();
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body));
  return `${body}.${bytesToBase64url(new Uint8Array(signature))}`;
}

export async function verifyToken(token: string | undefined | null): Promise<TokenPayload | null> {
  if (!token) return null;
  const [body, signature] = token.split(".");
  if (!body || !signature) return null;

  // Derived OUTSIDE the try on purpose. If AUTH_SECRET is missing this throws,
  // and swallowing it below would report a configuration failure as "not
  // signed in" — which sends you hunting for an auth bug that doesn't exist.
  const key = await hmacKey();

  try {
    const valid = await crypto.subtle.verify(
      "HMAC",
      key,
      base64urlToBytes(signature) as BufferSource,
      new TextEncoder().encode(body),
    );
    if (!valid) return null;

    const payload = JSON.parse(new TextDecoder().decode(base64urlToBytes(body))) as TokenPayload;
    if (payload.exp * 1000 < Date.now()) return null;
    return payload;
  } catch {
    // A malformed or tampered token is a genuine auth failure.
    return null;
  }
}
