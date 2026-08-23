import { createFileRoute } from "@tanstack/react-router";
import { PhoneCall, Percent, Headset, Timer, Plus, MessageSquare } from "lucide-react";
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
import { ActionButton, Panel, StatCard, StatusPill } from "@/components/dash/bits";
import { Button } from "@/components/ui/button";
import { CreateCampaignDialog } from "@/components/dash/CreateCampaignDialog";
import { activityFeed, callVolume7d, liveQueue } from "@/lib/mock-data";

export const Route = createFileRoute("/")({
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

function OverviewPage() {
  return (
    <Shell
      scope="tenant"
      title="Overview"
      description="Friday, August 22 · shift started 08:00 · 6 agents on the floor"
      actions={
        <>
          <ActionButton variant="outline">Export snapshot</ActionButton>
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
        <StatCard label="Calls today" value="1,725" delta="+12.4%" hint="vs yesterday" icon={PhoneCall} />
        <StatCard
          label="Connected rate"
          value="40.1%"
          delta="+2.6 pts"
          hint="rolling 7 days"
          icon={Percent}
          tone="success"
        />
        <StatCard label="Active agents" value="6 / 7" hint="1 offline" icon={Headset} />
        <StatCard label="SMS sent today" value="2,710" delta="+8.2%" hint="US numbers only" icon={MessageSquare} />
        <StatCard
          label="Minutes used"
          value="184,200"
          delta="-4.1%"
          hint="of 250,000 allotted"
          icon={Timer}
          tone="warning"
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
              <AreaChart data={callVolume7d} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
                <defs>
                  <linearGradient id="dials" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--color-chart-1)" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="var(--color-chart-1)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="var(--color-border)" vertical={false} />
                <XAxis dataKey="day" stroke="var(--color-muted-foreground)" fontSize={12} tickLine={false} axisLine={false} />
                <YAxis stroke="var(--color-muted-foreground)" fontSize={12} tickLine={false} axisLine={false} />
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

        <Panel title="Live activity" description="Streaming events" bodyClassName="p-0">
          <ul className="max-h-72 divide-y divide-border overflow-y-auto">
            {activityFeed.map((event) => (
              <li key={event.id} className="flex gap-3 px-5 py-3">
                <span
                  className={
                    "mt-1.5 size-2 shrink-0 rounded-full " +
                    (event.kind === "connected"
                      ? "bg-success"
                      : event.kind === "warning"
                        ? "bg-warning"
                        : event.kind === "error"
                          ? "bg-destructive"
                          : "bg-primary")
                  }
                />
                <div className="min-w-0">
                  <p className="text-sm leading-snug">{event.text}</p>
                  <p className="mt-0.5 font-mono text-[11px] text-muted-foreground">{event.time}</p>
                </div>
              </li>
            ))}
          </ul>
        </Panel>
      </div>

      <Panel title="Floor status" description="Agents currently signed in" bodyClassName="p-0">
        <div className="grid gap-px bg-border sm:grid-cols-2 xl:grid-cols-3">
          {liveQueue.slice(0, 6).map((row) => (
            <div key={row.ext} className="bg-card p-5">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-semibold">{row.agent}</p>
                <StatusPill status={row.status} />
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                Ext {row.ext} · {row.campaign}
              </p>
              <p className="mt-3 font-mono text-sm">{row.duration}</p>
            </div>
          ))}
        </div>
      </Panel>
    </Shell>
  );
}
