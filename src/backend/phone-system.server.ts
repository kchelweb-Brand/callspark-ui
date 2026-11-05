import { createServerFn } from "@tanstack/react-start";

import { sql } from "./db";
import { asMember, requireMember, type Member } from "./access.server";
import { requireCountWithinLimit } from "./entitlements";

/**
 * The owner always; an agent only when the owner gave them the phone system, and only to change it when
 * they were given "edit". The carrier connection and its credentials live in sip.server.ts, which stays
 * owner-only whatever an agent is allowed here.
 */
async function requireAccess(token: string, level: "view" | "edit"): Promise<Member> {
  const member = await requireMember(token);
  if (member.isAgent) {
    const access = member.permissions?.phoneSystem ?? "none";
    if (access === "none") throw new Error("You don't have access to the phone system.");
    if (level === "edit" && access !== "edit") throw new Error("You can see the phone system but not change it.");
  }
  return member;
}

/**
 * Anything that survives a JSON round-trip. The RPC layer type-checks that
 * payloads are serializable, so `unknown` isn't good enough here.
 */
export type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };
export type JsonObject = { [key: string]: JsonValue };

/**
 * The tenant's whole inbound call setup. Loaded and saved as one document —
 * these pieces reference each other (a number points at a menu, a menu points
 * at an extension), so saving them independently invites inconsistent states.
 */
export interface PhoneSystemConfig {
  menus: JsonValue[];
  extensions: JsonValue[];
  routing: JsonObject;
  businessHours: JsonObject;
  voicemail: JsonObject;
  numbers: JsonValue[];
}

export async function getPhoneSystem(data: { token: string }) {
  const { tenantId } = await requireAccess(data.token, "view");

  const rows = await sql`
    select routing, business_hours, voicemail, menus, extensions
    from phone_system_settings where tenant_id = ${tenantId} limit 1
  `;
  const row = rows[0] as
    | {
        routing: JsonObject;
        business_hours: JsonObject;
        voicemail: JsonObject;
        menus: JsonValue[];
        extensions: JsonValue[];
      }
    | undefined;

  const numbers = await sql`
    select number, label, type, region, status, ivr_menu_id, sms_enabled
    from phone_numbers where tenant_id = ${tenantId} order by created_at
  `;

  return {
    ok: true as const,
    // `saved: false` tells the client this tenant has never configured
    // anything, so it can seed sensible defaults instead of blank objects.
    saved: Boolean(row),
    config: {
      menus: row?.menus ?? [],
      extensions: row?.extensions ?? [],
      routing: row?.routing ?? {},
      businessHours: row?.business_hours ?? {},
      voicemail: row?.voicemail ?? {},
      numbers: numbers as JsonValue[],
    } satisfies PhoneSystemConfig,
  };
}

export const getPhoneSystemFn = createServerFn({ method: "POST" })
  .validator((data: { token: string }) => data)
  .handler(async ({ data }) => getPhoneSystem(data));

export async function savePhoneSystem(data: {
  token: string;
  menus: JsonValue[];
  extensions: JsonValue[];
  routing: JsonObject;
  businessHours: JsonObject;
  voicemail: JsonObject;
}) {
  const member = await requireAccess(data.token, "edit");
  const { tenantId } = member;
  await asMember(member, () => requireCountWithinLimit(tenantId, "ivrMenus", data.menus.length));

  await sql`
    insert into phone_system_settings
      (tenant_id, routing, business_hours, voicemail, menus, extensions, updated_at)
    values (
      ${tenantId},
      ${JSON.stringify(data.routing)}::jsonb,
      ${JSON.stringify(data.businessHours)}::jsonb,
      ${JSON.stringify(data.voicemail)}::jsonb,
      ${JSON.stringify(data.menus)}::jsonb,
      ${JSON.stringify(data.extensions)}::jsonb,
      now()
    )
    on conflict (tenant_id) do update set
      routing = excluded.routing,
      business_hours = excluded.business_hours,
      voicemail = excluded.voicemail,
      menus = excluded.menus,
      extensions = excluded.extensions,
      updated_at = now()
  `;

  return { ok: true as const };
}

export const savePhoneSystemFn = createServerFn({ method: "POST" })
  .validator(
    (data: {
      token: string;
      menus: JsonValue[];
      extensions: JsonValue[];
      routing: JsonObject;
      businessHours: JsonObject;
      voicemail: JsonObject;
    }) => data,
  )
  .handler(async ({ data }) => savePhoneSystem(data));

/** Numbers are stored separately so inbound routing can find a tenant by number. */
export async function savePhoneNumbers(data: {
  token: string;
  numbers: {
    number: string;
    label?: string | null;
    type?: string | null;
    region?: string | null;
    status?: string;
    ivrMenuId?: string | null;
    smsEnabled?: boolean;
  }[];
}) {
  const member = await requireAccess(data.token, "edit");
  const { tenantId } = member;
  await asMember(member, () => requireCountWithinLimit(tenantId, "phoneNumbers", data.numbers.length));

  const keep = data.numbers.map((n) => n.number);
  if (keep.length === 0) {
    await sql`delete from phone_numbers where tenant_id = ${tenantId}`;
  } else {
    await sql`
      delete from phone_numbers
      where tenant_id = ${tenantId} and number <> all(${keep}::text[])
    `;
  }

  for (const n of data.numbers) {
    // ivr_menu_id is what the inbound handler routes on — the number-to-menu
    // assignment is the link between a ringing phone and a tenant's IVR.
    await sql`
      insert into phone_numbers
        (tenant_id, number, label, type, region, status, sms_enabled, ivr_menu_id)
      values (
        ${tenantId}, ${n.number}, ${n.label ?? null}, ${n.type ?? null},
        ${n.region ?? null}, ${n.status ?? "Pending"}, ${n.smsEnabled ?? false},
        ${n.ivrMenuId ?? null}
      )
      on conflict (tenant_id, number) do update set
        label = excluded.label,
        type = excluded.type,
        region = excluded.region,
        status = excluded.status,
        sms_enabled = excluded.sms_enabled,
        ivr_menu_id = excluded.ivr_menu_id
    `;
  }

  return { ok: true as const };
}

export const savePhoneNumbersFn = createServerFn({ method: "POST" })
  .validator(
    (data: {
      token: string;
      numbers: {
        number: string;
        label?: string | null;
        type?: string | null;
        region?: string | null;
        status?: string;
        ivrMenuId?: string | null;
        smsEnabled?: boolean;
      }[];
    }) => data,
  )
  .handler(async ({ data }) => savePhoneNumbers(data));
