import { createServerFn } from "@tanstack/react-start";

import { sql } from "./db";
import { verifyToken } from "./tokens";
import { requireCountWithinLimit } from "./entitlements";

async function requireTenant(token: string): Promise<string> {
  const payload = await verifyToken(token);
  if (!payload || !payload.tenantId) throw new Error("Not signed in.");
  return payload.tenantId;
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

export const getPhoneSystemFn = createServerFn({ method: "POST" })
  .validator((data: { token: string }) => data)
  .handler(async ({ data }) => {
    const tenantId = await requireTenant(data.token);

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
  });

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
  .handler(async ({ data }) => {
    const tenantId = await requireTenant(data.token);
    await requireCountWithinLimit(tenantId, "ivrMenus", data.menus.length);

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
  });

/** Numbers are stored separately so inbound routing can find a tenant by number. */
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
  .handler(async ({ data }) => {
    const tenantId = await requireTenant(data.token);
    await requireCountWithinLimit(tenantId, "phoneNumbers", data.numbers.length);

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
  });
