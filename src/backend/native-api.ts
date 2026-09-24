// Plain REST routes for the native desktop dialer (Electron + baresip).
//
// The native app is not a browser, so it can't use TanStack Start's internal
// server-function RPC (that wire format is undocumented and its URL is a
// build-specific hash). Instead it talks to these fixed, plain-JSON paths —
// mounted in src/server.ts exactly like the SignalWire/Telnyx webhook routes.
//
// Every handler here is a thin pass-through to the SAME exported functions
// the web app already uses (auth.server.ts, calls.server.ts,
// webrtc.server.ts), so calls placed from the desktop app land in the same
// `calls` table and show up in Call History/Recordings like any other call.
import { sql } from "./db";
import { verifyToken } from "./tokens";
import { decryptSecret } from "./crypto";
import { requestLoginCode, verifyLoginCode } from "./auth.server";
import { startCall, answerCall, endCall } from "./calls.server";
import { reportRegistration } from "./webrtc.server";
import { isDialerAddonEnabled } from "./addons.server";

export const NATIVE_API_PREFIX = "/api/native/";

async function readJson<T>(request: Request): Promise<T> {
  try {
    return (await request.json()) as T;
  } catch {
    throw new Error("Invalid JSON body.");
  }
}

function jsonOk(data: unknown): Response {
  return new Response(JSON.stringify({ ok: true, ...(data as object) }), {
    headers: { "content-type": "application/json" },
  });
}

function jsonError(error: unknown): Response {
  const message = error instanceof Error ? error.message : "Something went wrong.";
  const status = message === "Not signed in." ? 401 : 400;
  return new Response(JSON.stringify({ ok: false, error: message }), {
    status,
    headers: { "content-type": "application/json" },
  });
}

/**
 * Bypasses getAgentSipConfigFn's WSS-only guard — a native client opens a
 * real UDP/TCP/TLS SIP socket directly, so the browser's "WebSocket only"
 * restriction (and the iceServers it hands back for WebRTC) don't apply.
 */
async function getNativeSipConfig(token: string) {
  const payload = await verifyToken(token);
  if (!payload || !payload.tenantId) throw new Error("Not signed in.");

  const rows = await sql`
    select label, sip_host, sip_port, sip_username, sip_password_enc, sip_realm, sip_transport, status
    from sip_connections where tenant_id = ${payload.tenantId} limit 1
  `;
  const row = rows[0] as
    | {
        label: string;
        sip_host: string | null;
        sip_port: number | null;
        sip_username: string | null;
        sip_password_enc: string | null;
        sip_realm: string | null;
        sip_transport: string | null;
        status: string;
      }
    | undefined;

  if (!row) {
    throw new Error("No SIP connection set up yet. Add one under Phone System → Connection.");
  }
  if (!row.sip_host || !row.sip_username || !row.sip_password_enc) {
    throw new Error("This connection is missing credentials. Re-save it under Phone System → Connection.");
  }

  const password = await decryptSecret(row.sip_password_enc);
  if (password === null) {
    throw new Error("Stored credentials could not be read. Please re-enter your SIP password.");
  }

  return {
    label: row.label,
    host: row.sip_host,
    port: row.sip_port || 5060,
    username: row.sip_username,
    password,
    realm: row.sip_realm,
    transport: (row.sip_transport ?? "udp").toLowerCase(),
  };
}

export async function handleNativeApi(request: Request, pathname: string): Promise<Response> {
  if (request.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const route = pathname.slice(NATIVE_API_PREFIX.length);

  try {
    switch (route) {
      case "login/request-code": {
        const body = await readJson<{ email: string; workspaceSlug: string }>(request);
        const result = await requestLoginCode({
          email: body.email,
          purpose: "login",
          workspaceSlug: body.workspaceSlug,
        });
        return jsonOk(result);
      }

      case "login/verify-code": {
        const body = await readJson<{ email: string; code: string }>(request);
        const result = await verifyLoginCode({ email: body.email, code: body.code, purpose: "login" });

        // The Desktop Dialer is a paid add-on, not bundled into any plan —
        // gating it here (not just hiding the download link) means a
        // forwarded installer is useless without it, since login itself
        // refuses to hand back a usable token.
        const tenantId = result.user.tenant_id;
        if (!tenantId || !(await isDialerAddonEnabled(tenantId))) {
          return jsonError(
            new Error(
              "The Desktop Dialer add-on isn't enabled on your account. Go to Billing on the website to request it.",
            ),
          );
        }

        return jsonOk(result);
      }

      case "sip-config": {
        const body = await readJson<{ token: string }>(request);
        const config = await getNativeSipConfig(body.token);
        return jsonOk({ config });
      }

      case "calls/start": {
        const body = await readJson<{
          token: string;
          direction: "outbound" | "inbound";
          toNumber?: string;
          fromNumber?: string;
          contactId?: string;
        }>(request);
        const result = await startCall(body);
        return jsonOk(result);
      }

      case "calls/answer": {
        const body = await readJson<{ token: string; callId: string }>(request);
        const result = await answerCall(body);
        return jsonOk(result);
      }

      case "calls/end": {
        const body = await readJson<{
          token: string;
          callId: string;
          status?: string;
          outcome?: string;
          error?: string;
        }>(request);
        const result = await endCall(body);
        return jsonOk(result);
      }

      case "calls/recent": {
        const body = await readJson<{ token: string }>(request);
        const payload = await verifyToken(body.token);
        if (!payload || !payload.tenantId) throw new Error("Not signed in.");

        const rows = await sql`
          select c.id, c.direction, c.from_number, c.to_number,
                 coalesce(ct.company, ct.person) as contact_name,
                 c.status, c.outcome, c.started_at, c.duration_seconds
          from calls c
          left join contacts ct on ct.id = c.contact_id
          where c.tenant_id = ${payload.tenantId}
          order by c.started_at desc
          limit 5
        `;
        return jsonOk({ calls: rows });
      }

      case "registration": {
        const body = await readJson<{ token: string; success: boolean; error?: string }>(request);
        const result = await reportRegistration(body);
        return jsonOk(result);
      }

      default:
        return new Response("Not found", { status: 404 });
    }
  } catch (error) {
    return jsonError(error);
  }
}
