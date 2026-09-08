// Server-only env access. Never import this from client-facing code — it's
// meant to be used only inside createServerFn handlers, which TanStack Start
// strips from the client bundle.
//
// In local dev (`vite dev`, plain Node) this loads .env into process.env.
// In production (Cloudflare Worker) these come from `wrangler secret put` /
// vars instead, surfaced on process.env via the nodejs_compat_populate_process_env
// compatibility flag — dotenv's config() is a safe no-op there (no .env file
// ships in the deployed bundle, and it fails silently rather than throwing).
import "dotenv/config";

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export const env = {
  get databaseUrl() {
    return required("DATABASE_URL");
  },
  get authSecret() {
    return required("AUTH_SECRET");
  },
  get resendApiKey() {
    return process.env["RESEND_API_KEY"] || "";
  },
  get resendFromEmail() {
    return process.env["RESEND_FROM_EMAIL"] || "Kchel Dialer <onboarding@resend.dev>";
  },
  /** Bearer token for Telnyx Call Control commands (inbound IVR). */
  get telnyxApiKey() {
    return process.env["TELNYX_API_KEY"] || "";
  },
  /**
   * Base64 Ed25519 public key from the Telnyx portal, used to authenticate
   * inbound webhooks. Optional so a new deployment can be tested before it's
   * set — src/backend/inbound.ts logs loudly while it's missing.
   */
  get telnyxPublicKey() {
    return process.env["TELNYX_PUBLIC_KEY"] || "";
  },
};
