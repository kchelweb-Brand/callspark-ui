// SignalWire's REST Calling API — the carrier side of *originating* a call.
//
// Distinct from signalwire.ts, which only builds/verifies inbound webhook
// responses. This is the only place in the app that places a call rather
// than reacting to one.

import { env } from "./env";

export interface SignalwireResult {
  ok: boolean;
  status: number;
  /** Carrier-supplied error text, already flattened for logging. */
  error?: string;
  body?: unknown;
}

/** Starts a brand-new outbound call, handed off to whatever `webhookUrl` returns (cXML or SWML). */
export async function originateAiCall(input: {
  to: string;
  from: string;
  webhookUrl: string;
  statusCallbackUrl: string;
}): Promise<SignalwireResult> {
  const { projectId, apiToken, spaceName } = signalwireCredentials();
  if (!projectId || !apiToken || !spaceName) {
    return { ok: false, status: 0, error: "SignalWire REST credentials are not configured." };
  }

  const url = `https://${spaceName}.signalwire.com/api/laml/2010-04-01/Accounts/${projectId}/Calls.json`;
  const body = new URLSearchParams({
    To: input.to,
    From: input.from,
    Url: input.webhookUrl,
    StatusCallback: input.statusCallbackUrl,
  });

  return signalwireFetch(url, body, projectId, apiToken);
}

function signalwireCredentials() {
  return {
    projectId: env.signalwireProjectId,
    apiToken: env.signalwireApiToken,
    spaceName: env.signalwireSpaceName,
  };
}

async function signalwireFetch(
  url: string,
  body: URLSearchParams,
  projectId: string,
  apiToken: string,
): Promise<SignalwireResult> {
  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: {
        authorization: `Basic ${btoa(`${projectId}:${apiToken}`)}`,
        "content-type": "application/x-www-form-urlencoded",
        accept: "application/json",
      },
      body,
    });
  } catch (err) {
    return { ok: false, status: 0, error: err instanceof Error ? err.message : "Network error" };
  }

  const text = await response.text();
  let parsed: unknown;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    parsed = text;
  }

  if (!response.ok) {
    const message = (parsed as { message?: string } | null)?.message || text;
    return { ok: false, status: response.status, error: message, body: parsed };
  }
  return { ok: true, status: response.status, body: parsed };
}
