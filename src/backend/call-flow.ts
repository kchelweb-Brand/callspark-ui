// The parts of inbound call handling that don't depend on the carrier.
//
// Two carriers drive the same phone system: Telnyx issues imperative commands
// over its REST API, SignalWire answers each webhook with cXML. What they must
// agree on is everything below — which tenant owns a number, which menu
// answers it, where an extension actually rings, and what the greeting is.
//
// Keeping it here means a routing fix lands for both carriers at once, and a
// third carrier is a new adapter rather than a second copy of the rules.

import { sql } from "./db";
import { normalizeNumber } from "./phone-numbers";
import { type BusinessHoursConfig } from "./business-hours";

/** Said when a tenant enabled a menu but never wrote a greeting. */
export const FALLBACK_MENU_GREETING =
  "Thank you for calling. Please listen to the following options.";
export const FALLBACK_VOICEMAIL_GREETING =
  "Thank you for calling. Please leave a message after the tone, then hang up when you are finished.";

/** How long a caller may talk for after the beep. */
export const VOICEMAIL_MAX_SECONDS = 300;

export interface IvrOption {
  id?: string;
  key?: string;
  label?: string;
  action?: string;
  target?: string;
}

export interface IvrMenu {
  id?: string;
  name?: string;
  greetingMode?: string;
  greetingText?: string;
  greetingFile?: { url?: string } | null;
  timeoutSeconds?: number;
  repeatCount?: number;
  options?: IvrOption[];
}

export interface Extension {
  id?: string;
  number?: string;
  label?: string;
  type?: string;
  forwardsTo?: string;
}

export interface RingStep {
  name?: string;
  ext?: string;
  ringSeconds?: number;
}

export interface RoutingRule {
  strategy?: string;
  /** E.164 country code for numbers stored in national format, e.g. "234". */
  defaultDialCode?: string;
  ringOrder?: RingStep[];
  timeoutSeconds?: number;
  fallback?: string;
  fallbackTarget?: string;
  afterHoursToMenu?: boolean;
  afterHoursMenuId?: string;
}

export interface VoicemailSettings {
  greetingMode?: string;
  greetingText?: string;
  greetingFile?: { url?: string } | null;
}

export interface TenantPhoneConfig {
  menus: IvrMenu[];
  extensions: Extension[];
  routing: RoutingRule;
  businessHours: BusinessHoursConfig;
  voicemail: VoicemailSettings;
  /**
   * The tenant's own SIP trunk as a dialable URI, or null if they have none.
   *
   * This is how a UDP/TCP/TLS trunk stays useful even though no browser can
   * register with it: the carrier places the leg over standard SIP on our
   * behalf. An extension forwarding to "trunk" resolves to this.
   */
  trunkUri: string | null;
}

export async function findTenantByNumber(to: string): Promise<{ tenantId: string } | null> {
  if (!to) return null;

  const exact = await sql`
    select tenant_id from phone_numbers where number = ${to} limit 1
  `;
  if (exact.length > 0) return { tenantId: (exact[0] as { tenant_id: string }).tenant_id };

  const normalized = normalizeNumber(to);
  if (!normalized) return null;

  const loose = await sql`
    select tenant_id from phone_numbers
    where right(regexp_replace(number, '\\D', '', 'g'), 10) = ${normalized}
    limit 1
  `;
  return loose.length > 0 ? { tenantId: (loose[0] as { tenant_id: string }).tenant_id } : null;
}

export async function menuIdForNumber(tenantId: string, to: string): Promise<string | null> {
  const normalized = normalizeNumber(to);
  const rows = await sql`
    select ivr_menu_id from phone_numbers
    where tenant_id = ${tenantId}
      and (number = ${to} or right(regexp_replace(number, '\\D', '', 'g'), 10) = ${normalized})
    limit 1
  `;
  return (rows[0] as { ivr_menu_id: string | null } | undefined)?.ivr_menu_id ?? null;
}

/** The number the caller dialled, reused as caller ID when ringing agents. */

export async function loadConfig(tenantId: string): Promise<TenantPhoneConfig> {
  const rows = await sql`
    select routing, business_hours, voicemail, menus, extensions
    from phone_system_settings where tenant_id = ${tenantId} limit 1
  `;
  const trunkRows = await sql`
    select sip_username, sip_host, sip_port, sip_transport
    from sip_connections where tenant_id = ${tenantId} limit 1
  `;
  const row = rows[0] as
    | {
        routing: RoutingRule | null;
        business_hours: BusinessHoursConfig | null;
        voicemail: VoicemailSettings | null;
        menus: IvrMenu[] | null;
        extensions: Extension[] | null;
      }
    | undefined;

  return {
    menus: row?.menus ?? [],
    extensions: row?.extensions ?? [],
    routing: row?.routing ?? {},
    businessHours: row?.business_hours ?? {},
    voicemail: row?.voicemail ?? {},
    trunkUri: buildTrunkUri(
      trunkRows[0] as
        | {
            sip_username: string | null;
            sip_host: string | null;
            sip_port: number | null;
            sip_transport: string | null;
          }
        | undefined,
    ),
  };
}

/**
 * A SIP URI for the tenant's own trunk, e.g. `sip:1001@pbx.example.com:5060;transport=tcp`.
 *
 * The transport parameter is only emitted for TCP and TLS — UDP is the SIP
 * default and `wss` is meaningless to a carrier placing the leg itself.
 */
export function buildTrunkUri(
  trunk:
    | { sip_username: string | null; sip_host: string | null; sip_port: number | null; sip_transport: string | null }
    | undefined,
): string | null {
  const user = trunk?.sip_username?.trim();
  const host = trunk?.sip_host?.trim();
  if (!user || !host) return null;

  const transport = (trunk?.sip_transport ?? "").toLowerCase();
  const port = trunk?.sip_port ? `:${trunk.sip_port}` : "";
  const param = transport === "tcp" || transport === "tls" ? `;transport=${transport}` : "";
  return `sip:${user}@${host}${port}${param}`;
}

/**
 * Menus are referenced by id internally, but a "Go to another menu" option is
 * typed by the person building the IVR, who sees the menu's *name*. Matching
 * both is the difference between that option working and silently dropping
 * the caller into voicemail.
 */
export function findMenu(config: TenantPhoneConfig, ref: string | null | undefined): IvrMenu | null {
  if (!ref) return null;
  const needle = ref.trim().toLowerCase();
  return (
    config.menus.find((m) => m?.id === ref) ??
    config.menus.find((m) => (m?.name ?? "").trim().toLowerCase() === needle) ??
    null
  );
}

/**
 * Turns an extension reference into things Telnyx can dial.
 *
 * `forwardsTo` may hold a phone number, a SIP URI, or several separated by
 * commas (a ring group hunts through them in order).
 */
export function targetsForExtension(config: TenantPhoneConfig, reference: string): string[] {
  const ref = reference.trim();
  if (!ref) return [];

  const needle = ref.toLowerCase();
  const ext =
    config.extensions.find((e) => e?.id === ref) ??
    config.extensions.find((e) => String(e?.number ?? "") === ref) ??
    // The IVR editor asks for a "Department or queue name", so a ring option's
    // target is usually the extension's label rather than its id or number.
    config.extensions.find((e) => (e?.label ?? "").trim().toLowerCase() === needle) ??
    null;

  const raw = ext?.forwardsTo ?? ref;
  const dialCode = config.routing.defaultDialCode;
  return raw
    .split(",")
    .map((t) => (t.trim().toLowerCase() === "trunk" ? config.trunkUri : dialableTarget(t, dialCode)))
    .filter((t): t is string => Boolean(t));
}

export function ringTargetsFromRouting(config: TenantPhoneConfig): string[] {
  const order = config.routing.ringOrder ?? [];
  const targets: string[] = [];
  for (const step of order) {
    for (const t of targetsForExtension(config, step?.ext ?? "")) {
      if (!targets.includes(t)) targets.push(t);
    }
  }
  return targets;
}

/**
 * Normalizes one destination into something the carrier accepts, or null if
 * it can't be dialled (a bare "201" is an internal extension number, not a
 * routable destination).
 */
export function dialableTarget(value: string, defaultDialCode?: string | null): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed.toLowerCase().startsWith("sip:")) return trimmed;

  const digits = trimmed.replace(/[^\d+]/g, "");
  if (digits.startsWith("+")) return digits;

  const bare = digits.replace(/\D/g, "");
  if (!bare) return null;

  // 00 is the international prefix most of the world dials.
  if (bare.startsWith("00")) return `+${bare.slice(2)}`;

  // A leading 0 is a national trunk prefix — "08034064184" is a real number in
  // Nigeria, not a malformed US one. It only becomes dialable once we know the
  // country, which is why the workspace carries a default dial code.
  const code = (defaultDialCode ?? "").replace(/[^\d]/g, "");
  if (bare.startsWith("0") && code) return `+${code}${bare.slice(1)}`;

  // North American numbering, kept because it needs no configuration.
  if (bare.length === 11 && bare.startsWith("1")) return `+${bare}`;
  if (bare.length === 10 && (!code || code === "1")) return `+1${bare}`;

  // Anything else is only meaningful with a country in front of it.
  if (code) return `+${code}${bare}`;
  return null;
}

/** Absolute URL for an uploaded greeting, or null when the menu uses TTS. */
export function greetingAudioUrl(
  mode: string | undefined,
  file: { url?: string } | null | undefined,
  origin: string,
): string | null {
  if (mode !== "upload") return null;
  const url = file?.url;
  if (!url) return null;
  // Stored URLs are site-relative ("/media/greetings/…"); the carrier's media
  // server needs an absolute one.
  return url.startsWith("http") ? url : `${origin}${url.startsWith("/") ? "" : "/"}${url}`;
}
