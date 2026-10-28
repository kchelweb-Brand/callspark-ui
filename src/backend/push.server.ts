// Phone alerts for the platform owner.
//
// The owner's phone app (an installable web app, see /admin/app) subscribes to Web Push.
// When a payment arrives or a customer says they've paid, every subscribed device of every
// platform owner gets a notification that opens the app on that payment. Push services
// need the sender to sign each message with a key pair; this module makes one the first
// time it is needed and keeps it in the database, so there is nothing to set up. Server-only.

import { buildPushPayload, type PushSubscription } from "@block65/webcrypto-web-push";
import { createServerFn } from "@tanstack/react-start";

import { sql, sqlQuery } from "./db";
import { ensureSchema } from "./schema.server";
import { verifyToken } from "./tokens";

interface Vapid {
  subject: string;
  publicKey: string;
  privateKey: string;
}

const b64url = (bytes: Uint8Array) => {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};
const fromB64url = (s: string) => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));

let cached: Vapid | null = null;

/** The signing keys for push messages: read from the database, made once if missing. */
export async function getVapid(): Promise<Vapid> {
  if (cached) return cached;
  await ensureSchema();
  const read = async () => {
    const rows = await sql`select value from payment_settings where key = 'vapid'`;
    return rows[0] ? ((rows[0] as { value: { publicKey?: string; privateKey?: string } }).value) : null;
  };
  let value = await read();
  if (!value?.publicKey || !value.privateKey) {
    const pair = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
    const jwk = (await crypto.subtle.exportKey("jwk", pair.privateKey)) as { x: string; y: string; d: string };
    const publicBytes = new Uint8Array([4, ...fromB64url(jwk.x), ...fromB64url(jwk.y)]);
    const made = { publicKey: b64url(publicBytes), privateKey: jwk.d };
    // If two requests race to make it, the first one stays and both read it back.
    await sql`insert into payment_settings (key, value) values ('vapid', ${JSON.stringify(made)}::jsonb) on conflict (key) do nothing`;
    value = await read();
  }
  cached = { subject: "https://kchel-dialer.kchelweb.workers.dev", publicKey: String(value!.publicKey), privateKey: String(value!.privateKey) };
  return cached;
}

async function requireOwner(token: string) {
  const payload = await verifyToken(token);
  if (!payload || !payload.isSuperAdmin) throw new Error("Not authorized.");
  return payload;
}

export interface BrowserSubscription {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

/** The public half of the key, which a phone needs to subscribe. */
export async function getPushConfig(data: { token: string }) {
  await requireOwner(data.token);
  return { ok: true as const, publicKey: (await getVapid()).publicKey };
}

export const getPushConfigFn = createServerFn({ method: "POST" })
  .validator((data: { token: string }) => data)
  .handler(async ({ data }) => getPushConfig(data));

/** Remembers a phone so it is told about payments. One row per device. */
export async function savePushSubscription(data: { token: string; subscription: BrowserSubscription; label?: string }) {
  const payload = await requireOwner(data.token);
  await ensureSchema();
  const s = data.subscription;
  if (!s || !/^https:\/\//.test(String(s.endpoint)) || !s.keys?.p256dh || !s.keys?.auth) {
    throw new Error("That phone did not give a valid notification address.");
  }
  await sql`
    insert into push_subscriptions (user_id, endpoint, p256dh, auth, label)
    values (${payload.sub}, ${s.endpoint}, ${s.keys.p256dh}, ${s.keys.auth}, ${(data.label ?? "").slice(0, 80) || null})
    on conflict (endpoint) do update set user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth, label = excluded.label
  `;
  return { ok: true as const };
}

export const savePushSubscriptionFn = createServerFn({ method: "POST" })
  .validator((data: Parameters<typeof savePushSubscription>[0]) => data)
  .handler(async ({ data }) => savePushSubscription(data));

export async function removePushSubscription(data: { token: string; endpoint: string }) {
  await requireOwner(data.token);
  await ensureSchema();
  await sql`delete from push_subscriptions where endpoint = ${data.endpoint}`;
  return { ok: true as const };
}

export const removePushSubscriptionFn = createServerFn({ method: "POST" })
  .validator((data: { token: string; endpoint: string }) => data)
  .handler(async ({ data }) => removePushSubscription(data));

export interface PushNotice {
  title: string;
  body: string;
  /** Where tapping it opens, on this site. */
  url: string;
  /** A second notice with the same tag replaces the first instead of stacking. */
  tag?: string;
}

/**
 * Tells every phone a platform owner has registered. Never throws, and sends to at most
 * ten phones (each is one outside request). A phone that has been removed or reset is
 * forgotten the first time it is refused.
 */
export async function pushToOwners(notice: PushNotice): Promise<number> {
  try {
    await ensureSchema();
    const subs = await sql`
      select s.id, s.endpoint, s.p256dh, s.auth from push_subscriptions s
      join users u on u.id = s.user_id where u.is_super_admin = true
      order by s.created_at desc limit 10
    `;
    if (subs.length === 0) return 0;
    const vapid = await getVapid();
    let sent = 0;
    const gone: string[] = [];
    for (const row of subs) {
      const sub = row as { id: string; endpoint: string; p256dh: string; auth: string };
      try {
        const subscription: PushSubscription = { endpoint: sub.endpoint, expirationTime: null, keys: { p256dh: sub.p256dh, auth: sub.auth } };
        const request = await buildPushPayload({ data: JSON.stringify(notice), options: { ttl: 60 * 60 * 12, urgency: "high" } }, subscription, vapid);
        const res = await fetch(sub.endpoint, request);
        if (res.status === 404 || res.status === 410) gone.push(sub.id);
        else if (res.ok) sent++;
        else console.warn("[push] refused", res.status);
      } catch (err) {
        console.warn("[push] could not send to a phone", err);
      }
    }
    if (gone.length > 0) await sqlQuery("delete from push_subscriptions where id = any($1::uuid[])", [gone]);
    return sent;
  } catch (err) {
    console.error("[push] could not notify the owners", err);
    return 0;
  }
}
