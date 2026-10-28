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
import { startCall, answerCall, endCall, prepareDialNumber } from "./calls.server";
import { reportRegistration } from "./webrtc.server";
import { isDialerAddonEnabled } from "./addons.server";
import { listContacts, getContactsMeta, createContact, importContacts, deleteContacts } from "./contacts.server";
import {
  listCampaigns,
  createCampaign,
  updateCampaign,
  duplicateCampaign,
  deleteCampaign,
} from "./campaigns.server";
import { reviewCampaignPrompt } from "./prompt-review";
import {
  getCampaignOutcomes,
  recallCampaign,
  sampleAiCall,
  listAppointments,
  setAppointmentStatus,
} from "./campaign-dialer";
import {
  AI_MODELS,
  AI_OUTCOMES,
  AI_STYLES,
  AI_TIER_NOTE,
  AI_VOICEMAIL,
  AI_VOICES,
  DEFAULT_AI_SETTINGS,
} from "./ai-agent-options";
import {
  startCampaignDialing,
  pauseCampaignDialing,
  reconcileCampaign,
  getCampaignCallLog,
} from "./campaign-dialer";
import { getPhoneSystem, savePhoneSystem, savePhoneNumbers } from "./phone-system.server";
import { getSipConnection, saveByoSip, deleteSipConnection } from "./sip.server";
import {
  getTenantSettings,
  saveTenantSettings,
  createMyTicket,
  listSms,
  createSmsCampaign,
  updateSmsCampaign,
  saveSmsDraft,
  deleteSmsDraft,
} from "./workspace.server";
import { getOverview, getAnalytics, getLiveFloor, listRecordings } from "./metrics.server";
import { listAgents, createAgent, updateAgent, deleteAgent } from "./agents.server";
import { listCalls } from "./calls.server";
import { listPlans, getPlanUsage } from "./billing.server";
import { claimPayment, deletePaymentLink, listPaymentLinks, savePaymentLink } from "./payments.server";
import { getAddonStatus, requestDialerAddon, requestSipAddon, setDialerAddon, setSipAddon } from "./addons.server";
import {
  getPlatformOverview,
  getPlatformRevenue,
  getPlatformHealth,
  listTickets,
  createTicket,
  updateTicket,
  deleteTicket,
} from "./admin.server";
import { listTenants, setTenantStatus } from "./auth.server";
import {
  listConversations,
  getConversation,
  replyAsSupport,
  listMyConversations,
  getMyConversation,
  replyAsCustomer,
} from "./support.server";
import { requestPlanUpgrade } from "./billing.server";
import { getAutomations, saveAutomations, listAutoTexts } from "./automation.server";
import { getNumberHealth, restNumber } from "./reputation.server";
import { summarizeCall, getCallSummary } from "./call-summary.server";
import { powerStart, powerNext, powerResult, powerStop, listPowerCampaigns } from "./power-dialer.server";
import { resendInvite } from "./agents.server";
import { listTasks, createTask, updateTask, deleteTask } from "./tasks.server";
import { listThreads, getThread, sendMessage } from "./messages.server";
import { listNotifications, markNotificationsRead } from "./notifications.server";
import { getAgentHome } from "./agent-home.server";
import { previewAudience, sendBroadcast, listBroadcasts } from "./broadcast.server";

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
  const payload = await verifyToken(token, { allowAgent: true });
  if (!payload || !payload.tenantId) throw new Error("Not signed in.");
  if (payload.agent && !payload.permissions?.dial) throw new Error("You don't have permission to place calls.");

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
        const body = await readJson<{ email: string; code: string; workspaceSlug?: string }>(request);
        const result = await verifyLoginCode({
          email: body.email,
          code: body.code,
          purpose: "login",
          ...(body.workspaceSlug ? { workspaceSlug: body.workspaceSlug } : {}),
        });

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
        // The desktop softphone dials through the workspace's SIP trunk, which
        // sets the caller ID. Record which number that is when there is only one
        // possibility, so number health can attribute these calls.
        if (body.direction === "outbound" && !body.fromNumber) {
          const payload = await verifyToken(body.token);
          if (payload?.tenantId) {
            const owned = await sql`
              select number from phone_numbers where tenant_id = ${payload.tenantId} and status = 'Active' limit 2
            `;
            if (owned.length === 1) body.fromNumber = (owned[0] as { number: string }).number;
          }
        }
        const result = await startCall(body);
        return jsonOk(result);
      }

      case "calls/prepare": {
        const body = await readJson<{ token: string; number: string }>(request);
        return jsonOk(await prepareDialNumber(body));
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
        const payload = await verifyToken(body.token, { allowAgent: true });
        if (!payload || !payload.tenantId) throw new Error("Not signed in.");
        // An agent's recents are their own calls.
        const onlyMine = Boolean(payload.agent) && payload.permissions?.callHistory !== "all";

        const rows = await sql`
          select c.id, c.direction, c.from_number, c.to_number,
                 coalesce(ct.company, ct.person) as contact_name,
                 c.status, c.outcome, c.started_at, c.duration_seconds
          from calls c
          left join contacts ct on ct.id = c.contact_id
          where c.tenant_id = ${payload.tenantId}
            and (${onlyMine}::boolean = false or c.agent_email = ${payload.email})
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

      // ---------- contacts ----------
      case "contacts/list":
        return jsonOk(await listContacts(await readJson(request)));
      case "contacts/meta":
        return jsonOk(await getContactsMeta(await readJson(request)));
      case "contacts/create":
        return jsonOk(await createContact(await readJson(request)));
      case "contacts/import":
        return jsonOk(await importContacts(await readJson(request)));
      case "contacts/delete":
        return jsonOk(await deleteContacts(await readJson(request)));

      // ---------- campaigns ----------
      case "campaigns/list":
        return jsonOk(await listCampaigns(await readJson(request)));
      case "campaigns/create":
        return jsonOk(await createCampaign(await readJson(request)));
      case "campaigns/update":
        return jsonOk(await updateCampaign(await readJson(request)));
      case "campaigns/duplicate":
        return jsonOk(await duplicateCampaign(await readJson(request)));
      case "campaigns/delete":
        return jsonOk(await deleteCampaign(await readJson(request)));
      case "campaigns/review-prompt":
        return jsonOk(await reviewCampaignPrompt(await readJson(request)));
      case "campaigns/start-dialing":
        return jsonOk(await startCampaignDialing(await readJson(request)));
      case "campaigns/pause-dialing":
        return jsonOk(await pauseCampaignDialing(await readJson(request)));
      case "campaigns/reconcile":
        return jsonOk(await reconcileCampaign(await readJson(request)));
      case "campaigns/call-log":
        return jsonOk(await getCampaignCallLog(await readJson(request)));
      case "campaigns/outcomes":
        return jsonOk(await getCampaignOutcomes(await readJson(request)));
      case "campaigns/recall":
        return jsonOk(await recallCampaign(await readJson(request)));

      // ---------- AI voice agent: what can be chosen, hearing a voice, bookings ----------
      case "ai/options": {
        // Static, but only for a signed-in owner like every other settings route.
        const { token } = await readJson<{ token: string }>(request);
        const payload = await verifyToken(token);
        if (!payload?.tenantId) throw new Error("Not signed in.");
        return jsonOk({
          voices: AI_VOICES,
          tierNotes: AI_TIER_NOTE,
          styles: AI_STYLES,
          models: AI_MODELS,
          voicemail: AI_VOICEMAIL,
          outcomes: AI_OUTCOMES,
          defaults: DEFAULT_AI_SETTINGS,
        });
      }
      case "ai/sample": {
        const body = await readJson<{ token: string; settings: unknown; to: string }>(request);
        return jsonOk(await sampleAiCall({ ...body, origin: new URL(request.url).origin }));
      }
      case "ai/appointments":
        return jsonOk(await listAppointments(await readJson(request)));
      case "ai/appointment-status":
        return jsonOk(await setAppointmentStatus(await readJson(request)));

      // ---------- phone system / IVR (menus live inside the same config) ----------
      case "phone-system/get":
        return jsonOk(await getPhoneSystem(await readJson(request)));
      case "phone-system/save":
        return jsonOk(await savePhoneSystem(await readJson(request)));
      case "phone-system/save-numbers":
        return jsonOk(await savePhoneNumbers(await readJson(request)));

      // ---------- SIP configuration ----------
      case "sip/get":
        return jsonOk(await getSipConnection(await readJson(request)));
      case "sip/save-byo":
        return jsonOk(await saveByoSip(await readJson(request)));
      case "sip/delete":
        return jsonOk(await deleteSipConnection(await readJson(request)));

      // ---------- who am I (drives which screens the app shows) ----------
      case "me": {
        const body = await readJson<{ token: string }>(request);
        const payload = await verifyToken(body.token, { allowAgent: true });
        if (!payload || !payload.tenantId) throw new Error("Not signed in.");
        const admins = await sql`
          select 1 from users where email = ${payload.email} and is_super_admin = true limit 1
        `;
        return jsonOk({
          email: payload.email,
          role: payload.role,
          workspaceSlug: payload.workspaceSlug,
          isSuperAdmin: Boolean(payload.isSuperAdmin),
          canAdmin: Boolean(payload.isSuperAdmin) || admins.length > 0,
          isAgent: Boolean(payload.agent),
          permissions: payload.permissions ?? null,
        });
      }

      // ---------- dashboard pages ----------
      case "overview":
        return jsonOk(await getOverview(await readJson(request)));
      case "analytics":
        return jsonOk(await getAnalytics(await readJson(request)));
      case "live-floor":
        return jsonOk(await getLiveFloor(await readJson(request)));
      case "recordings/list":
        return jsonOk(await listRecordings(await readJson(request)));
      case "calls/list":
        return jsonOk(await listCalls(await readJson(request)));

      case "agents/list":
        return jsonOk(await listAgents(await readJson(request)));
      case "agents/create":
        return jsonOk(await createAgent(await readJson(request)));
      case "agents/update":
        return jsonOk(await updateAgent(await readJson(request)));
      case "agents/delete":
        return jsonOk(await deleteAgent(await readJson(request)));

      case "sms/list":
        return jsonOk(await listSms(await readJson(request)));
      case "sms/create-campaign":
        return jsonOk(await createSmsCampaign(await readJson(request)));
      case "sms/update-campaign":
        return jsonOk(await updateSmsCampaign(await readJson(request)));
      case "sms/save-draft":
        return jsonOk(await saveSmsDraft(await readJson(request)));
      case "sms/delete-draft":
        return jsonOk(await deleteSmsDraft(await readJson(request)));

      case "support/list":
        return jsonOk(await listMyConversations(await readJson(request)));
      case "support/create":
        return jsonOk(await createMyTicket(await readJson(request)));
      case "support/thread":
        return jsonOk(await getMyConversation(await readJson(request)));
      case "support/reply":
        return jsonOk(await replyAsCustomer(await readJson(request)));

      // ---------- automations: text-back, AI receptionist, rotation ----------
      case "automations/get":
        return jsonOk(await getAutomations(await readJson(request)));
      case "automations/save":
        return jsonOk(await saveAutomations(await readJson(request)));
      case "automations/texts":
        return jsonOk(await listAutoTexts(await readJson(request)));

      // ---------- number health ----------
      case "numbers/health":
        return jsonOk(await getNumberHealth(await readJson(request)));
      case "numbers/rest":
        return jsonOk(await restNumber(await readJson(request)));

      // ---------- call summaries ----------
      case "calls/summarize":
        return jsonOk(await summarizeCall(await readJson(request)));
      case "calls/summary":
        return jsonOk(await getCallSummary(await readJson(request)));

      // ---------- power dialer ----------
      // ---------- team: invites, tasks, messages, notifications ----------
      case "agents/resend-invite":
        return jsonOk(await resendInvite(await readJson(request)));
      case "agent/home":
        return jsonOk(await getAgentHome(await readJson(request)));
      case "power/campaigns":
        return jsonOk(await listPowerCampaigns(await readJson(request)));
      case "tasks/list":
        return jsonOk(await listTasks(await readJson(request)));
      case "tasks/create":
        return jsonOk(await createTask(await readJson(request)));
      case "tasks/update":
        return jsonOk(await updateTask(await readJson(request)));
      case "tasks/delete":
        return jsonOk(await deleteTask(await readJson(request)));
      case "messages/threads":
        return jsonOk(await listThreads(await readJson(request)));
      case "messages/thread":
        return jsonOk(await getThread(await readJson(request)));
      case "messages/send":
        return jsonOk(await sendMessage(await readJson(request)));
      case "notifications/list":
        return jsonOk(await listNotifications(await readJson(request)));
      case "notifications/read":
        return jsonOk(await markNotificationsRead(await readJson(request)));

      case "power/start":
        return jsonOk(await powerStart(await readJson(request)));
      case "power/next":
        return jsonOk(await powerNext(await readJson(request)));
      case "power/result":
        return jsonOk(await powerResult(await readJson(request)));
      case "power/stop":
        return jsonOk(await powerStop(await readJson(request)));

      case "billing/plans":
        return jsonOk(await listPlans(await readJson(request)));
      case "billing/usage":
        return jsonOk(await getPlanUsage(await readJson(request)));
      case "billing/addons":
        return jsonOk(await getAddonStatus(await readJson(request)));
      case "billing/request-dialer":
        return jsonOk(await requestDialerAddon(await readJson(request)));
      case "billing/request-sip":
        return jsonOk(await requestSipAddon(await readJson(request)));
      case "billing/request-plan":
        return jsonOk(await requestPlanUpgrade(await readJson(request)));
      case "billing/claim-payment":
        return jsonOk(await claimPayment(await readJson(request)));

      // ---------- super admin ----------
      // A founder's tenant login isn't always flagged super-admin, so the app
      // can also unlock with a separate admin_login code (token kept in memory).
      case "admin/request-code": {
        const body = await readJson<{ email: string }>(request);
        return jsonOk(await requestLoginCode({ email: body.email, purpose: "admin_login" }));
      }
      case "admin/verify-code": {
        const body = await readJson<{ email: string; code: string }>(request);
        return jsonOk(await verifyLoginCode({ email: body.email, code: body.code, purpose: "admin_login" }));
      }
      case "admin/overview":
        return jsonOk(await getPlatformOverview(await readJson(request)));
      case "admin/revenue":
        return jsonOk(await getPlatformRevenue(await readJson(request)));
      case "admin/health":
        return jsonOk(await getPlatformHealth(await readJson(request)));
      case "admin/tenants":
        return jsonOk(await listTenants(await readJson(request)));
      case "admin/tenant-status":
        return jsonOk(await setTenantStatus(await readJson(request)));
      case "admin/set-dialer":
        return jsonOk(await setDialerAddon(await readJson(request)));
      case "admin/set-sip":
        return jsonOk(await setSipAddon(await readJson(request)));
      case "admin/broadcast-audience":
        return jsonOk(await previewAudience(await readJson(request)));
      case "admin/broadcast-send":
        return jsonOk(await sendBroadcast(await readJson(request)));
      case "admin/broadcasts":
        return jsonOk(await listBroadcasts(await readJson(request)));
      case "admin/payment-links":
        return jsonOk(await listPaymentLinks(await readJson(request)));
      case "admin/payment-link-save":
        return jsonOk(await savePaymentLink(await readJson(request)));
      case "admin/payment-link-delete":
        return jsonOk(await deletePaymentLink(await readJson(request)));
      case "admin/conversations":
        return jsonOk(await listConversations(await readJson(request)));
      case "admin/conversation":
        return jsonOk(await getConversation(await readJson(request)));
      case "admin/reply":
        return jsonOk(await replyAsSupport(await readJson(request)));
      case "admin/tickets":
        return jsonOk(await listTickets(await readJson(request)));
      case "admin/ticket-create":
        return jsonOk(await createTicket(await readJson(request)));
      case "admin/ticket-update":
        return jsonOk(await updateTicket(await readJson(request)));
      case "admin/ticket-delete":
        return jsonOk(await deleteTicket(await readJson(request)));

      // ---------- settings ----------
      case "settings/get":
        return jsonOk(await getTenantSettings(await readJson(request)));
      case "settings/save":
        return jsonOk(await saveTenantSettings(await readJson(request)));

      default:
        return new Response("Not found", { status: 404 });
    }
  } catch (error) {
    return jsonError(error);
  }
}
