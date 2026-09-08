import { createServerFn } from "@tanstack/react-start";

import { sql } from "./db";
import { verifyToken } from "./tokens";
import { decryptSecret } from "./crypto";

/**
 * Hands an agent's browser the credentials it needs to register with the
 * carrier over SIP-over-WebSocket.
 *
 * SECURITY NOTE: this necessarily returns the SIP password in plaintext. With
 * client-side SIP the browser *is* the SIP endpoint, so it must authenticate
 * directly with the carrier — there is no way to keep the secret server-side
 * and still place a call from a browser tab. Mitigations:
 *   - only ever returned to a signed-in user of the owning tenant
 *   - only over HTTPS
 *   - held in memory by the caller; never written to storage (see softphone.ts)
 *
 * When managed mode lands, Telnyx on-demand credentials let us issue a
 * short-lived token instead of a standing password — better, but not available
 * for bring-your-own carriers.
 */
export const getAgentSipConfigFn = createServerFn({ method: "POST" })
  .validator((data: { token: string }) => data)
  .handler(async ({ data }) => {
    const payload = await verifyToken(data.token);
    if (!payload || !payload.tenantId) throw new Error("Not signed in.");

    const rows = await sql`
      select mode, label, sip_host, sip_port, sip_username, sip_password_enc,
             sip_realm, sip_wss_url, sip_transport, status
      from sip_connections where tenant_id = ${payload.tenantId} limit 1
    `;
    const row = rows[0] as
      | {
          mode: string;
          label: string;
          sip_host: string | null;
          sip_port: number | null;
          sip_username: string | null;
          sip_password_enc: string | null;
          sip_realm: string | null;
          sip_wss_url: string | null;
          sip_transport: string | null;
          status: string;
        }
      | undefined;

    if (!row) {
      throw new Error("No SIP connection set up yet. Add one under Phone System → Connection.");
    }

    // A browser can only speak SIP over WebSocket — it has no way to open a
    // UDP or raw TCP socket. Saying so plainly beats letting the user watch a
    // registration fail with a transport error they can't act on.
    const transport = (row.sip_transport ?? "wss").toLowerCase();
    if (transport !== "wss") {
      throw new Error(
        `This trunk uses SIP over ${transport.toUpperCase()}, which a browser cannot connect to directly — ` +
          "browsers can only open WebSocket connections. Ask your carrier for their SIP-over-WSS " +
          "(sometimes called WebRTC) endpoint and add it under Phone System → Connection. Until then " +
          "this trunk can still receive calls routed to it by your carrier.",
      );
    }

    if (!row.sip_wss_url || !row.sip_username || !row.sip_password_enc) {
      throw new Error("This connection is missing credentials. Re-save it under Phone System → Connection.");
    }

    const password = await decryptSecret(row.sip_password_enc);
    if (password === null) {
      // Happens if AUTH_SECRET was rotated after the credential was stored.
      throw new Error("Stored credentials could not be read. Please re-enter your SIP password.");
    }

    return {
      ok: true as const,
      config: {
        label: row.label,
        wssUrl: row.sip_wss_url,
        // Fall back to the WSS hostname when no explicit SIP domain was given.
        host: row.sip_host || new URL(row.sip_wss_url).hostname,
        username: row.sip_username,
        password,
        realm: row.sip_realm,
      },
    };
  });

/** Records the outcome of a registration attempt so the Connection tab can show real status. */
export const reportRegistrationFn = createServerFn({ method: "POST" })
  .validator((data: { token: string; success: boolean; error?: string }) => data)
  .handler(async ({ data }) => {
    const payload = await verifyToken(data.token);
    if (!payload || !payload.tenantId) throw new Error("Not signed in.");

    if (data.success) {
      await sql`
        update sip_connections
        set status = 'active', last_registered_at = now(), last_error = null, updated_at = now()
        where tenant_id = ${payload.tenantId}
      `;
    } else {
      await sql`
        update sip_connections
        set status = 'failed', last_error = ${data.error?.slice(0, 500) ?? "Registration failed"},
            updated_at = now()
        where tenant_id = ${payload.tenantId}
      `;
    }
    return { ok: true as const };
  });
