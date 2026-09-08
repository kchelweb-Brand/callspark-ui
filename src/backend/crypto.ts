// Symmetric encryption for stored carrier credentials.
//
// A tenant's SIP password is a live billing credential — anyone holding it can
// place calls on that tenant's carrier account. So it is encrypted at rest and
// only ever decrypted server-side when building an agent's connection config.
// It is never returned to the browser.
import { env } from "./env";
import { base64urlToBytes, bytesToBase64url } from "./base64";

// Domain-separates this key from the one signing session tokens, so the same
// AUTH_SECRET can back both without either weakening the other.
const KEY_LABEL = "kchel:sip-credential:v1";
const IV_BYTES = 12; // AES-GCM standard nonce length

async function encryptionKey(): Promise<CryptoKey> {
  const material = new TextEncoder().encode(`${KEY_LABEL}:${env.authSecret}`);
  const digest = await crypto.subtle.digest("SHA-256", material);
  return crypto.subtle.importKey("raw", digest, { name: "AES-GCM" }, false, [
    "encrypt",
    "decrypt",
  ]);
}

/** Returns base64url(iv || ciphertext). A fresh IV per call, as AES-GCM requires. */
export async function encryptSecret(plaintext: string): Promise<string> {
  const key = await encryptionKey();
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    new TextEncoder().encode(plaintext),
  );

  const packed = new Uint8Array(iv.length + ciphertext.byteLength);
  packed.set(iv, 0);
  packed.set(new Uint8Array(ciphertext), iv.length);
  return bytesToBase64url(packed);
}

/** Reverses encryptSecret. Returns null if the payload is corrupt or the key changed. */
export async function decryptSecret(packed: string): Promise<string | null> {
  try {
    const bytes = base64urlToBytes(packed);
    if (bytes.length <= IV_BYTES) return null;

    const key = await encryptionKey();
    const plaintext = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: bytes.slice(0, IV_BYTES) as BufferSource },
      key,
      bytes.slice(IV_BYTES) as BufferSource,
    );
    return new TextDecoder().decode(plaintext);
  } catch {
    return null;
  }
}
