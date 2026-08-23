import { createFileRoute } from "@tanstack/react-router";
import { DollarSign, TrendingUp, Users, Radio, MessageSquare } from "lucide-react";
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
import { ActionButton, Panel, StatCard, StatusPill } from "@/components/dash/bits";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { revenueByTenant, sipSales, smsByTenant, tenantGrowth } from "@/lib/mock-data";

export const Route = createFileRoute("/admin/revenue")({
  head: () => ({
    meta: [
      { title: "Billing & Revenue — Kchel Admin" },
      {
        name: "description",
        content:
          "Platform revenue overview with per-tenant billing breakdown and SIP credential sales.",
      },
      { property: "og:title", content: "Billing & Revenue — Kchel Admin" },
      {
        property: "og:description",
        content: "Track MRR, per-tenant billing and SIP credential sales across the platform.",
      },
    ],
  }),
  component: AdminRevenuePage,
});

function AdminRevenuePage() {
  return (
    <Shell
      scope="admin"
      title="Billing & Revenue"
      description="August 2026 · USD"
      actions={<ActionButton variant="outline">Export ledger</ActionButton>}
    >
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <StatCard label="MRR" value="$41,540" delta="+9.4%" icon={DollarSign} tone="success" />
        <StatCard label="SIP credential sales" value="$2,310" delta="+18.0%" icon={Radio} />
        <StatCard label="SMS revenue" value="$3,304" delta="+14.2%" icon={MessageSquare} />
        <StatCard label="ARPA" value="$561" delta="+2.1%" icon={TrendingUp} />
        <StatCard label="Paying tenants" value="71 / 74" hint="3 on trial" icon={Users} />
      </div>

      <Panel title="Revenue by month" description="Subscription plus usage" bodyClassName="p-4">
        <div className="h-72 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={tenantGrowth} margin={{ top: 8, right: 8, left: -4, bottom: 0 }}>
              <CartesianGrid stroke="var(--color-border)" vertical={false} />
              <XAxis dataKey="month" stroke="var(--color-muted-foreground)" fontSize={12} tickLine={false} axisLine={false} />
              <YAxis stroke="var(--color-muted-foreground)" fontSize={12} tickLine={false} axisLine={false} />
              <Tooltip
                contentStyle={{
                  background: "var(--color-card)",
                  border: "1px solid var(--color-border)",
                  borderRadius: "10px",
                  fontSize: "12px",
                }}
              />
              <Bar dataKey="revenue" fill="var(--color-chart-1)" radius={[6, 6, 0, 0]} name="Revenue" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Panel>

      <Panel title="Per-tenant billing" description="Current period" bodyClassName="p-0">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Tenant</TableHead>
                <TableHead>Plan</TableHead>
                <TableHead className="text-right">Minutes</TableHead>
                <TableHead className="text-right">SIP</TableHead>
                <TableHead className="text-right">SMS sent</TableHead>
                <TableHead className="text-right">SMS cost</TableHead>
                <TableHead className="text-right">Subscription</TableHead>
                <TableHead className="text-right">Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {revenueByTenant.map((r) => (
                <TableRow key={r.company}>
                  <TableCell className="font-semibold">{r.company}</TableCell>
                  <TableCell>{r.plan}</TableCell>
                  <TableCell className="text-right font-mono text-sm">
                    {r.minutes.toLocaleString()}
                  </TableCell>
                  <TableCell className="text-right font-mono text-sm">{r.sip}</TableCell>
                  <TableCell className="text-right font-mono text-sm">
                    {(smsByTenant.find((s) => s.company === r.company)?.sms ?? 0).toLocaleString()}
                  </TableCell>
                  <TableCell className="text-right font-mono text-sm">
                    {smsByTenant.find((s) => s.company === r.company)?.smsCost ?? "$0"}
                  </TableCell>
                  <TableCell className="text-right font-mono text-sm">{r.mrr}</TableCell>
                  <TableCell className="text-right font-mono text-sm font-semibold">{r.total}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </Panel>

      <Panel title="SIP credential sales" bodyClassName="p-0">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Order</TableHead>
                <TableHead>Tenant</TableHead>
                <TableHead>Credential</TableHead>
                <TableHead>Date</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sipSales.map((s) => (
                <TableRow key={s.id}>
                  <TableCell className="font-mono text-sm">{s.id}</TableCell>
                  <TableCell className="font-semibold">{s.tenant}</TableCell>
                  <TableCell>{s.credential}</TableCell>
                  <TableCell className="text-muted-foreground">{s.date}</TableCell>
                  <TableCell className="text-right font-mono text-sm">{s.amount}</TableCell>
                  <TableCell>
                    <StatusPill status={s.status} />
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
