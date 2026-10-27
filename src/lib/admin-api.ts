import {
  createTicketFn,
  deleteTicketFn,
  getPlatformHealthFn,
  getPlatformOverviewFn,
  getPlatformRevenueFn,
  listTicketsFn,
  updateTicketFn,
  type TicketRecord,
} from "@/backend/admin.server";
import {
  getConversationFn,
  listConversationsFn,
  replyAsSupportFn,
  type Conversation,
  type CustomerProfile,
  type ThreadMessage,
} from "@/backend/support.server";
import { getSessionToken } from "./auth-api";

export type { TicketRecord, Conversation, CustomerProfile, ThreadMessage };

function requireToken(): string {
  const token = getSessionToken();
  if (!token) throw new Error("Not signed in.");
  return token;
}

export function getPlatformOverview() {
  return getPlatformOverviewFn({ data: { token: requireToken() } });
}

export function getPlatformRevenue() {
  return getPlatformRevenueFn({ data: { token: requireToken() } });
}

export function getPlatformHealth() {
  return getPlatformHealthFn({ data: { token: requireToken() } });
}

export function listTickets() {
  return listTicketsFn({ data: { token: requireToken() } });
}

export function createTicket(input: {
  tenantId?: string;
  subject: string;
  body?: string;
  priority?: string;
}) {
  return createTicketFn({ data: { token: requireToken(), ...input } });
}

export function updateTicket(id: string, changes: { status?: string; priority?: string }) {
  return updateTicketFn({ data: { token: requireToken(), id, ...changes } });
}

export function deleteTicket(id: string) {
  return deleteTicketFn({ data: { token: requireToken(), id } });
}

export function listConversations() {
  return listConversationsFn({ data: { token: requireToken() } });
}

export function getConversation(id: string) {
  return getConversationFn({ data: { token: requireToken(), id } });
}

export function replyAsSupport(id: string, body: string, status?: string) {
  return replyAsSupportFn({ data: { token: requireToken(), id, body, ...(status ? { status } : {}) } });
}

/** Shared formatting so every admin screen renders these the same way. */
export function formatMinutes(seconds: number): string {
  const mins = Math.round(seconds / 60);
  return mins.toLocaleString();
}

export function formatMoney(amount: number): string {
  return `$${amount.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}
