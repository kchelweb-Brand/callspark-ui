// Deciding whether a tenant is open right now.
//
// Pure functions with no I/O so the rules can be exercised directly — this is
// the logic most likely to be wrong at 4:59pm on a holiday, and least
// pleasant to debug through a live phone call.

export interface DayHours {
  day: string;
  open: boolean;
  start: string;
  end: string;
}

export interface HoursException {
  id?: string;
  date: string;
  label?: string;
  closed: boolean;
  start?: string;
  end?: string;
}

export interface BusinessHoursConfig {
  timezone?: string;
  days?: DayHours[];
  exceptions?: HoursException[];
}

/**
 * The wall-clock date and weekday at `at`, as seen in `timezone`.
 *
 * Business hours are what the tenant's staff experience, not what the server
 * experiences — a Lagos office closes at 17:00 Lagos time regardless of where
 * this code runs. Using the tenant's zone is the whole point.
 */
export function localParts(
  at: Date,
  timezone: string,
): { date: string; weekday: string; minutes: number } {
  let parts: Intl.DateTimeFormatPart[];
  try {
    parts = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      weekday: "long",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).formatToParts(at);
  } catch {
    // An unknown/typo'd IANA zone must not take inbound calling down; UTC is
    // a defensible fallback and the misconfiguration stays visible in the UI.
    return localParts(at, "UTC");
  }

  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  // `hour12: false` yields "24" for midnight in some ICU versions.
  const hour = Number(get("hour")) % 24;
  const minute = Number(get("minute"));

  return {
    date: `${get("year")}-${get("month")}-${get("day")}`,
    weekday: get("weekday"),
    minutes: hour * 60 + minute,
  };
}

/** "09:30" → 570. Returns null for anything unparseable. */
export function parseClock(value: string | undefined | null): number | null {
  if (!value) return null;
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;
  return hours * 60 + minutes;
}

/**
 * Whether a window is currently open.
 *
 * The end time is exclusive: a 09:00–17:00 office is closed at 17:00 sharp.
 * An overnight window (22:00–06:00) wraps midnight rather than being empty,
 * which is what a support line running late actually means.
 */
function withinWindow(nowMinutes: number, start: number, end: number): boolean {
  if (start === end) return false;
  if (start < end) return nowMinutes >= start && nowMinutes < end;
  return nowMinutes >= start || nowMinutes < end;
}

export interface OpenVerdict {
  open: boolean;
  /** Why — surfaced in logs so a routing surprise is explainable. */
  reason: string;
}

/**
 * Is the tenant open at `at`?
 *
 * An unconfigured business-hours document means "always open" rather than
 * "always closed": a tenant who has set up an IVR but never opened the
 * Business Hours tab should still have their calls answered.
 */
export function isOpenAt(config: BusinessHoursConfig | null | undefined, at: Date): OpenVerdict {
  const days = config?.days;
  if (!config || !Array.isArray(days) || days.length === 0) {
    return { open: true, reason: "no business hours configured — treating as always open" };
  }

  const timezone = config.timezone || "UTC";
  const { date, weekday, minutes } = localParts(at, timezone);

  // A dated exception (holiday, half day) always beats the weekly template.
  const exception = (config.exceptions ?? []).find((e) => e?.date === date);
  if (exception) {
    if (exception.closed) return { open: false, reason: `closed for exception on ${date}` };
    const start = parseClock(exception.start);
    const end = parseClock(exception.end);
    if (start === null || end === null) {
      return { open: true, reason: `exception on ${date} with no hours — treating as open` };
    }
    return {
      open: withinWindow(minutes, start, end),
      reason: `exception hours ${exception.start}–${exception.end} on ${date}`,
    };
  }

  const today = days.find((d) => d?.day === weekday);
  if (!today) return { open: true, reason: `no entry for ${weekday} — treating as open` };
  if (!today.open) return { open: false, reason: `${weekday} is marked closed` };

  const start = parseClock(today.start);
  const end = parseClock(today.end);
  if (start === null || end === null) {
    return { open: true, reason: `${weekday} has no valid hours — treating as open` };
  }

  return {
    open: withinWindow(minutes, start, end),
    reason: `${weekday} ${today.start}–${today.end} (${timezone})`,
  };
}
