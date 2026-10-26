// Paid add-ons, sold outside any plan: Desktop Dialer ($500 one-time) and
// Managed SIP ($200 one-time). There's no payment processor wired up, so
// this follows the same manual-approval pattern already used for tenant
// activation: the tenant requests it, pays the founder directly (bank
// transfer etc.), and a super admin flips it on from the admin console once
// payment is confirmed — activation is promised within 24 hours.
import { createServerFn } from "@tanstack/react-start";

import { sql } from "./db";
import { verifyToken } from "./tokens";
import { sendAddonRequestEmail, sendAddonActivatedEmail } from "./email";

const SIGN_IN_URL = "https://kchel-dialer.kchelweb.workers.dev/login";

async function requireSession(token: string) {
  const payload = await verifyToken(token);
  if (!payload || !payload.tenantId) throw new Error("Not signed in.");
  return payload;
}

async function requireSuperAdmin(token: string) {
  const payload = await verifyToken(token);
  if (!payload || !payload.isSuperAdmin) throw new Error("Not authorized.");
  return payload;
}

interface TenantAddonRow {
  dialer_addon_enabled: boolean;
  dialer_addon_requested_at: string | null;
  sip_addon_enabled: boolean;
  sip_addon_requested_at: string | null;
  plan: string | null;
}

/** Plain function (not a server fn) for the native app's own login gate in
 * native-api.ts, which can't go through createServerFn — see that file.
 * Managed Enterprise bundles the Dialer for free, so a plan check bypasses
 * the separate paid flag rather than needing it flipped by hand too. */
export async function isDialerAddonEnabled(tenantId: string): Promise<boolean> {
  const rows = await sql`
    select dialer_addon_enabled, plan from tenants where id = ${tenantId} limit 1
  `;
  const row = rows[0] as { dialer_addon_enabled: boolean; plan: string | null } | undefined;
  return Boolean(row?.dialer_addon_enabled) || row?.plan === "managed";
}

export async function getAddonStatus(data: { token: string }) {
    const payload = await requireSession(data.token);
    const rows = await sql`
      select dialer_addon_enabled, dialer_addon_requested_at, sip_addon_enabled, sip_addon_requested_at, plan
      from tenants where id = ${payload.tenantId} limit 1
    `;
    const row = rows[0] as TenantAddonRow | undefined;
    const onManagedPlan = row?.plan === "managed";
    return {
      ok: true as const,
      dialer: {
        enabled: Boolean(row?.dialer_addon_enabled) || onManagedPlan,
        requestedAt: row?.dialer_addon_requested_at ?? null,
        includedInPlan: onManagedPlan,
      },
      sip: {
        enabled: Boolean(row?.sip_addon_enabled) || onManagedPlan,
        requestedAt: row?.sip_addon_requested_at ?? null,
        includedInPlan: onManagedPlan,
      },
    };
  }

export const getAddonStatusFn = createServerFn({ method: "POST" })
  .validator((data: Parameters<typeof getAddonStatus>[0]) => data)
  .handler(async ({ data }) => getAddonStatus(data));

async function requestAddon(tenantId: string, requestedByEmail: string, addonName: string, price: string, column: "dialer_addon_requested_at" | "sip_addon_requested_at") {
  if (column === "dialer_addon_requested_at") {
    await sql`update tenants set dialer_addon_requested_at = now() where id = ${tenantId}`;
  } else {
    await sql`update tenants set sip_addon_requested_at = now() where id = ${tenantId}`;
  }

  const tenantRows = await sql`select name, workspace_slug from tenants where id = ${tenantId} limit 1`;
  const tenant = tenantRows[0] as { name: string; workspace_slug: string } | undefined;

  const admins = await sql`select distinct email from users where is_super_admin = true and email is not null`;
  await sendAddonRequestEmail(
    (admins as { email: string }[]).map((a) => a.email),
    {
      addonName,
      price,
      workspaceName: tenant?.name ?? "Unknown",
      workspaceSlug: tenant?.workspace_slug ?? "unknown",
      requestedBy: requestedByEmail,
    },
  );
}

export async function requestDialerAddon(data: { token: string }) {
    const payload = await requireSession(data.token);
    await requestAddon(payload.tenantId!, payload.email, "Desktop Dialer", "$500 one-time", "dialer_addon_requested_at");
    return { ok: true as const };
  }

export const requestDialerAddonFn = createServerFn({ method: "POST" })
  .validator((data: Parameters<typeof requestDialerAddon>[0]) => data)
  .handler(async ({ data }) => requestDialerAddon(data));

export async function requestSipAddon(data: { token: string }) {
    const payload = await requireSession(data.token);
    await requestAddon(payload.tenantId!, payload.email, "Managed SIP Trunk", "$200 one-time", "sip_addon_requested_at");
    return { ok: true as const };
  }

export const requestSipAddonFn = createServerFn({ method: "POST" })
  .validator((data: Parameters<typeof requestSipAddon>[0]) => data)
  .handler(async ({ data }) => requestSipAddon(data));

async function notifyAddonActivated(tenantId: string, addonName: string, note: string) {
  const rows = await sql`
    select u.email from users u where u.tenant_id = ${tenantId}
    order by (u.role = 'tenant_owner') desc, u.created_at asc limit 1
  `;
  const ownerEmail = (rows[0] as { email: string } | undefined)?.email;
  if (ownerEmail) {
    await sendAddonActivatedEmail(ownerEmail, { addonName, signInUrl: SIGN_IN_URL, note });
  }
}

/** Admin-only: turns the Desktop Dialer add-on on/off for a specific tenant. */
export async function setDialerAddon(data: { token: string; tenantId: string; enabled: boolean }) {
    await requireSuperAdmin(data.token);
    await sql`update tenants set dialer_addon_enabled = ${data.enabled} where id = ${data.tenantId}`;
    if (data.enabled) {
      await notifyAddonActivated(data.tenantId, "Desktop Dialer", "Go to Billing → Desktop Dialer once signed in to get the installer.");
    }
    return { ok: true as const };
  }

export const setDialerAddonFn = createServerFn({ method: "POST" })
  .validator((data: Parameters<typeof setDialerAddon>[0]) => data)
  .handler(async ({ data }) => setDialerAddon(data));

/** Admin-only: turns the Managed SIP add-on on/off for a specific tenant. */
export async function setSipAddon(data: { token: string; tenantId: string; enabled: boolean }) {
    await requireSuperAdmin(data.token);
    await sql`update tenants set sip_addon_enabled = ${data.enabled} where id = ${data.tenantId}`;
    if (data.enabled) {
      await notifyAddonActivated(data.tenantId, "Managed SIP Trunk", "We'll set up your managed SIP trunk under Phone System → Connection within 24 hours.");
    }
    return { ok: true as const };
  }

export const setSipAddonFn = createServerFn({ method: "POST" })
  .validator((data: Parameters<typeof setSipAddon>[0]) => data)
  .handler(async ({ data }) => setSipAddon(data));
