import {
  getPhoneSystemFn,
  savePhoneNumbersFn,
  savePhoneSystemFn,
  type JsonObject,
  type JsonValue,
} from "@/backend/phone-system.server";
import { getSessionToken } from "./auth-api";
import type {
  BusinessHoursConfig,
  Extension,
  IvrMenu,
  PhoneNumber,
  RoutingRule,
  VoicemailSettings,
} from "./phone-system-data";

function requireToken(): string {
  const token = getSessionToken();
  if (!token) throw new Error("Not signed in.");
  return token;
}

export interface LoadedPhoneSystem {
  saved: boolean;
  menus: IvrMenu[];
  extensions: Extension[];
  routing: RoutingRule;
  businessHours: BusinessHoursConfig;
  voicemail: VoicemailSettings;
  numbers: PhoneNumber[];
}

interface StoredNumber {
  number: string;
  label: string | null;
  type: string | null;
  region: string | null;
  status: string;
  ivr_menu_id: string | null;
  sms_enabled: boolean;
}

export async function getPhoneSystem(): Promise<LoadedPhoneSystem> {
  const result = await getPhoneSystemFn({ data: { token: requireToken() } });
  const c = result.config;

  return {
    saved: result.saved,
    menus: c.menus as unknown as IvrMenu[],
    extensions: c.extensions as unknown as Extension[],
    routing: c.routing as unknown as RoutingRule,
    businessHours: c.businessHours as unknown as BusinessHoursConfig,
    voicemail: c.voicemail as unknown as VoicemailSettings,
    numbers: (c.numbers as unknown as StoredNumber[]).map((n) => ({
      number: n.number,
      label: n.label ?? "",
      type: (n.type as PhoneNumber["type"]) ?? "Local",
      region: n.region ?? "",
      status: (n.status as PhoneNumber["status"]) ?? "Pending",
      ivrMenuId: n.ivr_menu_id,
      smsEnabled: n.sms_enabled,
    })),
  };
}

export function savePhoneSystem(input: {
  menus: IvrMenu[];
  extensions: Extension[];
  routing: RoutingRule;
  businessHours: BusinessHoursConfig;
  voicemail: VoicemailSettings;
}) {
  return savePhoneSystemFn({
    data: {
      token: requireToken(),
      menus: input.menus as unknown as JsonValue[],
      extensions: input.extensions as unknown as JsonValue[],
      routing: input.routing as unknown as JsonObject,
      businessHours: input.businessHours as unknown as JsonObject,
      voicemail: input.voicemail as unknown as JsonObject,
    },
  });
}

export function savePhoneNumbers(numbers: PhoneNumber[]) {
  return savePhoneNumbersFn({
    data: {
      token: requireToken(),
      numbers: numbers.map((n) => ({
        number: n.number,
        label: n.label,
        type: n.type,
        region: n.region,
        status: n.status,
        ivrMenuId: n.ivrMenuId,
        smsEnabled: n.smsEnabled,
      })),
    },
  });
}
