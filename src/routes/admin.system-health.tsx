import { createFileRoute } from "@tanstack/react-router";
import { Loader2, PhoneCall, PlugZap, RefreshCw, TriangleAlert } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
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
import { Panel, StatCard } from "@/components/dash/bits";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { getPlatformHealth } from "@/lib/admin-api";

export const Route = createFileRoute("/admin/system-health")({
  head: () => ({
    meta: [
      { title: "System Health — Kchel Admin" },
      {
        name: "description",
        content: "Live call volume, trunk registration status and recent connection failures.",
      },
      { property: "og:title", content: "System Health — Kchel Admin" },
      {
        property: "og:description",
        content: "Watch platform call activity and carrier registration failures.",
      },
    ],
  }),
  component: AdminSystemHealthPage,
});

type Health = Awaited<ReturnType<typeof getPlatformHealth>>;

function AdminSystemHealthPage() {
  const [data, setData] = useState<Health | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await getPlatformHealth());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load system health.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) {
    return (
      <Shell scope="admin" title="System Health" description="Loading…">
        <Panel bodyClassName="flex items-center justify-center gap-2 p-12 text-muted-foreground">
          <Loader2 className="size-4 animate-spin" /> Loading…
        </Panel>
      </Shell>
    );
  }

  if (error || !data) {
    return (
      <Shell scope="admin" title="System Health">
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
      scope="admin"
      title="System Health"
      description="Platform call activity and carrier registration status"
      actions={
        <Button variant="outline" onClick={() => void load()}>
          <RefreshCw className="size-4" /> Refresh
        </Button>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Calls in progress"
          value={data.activeCalls.toLocaleString()}
          icon={PhoneCall}
          {...(data.activeCalls > 0 ? { tone: "success" as const } : {})}
        />
        <StatCard label="Calls today" value={data.callsToday.toLocaleString()} icon={PhoneCall} />
        <StatCard
          label="Failure rate today"
          value={data.callsToday === 0 ? "—" : `${data.failureRate.toFixed(1)}%`}
          hint={data.callsToday === 0 ? "no calls yet" : `${data.failedToday} failed`}
          icon={TriangleAlert}
          {...(data.failureRate > 5 ? { tone: "destructive" as const } : {})}
        />
        <StatCard
          label="Trunks registered"
          value={`${data.trunksActive} / ${data.trunksTotal}`}
          hint={data.trunksFailed > 0 ? `${data.trunksFailed} failing` : "no failures"}
          icon={PlugZap}
          {...(data.trunksFailed > 0 ? { tone: "warning" as const } : {})}
        />
      </div>

      <Panel title="Call volume today" description="Platform-wide, by hour" bodyClassName="p-4">
        <div className="h-72 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data.hourly} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
              <CartesianGrid stroke="var(--color-border)" vertical={false} />
              <XAxis dataKey="hour" stroke="var(--color-muted-foreground)" fontSize={12} tickLine={false} axisLine={false} interval={2} />
              <YAxis stroke="var(--color-muted-foreground)" fontSize={12} tickLine={false} axisLine={false} allowDecimals={false} />
              <Tooltip
                contentStyle={{
                  background: "var(--color-card)",
                  border: "1px solid var(--color-border)",
                  borderRadius: "10px",
                  fontSize: "12px",
                }}
              />
              <Line type="monotone" dataKey="calls" stroke="var(--color-chart-1)" strokeWidth={2.5} dot={false} name="Calls" />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </Panel>

      <Panel
        title="Carrier registration failures"
        description="Tenants whose SIP trunk could not register"
        bodyClassName="p-0"
      >
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Tenant</TableHead>
                <TableHead>Workspace</TableHead>
                <TableHead>Error</TableHead>
                <TableHead>When</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.failures.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="py-12 text-center">
                    <p className="text-sm font-medium">No registration failures</p>
                    <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
                      Tenants whose carrier connection fails will be listed here with the
                      carrier's own error message.
                    </p>
                  </TableCell>
                </TableRow>
              ) : (
                data.failures.map((f, i) => (
                  <TableRow key={`${f.workspace_slug}-${i}`}>
                    <TableCell className="font-semibold">{f.tenant_name}</TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">
                      {f.workspace_slug}
                    </TableCell>
                    <TableCell className="max-w-96 truncate text-sm">{f.last_error}</TableCell>
                    <TableCell className="whitespace-nowrap text-muted-foreground">
                      {new Date(f.updated_at).toLocaleString()}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </Panel>

      {/* Carrier-side telemetry (account balance, queue depth, upstream alerts)
          needs the Telnyx API, which isn't connected yet. Saying so beats
          showing numbers that aren't real. */}
      <Panel title="Carrier telemetry" bodyClassName="p-8 text-center">
        <p className="text-sm font-medium">Not connected</p>
        <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
          Carrier balance, queue depth and upstream alerts become available once the Telnyx
          API key is configured.
        </p>
      </Panel>
    </Shell>
  );
}
