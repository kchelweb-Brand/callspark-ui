// Client wrappers for the team features: agent home, tasks, messages, notifications, outreach.
import { getAgentHomeFn, type AgentHome } from "@/backend/agent-home.server";
import { createTaskFn, deleteTaskFn, listTasksFn, updateTaskFn, type TaskRow } from "@/backend/tasks.server";
import {
  getThreadFn,
  listThreadsFn,
  sendMessageFn,
  type ChatMessage,
  type ThreadSummary,
} from "@/backend/messages.server";
import {
  listNotificationsFn,
  markNotificationsReadFn,
  type NotificationRow,
} from "@/backend/notifications.server";
import {
  listBroadcastsFn,
  previewAudienceFn,
  sendBroadcastFn,
  type Audience,
  type BroadcastRecord,
} from "@/backend/broadcast.server";
import { resendInviteFn } from "@/backend/agents.server";
import { getSessionToken } from "./auth-api";

export type { AgentHome, TaskRow, ChatMessage, ThreadSummary, NotificationRow, Audience, BroadcastRecord };

function token(): string {
  const t = getSessionToken();
  if (!t) throw new Error("Not signed in.");
  return t;
}

export const getAgentHome = () => getAgentHomeFn({ data: { token: token() } });

export const listTasks = (opts: { status?: string; assigneeId?: string } = {}) =>
  listTasksFn({ data: { token: token(), ...opts } });
export const createTask = (input: {
  assigneeId: string;
  title: string;
  details?: string;
  priority?: string;
  dueAt?: string;
  contactId?: string;
}) => createTaskFn({ data: { token: token(), ...input } });
export const updateTask = (
  id: string,
  changes: {
    status?: string;
    note?: string;
    title?: string;
    details?: string;
    priority?: string;
    dueAt?: string | null;
    assigneeId?: string;
  },
) => updateTaskFn({ data: { token: token(), id, ...changes } });
export const deleteTask = (id: string) => deleteTaskFn({ data: { token: token(), id } });

export const listThreads = () => listThreadsFn({ data: { token: token() } });
export const getThread = (agentUserId?: string, since?: string) =>
  getThreadFn({ data: { token: token(), ...(agentUserId ? { agentUserId } : {}), ...(since ? { since } : {}) } });
export const sendMessage = (body: string, agentUserId?: string, taskId?: string) =>
  sendMessageFn({
    data: { token: token(), body, ...(agentUserId ? { agentUserId } : {}), ...(taskId ? { taskId } : {}) },
  });

export const listNotifications = (limit = 30) => listNotificationsFn({ data: { token: token(), limit } });
export const markNotificationsRead = (opts: { ids?: string[]; kind?: string; all?: boolean }) =>
  markNotificationsReadFn({ data: { token: token(), ...opts } });

export const resendInvite = (id: string) => resendInviteFn({ data: { token: token(), id } });

export const previewAudience = (audience: Audience) => previewAudienceFn({ data: { token: token(), audience } });
export const listBroadcasts = () => listBroadcastsFn({ data: { token: token() } });
export const sendBroadcast = (input: {
  title: string;
  body: string;
  howTo?: string;
  linkUrl?: string;
  linkLabel?: string;
  audience: Audience;
  sendEmail: boolean;
}) => sendBroadcastFn({ data: { token: token(), ...input } });
