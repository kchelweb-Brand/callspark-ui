import { createServerFn } from "@tanstack/react-start";

import { sql } from "./db";
import { CODE_TTL_MINUTES, generateCode, hashCode, isAttemptsExceeded } from "./codes";
import { getTenantPlan } from "./entitlements";
import { sendCodeEmail } from "./email";
import { callingCodeFromE164 } from "./phone-numbers";
import { PLANS } from "./plans";
import { signToken, verifyToken } from "./tokens";
import { ensureSchema } from "./schema.server";
import { hasExpired, lifecycleOf } from "./billing-lifecycle";
import { parsePhone } from "./contact-import";
import { sendSms } from "./signalwire-rest";
import { countryByCode } from "./countries";

type Purpose = "login" | "admin_login" | "signup";

const RESERVED_SLUGS = new Set(["admin", "api", "www", "app", "dashboard", "login", "signup"]);
const SLUG_RE = /^[a-z0-9][a-z0-9-]{1,30}[a-z0-9]$/;

function slugIssue(slug: string): string | null {
  if (!SLUG_RE.test(slug)) {
    return "Use 3-32 lowercase letters, numbers and hyphens (no leading/trailing hyphen).";
  }
  if (RESERVED_SLUGS.has(slug)) {
    return "This workspace name is reserved.";
  }
  return null;
}

/**
 * `excludeSignupId` lets the verify step recheck against real tenants and
 * *other* pending signups without tripping over the very signup_requests row
 * it's in the middle of promoting.
 */
async function isSlugTaken(slug: string, excludeSignupId?: string): Promise<boolean> {
  const tenant = await sql`select 1 from tenants where workspace_slug = ${slug} limit 1`;
  if (tenant.length > 0) return true;

  const pending = excludeSignupId
    ? await sql`
        select 1 from signup_requests
        where workspace_slug = ${slug} and verified_at is null and created_at > now() - interval '1 hour'
          and id != ${excludeSignupId}
        limit 1
      `
    : await sql`
        select 1 from signup_requests
        where workspace_slug = ${slug} and verified_at is null and created_at > now() - interval '1 hour'
        limit 1
      `;
  return pending.length > 0;
}

interface UserRow {
  id: string;
  tenant_id: string | null;
  email: string;
  role: string;
  is_super_admin: boolean;
  status?: string;
}

interface TenantRow {
  id: string;
  name: string;
  workspace_slug: string;
  status: "pending" | "active" | "suspended";
  created_at: string;
  plan?: string | null;
  trial_ends_at?: string | null;
  paid_until?: string | null;
  held_at?: string | null;
  dialer_addon_enabled?: boolean;
  sip_addon_enabled?: boolean;
}

function toAuthUser(user: UserRow, workspaceSlug: string | null) {
  return {
    id: user.id,
    email: user.email,
    role: user.role,
    tenant_id: user.tenant_id,
    is_super_admin: user.is_super_admin,
    ...(workspaceSlug ? { workspace_slug: workspaceSlug } : {}),
  };
}

async function issueCode(email: string, purpose: Purpose) {
  const code = generateCode();
  const codeHash = await hashCode(email, purpose, code);
  const expiresAt = new Date(Date.now() + CODE_TTL_MINUTES * 60_000).toISOString();
  await sql`
    insert into otp_codes (email, code_hash, purpose, expires_at)
    values (${email}, ${codeHash}, ${purpose}, ${expiresAt})
  `;
  return sendCodeEmail(email, code, purpose);
}

// ---------- request-code ----------

export async function requestLoginCode(data: {
  email: string;
  purpose: "login" | "admin_login";
  workspaceSlug?: string;
}) {
    const email = data.email.trim().toLowerCase();
    if (!email) throw new Error("Enter your email to continue.");

    if (data.purpose === "login") {
      const slug = (data.workspaceSlug || "").trim().toLowerCase();
      if (!slug) throw new Error("Enter your workspace to continue.");

      const tenants = await sql`select id from tenants where workspace_slug = ${slug} limit 1`;
      const tenant = tenants[0] as { id: string } | undefined;
      if (tenant) {
        await ensureSchema();
        // A person whose access the owner turned off gets no code at all.
        const users = await sql`
          select id from users where tenant_id = ${tenant.id} and email = ${email} and status <> 'disabled' limit 1
        `;
        if (users.length > 0) {
          const sent = await issueCode(email, "login");
          // Deliberately not surfaced: reporting a delivery failure here would
          // only ever happen for addresses that have an account, which is
          // exactly what the generic response below exists to hide. The
          // operator sees it in the logs instead.
          if (!sent.delivered) {
            console.error(`[auth] login code for ${email} was not delivered: ${sent.error}`);
          }
        }
      }
    } else {
      const users = await sql`
        select id from users where email = ${email} and is_super_admin = true limit 1
      `;
      if (users.length > 0) {
        const sent = await issueCode(email, "admin_login");
        if (!sent.delivered) {
          console.error(`[auth] admin code for ${email} was not delivered: ${sent.error}`);
        }
      }
    }

    // Always a generic response — never reveal whether the account exists.
    return { ok: true as const, message: "If that account exists, a login code has been sent.", expiresInMinutes: CODE_TTL_MINUTES };
}

export const requestLoginCodeFn = createServerFn({ method: "POST" })
  .validator((data: { email: string; purpose: "login" | "admin_login"; workspaceSlug?: string }) => data)
  .handler(async ({ data }) => requestLoginCode(data));

// ---------- verify-code ----------

export async function verifyLoginCode(data: {
  email: string;
  code: string;
  purpose: "login" | "admin_login";
  /** Which workspace they are signing in to. Matters when one email belongs to several. */
  workspaceSlug?: string;
}) {
    await ensureSchema();
    const email = data.email.trim().toLowerCase();
    const code = data.code.trim();

    const rows = await sql`
      select id, code_hash, attempt_count from otp_codes
      where email = ${email} and purpose = ${data.purpose} and consumed_at is null and expires_at > now()
      order by created_at desc limit 1
    `;
    const row = rows[0] as { id: string; code_hash: string; attempt_count: number } | undefined;
    if (!row) throw new Error("Invalid or expired code.");
    if (isAttemptsExceeded(row.attempt_count)) throw new Error("Too many attempts. Request a new code.");

    const expectedHash = await hashCode(email, data.purpose, code);
    if (expectedHash !== row.code_hash) {
      await sql`update otp_codes set attempt_count = attempt_count + 1 where id = ${row.id}`;
      throw new Error("Invalid or expired code.");
    }
    await sql`update otp_codes set consumed_at = now() where id = ${row.id}`;

    let user: UserRow | undefined;
    if (data.purpose === "admin_login") {
      const users = await sql`
        select id, tenant_id, email, role, is_super_admin from users
        where email = ${email} and is_super_admin = true limit 1
      `;
      user = users[0] as UserRow | undefined;
    } else {
      const slug = (data.workspaceSlug || "").trim().toLowerCase();
      const users = slug
        ? await sql`
            select u.id, u.tenant_id, u.email, u.role, u.is_super_admin, u.status from users u
            join tenants t on t.id = u.tenant_id
            where u.email = ${email} and t.workspace_slug = ${slug} limit 1
          `
        : await sql`
            select id, tenant_id, email, role, is_super_admin, status from users
            where email = ${email} and tenant_id is not null
            order by created_at desc limit 1
          `;
      user = users[0] as UserRow | undefined;
    }
    if (!user) throw new Error("Invalid or expired code.");
    if (user.status === "disabled") {
      throw new Error("Your access to this workspace has been turned off. Ask the workspace owner.");
    }

    let workspaceSlug: string | null = null;
    if (user.tenant_id) {
      const tenants = await sql`select workspace_slug from tenants where id = ${user.tenant_id} limit 1`;
      const tenant = tenants[0] as { workspace_slug: string } | undefined;
      workspaceSlug = tenant?.workspace_slug ?? null;

      // Ordinary logins only — an admin logging into the console isn't
      // blocked by a customer tenant's own state. Routed through
      // getTenantPlan rather than reading status directly, because that's
      // also where a lapsed trial gets suspended: this is the moment that
      // almost always notices it first, since it's exactly what someone
      // does after being away for two weeks.
      if (data.purpose === "login" && tenant) {
        const { status } = await getTenantPlan(user.tenant_id);
        if (status === "suspended") throw new Error("This workspace has been suspended. Contact support.");
        if (status === "pending") throw new Error("This workspace is awaiting approval — we'll email you once it's live.");
      }
    }

    // The first sign-in is what accepts an invitation.
    if (user.status === "invited") {
      await sql`update users set status = 'active', accepted_at = coalesce(accepted_at, now()) where id = ${user.id}`;
    }

    const token = await signToken({
      sub: user.id,
      email: user.email,
      role: user.role,
      tenantId: user.tenant_id,
      isSuperAdmin: user.is_super_admin,
      workspaceSlug,
      ...(user.role === "agent" && !user.is_super_admin ? { agent: true } : {}),
    });

    return { ok: true as const, token, user: toAuthUser(user, workspaceSlug) };
}

export const verifyLoginCodeFn = createServerFn({ method: "POST" })
  .validator((data: Parameters<typeof verifyLoginCode>[0]) => data)
  .handler(async ({ data }) => verifyLoginCode(data));

// ---------- signup ----------

export const checkSlugAvailabilityFn = createServerFn({ method: "POST" })
  .validator((data: { slug: string }) => data)
  .handler(async ({ data }) => {
    const slug = data.slug.trim().toLowerCase();
    const issue = slugIssue(slug);
    if (issue) return { available: false, reason: issue };
    const taken = await isSlugTaken(slug);
    return taken
      ? { available: false, reason: "This workspace name is already taken." }
      : { available: true, reason: null };
  });

const PHONE_CODE_TTL_MINUTES = 10;
const SIGNUPS_PER_PHONE_PER_HOUR = 3;

/**
 * Texts a verification code to a pending signup's phone, from the platform's
 * own number. With no sender configured nothing is sent and signup carries on
 * with the phone recorded as unverified; a sender that is configured but fails
 * is an error, because the number is then probably wrong.
 */
async function sendPhoneCode(signupId: string, phone: string): Promise<{ sent: boolean; error?: string }> {
  const from = process.env["PLATFORM_SMS_FROM"] || "";
  if (!from) return { sent: false };
  const code = generateCode();
  const hash = await hashCode(phone, "phone", code);
  await sql`
    update signup_requests set
      phone_code_hash = ${hash},
      phone_code_expires_at = now() + (${PHONE_CODE_TTL_MINUTES} || ' minutes')::interval,
      phone_code_attempts = 0
    where id = ${signupId}
  `;
  const result = await sendSms({
    to: phone,
    from,
    body: `Your Kchel verification code is ${code}. It expires in ${PHONE_CODE_TTL_MINUTES} minutes.`,
  });
  if (!result.ok) {
    await sql`update signup_requests set phone_code_hash = null where id = ${signupId}`;
    return { sent: false, error: "We couldn't text that number. Check it, including the country, and try again." };
  }
  return { sent: true };
}

function cleanWebsite(raw: string | undefined): string | null {
  const text = (raw ?? "").trim();
  if (!text) return null;
  try {
    const url = new URL(/^https?:\/\//i.test(text) ? text : `https://${text}`);
    if (!url.hostname.includes(".")) throw new Error("no dot");
    return url.toString().replace(/\/$/, "").slice(0, 200);
  } catch {
    throw new Error("That website address doesn't look right. Leave it empty if you don't have one.");
  }
}

export async function resendPhoneCode(data: { email: string }) {
  await ensureSchema();
  const email = data.email.trim().toLowerCase();
  const rows = await sql`
    select id, phone, (phone_code_expires_at is not null
      and phone_code_expires_at > now() + ((${PHONE_CODE_TTL_MINUTES} - 1) || ' minutes')::interval) as too_soon
    from signup_requests where email = ${email} and verified_at is null order by created_at desc limit 1
  `;
  const row = rows[0] as { id: string; phone: string | null; too_soon: boolean } | undefined;
  if (!row?.phone) throw new Error("Signup request not found. Please start over.");
  if (row.too_soon) throw new Error("Wait a minute before asking for another text.");
  const sent = await sendPhoneCode(row.id, row.phone);
  if (sent.error) throw new Error(sent.error);
  return { ok: true as const, sent: sent.sent };
}

export const resendPhoneCodeFn = createServerFn({ method: "POST" })
  .validator((data: Parameters<typeof resendPhoneCode>[0]) => data)
  .handler(async ({ data }) => resendPhoneCode(data));

export async function submitSignup(data: {
  fullName: string;
  email: string;
  accountType: "individual" | "business";
  companyName?: string;
  phone: string;
  country: string;
  city: string;
  address?: string;
  website?: string;
  workspaceSlug: string;
}) {
  await ensureSchema();
  const email = data.email.trim().toLowerCase();
  const slug = data.workspaceSlug.trim().toLowerCase();
  const fullName = data.fullName.trim();
  if (!email || !fullName) throw new Error("Please fill in all the required fields.");

  const issue = slugIssue(slug);
  if (issue) throw new Error(issue);
  if (await isSlugTaken(slug)) throw new Error("This workspace name is already taken.");

  // Where the customer is and how to reach them: asked for up front so a
  // workspace is never an anonymous throwaway, and so prices and phone
  // routing start out right for their country.
  const country = countryByCode(data.country);
  if (!country) throw new Error("Choose your country.");
  const city = data.city?.trim().slice(0, 100);
  if (!city) throw new Error("Enter your city.");
  if (data.accountType === "business" && !data.companyName?.trim()) {
    throw new Error("Company name is required for business accounts.");
  }
  const parsedPhone = parsePhone(data.phone ?? "", country.dial);
  if ("error" in parsedPhone) throw new Error(`Phone number: ${parsedPhone.error}.`);
  const phone = parsedPhone.phone;
  const website = cleanWebsite(data.website);
  const address = data.address?.trim().slice(0, 200) || null;

  // Each text costs money and a code can be requested for any number, so a
  // number can only start a few signups an hour.
  const [recent] = await sql`
    select count(*)::int as n from signup_requests
    where phone = ${phone} and created_at > now() - interval '1 hour'
  `;
  if (Number(recent?.["n"] ?? 0) >= SIGNUPS_PER_PHONE_PER_HOUR) {
    throw new Error("That phone number has been used for too many signups. Try again in an hour.");
  }

  const inserted = await sql`
    insert into signup_requests (email, full_name, account_type, company_name, phone, workspace_slug, country, city, address, website)
    values (
      ${email}, ${fullName}, ${data.accountType}, ${data.companyName || null},
      ${phone}, ${slug}, ${country.code}, ${city}, ${address}, ${website}
    )
    returning id
  `;
  const signupId = (inserted[0] as { id: string }).id;

  const phoneCode = await sendPhoneCode(signupId, phone);
  if (phoneCode.error) {
    await sql`delete from signup_requests where id = ${signupId} and verified_at is null`;
    throw new Error(phoneCode.error);
  }

  // Signup can report a delivery failure honestly: this flow already tells
  // the caller whether an email or workspace is taken, so there is no account
  // to leak. Telling someone "check your email" when nothing was sent leaves
  // them waiting on a message that will never arrive.
  const sent = await issueCode(email, "signup");

  if (!sent.delivered) {
    // Undo the reservation. A pending signup holds its workspace name for an
    // hour, so leaving this row behind would make the retry fail with "this
    // workspace name is already taken" — the user blocked by their own
    // failed attempt, and no way to tell that from a genuine collision.
    await sql`delete from signup_requests where id = ${signupId} and verified_at is null`;
    throw new Error(sent.error ?? "We couldn't send your verification code. Please try again.");
  }

  return {
    ok: true as const,
    message: "Verification code sent.",
    expiresInMinutes: CODE_TTL_MINUTES,
    phoneCodeSent: phoneCode.sent,
  };
}

export const submitSignupFn = createServerFn({ method: "POST" })
  .validator((data: Parameters<typeof submitSignup>[0]) => data)
  .handler(async ({ data }) => submitSignup(data));

export async function verifySignup(data: { email: string; code: string; phoneCode?: string }) {
  await ensureSchema();
  const email = data.email.trim().toLowerCase();
  const code = data.code.trim();

  // When a text was sent, that code is owed too. It is checked first, so a
  // wrong text code never uses up the email code.
  const owed = await sql`
    select id, phone, phone_code_hash, phone_code_attempts, (phone_code_expires_at > now()) as phone_code_live
    from signup_requests where email = ${email} and verified_at is null order by created_at desc limit 1
  `;
  const phoneOwed = owed[0] as
    | { id: string; phone: string; phone_code_hash: string | null; phone_code_attempts: number; phone_code_live: boolean }
    | undefined;
  let phoneVerified = false;
  if (phoneOwed?.phone_code_hash) {
    const typed = (data.phoneCode ?? "").trim();
    if (typed.length !== 6) throw new Error("Enter the 6-digit code we texted to your phone.");
    if (!phoneOwed.phone_code_live) throw new Error("The text code has expired. Ask for a new one.");
    if (isAttemptsExceeded(phoneOwed.phone_code_attempts)) throw new Error("Too many attempts. Ask for a new text code.");
    if ((await hashCode(phoneOwed.phone, "phone", typed)) !== phoneOwed.phone_code_hash) {
      await sql`update signup_requests set phone_code_attempts = phone_code_attempts + 1 where id = ${phoneOwed.id}`;
      throw new Error("That text code isn't right.");
    }
    phoneVerified = true;
  }

  const rows = await sql`
    select id, code_hash, attempt_count from otp_codes
    where email = ${email} and purpose = 'signup' and consumed_at is null and expires_at > now()
    order by created_at desc limit 1
  `;
  const row = rows[0] as { id: string; code_hash: string; attempt_count: number } | undefined;
  if (!row) throw new Error("Invalid or expired code.");
  if (isAttemptsExceeded(row.attempt_count)) throw new Error("Too many attempts. Request a new code.");

  const expectedHash = await hashCode(email, "signup", code);
  if (expectedHash !== row.code_hash) {
    await sql`update otp_codes set attempt_count = attempt_count + 1 where id = ${row.id}`;
    throw new Error("Invalid or expired code.");
  }
  await sql`update otp_codes set consumed_at = now() where id = ${row.id}`;

  const pending = await sql`
    select id, full_name, account_type, company_name, phone, workspace_slug, country, city, address, website
    from signup_requests
    where email = ${email} and verified_at is null
    order by created_at desc limit 1
  `;
  const signup = pending[0] as
    | {
        id: string;
        full_name: string;
        account_type: string;
        company_name: string | null;
        phone: string | null;
        workspace_slug: string;
        country: string | null;
        city: string | null;
        address: string | null;
        website: string | null;
      }
    | undefined;
  if (!signup) throw new Error("Signup request not found. Please start over.");

  if (await isSlugTaken(signup.workspace_slug, signup.id)) {
    throw new Error("That workspace name was just taken. Please start over with a different name.");
  }

  await sql`
    update signup_requests set verified_at = now(),
      phone_verified_at = case when ${phoneVerified} then now() else null end,
      phone_code_hash = null
    where id = ${signup.id}
  `;

  // Live immediately, no approval queue — the trial clock starts at this
  // exact insert, not whenever a human next looks at it. Same interval
  // setTenantPlanFn uses when the admin console puts a tenant back on
  // trial, so there's one place that decides what "7 days" means.
  const tenantName = signup.company_name?.trim() || signup.full_name;
  const trialDays = PLANS.trial.trialDays ?? 7;
  const tenants = await sql`
    insert into tenants (name, workspace_slug, status, trial_ends_at, country, phone_verified_at)
    values (
      ${tenantName}, ${signup.workspace_slug}, 'active',
      now() + (${trialDays} || ' days')::interval,
      ${signup.country}, case when ${phoneVerified} then now() else null end
    )
    returning id
  `;
  const tenant = tenants[0] as { id: string };

  const createdUsers = await sql`
    insert into users (tenant_id, email, role, is_super_admin)
    values (${tenant.id}, ${email}, 'tenant_owner', false)
    returning id, tenant_id, email, role, is_super_admin
  `;
  const owner = createdUsers[0] as unknown as UserRow;

  // Prefill from what signup already collected, so Settings and Phone
  // System open with real information instead of blanks the owner has to
  // remember to fill in a second time. Both are genuine upserts (the row
  // doesn't exist yet for a brand-new tenant) and neither invents data the
  // customer didn't provide — a business phone left blank at signup just
  // means the dial code stays blank too, same as today.
  await sql`
    insert into tenant_settings (tenant_id, workspace, updated_at)
    values (
      ${tenant.id},
      ${JSON.stringify({
        company: tenantName,
        phone: signup.phone,
        country: signup.country,
        city: signup.city,
        address: signup.address,
        website: signup.website,
      })}::jsonb,
      now()
    )
    on conflict (tenant_id) do update set
      workspace = tenant_settings.workspace || excluded.workspace,
      updated_at = now()
  `;

  const dialCode = signup.phone ? callingCodeFromE164(signup.phone) : "";
  if (dialCode) {
    await sql`
      insert into phone_system_settings (tenant_id, routing, updated_at)
      values (${tenant.id}, ${JSON.stringify({ defaultDialCode: dialCode })}::jsonb, now())
      on conflict (tenant_id) do update set
        routing = phone_system_settings.routing || excluded.routing,
        updated_at = now()
    `;
  }

  // They have just proved they own this email (and phone), which is what a sign-in code proves
  // too, so they are signed in now. That lets payment follow in the same sitting.
  const token = await signToken({
    sub: owner.id,
    email: owner.email,
    role: owner.role,
    tenantId: owner.tenant_id,
    isSuperAdmin: false,
    workspaceSlug: signup.workspace_slug,
  });

  return {
    ok: true as const,
    status: "active",
    message: `Your workspace is live. Your ${trialDays}-day trial starts now.`,
    workspaceSlug: signup.workspace_slug,
    token,
    user: toAuthUser(owner, signup.workspace_slug),
  };
}

export const verifySignupFn = createServerFn({ method: "POST" })
  .validator((data: Parameters<typeof verifySignup>[0]) => data)
  .handler(async ({ data }) => verifySignup(data));

// ---------- admin: tenants ----------

async function requireSuperAdmin(token: string) {
  const payload = await verifyToken(token);
  if (!payload || !payload.isSuperAdmin) {
    throw new Error("Not authorized.");
  }
  return payload;
}

function toAdminTenant(row: TenantRow & { user_count: number | string; owner_email: string | null }) {
  return {
    id: row.id,
    name: row.name,
    workspace_slug: row.workspace_slug,
    status: row.status,
    created_at: row.created_at,
    user_count: Number(row.user_count),
    owner_email: row.owner_email,
    // Which plan the tenant is on drives the admin console's activate action.
    plan: row.plan ?? "trial",
    trial_ends_at: row.trial_ends_at ?? null,
    dialer_addon_enabled: row.dialer_addon_enabled ?? false,
    sip_addon_enabled: row.sip_addon_enabled ?? false,
    paid_until: row.paid_until ?? null,
    // Where its plan stands, and whether the platform owner put it on hold by hand.
    renewal_state: lifecycleOf({ plan: row.plan, trialEndsAt: row.trial_ends_at, paidUntil: row.paid_until, heldAt: row.held_at }).state,
    held_by_admin: Boolean(row.held_at),
    plan_expired: hasExpired({ plan: row.plan, trialEndsAt: row.trial_ends_at, paidUntil: row.paid_until }),
  };
}

export async function listTenants(data: { token: string; status?: string }) {
    await requireSuperAdmin(data.token);
    await ensureSchema();

    const rows = data.status
      ? await sql`
          select t.id, t.name, t.workspace_slug, t.status, t.created_at, t.plan, t.trial_ends_at, t.paid_until, t.held_at, t.dialer_addon_enabled, t.sip_addon_enabled,
            (select count(*) from users u where u.tenant_id = t.id) as user_count,
            (select u.email from users u where u.tenant_id = t.id order by (u.role = 'tenant_owner') desc, u.created_at asc limit 1) as owner_email
          from tenants t
          where t.status = ${data.status}
          order by t.created_at desc
        `
      : await sql`
          select t.id, t.name, t.workspace_slug, t.status, t.created_at, t.plan, t.trial_ends_at, t.paid_until, t.held_at, t.dialer_addon_enabled, t.sip_addon_enabled,
            (select count(*) from users u where u.tenant_id = t.id) as user_count,
            (select u.email from users u where u.tenant_id = t.id order by (u.role = 'tenant_owner') desc, u.created_at asc limit 1) as owner_email
          from tenants t
          order by t.created_at desc
        `;

    return {
      ok: true as const,
      tenants: (rows as unknown as Array<TenantRow & { user_count: number; owner_email: string | null }>).map(toAdminTenant),
    };
  }

export const listTenantsFn = createServerFn({ method: "POST" })
  .validator((data: Parameters<typeof listTenants>[0]) => data)
  .handler(async ({ data }) => listTenants(data));

export async function setTenantStatus(data: { token: string; id: string; status: "active" | "suspended" | "pending" }) {
    await requireSuperAdmin(data.token);
    await ensureSchema();

    const updated = await sql`
      update tenants set status = ${data.status} where id = ${data.id} returning id
    `;
    if (updated.length === 0) throw new Error("Could not find that tenant.");

    const rows = await sql`
      select t.id, t.name, t.workspace_slug, t.status, t.created_at, t.plan, t.trial_ends_at, t.paid_until, t.held_at, t.dialer_addon_enabled, t.sip_addon_enabled,
        (select count(*) from users u where u.tenant_id = t.id) as user_count,
        (select u.email from users u where u.tenant_id = t.id order by (u.role = 'tenant_owner') desc, u.created_at asc limit 1) as owner_email
      from tenants t where t.id = ${data.id}
    `;

    return {
      ok: true as const,
      tenant: toAdminTenant(rows[0] as unknown as TenantRow & { user_count: number; owner_email: string | null }),
    };
  }

export const setTenantStatusFn = createServerFn({ method: "POST" })
  .validator((data: Parameters<typeof setTenantStatus>[0]) => data)
  .handler(async ({ data }) => setTenantStatus(data));
