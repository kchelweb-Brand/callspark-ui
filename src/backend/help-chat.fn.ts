// The help assistant as the browser sees it: thin server functions that load the
// real implementation only when they run on the server. Keeping that import
// inside the handlers is what stops the AI binding code reaching the browser.

import { createServerFn } from "@tanstack/react-start";

import type { ChatMessage } from "./help-types";

export type { ChatMessage };

export const helpChatFn = createServerFn({ method: "POST" })
  .validator((data: { token?: string; messages: ChatMessage[]; page?: string }) => data)
  .handler(async ({ data }) => {
    const { helpChat } = await import("./help-chat.server");
    let clientKey = "";
    try {
      const server = await import("@tanstack/react-start/server");
      clientKey = server.getRequestHeader("cf-connecting-ip") ?? server.getRequestHeader("x-forwarded-for") ?? "";
    } catch {
      // Without a client address every signed-out visitor shares one allowance, which is the safe direction.
    }
    return helpChat({ ...data, clientKey });
  });

export const escalateHelpFn = createServerFn({ method: "POST" })
  .validator((data: { token: string; messages: ChatMessage[] }) => data)
  .handler(async ({ data }) => {
    const { escalateHelp } = await import("./help-chat.server");
    return escalateHelp(data);
  });
