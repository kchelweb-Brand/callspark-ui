import { createFileRoute } from "@tanstack/react-router";
import { Activity, Headset, Loader2, MessageSquare, Percent, PhoneCall, Plus, Timer } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { Shell } from "@/components/dash/Shell";
import { Panel, StatCard } from "@/components/dash/bits";
import { Button } from "@/components/ui/button";
import { CreateCampaignDialog } from "@/components/dash/CreateCampaignDialog";
import { downloadCsv } from "@/lib/download";
import { formatTalk, getOverview } from "@/lib/metrics-api";

export const Route = createFileRoute("/dashboard")({
  head: () => ({
    meta: [
      { title: "Overview — Kchel Dialer" },
      {
        name: "description",
        content:
          "Live call center overview: calls today, connect rate, active agents, minutes used and 7-day call volume.",
      },
      { property: "og:title", content: "Overview — Kchel Dialer" },
      {
        property: "og:description",
        content: "Track calls, agents and minutes for your call center workspace in real time.",
      },
    ],
  }),
  component: OverviewPage,
});

type Overview = Awaited<ReturnType<typeof getOverview>>;

function OverviewPage() {
  const [data, setData] = useState<Overview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await getOverview());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load your overview.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const today = new Date().toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
  });

  if (loading) {
    return (
      <Shell scope="tenant" title="Overview" description={today}>
        <Panel bodyClassName="flex items-center justify-center gap-2 p-12 text-muted-foreground">
          <Loader2 className="size-4 animate-spin" /> Loading…
        </Panel>
      </Shell>
    );
  }

  if (error || !data) {
    return (
      <Shell scope="tenant" title="Overview" description={today}>
        <Panel bodyClassName="p-10 text-center">
          <p className="text-sm text-destructive">{error}</p>
          <Button className="mt-4" onClick={() => void load()}>
            Try again
          </Button>
        </Panel>
      </Shell>
    );
  }

  return (
    <Shell
      scope="tenant"
      title="Overview"
      description={`${today} · ${data.agentsOnline} of ${data.agentsTotal} agent${data.agentsTotal === 1 ? "" : "s"} online`}
      actions={
        <>
          <Button
            variant="outline"
            onClick={() => {
              downloadCsv(`overview-snapshot-${Date.now()}.csv`, data.volume, [
                "day",
                "calls",
                "connected",
              ]);
              toast.success("Snapshot exported");
            }}
          >
            Export snapshot
          </Button>
          <CreateCampaignDialog
            trigger={
              <Button>
                <Plus className="size-4" /> New campaign
              </Button>
            }
          />
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <StatCard
          label="Calls today"
          value={data.callsToday.toLocaleString()}
          hint={data.callsActive > 0 ? `${data.callsActive} in progress` : "none in progress"}
          icon={PhoneCall}
        />
        <StatCard
          label="Connect rate"
          value={data.connectRate === null ? "—" : `${data.connectRate.toFixed(1)}%`}
          hint={data.connectRate === null ? "no calls yet" : `${data.connectedToday} connected`}
          icon={Percent}
          {...(data.connectRate !== null && data.connectRate >= 30 ? { tone: "success" as const } : {})}
        />
        <StatCard
          label="Active agents"
          value={`${data.agentsOnline} / ${data.agentsTotal}`}
          hint={data.agentsTotal === 0 ? "invite your team" : `${data.agentsTotal - data.agentsOnline} offline`}
          icon={Headset}
        />
        <StatCard
          label="SMS sent"
          value={data.smsSent.toLocaleString()}
          hint="US numbers only"
          icon={MessageSquare}
        />
        <StatCard
          label="Minutes this month"
          value={formatTalk(data.talkSecondsMonth)}
          hint={`${data.campaignsActive} campaign${data.campaignsActive === 1 ? "" : "s"} active`}
          icon={Timer}
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <Panel
          title="Call volume — last 7 days"
          description="Total dials vs connected conversations"
          className="xl:col-span-2"
          bodyClassName="p-4"
        >
          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data.volume} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
                <defs>
                  <linearGradient id="dials" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--color-chart-1)" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="var(--color-chart-1)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="var(--color-border)" vertical={false} />
                <XAxis dataKey="day" stroke="var(--color-muted-foreground)" fontSize={12} tickLine={false} axisLine={false} />
                <YAxis stroke="var(--color-muted-foreground)" fontSize={12} tickLine={false} axisLine={false} allowDecimals={false} />
                <Tooltip
                  contentStyle={{
                    background: "var(--color-card)",
                    border: "1px solid var(--color-border)",
                    borderRadius: "10px",
                    fontSize: "12px",
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="calls"
                  stroke="var(--color-chart-1)"
                  strokeWidth={2.5}
                  fill="url(#dials)"
                  name="Dials"
                />
                <Line
                  type="monotone"
                  dataKey="connected"
                  stroke="var(--color-chart-2)"
                  strokeWidth={2.5}
                  dot={false}
                  name="Connected"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Panel>

        <Panel title="Recent activity" description="Latest calls" bodyClassName="p-0">
          {data.activity.length === 0 ? (
            <div className="flex h-72 flex-col items-center justify-center gap-2 px-6 text-center">
              <Activity className="size-6 text-muted-foreground" />
              <p className="text-sm font-medium">No activity yet</p>
              <p className="text-xs text-muted-foreground">
                Calls appear here as soon as agents start dialing.
              </p>
            </div>
          ) : (
            <ul className="max-h-72 divide-y divide-border overflow-y-auto">
              {data.activity.map((e) => {
                const number = e.direction === "outbound" ? e.to_number : e.from_number;
                return (
                  <li key={e.id} className="flex gap-3 px-5 py-3">
                    <span
                      className={
                        "mt-1.5 size-2 shrink-0 rounded-full " +
                        (e.outcome === "Connected"
                          ? "bg-success"
                          : e.status === "failed"
                            ? "bg-destructive"
                            : "bg-muted-foreground")
                      }
                    />
                    <div className="min-w-0">
                      <p className="truncate text-sm leading-snug">
                        {e.contact_name ?? number ?? "Unknown"} — {e.outcome ?? e.status}
                      </p>
                      <p className="mt-0.5 font-mono text-[11px] text-muted-foreground">
                        {new Date(e.started_at).toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                        {e.agent_email ? ` · ${e.agent_email}` : ""}
                      </p>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </Panel>
      </div>
    </Shell>
  );
}
