// What an invited agent is allowed to do, as chosen by the workspace owner.
//
// Pure data and no I/O, so it can be imported anywhere and tested directly. The
// server enforces these on every request; the screens only use them to decide
// what to show.

export type ContactAccess = "none" | "assigned" | "all";
export type CallHistoryAccess = "own" | "all";

export interface AgentPermissions {
  /** Place and answer calls. */
  dial: boolean;
  /** Work a campaign list one contact after another. Needs `dial`. */
  powerDialer: boolean;
  /**
   * `assigned` shows only the contacts attached to the agent's open tasks, so a
   * new hire can't browse (or export) the whole book.
   */
  contacts: ContactAccess;
  /** Add new contacts. Importing and deleting always stay with the owner. */
  editContacts: boolean;
  callHistory: CallHistoryAccess;
  /** Listen to recordings of their own calls (and everyone's when callHistory is `all`). */
  recordings: boolean;
}

export type PermissionPreset = "caller" | "senior" | "supervisor";

export const PRESETS: Record<PermissionPreset, AgentPermissions> = {
  caller: {
    dial: true,
    powerDialer: true,
    contacts: "assigned",
    editContacts: false,
    callHistory: "own",
    recordings: false,
  },
  senior: {
    dial: true,
    powerDialer: true,
    contacts: "all",
    editContacts: true,
    callHistory: "own",
    recordings: true,
  },
  supervisor: {
    dial: true,
    powerDialer: true,
    contacts: "all",
    editContacts: true,
    callHistory: "all",
    recordings: true,
  },
};

export const PRESET_LABELS: Record<PermissionPreset, string> = {
  caller: "Caller: dials assigned contacts, sees only their own calls",
  senior: "Senior: all contacts, can add contacts, hears recordings",
  supervisor: "Supervisor: everything above, plus everyone's call history",
};

export function isPreset(value: unknown): value is PermissionPreset {
  return value === "caller" || value === "senior" || value === "supervisor";
}

/** Fills every field, falling back to the most restrictive preset for anything missing or invalid. */
export function normalizePermissions(raw: unknown): AgentPermissions {
  const base = PRESETS.caller;
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const dial = typeof r["dial"] === "boolean" ? r["dial"] : base.dial;
  const contacts =
    r["contacts"] === "none" || r["contacts"] === "assigned" || r["contacts"] === "all"
      ? r["contacts"]
      : base.contacts;
  const callHistory = r["callHistory"] === "all" || r["callHistory"] === "own" ? r["callHistory"] : base.callHistory;
  return {
    dial,
    // A power dialer without the right to dial is meaningless.
    powerDialer: dial && (typeof r["powerDialer"] === "boolean" ? r["powerDialer"] : base.powerDialer),
    contacts,
    editContacts: contacts !== "none" && (typeof r["editContacts"] === "boolean" ? r["editContacts"] : base.editContacts),
    callHistory,
    recordings: typeof r["recordings"] === "boolean" ? r["recordings"] : base.recordings,
  };
}

/** A preset name or a custom permissions object, from an owner's form. */
export function resolvePermissions(input: { preset?: unknown; permissions?: unknown }): AgentPermissions {
  if (input.permissions && typeof input.permissions === "object") return normalizePermissions(input.permissions);
  return { ...PRESETS[isPreset(input.preset) ? input.preset : "caller"] };
}
