// Split out of campaigns.server.ts so this stays an ordinary import rather
// than a sibling export in that file. campaigns.server.ts is reachable from
// the client bundle (via src/lib/workspace-api.ts), and TanStack's
// client/server split only strips code that's textually inside a
// createServerFn(...).handler(...) call — a same-file top-level export
// sitting next to it doesn't get stripped, so it (and this function's
// getWorkersAi -> "cloudflare:workers" import) leaked into the client build
// and broke it. As a plain import, ordinary unused-import tree-shaking
// removes it from the client bundle instead.
import { getWorkersAi } from "./cf-env";
import { verifyToken } from "./tokens";

async function requireTenant(token: string): Promise<string> {
  const payload = await verifyToken(token);
  if (!payload || !payload.tenantId) throw new Error("Not signed in.");
  return payload.tenantId;
}

/**
 * Reviews an AI-agent prompt for scam/spam-sounding language (fake urgency,
 * requests for sensitive financial info, no business identification, no
 * "this is an automated call" disclosure) and suggests a rewrite. Requires a
 * session — otherwise this is an unauthenticated proxy to the Anthropic bill.
 */
export async function reviewCampaignPrompt(data: { token: string; prompt: string; businessName?: string }) {
  await requireTenant(data.token);

  const ai = await getWorkersAi();
  if (!ai) throw new Error("Prompt review isn't available in local development — deploy to test it.");

  const prompt = data.prompt.trim();
  if (!prompt) throw new Error("Write a prompt first.");

  const system =
    "You review scripts for an outbound AI voice-calling agent. Flag anything that would make the " +
    "call sound like a scam or spam robocall: fake urgency, requests for passwords/SSNs/card numbers, " +
    "no clear business identification, or no disclosure that the caller is an automated assistant. " +
    "Then rewrite the script so it clearly identifies the business, opens with a plain disclosure " +
    "that this is an automated call, and stays focused on a legitimate purpose. " +
    `${data.businessName ? `The business is called "${data.businessName}". ` : ""}` +
    'Respond with ONLY minified JSON: {"concerns": string[], "rewrite": string}. No prose, no markdown fences.';

  // Workers AI — free tier (10k neurons/day), no separate account or key.
  // `response` is usually the raw text, but this model returns it already
  // parsed into an object when the content is valid JSON — handle both.
  const result = (await ai.run("@cf/meta/llama-3.2-3b-instruct", {
    messages: [
      { role: "system", content: system },
      { role: "user", content: prompt },
    ],
  })) as { response?: unknown };

  let parsed: { concerns?: string[]; rewrite?: string } | undefined;
  if (result.response && typeof result.response === "object") {
    parsed = result.response as { concerns?: string[]; rewrite?: string };
  } else if (typeof result.response === "string") {
    // Instruct models sometimes wrap JSON in a markdown fence despite being told not to.
    const jsonText = result.response.trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "");
    try {
      parsed = JSON.parse(jsonText);
    } catch {
      // fall through to the error below
    }
  }

  if (!parsed) throw new Error("Could not read the review response — try again.");
  return {
    ok: true as const,
    concerns: Array.isArray(parsed.concerns) ? parsed.concerns : [],
    rewrite: parsed.rewrite ?? "",
  };
}
