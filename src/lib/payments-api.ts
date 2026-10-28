// Client wrappers around src/backend/payments.server.ts (the owner's payment links).
import {
  deletePaymentLinkFn,
  listPaymentLinksFn,
  savePaymentLinkFn,
  savePaymentSettingsFn,
  type PaymentLinkRow,
  type SavePaymentLinkInput,
  type SavePaymentSettingsInput,
} from "@/backend/payments.server";
import { getSessionToken } from "./auth-api";

function requireToken(): string {
  const token = getSessionToken();
  if (!token) throw new Error("Not signed in.");
  return token;
}

export type { PaymentLinkRow };

export function listPaymentLinks() {
  return listPaymentLinksFn({ data: { token: requireToken() } });
}

export function savePaymentLink(input: Omit<SavePaymentLinkInput, "token">) {
  return savePaymentLinkFn({ data: { token: requireToken(), ...input } });
}

export function savePaymentSettings(input: Omit<SavePaymentSettingsInput, "token">) {
  return savePaymentSettingsFn({ data: { token: requireToken(), ...input } });
}

export function deletePaymentLink(id: string) {
  return deletePaymentLinkFn({ data: { token: requireToken(), id } });
}
