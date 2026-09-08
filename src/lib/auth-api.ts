// Thin client-side wrappers around the server functions in src/server/auth.server.ts.
// Kept as separate named functions (rather than exporting the server functions
// directly) so call sites don't need to know about the `{ data }` RPC shape,
// and so a future swap to a different backend only touches this file.
import {
  checkSlugAvailabilityFn,
  listTenantsFn,
  requestLoginCodeFn,
  setTenantStatusFn,
  submitSignupFn,
  verifyLoginCodeFn,
  verifySignupFn,
} from "@/backend/auth.server";

export type AuthPurpose = "login" | "admin_login";

export interface RequestCodeParams {
  email: string;
  purpose: AuthPurpose;
  workspaceSlug?: string;
}

export interface VerifyCodeParams {
  email: string;
  code: string;
  purpose: AuthPurpose;
}

export interface AuthUser {
  id: string;
  email: string;
  role: string;
  tenant_id?: string | null;
  is_super_admin?: boolean;
  workspace_slug?: string;
}

export async function requestLoginCode(params: RequestCodeParams) {
  return requestLoginCodeFn({ data: params });
}

export async function verifyLoginCode(params: VerifyCodeParams) {
  return verifyLoginCodeFn({ data: params });
}

const TOKEN_KEY = "kchel_dialer_token";
const USER_KEY = "kchel_dialer_user";
const ACTIVITY_KEY = "kchel_dialer_last_active";

/** Sign the user out after this long with no interaction. */
export const IDLE_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes

// sessionStorage (not localStorage) so the session dies when the tab/browser
// is closed — the user has to sign in again with a fresh code next visit.
// Guarded for SSR: `window` doesn't exist on the server, so components that
// read session state during render (e.g. Shell) would otherwise crash the
// server render and force a client-only fallback on every page.
function store() {
  if (typeof window === "undefined") {
    return {
      getItem: () => null,
      setItem: () => {},
      removeItem: () => {},
    } as unknown as Storage;
  }
  return window.sessionStorage;
}

export function saveSession(token: string, user: AuthUser) {
  store().setItem(TOKEN_KEY, token);
  store().setItem(USER_KEY, JSON.stringify(user));
  touchSession();
}

/** Records "the user is still here" — called on real interaction. */
export function touchSession() {
  store().setItem(ACTIVITY_KEY, String(Date.now()));
}

/** True when the session has been idle past the timeout. */
export function isSessionIdle() {
  const last = Number(store().getItem(ACTIVITY_KEY) || 0);
  if (!last) return true;
  return Date.now() - last > IDLE_TIMEOUT_MS;
}

/** Milliseconds until idle logout, or 0 if already past it. */
export function msUntilIdleLogout() {
  const last = Number(store().getItem(ACTIVITY_KEY) || 0);
  if (!last) return 0;
  return Math.max(0, last + IDLE_TIMEOUT_MS - Date.now());
}

export function getSessionToken() {
  return store().getItem(TOKEN_KEY);
}

export function getSessionUser(): AuthUser | null {
  const raw = store().getItem(USER_KEY);
  return raw ? JSON.parse(raw) : null;
}

/** A session is only valid if we have a token AND it hasn't gone idle. */
export function hasValidSession() {
  return Boolean(getSessionToken()) && !isSessionIdle();
}

export function clearSession() {
  store().removeItem(TOKEN_KEY);
  store().removeItem(USER_KEY);
  store().removeItem(ACTIVITY_KEY);
}

// ---------- Signup ----------

export type AccountType = "individual" | "business";

export interface SignupParams {
  fullName: string;
  email: string;
  accountType: AccountType;
  companyName?: string | undefined;
  workspaceSlug: string;
}

export async function checkSlugAvailability(slug: string) {
  return checkSlugAvailabilityFn({ data: { slug } });
}

export async function submitSignup(params: SignupParams) {
  return submitSignupFn({
    data: {
      fullName: params.fullName,
      email: params.email,
      accountType: params.accountType,
      workspaceSlug: params.workspaceSlug,
      ...(params.companyName ? { companyName: params.companyName } : {}),
    },
  });
}

export async function verifySignup(email: string, code: string) {
  return verifySignupFn({ data: { email, code } });
}

// ---------- Admin ----------

export interface AdminTenant {
  id: string;
  name: string;
  workspace_slug: string;
  status: "pending" | "active" | "suspended";
  created_at: string;
  user_count: number;
  owner_email: string | null;
}

export async function listTenants(status?: string) {
  const token = getSessionToken();
  if (!token) throw new Error("Not signed in.");
  return listTenantsFn({ data: { token, ...(status ? { status } : {}) } });
}

export async function setTenantStatus(id: string, status: "active" | "suspended" | "pending") {
  const token = getSessionToken();
  if (!token) throw new Error("Not signed in.");
  return setTenantStatusFn({ data: { token, id, status } });
}
