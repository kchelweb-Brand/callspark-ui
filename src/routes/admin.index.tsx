import { createFileRoute, Link } from "@tanstack/react-router";
import { Building2, Loader2, MessageSquare, PhoneCall, Timer, Users } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import {
  Bar,
  BarChart,
  CartesianGrid,
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
import { downloadCsv } from "@/lib/download";
import { formatMinutes, formatMoney, getPlatformOverview } from "@/lib/admin-api";

export const Route = createFileRoute("/admin/")({
  head: () => ({
    meta: [
      { title: "Platform Overview — Kchel Admin" },
      {
        name: "description",
        content: "Tenant counts, platform call volume, plan mix and monthly recurring revenue.",
      },
      { property: "og:title", content: "Platform Overview — Kchel Admin" },
      {
        property: "og:description",
        content: "Live platform metrics across every tenant on Kchel Dialer.",
      },
    ],
  }),
  component: AdminOverviewPage,
});

type Overview = Awaited<ReturnType<typeof getPlatformOverview>>;

const tooltipStyle = {
  background: "var(--color-card)",
  border: "1px solid var(--color-border)",
  borderRadius: "10px",
  fontSize: "12px",
};

function AdminOverviewPage() {
  const [data, setData] = useState<Overview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await getPlatformOverview());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load platform metrics.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  function exportReport() {
    if (!data) return;
    downloadCsv(
      `platform-report-${Date.now()}.csv`,
      data.largest.map((t) => ({
        tenant: t.name,
        workspace: t.workspace_slug,
        status: t.status,
        plan: t.plan,
        users: t.users,
        contacts: t.contacts,
        calls: t.calls,
        minutes: Math.round(t.talk_seconds / 60),
      })),
      ["tenant", "workspace", "status", "plan", "users", "contacts", "calls", "minutes"],
    );
    toast.success("Platform report downloaded");
  }

  if (loading) {
    return (
      <Shell scope="admin" title="Platform Overview" description="Loading live metrics…">
        <Panel bodyClassName="flex items-center justify-center gap-2 p-12 text-muted-foreground">
          <Loader2 className="size-4 animate-spin" /> Loading…
        </Panel>
      </Shell>
    );
  }

  if (error || !data) {
    return (
      <Shell scope="admin" title="Platform Overview">
        <Panel bodyClassName="p-10 text-center">
          <p className="text-sm text-destructive">{error}</p>
          <Button className="mt-4" onClick={() => void load()}>
            Try again
          </Button>
        </Panel>
      </Shell>
    );
  }

  const t = data.totals;
  const hasTenants = t.tenants > 0;

  return (
    <Shell
      scope="admin"
      title="Platform Overview"
      description={`${t.tenants} tenant${t.tenants === 1 ? "" : "s"} · ${t.activeTenants} active${t.pendingTenants > 0 ? ` · ${t.pendingTenants} awaiting approval` : ""}`}
      actions={
        <Button variant="outline" onClick={exportReport} disabled={!hasTenants}>
          Download platform report
        </Button>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <StatCard
          label="Tenants"
          value={t.tenants.toLocaleString()}
          hint={t.newThisMonth > 0 ? `+${t.newThisMonth} this month` : "none added this month"}
          icon={Building2}
        />
        <StatCard label="Users" value={t.users.toLocaleString()} hint={`${t.agents} agent seats`} icon={Users} />
        <StatCard
          label="Calls today"
          value={t.callsToday.toLocaleString()}
          hint={t.callsActive > 0 ? `${t.callsActive} in progress` : "none in progress"}
          icon={PhoneCall}
        />
        <StatCard
          label="Minutes this month"
          value={formatMinutes(t.talkSecondsMonth)}
          hint={`${formatMinutes(t.talkSeconds)} all time`}
          icon={Timer}
        />
        <StatCard
          label="MRR"
          value={formatMoney(t.mrr)}
          hint="from active tenant plans"
          icon={MessageSquare}
        />
      </div>

      {t.pendingTenants > 0 && (
        <Link
          to="/admin/tenants"
          className="flex items-center justify-between gap-3 rounded-lg border border-warning/35 bg-warning/10 px-4 py-3 text-sm font-medium text-warning-foreground transition-colors hover:bg-warning/15"
        >
          <span>
            {t.pendingTenants} signup{t.pendingTenants === 1 ? "" : "s"} waiting for approval
          </span>
          <span className="text-xs font-semibold">Review →</span>
        </Link>
      )}

      <div className="grid gap-4 xl:grid-cols-3">
        <Panel
          title="New tenants per month"
          description="Last 6 months"
          className="xl:col-span-2"
          bodyClassName="p-4"
        >
          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.growth} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
                <CartesianGrid stroke="var(--color-border)" vertical={false} />
                <XAxis dataKey="month" stroke="var(--color-muted-foreground)" fontSize={12} tickLine={false} axisLine={false} />
                <YAxis stroke="var(--color-muted-foreground)" fontSize={12} tickLine={false} axisLine={false} allowDecimals={false} />
                <Tooltip contentStyle={tooltipStyle} />
                <Bar dataKey="tenants" fill="var(--color-chart-1)" radius={[6, 6, 0, 0]} name="New tenants" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Panel>

        <Panel title="Plan mix" description="Active tenants by plan" bodyClassName="p-0">
          {data.plans.length === 0 ? (
            <p className="py-12 text-center text-sm text-muted-foreground">No active tenants yet.</p>
          ) : (
            <ul className="divide-y divide-border">
              {data.plans.map((p) => (
                <li key={p.plan} className="flex items-center justify-between gap-3 px-5 py-3.5">
                  <div>
                    <p className="text-sm font-semibold">{p.plan}</p>
                    <p className="text-xs text-muted-foreground">
                      {p.tenants} tenant{p.tenants === 1 ? "" : "s"}
                    </p>
                  </div>
                  <span className="font-mono text-sm font-semibold">{formatMoney(p.mrr)}</span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      <Panel title="Tenants by usage" description="Ranked by talk minutes" bodyClassName="p-0">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Tenant</TableHead>
                <TableHead>Workspace</TableHead>
                <TableHead>Plan</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Users</TableHead>
                <TableHead className="text-right">Contacts</TableHead>
                <TableHead className="text-right">Calls</TableHead>
                <TableHead className="text-right">Minutes</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.largest.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="py-12 text-center">
                    <p className="text-sm font-medium">No tenants yet</p>
                    <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
                      Metrics appear here as workspaces sign up and start dialing.
                    </p>
                  </TableCell>
                </TableRow>
              ) : (
                data.largest.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="font-semibold">{row.name}</TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">
                      {row.workspace_slug}
                    </TableCell>
                    <TableCell className="text-muted-foreground">{row.plan}</TableCell>
                    <TableCell>
                      <StatusPill status={row.status} />
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm">{row.users}</TableCell>
                    <TableCell className="text-right font-mono text-sm">
                      {row.contacts.toLocaleString()}
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm">
                      {row.calls.toLocaleString()}
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm">
                      {formatMinutes(row.talk_seconds)}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </Panel>
    </Shell>
  );
}
