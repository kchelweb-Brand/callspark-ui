// Client-side wrappers around src/backend/sip.server.ts — same pattern as
// auth-api.ts and contacts-api.ts.
import {
  deleteSipConnectionFn,
  getSipConnectionFn,
  getWalletFn,
  saveByoSipFn,
  type SipConnectionView,
  type SipTransport,
} from "@/backend/sip.server";
import { getSessionToken } from "./auth-api";

export type { SipConnectionView, SipTransport };

function requireToken(): string {
  const token = getSessionToken();
  if (!token) throw new Error("Not signed in.");
  return token;
}

export function getSipConnection() {
  return getSipConnectionFn({ data: { token: requireToken() } });
}

export interface ByoSipInput {
  label: string;
  sipHost: string;
  sipWssUrl: string;
  sipUsername: string;
  /** Omit when editing to keep the stored password unchanged. */
  sipPassword?: string;
  sipRealm?: string;
  sipPort?: number;
  /** Defaults to "wss" — the only transport a browser can register over. */
  sipTransport?: SipTransport;
}

export function saveByoSip(input: ByoSipInput) {
  return saveByoSipFn({ data: { token: requireToken(), ...input } });
}

export function deleteSipConnection() {
  return deleteSipConnectionFn({ data: { token: requireToken() } });
}

export function getWallet() {
  return getWalletFn({ data: { token: requireToken() } });
}
