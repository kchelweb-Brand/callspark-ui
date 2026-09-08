# scripts

| Script | What it does |
| --- | --- |
| `npm run migrate` | Creates/updates tables. Additive and idempotent — safe to re-run. |
| `npm run deploy` | Builds, patches Nitro's generated wrangler config (worker name, R2 binding, UTC compatibility date), then deploys. |

## Rule: never run destructive SQL against a real tenant

A verification pass once deleted a live tenant's `phone_system_settings` row —
their IVR menu went with it. Testing must not touch production data.

A sandbox tenant exists for that purpose:

- workspace slug: `qa-sandbox`
- owner email: `qa@kchel.internal`

When verifying anything that writes to the database:

1. Point the test session at the sandbox tenant, not a customer's.
2. Scope any cleanup to **specific row ids you created**, never
   `delete from <table> where tenant_id = ...` — that wipes everything the
   tenant owns, not just the test rows.
3. Prefer deleting through the app's own UI, which exercises the real code
   path and can only touch what the signed-in tenant owns.
