import { getAgentSipConfigFn, reportRegistrationFn } from "@/backend/webrtc.server";
import { getSessionToken } from "./auth-api";

export interface AgentSipConfig {
  label: string;
  wssUrl: string;
  host: string;
  username: string;
  password: string;
  realm: string | null;
}

function requireToken(): string {
  const token = getSessionToken();
  if (!token) throw new Error("Not signed in.");
  return token;
}

export async function getAgentSipConfig(): Promise<AgentSipConfig> {
  const result = await getAgentSipConfigFn({ data: { token: requireToken() } });
  return result.config;
}

export function reportRegistration(success: boolean, error?: string) {
  return reportRegistrationFn({
    data: { token: requireToken(), success, ...(error ? { error } : {}) },
  });
}
