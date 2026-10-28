// Client wrappers around src/backend/help-chat.server.ts (the help assistant).
import { escalateHelpFn, helpChatFn, type ChatMessage } from "@/backend/help-chat.fn";
import { getSessionToken } from "./auth-api";

export type { ChatMessage };

/** Asks the assistant. Works signed out: visitors can ask about the product and its plans. */
export function askHelp(messages: ChatMessage[], page: string) {
  const token = getSessionToken();
  return helpChatFn({ data: { messages, page, ...(token ? { token } : {}) } });
}

/** Sends the conversation to the team as a support thread. Workspace owners only. */
export function sendChatToSupport(messages: ChatMessage[]) {
  const token = getSessionToken();
  if (!token) throw new Error("Sign in to message the team.");
  return escalateHelpFn({ data: { token, messages } });
}

export function isSignedIn(): boolean {
  try {
    return Boolean(getSessionToken());
  } catch {
    return false;
  }
}
