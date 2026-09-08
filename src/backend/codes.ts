// One-time login/verification codes: 6 digits, hashed at rest, short-lived.
export const CODE_TTL_MINUTES = 10;
const MAX_ATTEMPTS = 5;

export function generateCode(): string {
  // crypto.getRandomValues avoids Math.random()'s weak guarantees.
  const bytes = new Uint32Array(1);
  crypto.getRandomValues(bytes);
  const code = (bytes[0] as number) % 1_000_000;
  return String(code).padStart(6, "0");
}

async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** Hashes are salted with email+purpose so the same 6-digit code never hashes
 *  the same way across two different requests. */
export function hashCode(email: string, purpose: string, code: string): Promise<string> {
  return sha256Hex(`${email.toLowerCase()}:${purpose}:${code}`);
}

export function isAttemptsExceeded(attemptCount: number): boolean {
  return attemptCount >= MAX_ATTEMPTS;
}
