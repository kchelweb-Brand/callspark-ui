import { createFileRoute } from "@tanstack/react-router";
import { Percent, PhoneCall, Timer, TrendingUp } from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { Shell } from "@/components/dash/Shell";
import { ActionButton, Panel, StatCard } from "@/components/dash/bits";
import { hourlyLoad, outcomeBreakdown, agents } from "@/lib/mock-data";

export const Route = createFileRoute("/analytics")({
  head: () => ({
    meta: [
      { title: "Analytics — Kchel Dialer" },
      {
        name: "description",
        content:
          "Call outcome breakdown, hourly dial load and agent leaderboard analytics for your call center.",
      },
      { property: "og:title", content: "Analytics — Kchel Dialer" },
      {
        property: "og:description",
        content: "Understand outcomes, peak hours and agent performance trends.",
      },
    ],
  }),
  component: AnalyticsPage,
});

const pieColors = [
  "var(--color-chart-2)",
  "var(--color-chart-4)",
  "var(--color-chart-1)",
  "var(--color-chart-3)",
  "var(--color-chart-5)",
];

const tooltipStyle = {
  background: "var(--color-card)",
  border: "1px solid var(--color-border)",
  borderRadius: "10px",
  fontSize: "12px",
};

function AnalyticsPage() {
  return (
    <Shell
      scope="tenant"
      title="Analytics"
      description="Last 30 days · all campaigns"
      actions={<ActionButton variant="outline">Change range</ActionButton>}
    >
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Total dials" value="8,002" delta="+9.2%" icon={PhoneCall} />
        <StatCard label="Connect rate" value="39.1%" delta="+1.8 pts" icon={Percent} tone="success" />
        <StatCard label="Avg handle time" value="04:38" delta="-0:12" icon={Timer} />
        <StatCard label="Qualified leads" value="612" delta="+14.0%" icon={TrendingUp} tone="success" />
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <Panel title="Dial load by hour" className="xl:col-span-2" bodyClassName="p-4">
          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={hourlyLoad} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
                <CartesianGrid stroke="var(--color-border)" vertical={false} />
                <XAxis dataKey="hour" stroke="var(--color-muted-foreground)" fontSize={12} tickLine={false} axisLine={false} />
                <YAxis stroke="var(--color-muted-foreground)" fontSize={12} tickLine={false} axisLine={false} />
                <Tooltip contentStyle={tooltipStyle} />
                <Bar dataKey="calls" fill="var(--color-chart-1)" radius={[6, 6, 0, 0]} name="Dials" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Panel>

        <Panel title="Outcome breakdown" bodyClassName="p-4">
          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={outcomeBreakdown}
                  dataKey="value"
                  nameKey="name"
                  innerRadius={54}
                  outerRadius={86}
                  paddingAngle={2}
                >
                  {outcomeBreakdown.map((entry, i) => (
                    <Cell key={entry.name} fill={pieColors[i % pieColors.length]} />
                  ))}
                </Pie>
                <Legend wrapperStyle={{ fontSize: "12px" }} />
                <Tooltip contentStyle={tooltipStyle} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </Panel>
      </div>

      <Panel title="Agent leaderboard" description="Ranked by connect rate" bodyClassName="p-5">
        <ul className="flex flex-col gap-3">
          {[...agents]
            .sort((a, b) => b.connect - a.connect)
            .map((a, i) => (
              <li key={a.ext} className="flex items-center gap-4">
                <span className="w-5 font-mono text-xs text-muted-foreground">{i + 1}</span>
                <span className="w-40 shrink-0 truncate text-sm font-semibold">{a.name}</span>
                <span className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                  <span
                    className="block h-full rounded-full bg-primary"
                    style={{ width: `${Math.max(a.connect, 2)}%` }}
                  />
                </span>
                <span className="w-14 text-right font-mono text-xs">{a.connect.toFixed(1)}%</span>
              </li>
            ))}
        </ul>
      </Panel>
    </Shell>
  );
}
