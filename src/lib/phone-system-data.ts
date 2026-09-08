/**
 * Seed data + types for the Phone System page (IVR, call routing, business
 * hours, extensions, voicemail). Local state only for now — shaped so it
 * can be swapped for real API calls the same way contacts-api.ts was.
 * Everything starts empty/neutral — a brand-new account hasn't configured
 * any of this yet.
 */

export type IvrAction =
  | "ring_extension"
  | "ring_department"
  | "voicemail"
  | "repeat_menu"
  | "goto_menu"
  | "hangup";

export const ivrActionLabels: Record<IvrAction, string> = {
  ring_extension: "Ring extension",
  ring_department: "Ring department",
  voicemail: "Send to voicemail",
  repeat_menu: "Repeat this menu",
  goto_menu: "Go to another menu",
  hangup: "Hang up",
};

export interface IvrOption {
  id: string;
  key: string;
  label: string;
  action: IvrAction;
  target: string;
}

export type GreetingMode = "tts" | "upload";

/** An uploaded greeting: display name, the URL a carrier fetches, and the storage key. */
export interface GreetingFile {
  name: string;
  url: string;
  key: string;
}

export interface IvrMenu {
  id: string;
  name: string;
  greetingMode: GreetingMode;
  greetingText: string;
  greetingFileName: string | null;
  /** Present once audio has actually been stored (older records won't have it). */
  greetingFile?: GreetingFile | null;
  timeoutSeconds: number;
  repeatCount: number;
  options: IvrOption[];
}

// No IVR menus yet — created from the "New menu" button.
export const ivrMenus: IvrMenu[] = [];

export type RingStrategy = "simultaneous" | "sequential" | "longest_idle";

export const ringStrategyLabels: Record<RingStrategy, string> = {
  simultaneous: "Simultaneous — ring everyone at once",
  sequential: "Sequential — ring in order",
  longest_idle: "Longest idle — ring whoever's been free the longest",
};

export type FallbackDestination = "voicemail" | "external_number" | "extension";

export interface RingStep {
  id: string;
  name: string;
  ext: string;
  ringSeconds: number;
}

export interface RoutingRule {
  strategy: RingStrategy;
  /**
   * Country code for numbers written in national format. "08034064184" is a
   * real Nigerian number, not a malformed American one — without this the
   * dialer can't tell which country to put in front of it.
   */
  defaultDialCode?: string;
  ringOrder: RingStep[];
  timeoutSeconds: number;
  fallback: FallbackDestination;
  fallbackTarget: string;
  afterHoursToMenu: boolean;
  afterHoursMenuId: string;
}

export const routingRule: RoutingRule = {
  strategy: "simultaneous",
  defaultDialCode: "",
  ringOrder: [],
  timeoutSeconds: 30,
  fallback: "voicemail",
  fallbackTarget: "",
  afterHoursToMenu: false,
  afterHoursMenuId: "",
};

export interface DayHours {
  day: string;
  open: boolean;
  start: string;
  end: string;
}

export interface HoursException {
  id: string;
  date: string;
  label: string;
  closed: boolean;
  start?: string;
  end?: string;
}

export interface BusinessHoursConfig {
  timezone: string;
  days: DayHours[];
  exceptions: HoursException[];
}

// A sensible default weekly template — timezone reads from the browser so it
// isn't tied to any particular company.
export const businessHours: BusinessHoursConfig = {
  timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  days: [
    { day: "Monday", open: true, start: "09:00", end: "17:00" },
    { day: "Tuesday", open: true, start: "09:00", end: "17:00" },
    { day: "Wednesday", open: true, start: "09:00", end: "17:00" },
    { day: "Thursday", open: true, start: "09:00", end: "17:00" },
    { day: "Friday", open: true, start: "09:00", end: "17:00" },
    { day: "Saturday", open: false, start: "09:00", end: "13:00" },
    { day: "Sunday", open: false, start: "09:00", end: "13:00" },
  ],
  exceptions: [],
};

export type ExtensionType = "User" | "Department" | "Ring group";

export interface Extension {
  id: string;
  number: string;
  label: string;
  type: ExtensionType;
  forwardsTo: string;
}

// No extensions yet — add users, departments or ring groups as you set them up.
export const extensions: Extension[] = [];

export interface VoicemailSettings {
  greetingMode: GreetingMode;
  greetingText: string;
  greetingFileName: string | null;
  greetingFile?: GreetingFile | null;
  transcriptionEnabled: boolean;
  emailNotifications: boolean;
  notifyEmail: string;
}

export const voicemailSettings: VoicemailSettings = {
  greetingMode: "tts",
  greetingText: "",
  greetingFileName: null,
  transcriptionEnabled: false,
  emailNotifications: false,
  notifyEmail: "",
};

export interface PhoneNumber {
  number: string;
  label: string;
  type: "Local" | "Toll-free";
  region: string;
  status: "Active" | "Pending";
  ivrMenuId: string | null;
  smsEnabled: boolean;
}

// No numbers yet — buy your first one from the Numbers tab.
export const phoneNumberList: PhoneNumber[] = [];

let idCounter = 1000;
/** Small local-id generator for rows created client-side (menus, options, extensions, …). */
export function nextId(prefix: string) {
  idCounter += 1;
  return `${prefix}_${idCounter}`;
}
