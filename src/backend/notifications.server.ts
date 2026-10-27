import { createServerFn } from "@tanstack/react-start";

// In-app notifications, with an email fallback for people who aren't in the app.
//
// Every event worth knowing about (a task assigned, a message, an announcement)
// becomes a row here. Clients poll for the unread count; the bell and the
// desktop pop-up are built from it. If the recipient hasn't been seen in the
// app for a while, the same event is also emailed so nothing is missed.

import { sql } from "./db";
import { ensureSchema } from "./schema.server";
import { requireMember, touchSeen } from "./access.server";
import { sendTeamAlertEmail } from "./email";

/** Someone seen this recently is looking at the app, so an email would just be noise. */
const AWAY_MINUTES = 10;

export type NotificationKind = "task" | "message" | "invite" | "announcement" | "system";

export interface NotificationRow {
  id: string;
  kind: NotificationKind;
  title: string;
  body: string | null;
  link: string | null;
  broadcast_id: string | null;
  created_at: string;
  read_at: string | null;
}

export async function notify(input: {
  tenantId: string | null;
  userId: string;
  kind: NotificationKind;
  title: string;
  body?: string | null;
  link?: string | null;
  /** Also email the recipient, but only when they haven't been seen in the app lately. */
  emailIfAway?: { subject: string; heading: string; ctaLabel: string; ctaPath: string };
}): Promise<void> {
  try {
    await ensureSchema();
    await sql`
      insert into notifications (user_id, tenant_id, kind, title, body, link)
      values (${input.userId}, ${input.tenantId}, ${input.kind}, ${input.title}, ${input.body ?? null}, ${input.link ?? null})
    `;
    if (!input.emailIfAway) return;
    const rows = await sql`
      select email, (last_seen_at is null or last_seen_at < now() - (${AWAY_MINUTES} || ' minutes')::interval) as away
      from users where id = ${input.userId} limit 1
    `;
    const user = rows[0] as { email: string; away: boolean } | undefined;
    if (user?.away) {
      await sendTeamAlertEmail(user.email, input.emailIfAway.subject, {
        heading: input.emailIfAway.heading,
        message: input.body ? `${input.title}\n\n${input.body}` : input.title,
        ctaLabel: input.emailIfAway.ctaLabel,
        ctaPath: input.emailIfAway.ctaPath,
      });
    }
  } catch (err) {
    // A failed alert must never fail the action that caused it.
    console.error("[notify] failed", err);
  }
}

/** The bell: recent notifications, the unread total, and unread counts per area for menu badges. */
export async function listNotifications(data: { token: string; limit?: number }) {
  const member = await requireMember(data.token);
  await ensureSchema();
  await touchSeen(member.userId);
  const limit = Math.min(100, Math.max(1, data.limit ?? 30));

  const items = await sql`
    select id, kind, title, body, link, broadcast_id, created_at, read_at
    from notifications where user_id = ${member.userId}
    order by created_at desc limit ${limit}
  `;
  const counts = await sql`
    select kind, count(*)::int as n from notifications
    where user_id = ${member.userId} and read_at is null group by kind
  `;
  const byKind: Record<string, number> = {};
  let unread = 0;
  for (const c of counts as { kind: string; n: number }[]) {
    byKind[c.kind] = c.n;
    unread += c.n;
  }
  return { ok: true as const, notifications: items as unknown as NotificationRow[], unread, byKind };
}

export async function markNotificationsRead(data: { token: string; ids?: string[]; kind?: string; all?: boolean }) {
  const member = await requireMember(data.token);
  await ensureSchema();
  if (data.all) {
    await sql`update notifications set read_at = now() where user_id = ${member.userId} and read_at is null`;
  } else if (data.kind) {
    await sql`
      update notifications set read_at = now()
      where user_id = ${member.userId} and kind = ${data.kind} and read_at is null
    `;
  } else if (data.ids && data.ids.length > 0) {
    await sql`
      update notifications set read_at = now()
      where user_id = ${member.userId} and read_at is null and id = any(${data.ids}::uuid[])
    `;
  }
  return { ok: true as const };
}

export const listNotificationsFn = createServerFn({ method: "POST" })
  .validator((data: Parameters<typeof listNotifications>[0]) => data)
  .handler(async ({ data }) => listNotifications(data));

export const markNotificationsReadFn = createServerFn({ method: "POST" })
  .validator((data: Parameters<typeof markNotificationsRead>[0]) => data)
  .handler(async ({ data }) => markNotificationsRead(data));

