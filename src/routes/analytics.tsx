import { createFileRoute } from "@tanstack/react-router";
import { BarChart3, Loader2, Percent, PhoneCall, Timer, TrendingUp } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
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
import { Panel, StatCard } from "@/components/dash/bits";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatDuration, getAnalytics } from "@/lib/metrics-api";

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

type Analytics = Awaited<ReturnType<typeof getAnalytics>>;

const RANGE_LABELS: Record<string, string> = {
  "7d": "Last 7 days",
  "30d": "Last 30 days",
  "90d": "Last 90 days",
};

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
  const [range, setRange] = useState("7d");
  const [data, setData] = useState<Analytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await getAnalytics(range));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load analytics.");
    } finally {
      setLoading(false);
    }
  }, [range]);

  useEffect(() => {
    void load();
  }, [load]);

  const rangeSelect = (
    <Select value={range} onValueChange={setRange}>
      <SelectTrigger className="w-40">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="7d">Last 7 days</SelectItem>
        <SelectItem value="30d">Last 30 days</SelectItem>
        <SelectItem value="90d">Last 90 days</SelectItem>
      </SelectContent>
    </Select>
  );

  if (loading || !data) {
    return (
      <Shell
        scope="tenant"
        title="Analytics"
        description={RANGE_LABELS[range] ?? "Analytics"}
        actions={rangeSelect}
      >
        <Panel bodyClassName="flex items-center justify-center gap-2 p-12 text-muted-foreground">
          {error ? (
            <div className="text-center">
              <p className="text-sm text-destructive">{error}</p>
              <Button className="mt-4" onClick={() => void load()}>
                Try again
              </Button>
            </div>
          ) : (
            <>
              <Loader2 className="size-4 animate-spin" /> Loading…
            </>
          )}
        </Panel>
      </Shell>
    );
  }

  const hasCalls = data.dials > 0;

  return (
    <Shell
      scope="tenant"
      title="Analytics"
      description={`${RANGE_LABELS[range] ?? "Analytics"} · ${data.dials.toLocaleString()} dial${data.dials === 1 ? "" : "s"}`}
      actions={rangeSelect}
    >
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Total dials" value={data.dials.toLocaleString()} icon={PhoneCall} />
        <StatCard
          label="Connect rate"
          value={data.connectRate === null ? "—" : `${data.connectRate.toFixed(1)}%`}
          hint={data.connectRate === null ? "no calls yet" : `${data.connected} connected`}
          icon={Percent}
          {...(data.connectRate !== null && data.connectRate >= 30 ? { tone: "success" as const } : {})}
        />
        <StatCard
          label="Avg handle time"
          value={hasCalls ? formatDuration(data.avgHandleSeconds) : "—"}
          hint="answered calls only"
          icon={Timer}
        />
        <StatCard
          label="Connected calls"
          value={data.connected.toLocaleString()}
          icon={TrendingUp}
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <Panel title="Dial load by hour" description="When your calls happen" className="xl:col-span-2" bodyClassName="p-4">
          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.hourly} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
                <CartesianGrid stroke="var(--color-border)" vertical={false} />
                <XAxis dataKey="hour" stroke="var(--color-muted-foreground)" fontSize={12} tickLine={false} axisLine={false} interval={2} />
                <YAxis stroke="var(--color-muted-foreground)" fontSize={12} tickLine={false} axisLine={false} allowDecimals={false} />
                <Tooltip contentStyle={tooltipStyle} />
                <Bar dataKey="calls" fill="var(--color-chart-1)" radius={[6, 6, 0, 0]} name="Dials" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Panel>

        <Panel title="Outcome breakdown" bodyClassName="p-4">
          {data.outcomes.length === 0 ? (
            <div className="flex h-72 flex-col items-center justify-center gap-2 text-center">
              <BarChart3 className="size-6 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">No calls in this period.</p>
            </div>
          ) : (
            <div className="h-72 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={data.outcomes}
                    dataKey="value"
                    nameKey="name"
                    innerRadius={54}
                    outerRadius={86}
                    paddingAngle={2}
                  >
                    {data.outcomes.map((entry, i) => (
                      <Cell key={entry.name} fill={pieColors[i % pieColors.length]} />
                    ))}
                  </Pie>
                  <Legend wrapperStyle={{ fontSize: "12px" }} />
                  <Tooltip contentStyle={tooltipStyle} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}
        </Panel>
      </div>

      <Panel title="Agent leaderboard" description="Ranked by calls handled" bodyClassName="p-5">
        {data.leaderboard.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            No agents yet — invite your team from the Agents page.
          </p>
        ) : (
          <ul className="flex flex-col gap-3">
            {data.leaderboard.map((a, i) => (
              <li key={a.id} className="flex items-center gap-4">
                <span className="w-5 font-mono text-xs text-muted-foreground">{i + 1}</span>
                <span className="w-40 shrink-0 truncate text-sm font-semibold">{a.name}</span>
                <span className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                  <span
                    className="block h-full rounded-full bg-primary"
                    style={{ width: `${Math.max(a.connectRate, a.calls > 0 ? 2 : 0)}%` }}
                  />
                </span>
                <span className="w-16 text-right font-mono text-xs text-muted-foreground">
                  {a.calls} call{a.calls === 1 ? "" : "s"}
                </span>
                <span className="w-14 text-right font-mono text-xs">
                  {a.calls === 0 ? "—" : `${a.connectRate.toFixed(0)}%`}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </Shell>
  );
}
