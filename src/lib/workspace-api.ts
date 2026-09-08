// Client wrappers for campaigns, agents, SMS and workspace settings.
import {
  createCampaignFn,
  deleteCampaignFn,
  duplicateCampaignFn,
  listCampaignsFn,
  updateCampaignFn,
  type CampaignRecord,
} from "@/backend/campaigns.server";
import {
  createAgentFn,
  deleteAgentFn,
  listAgentsFn,
  updateAgentFn,
  type AgentRecord,
} from "@/backend/agents.server";
import {
  createMyTicketFn,
  createSmsCampaignFn,
  deleteSmsDraftFn,
  getTenantSettingsFn,
  listMyTicketsFn,
  listSmsFn,
  saveSmsDraftFn,
  saveTenantSettingsFn,
  updateSmsCampaignFn,
  type MyTicketRecord,
  type SmsCampaignRecord,
  type SmsDraftRecord,
} from "@/backend/workspace.server";
import type { JsonObject } from "@/backend/phone-system.server";
import { getSessionToken } from "./auth-api";

export type { CampaignRecord, AgentRecord, SmsCampaignRecord, SmsDraftRecord, MyTicketRecord };

function requireToken(): string {
  const token = getSessionToken();
  if (!token) throw new Error("Not signed in.");
  return token;
}

// ---------- campaigns ----------

export function listCampaigns() {
  return listCampaignsFn({ data: { token: requireToken() } });
}

export function createCampaign(input: {
  name: string;
  listName?: string;
  owner?: string;
  script?: string;
  status?: string;
}) {
  return createCampaignFn({ data: { token: requireToken(), ...input } });
}

export function updateCampaign(id: string, changes: { name?: string; status?: string }) {
  return updateCampaignFn({ data: { token: requireToken(), id, ...changes } });
}

export function duplicateCampaign(id: string) {
  return duplicateCampaignFn({ data: { token: requireToken(), id } });
}

export function deleteCampaign(id: string) {
  return deleteCampaignFn({ data: { token: requireToken(), id } });
}

// ---------- agents ----------

export function listAgents() {
  return listAgentsFn({ data: { token: requireToken() } });
}

export function createAgent(input: {
  name: string;
  email: string;
  extension?: string;
  role?: string;
}) {
  return createAgentFn({ data: { token: requireToken(), ...input } });
}

export function updateAgent(id: string, changes: { status?: string; role?: string }) {
  return updateAgentFn({ data: { token: requireToken(), id, ...changes } });
}

export function deleteAgent(id: string) {
  return deleteAgentFn({ data: { token: requireToken(), id } });
}

// ---------- sms ----------

export function listSms() {
  return listSmsFn({ data: { token: requireToken() } });
}

export function createSmsCampaign(input: {
  name: string;
  listName?: string;
  body?: string;
  status?: string;
}) {
  return createSmsCampaignFn({ data: { token: requireToken(), ...input } });
}

export function updateSmsCampaign(id: string, status: string) {
  return updateSmsCampaignFn({ data: { token: requireToken(), id, status } });
}

export function saveSmsDraft(body: string, listName?: string) {
  return saveSmsDraftFn({ data: { token: requireToken(), body, ...(listName ? { listName } : {}) } });
}

export function deleteSmsDraft(id: string) {
  return deleteSmsDraftFn({ data: { token: requireToken(), id } });
}

// ---------- support (tenant's own tickets) ----------

export function listMyTickets() {
  return listMyTicketsFn({ data: { token: requireToken() } });
}

export function createMyTicket(input: { subject: string; body?: string; priority?: string }) {
  return createMyTicketFn({ data: { token: requireToken(), ...input } });
}

// ---------- workspace settings ----------

export function getTenantSettings() {
  return getTenantSettingsFn({ data: { token: requireToken() } });
}

export function saveTenantSettings(input: {
  workspace?: Record<string, unknown>;
  preferences?: Record<string, unknown>;
  billing?: Record<string, unknown>;
}) {
  return saveTenantSettingsFn({
    data: {
      token: requireToken(),
      ...(input.workspace ? { workspace: input.workspace as JsonObject } : {}),
      ...(input.preferences ? { preferences: input.preferences as JsonObject } : {}),
      ...(input.billing ? { billing: input.billing as JsonObject } : {}),
    },
  });
}
