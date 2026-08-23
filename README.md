# Call Flow Central

Build a multi-tenant call center SaaS dashboard with two views: a Tenant Dashboard and a Super Admin Dashboard. Use a clean, modern SaaS aesthetic (dark sidebar, light content area, card-based layout).

TENANT DASHBOARD (for each client company using the dialer):

- Sidebar navigation: Overview, Campaigns, Contacts, Live Calls, Agents, Call History, Recordings, Analytics, Settings, Billing

- Overview page: stat cards (calls today, connected rate, active agents, minutes used), a live activity feed, and a simple line chart of call volume over the last 7 days

- Campaigns page: table of campaigns (name, status, contacts loaded, calls made, connect rate) with a "Create Campaign" button

- Live Calls page: real-time call queue showing agent status (available/on call/wrap-up), current call duration, and a waveform/audio indicator placeholder for active calls

- Contacts page: table view with upload button (CSV import), search/filter, and tags

- Agents page: list of agents with status indicator, calls handled today, and performance stats

- Call History page: searchable/filterable table (date, contact, agent, duration, outcome, recording link)

- Settings page: SIP credential status, phone number management, IVR/routing config placeholder

- Billing page: current plan, minutes used vs allotted, SIP credential purchase status, invoice history

SUPER ADMIN DASHBOARD (for the platform owner):

- Sidebar navigation: Overview, Tenants, System Health, Billing & Revenue, Support

- Overview page: stat cards (total tenants, active calls across platform, total minutes today, revenue this month), tenant growth chart

- Tenants page: table of all tenant accounts (company name, plan, status, minutes used, join date) with ability to suspend/activate a tenant and view their usage

- System Health page: Telnyx account balance/status, queue depth, active call count, error/alert log

- Billing & Revenue page: revenue overview, per-tenant billing breakdown, SIP credential sales

Use a professional color palette (deep navy/slate sidebar, white/light gray content, one accent color like blue or teal for CTAs and active states). Make it responsive. Use placeholder data to populate all tables and charts. Do not build backend logic — this is frontend/UI only, I'll connect it to my own API afterward.

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://callspark-ui.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/2ef85e51-f173-41f6-a35f-e2b251140c05).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
