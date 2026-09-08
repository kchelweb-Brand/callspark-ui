import { createServerFn } from "@tanstack/react-start";

import { sql } from "./db";
import { CODE_TTL_MINUTES, generateCode, hashCode, isAttemptsExceeded } from "./codes";
import { sendCodeEmail } from "./email";
import { signToken, verifyToken } from "./tokens";

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
}

interface TenantRow {
  id: string;
  name: string;
  workspace_slug: string;
  status: "pending" | "active" | "suspended";
  created_at: string;
  plan?: string | null;
  trial_ends_at?: string | null;
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

export const requestLoginCodeFn = createServerFn({ method: "POST" })
  .validator((data: { email: string; purpose: "login" | "admin_login"; workspaceSlug?: string }) => data)
  .handler(async ({ data }) => {
    const email = data.email.trim().toLowerCase();
    if (!email) throw new Error("Enter your email to continue.");

    if (data.purpose === "login") {
      const slug = (data.workspaceSlug || "").trim().toLowerCase();
      if (!slug) throw new Error("Enter your workspace to continue.");

      const tenants = await sql`select id from tenants where workspace_slug = ${slug} limit 1`;
      const tenant = tenants[0] as { id: string } | undefined;
      if (tenant) {
        const users = await sql`
          select id from users where tenant_id = ${tenant.id} and email = ${email} limit 1
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
  });

// ---------- verify-code ----------

export const verifyLoginCodeFn = createServerFn({ method: "POST" })
  .validator((data: { email: string; code: string; purpose: "login" | "admin_login" }) => data)
  .handler(async ({ data }) => {
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
      const users = await sql`
        select id, tenant_id, email, role, is_super_admin from users
        where email = ${email} and tenant_id is not null
        order by created_at desc limit 1
      `;
      user = users[0] as UserRow | undefined;
    }
    if (!user) throw new Error("Invalid or expired code.");

    let workspaceSlug: string | null = null;
    if (user.tenant_id) {
      const tenants = await sql`select workspace_slug, status from tenants where id = ${user.tenant_id} limit 1`;
      const tenant = tenants[0] as { workspace_slug: string; status: string } | undefined;
      if (data.purpose === "login" && tenant) {
        if (tenant.status === "suspended") throw new Error("This workspace has been suspended. Contact support.");
        if (tenant.status === "pending") throw new Error("This workspace is awaiting approval — we'll email you once it's live.");
      }
      workspaceSlug = tenant?.workspace_slug ?? null;
    }

    const token = await signToken({
      sub: user.id,
      email: user.email,
      role: user.role,
      tenantId: user.tenant_id,
      isSuperAdmin: user.is_super_admin,
      workspaceSlug,
    });

    return { ok: true as const, token, user: toAuthUser(user, workspaceSlug) };
  });

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

export const submitSignupFn = createServerFn({ method: "POST" })
  .validator(
    (data: {
      fullName: string;
      email: string;
      accountType: "individual" | "business";
      companyName?: string;
      workspaceSlug: string;
    }) => data,
  )
  .handler(async ({ data }) => {
    const email = data.email.trim().toLowerCase();
    const slug = data.workspaceSlug.trim().toLowerCase();
    const fullName = data.fullName.trim();
    if (!email || !fullName) throw new Error("Please fill in all the required fields.");

    const issue = slugIssue(slug);
    if (issue) throw new Error(issue);
    if (await isSlugTaken(slug)) throw new Error("This workspace name is already taken.");

    const inserted = await sql`
      insert into signup_requests (email, full_name, account_type, company_name, workspace_slug)
      values (${email}, ${fullName}, ${data.accountType}, ${data.companyName || null}, ${slug})
      returning id
    `;
    const signupId = (inserted[0] as { id: string }).id;

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

    return { ok: true as const, message: "Verification code sent.", expiresInMinutes: CODE_TTL_MINUTES };
  });

export const verifySignupFn = createServerFn({ method: "POST" })
  .validator((data: { email: string; code: string }) => data)
  .handler(async ({ data }) => {
    const email = data.email.trim().toLowerCase();
    const code = data.code.trim();

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
      select id, full_name, account_type, company_name, workspace_slug from signup_requests
      where email = ${email} and verified_at is null
      order by created_at desc limit 1
    `;
    const signup = pending[0] as
      | { id: string; full_name: string; account_type: string; company_name: string | null; workspace_slug: string }
      | undefined;
    if (!signup) throw new Error("Signup request not found. Please start over.");

    if (await isSlugTaken(signup.workspace_slug, signup.id)) {
      throw new Error("That workspace name was just taken. Please start over with a different name.");
    }

    await sql`update signup_requests set verified_at = now() where id = ${signup.id}`;

    const tenantName = signup.company_name?.trim() || signup.full_name;
    const tenants = await sql`
      insert into tenants (name, workspace_slug, status)
      values (${tenantName}, ${signup.workspace_slug}, 'pending')
      returning id
    `;
    const tenant = tenants[0] as { id: string };

    await sql`
      insert into users (tenant_id, email, role, is_super_admin)
      values (${tenant.id}, ${email}, 'tenant_owner', false)
    `;

    return {
      ok: true as const,
      status: "pending",
      message: "Your workspace has been created and is awaiting approval.",
      workspaceSlug: signup.workspace_slug,
    };
  });

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
  };
}

export const listTenantsFn = createServerFn({ method: "POST" })
  .validator((data: { token: string; status?: string }) => data)
  .handler(async ({ data }) => {
    await requireSuperAdmin(data.token);

    const rows = data.status
      ? await sql`
          select t.id, t.name, t.workspace_slug, t.status, t.created_at, t.plan, t.trial_ends_at,
            (select count(*) from users u where u.tenant_id = t.id) as user_count,
            (select u.email from users u where u.tenant_id = t.id order by (u.role = 'tenant_owner') desc, u.created_at asc limit 1) as owner_email
          from tenants t
          where t.status = ${data.status}
          order by t.created_at desc
        `
      : await sql`
          select t.id, t.name, t.workspace_slug, t.status, t.created_at, t.plan, t.trial_ends_at,
            (select count(*) from users u where u.tenant_id = t.id) as user_count,
            (select u.email from users u where u.tenant_id = t.id order by (u.role = 'tenant_owner') desc, u.created_at asc limit 1) as owner_email
          from tenants t
          order by t.created_at desc
        `;

    return {
      ok: true as const,
      tenants: (rows as unknown as Array<TenantRow & { user_count: number; owner_email: string | null }>).map(toAdminTenant),
    };
  });

export const setTenantStatusFn = createServerFn({ method: "POST" })
  .validator((data: { token: string; id: string; status: "active" | "suspended" | "pending" }) => data)
  .handler(async ({ data }) => {
    await requireSuperAdmin(data.token);

    const updated = await sql`
      update tenants set status = ${data.status} where id = ${data.id} returning id
    `;
    if (updated.length === 0) throw new Error("Could not find that tenant.");

    const rows = await sql`
      select t.id, t.name, t.workspace_slug, t.status, t.created_at, t.plan, t.trial_ends_at,
        (select count(*) from users u where u.tenant_id = t.id) as user_count,
        (select u.email from users u where u.tenant_id = t.id order by (u.role = 'tenant_owner') desc, u.created_at asc limit 1) as owner_email
      from tenants t where t.id = ${data.id}
    `;

    return {
      ok: true as const,
      tenant: toAdminTenant(rows[0] as unknown as TenantRow & { user_count: number; owner_email: string | null }),
    };
  });
