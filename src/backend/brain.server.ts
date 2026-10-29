// The AI model behind phone conversations: Cloudflare's own hosted models, tried best first so a busy
// one never leaves a call without an answer. Server-only; the Worker entry hands it to the phone code
// (see setPhoneBrain), so browser code never imports the AI binding.

import { getWorkersAi } from "./cf-env";
import type { BrainMessage } from "./ai-phone.server";

const MODELS = ["@cf/meta/llama-3.3-70b-instruct-fp8-fast", "@cf/meta/llama-3.1-8b-instruct", "@cf/meta/llama-3.2-3b-instruct"];

/** What the model wrote, whichever shape it answers in. */
function textOf(result: unknown): string {
  if (typeof result === "string") return result;
  if (result && typeof result === "object") {
    const r = result as { response?: unknown; result?: { response?: unknown }; choices?: { message?: { content?: unknown } }[] };
    if (typeof r.response === "string") return r.response;
    if (typeof r.result?.response === "string") return r.result.response;
    const c = r.choices?.[0]?.message?.content;
    if (typeof c === "string") return c;
  }
  return "";
}

export async function phoneBrain(system: string, messages: BrainMessage[], maxTokens = 260): Promise<string | null> {
  const ai = await getWorkersAi();
  if (!ai) return null;
  for (const model of MODELS) {
    try {
      const out = textOf(
        await ai.run(model, {
          messages: [{ role: "system", content: system }, ...messages],
          max_tokens: maxTokens,
          temperature: 0.5,
        }),
      ).trim();
      if (out) return out;
    } catch (err) {
      console.warn(`[phone-ai] ${model} failed`, err);
    }
  }
  return null;
}
