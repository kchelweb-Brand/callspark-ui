import {
  answerCallFn,
  endCallFn,
  listCallsFn,
  startCallFn,
  type CallRecord,
} from "@/backend/calls.server";
import { getSessionToken } from "./auth-api";

export type { CallRecord };

function requireToken(): string {
  const token = getSessionToken();
  if (!token) throw new Error("Not signed in.");
  return token;
}

export function startCall(input: {
  direction: "outbound" | "inbound";
  toNumber?: string;
  fromNumber?: string;
  contactId?: string;
}) {
  return startCallFn({ data: { token: requireToken(), ...input } });
}

export function answerCall(callId: string) {
  return answerCallFn({ data: { token: requireToken(), callId } });
}

export function endCall(
  callId: string,
  opts: { status?: string; outcome?: string; error?: string } = {},
) {
  return endCallFn({ data: { token: requireToken(), callId, ...opts } });
}

export interface ListCallsParams {
  search?: string;
  outcome?: string;
  agent?: string;
  page?: number;
  pageSize?: number;
}

export function listCalls(params: ListCallsParams = {}) {
  return listCallsFn({ data: { token: requireToken(), ...params } });
}
