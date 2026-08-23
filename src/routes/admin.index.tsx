import { createFileRoute } from "@tanstack/react-router";
import { Building2, PhoneCall, Timer, DollarSign, MessageSquare } from "lucide-react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { Shell } from "@/components/dash/Shell";
import { ActionButton, Panel, StatCard, StatusPill } from "@/components/dash/bits";
import { systemAlerts, tenantGrowth, tenants } from "@/lib/mock-data";

export const Route = createFileRoute("/admin/")({
  head: () => ({
    meta: [
      { title: "Platform Overview — Kchel Admin" },
      {
        name: "description",
        content:
          "Platform-wide view of tenants, active calls, minutes consumed and monthly recurring revenue.",
      },
      { property: "og:title", content: "Platform Overview — Kchel Admin" },
      {
        property: "og:description",
        content: "Monitor tenant growth, platform call load and revenue in one console.",
      },
    ],
  }),
  component: AdminOverviewPage,
});

const tooltipStyle = {
  background: "var(--color-card)",
  border: "1px solid var(--color-border)",
  borderRadius: "10px",
  fontSize: "12px",
};

function AdminOverviewPage() {
  return (
    <Shell
      scope="admin"
      title="Platform Overview"
      description="74 tenants · production US-East · all regions healthy"
      actions={<ActionButton variant="outline">Download platform report</ActionButton>}
    >
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <StatCard label="Total tenants" value="74" delta="+6" hint="this month" icon={Building2} />
        <StatCard label="Active calls" value="1,284" hint="peak today 1,610" icon={PhoneCall} />
        <StatCard label="Minutes today" value="412,880" delta="+7.8%" icon={Timer} />
        <StatCard
          label="SMS sent today"
          value="86,420"
          delta="+14.2%"
          hint="US numbers only"
          icon={MessageSquare}
        />
        <StatCard
          label="Revenue this month"
          value="$43,850"
          delta="+11.9%"
          hint="MRR + SIP sales"
          icon={DollarSign}
          tone="success"
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <Panel title="Tenant growth" description="Accounts onboarded per month" className="xl:col-span-2" bodyClassName="p-4">
          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={tenantGrowth} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
                <defs>
                  <linearGradient id="growth" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--color-chart-1)" stopOpacity={0.38} />
                    <stop offset="100%" stopColor="var(--color-chart-1)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="var(--color-border)" vertical={false} />
                <XAxis dataKey="month" stroke="var(--color-muted-foreground)" fontSize={12} tickLine={false} axisLine={false} />
                <YAxis stroke="var(--color-muted-foreground)" fontSize={12} tickLine={false} axisLine={false} />
                <Tooltip contentStyle={tooltipStyle} />
                <Area
                  type="monotone"
                  dataKey="tenants"
                  stroke="var(--color-chart-1)"
                  strokeWidth={2.5}
                  fill="url(#growth)"
                  name="Tenants"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Panel>

        <Panel title="Revenue trend" description="Monthly, USD" bodyClassName="p-4">
          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={tenantGrowth} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
                <CartesianGrid stroke="var(--color-border)" vertical={false} />
                <XAxis dataKey="month" stroke="var(--color-muted-foreground)" fontSize={12} tickLine={false} axisLine={false} />
                <YAxis stroke="var(--color-muted-foreground)" fontSize={12} tickLine={false} axisLine={false} />
                <Tooltip contentStyle={tooltipStyle} />
                <Bar dataKey="revenue" fill="var(--color-chart-2)" radius={[6, 6, 0, 0]} name="Revenue" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Panel>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Panel title="Largest tenants" description="By minutes consumed" bodyClassName="p-0">
          <ul className="divide-y divide-border">
            {[...tenants]
              .sort((a, b) => b.minutes - a.minutes)
              .slice(0, 5)
              .map((t) => (
                <li key={t.id} className="flex items-center gap-3 px-5 py-3.5">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold">{t.company}</span>
                    <span className="text-xs text-muted-foreground">
                      {t.plan} · {t.agents} agents
                    </span>
                  </span>
                  <span className="font-mono text-sm">{t.minutes.toLocaleString()}</span>
                  <StatusPill status={t.status} />
                </li>
              ))}
          </ul>
        </Panel>

        <Panel title="Recent alerts" description="Last 4 hours" bodyClassName="p-0">
          <ul className="divide-y divide-border">
            {systemAlerts.slice(0, 5).map((a) => (
              <li key={a.id} className="flex items-start gap-3 px-5 py-3.5">
                <StatusPill status={a.severity} />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm leading-snug">{a.message}</span>
                  <span className="font-mono text-[11px] text-muted-foreground">
                    {a.time} · {a.source}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </Panel>
      </div>
    </Shell>
  );
}
