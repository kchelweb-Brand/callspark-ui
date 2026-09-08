# Kchel Dialer

A multi-tenant call center SaaS dashboard: a Tenant Dashboard (campaigns, contacts, live calls,
agents, call history, recordings, analytics, phone system, settings, billing) and a Super Admin
Dashboard (tenants, system health, billing & revenue, support) for the platform owner.

The Phone System section covers IVR/auto-attendant menu setup, call routing rules, business
hours, extensions and voicemail — configuration that answers and routes inbound calls before
they ever reach an agent.

The UI is fully interactive against local state today (every button, filter, toggle and form
works) and is structured to swap in real API calls next — `src/lib/auth-api.ts` and
`src/lib/contacts-api.ts` are already wired to a backend at `VITE_API_URL`; the rest follow the
same pattern.

## Development

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```

Set `VITE_API_URL` in `.env` to point at your backend (defaults to `http://localhost:4000`).
