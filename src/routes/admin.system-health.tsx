import { createFileRoute } from "@tanstack/react-router";
import { Wallet, Layers, PhoneCall, TriangleAlert } from "lucide-react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { Shell } from "@/components/dash/Shell";
import { Panel, StatCard, StatusPill } from "@/components/dash/bits";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { hourlyLoad, systemAlerts } from "@/lib/mock-data";

export const Route = createFileRoute("/admin/system-health")({
  head: () => ({
    meta: [
      { title: "System Health — Cadence Super Admin" },
      {
        name: "description",
        content:
          "Carrier balance, queue depth, active call count and platform error and alert log in one view.",
      },
      { property: "og:title", content: "System Health — Cadence Super Admin" },
      {
        property: "og:description",
        content: "Watch carrier balance, queue depth and platform alerts in real time.",
      },
    ],
  }),
  component: AdminSystemHealthPage,
});

function AdminSystemHealthPage() {
  return (
    <Shell
      scope="admin"
      title="System Health"
      description="Carrier, queue and error telemetry"
      actions={
        <>
          <Button variant="outline">Alert rules</Button>
          <Button>Top up carrier</Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Telnyx balance"
          value="$8,412.60"
          hint="auto top-up at $2,000"
          icon={Wallet}
          tone="success"
        />
        <StatCard label="Queue depth" value="312" hint="across 74 tenants" icon={Layers} />
        <StatCard label="Active calls" value="1,284" hint="peak today 1,610" icon={PhoneCall} />
        <StatCard
          label="Error rate (1h)"
          value="0.8%"
          hint="threshold 2.0%"
          icon={TriangleAlert}
          tone="warning"
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <Panel title="Platform call concurrency" description="Today, hourly" className="xl:col-span-2" bodyClassName="p-4">
          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={hourlyLoad} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
                <CartesianGrid stroke="var(--color-border)" vertical={false} />
                <XAxis dataKey="hour" stroke="var(--color-muted-foreground)" fontSize={12} tickLine={false} axisLine={false} />
                <YAxis stroke="var(--color-muted-foreground)" fontSize={12} tickLine={false} axisLine={false} />
                <Tooltip
                  contentStyle={{
                    background: "var(--color-card)",
                    border: "1px solid var(--color-border)",
                    borderRadius: "10px",
                    fontSize: "12px",
                  }}
                />
                <Line
                  type="monotone"
                  dataKey="calls"
                  stroke="var(--color-chart-1)"
                  strokeWidth={2.5}
                  dot={false}
                  name="Concurrent calls"
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Panel>

        <Panel title="Service status" bodyClassName="p-0">
          <ul className="divide-y divide-border">
            {[
              ["Media gateway", "Online"],
              ["Dialer workers", "Online"],
              ["Recording storage", "Online"],
              ["Billing sync", "Warning"],
              ["Carrier edge-02", "Warning"],
              ["Webhooks", "Online"],
            ].map(([svc, status]) => (
              <li key={svc} className="flex items-center justify-between gap-3 px-5 py-3.5">
                <span className="text-sm font-medium">{svc}</span>
                <StatusPill status={status} />
              </li>
            ))}
          </ul>
        </Panel>
      </div>

      <Panel title="Error & alert log" description="Most recent first" bodyClassName="p-0">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Severity</TableHead>
                <TableHead>Time</TableHead>
                <TableHead>Source</TableHead>
                <TableHead>Message</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {systemAlerts.map((a) => (
                <TableRow key={a.id}>
                  <TableCell>
                    <StatusPill status={a.severity} />
                  </TableCell>
                  <TableCell className="font-mono text-sm">{a.time}</TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground">{a.source}</TableCell>
                  <TableCell>{a.message}</TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="sm">
                      Acknowledge
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </Panel>
    </Shell>
  );
}
