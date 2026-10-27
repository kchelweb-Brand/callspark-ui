// Client wrappers around src/backend/billing.server.ts.
import {
  activateTenantFn,
  getPlanUsageFn,
  listPlansFn,
  requestPlanUpgradeFn,
  setTenantPlanFn,
} from "@/backend/billing.server";
import {
  getAddonStatusFn,
  requestDialerAddonFn,
  requestSipAddonFn,
  setDialerAddonFn,
  setSipAddonFn,
} from "@/backend/addons.server";
import { getSessionToken } from "./auth-api";

function requireToken(): string {
  const token = getSessionToken();
  if (!token) throw new Error("Not signed in.");
  return token;
}

export function listPlans() {
  return listPlansFn({ data: {} });
}

export function requestPlanUpgrade(planId: string) {
  return requestPlanUpgradeFn({ data: { token: requireToken(), planId } });
}

export function getPlanUsage() {
  return getPlanUsageFn({ data: { token: requireToken() } });
}

export function setTenantPlan(tenantId: string, plan: string, trialDays?: number) {
  return setTenantPlanFn({
    data: { token: requireToken(), tenantId, plan, ...(trialDays ? { trialDays } : {}) },
  });
}

/** "5 of 25" / "1,204 of unlimited" — one place so every readout matches. */
export function formatUsage(used: number, limit: number | null): string {
  return `${used.toLocaleString()} of ${limit === null ? "unlimited" : limit.toLocaleString()}`;
}

export const USAGE_LABELS: Record<string, string> = {
  agents: "Agents",
  contacts: "Contacts",
  campaigns: "Campaigns",
  ivrMenus: "IVR menus",
  phoneNumbers: "Phone numbers",
  calls: "Calls",
  smsCampaigns: "SMS campaigns",
};

/**
 * Activates a tenant on a plan and emails the owner.
 *
 * `origin` is passed from the browser so the sign-in link in the email points
 * at whatever host the admin is actually using, rather than a baked-in URL.
 */
export function activateTenant(tenantId: string, plan: string, notify = true) {
  return activateTenantFn({
    data: {
      token: requireToken(),
      tenantId,
      plan,
      notify,
      origin: typeof window === "undefined" ? "" : window.location.origin,
    },
  });
}

// ---------- Paid add-ons: Desktop Dialer ($500) and Managed SIP ($200) ----------

export function getAddonStatus() {
  return getAddonStatusFn({ data: { token: requireToken() } });
}

export function requestDialerAddon() {
  return requestDialerAddonFn({ data: { token: requireToken() } });
}

export function requestSipAddon() {
  return requestSipAddonFn({ data: { token: requireToken() } });
}

export function setDialerAddon(tenantId: string, enabled: boolean) {
  return setDialerAddonFn({ data: { token: requireToken(), tenantId, enabled } });
}

export function setSipAddon(tenantId: string, enabled: boolean) {
  return setSipAddonFn({ data: { token: requireToken(), tenantId, enabled } });
}
