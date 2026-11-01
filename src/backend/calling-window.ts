// "Only call between 9am and 8pm" — worked out in the right time zone.
//
// Pure functions, no database and no clock of their own (the caller passes `now`), so every
// rule can be tested at 4:59pm on a Friday without waiting for one.

import { ZONE_LONGEST_PREFIX, ZONE_NAMES, ZONE_PREFIXES } from "./phone-zones";

export interface CallingWindow {
  enabled: boolean;
  /** First hour calls may start, 0 to 23. */
  startHour: number;
  /** Hour calls must stop, 1 to 24. A call is never started at or after this hour. */
  endHour: number;
  /** Days calls are allowed, 0 = Sunday to 6 = Saturday. */
  days: number[];
  /** "contact": each person's own local time. "single": one time zone for everybody. */
  mode: "contact" | "single";
  /** The zone used in "single" mode, and for any number whose zone isn't known. */
  zone: string;
}

/** A cautious default: inside the 8am to 9pm federal limit, Monday to Saturday. */
export const DEFAULT_CALLING_WINDOW: CallingWindow = {
  enabled: true,
  startHour: 9,
  endHour: 20,
  days: [1, 2, 3, 4, 5, 6],
  mode: "contact",
  zone: "America/New_York",
};

/** How campaigns saved before this feature behave: no limit at all, exactly as they did. */
export const OFF_CALLING_WINDOW: CallingWindow = { ...DEFAULT_CALLING_WINDOW, enabled: false };

export function isValidZone(zone: unknown): zone is string {
  if (typeof zone !== "string" || zone.length === 0 || zone.length > 64) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: zone });
    return true;
  } catch {
    return false;
  }
}

/** Fills every field so a hand-edited or half-saved value can't reach the dialer. */
export function sanitizeCallingWindow(raw: unknown, fallback: CallingWindow): CallingWindow {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const hour = (v: unknown, lo: number, hi: number, d: number) => {
    const n = Math.round(Number(v));
    return Number.isFinite(n) && n >= lo && n <= hi ? n : d;
  };
  let startHour = hour(r["startHour"], 0, 23, fallback.startHour);
  let endHour = hour(r["endHour"], 1, 24, fallback.endHour);
  if (endHour <= startHour) {
    startHour = fallback.startHour;
    endHour = fallback.endHour;
  }
  const days = Array.isArray(r["days"])
    ? [...new Set((r["days"] as unknown[]).map((d) => Math.round(Number(d))).filter((d) => Number.isInteger(d) && d >= 0 && d <= 6))].sort()
    : fallback.days;
  return {
    enabled: typeof r["enabled"] === "boolean" ? r["enabled"] : fallback.enabled,
    startHour,
    endHour,
    days: days.length > 0 ? days : fallback.days,
    mode: r["mode"] === "single" || r["mode"] === "contact" ? r["mode"] : fallback.mode,
    zone: isValidZone(r["zone"]) ? (r["zone"] as string) : fallback.zone,
  };
}

/** What is wrong with the window, in words the owner can act on, or null. */
export function callingWindowProblem(w: CallingWindow): string | null {
  if (!w.enabled) return null;
  if (w.endHour <= w.startHour) return "The calling window must end after it starts.";
  if (w.days.length === 0) return "Choose at least one day to call on.";
  // The federal limit, stated plainly: nobody may be called before 8am or after 9pm their time.
  if (w.startHour < 8 || w.endHour > 21) {
    return "Calls to people before 8am or after 9pm their time are not allowed in the US. Pick hours between 8am and 9pm.";
  }
  return null;
}

// ---------------------------------------------------------------------------
// Where is this number?
// ---------------------------------------------------------------------------

/** The time zones a phone number is likely in, or [] when it can't be told apart (use the campaign's zone). */
export function zonesForPhone(phone: string): string[] {
  const digits = phone.replace(/[^\d]/g, "");
  for (let n = Math.min(ZONE_LONGEST_PREFIX, digits.length); n >= 1; n--) {
    const hit = ZONE_PREFIXES[digits.slice(0, n)];
    if (hit === undefined) continue;
    if (hit === "") return [];
    return hit.split(",").map((i) => ZONE_NAMES[Number(i)] as string);
  }
  return [];
}

// ---------------------------------------------------------------------------
// Clock arithmetic
// ---------------------------------------------------------------------------

const formatters = new Map<string, Intl.DateTimeFormat>();
function formatter(zone: string): Intl.DateTimeFormat {
  let f = formatters.get(zone);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", { timeZone: zone, weekday: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
    formatters.set(zone, f);
  }
  return f;
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** The weekday (0 = Sunday) and minutes since midnight at `at`, on a clock in `zone`. */
export function localClock(at: Date, zone: string): { weekday: number; minutes: number } {
  let weekday = 0;
  let hour = 0;
  let minute = 0;
  for (const p of formatter(zone).formatToParts(at)) {
    if (p.type === "weekday") weekday = Math.max(0, WEEKDAYS.indexOf(p.value));
    else if (p.type === "hour") hour = Number(p.value) % 24;
    else if (p.type === "minute") minute = Number(p.value);
  }
  return { weekday, minutes: hour * 60 + minute };
}

function openIn(at: Date, zone: string, w: CallingWindow): boolean {
  const { weekday, minutes } = localClock(at, zone);
  return w.days.includes(weekday) && minutes >= w.startHour * 60 && minutes < w.endHour * 60;
}

/** The zones whose clocks must ALL be inside the window for this person to be called. */
export function zonesToCheck(phone: string, w: CallingWindow): string[] {
  if (w.mode === "single") return [w.zone];
  const zones = zonesForPhone(phone);
  return zones.length > 0 ? zones : [w.zone];
}

/** True when a call to `phone` may start at `at`. A person in two zones is called only when both are open. */
export function canCallNow(at: Date, phone: string, w: CallingWindow): boolean {
  if (!w.enabled) return true;
  return zonesToCheck(phone, w).every((z) => openIn(at, z, w));
}

const STEP_MS = 15 * 60 * 1000;
const LOOKAHEAD_STEPS = 8 * 24 * 4;

/** The first moment (to the quarter hour) after `at` when `phone` may be called, or null when it never can. */
export function nextOpenAt(at: Date, phone: string, w: CallingWindow): Date | null {
  if (!w.enabled) return at;
  const zones = zonesToCheck(phone, w);
  // Start from the next quarter hour boundary so the answer is stable and never in the past.
  const start = Math.ceil(at.getTime() / STEP_MS) * STEP_MS;
  for (let i = 0; i < LOOKAHEAD_STEPS; i++) {
    const t = new Date(start + i * STEP_MS);
    if (zones.every((z) => openIn(t, z, w))) return t;
  }
  return null;
}
