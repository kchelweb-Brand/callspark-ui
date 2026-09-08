import { createFileRoute } from "@tanstack/react-router";
import { DollarSign, Loader2, MessageSquare, Timer, Wallet } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

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
import { formatMinutes, formatMoney, getPlatformRevenue } from "@/lib/admin-api";

export const Route = createFileRoute("/admin/revenue")({
  head: () => ({
    meta: [
      { title: "Billing & Revenue — Kchel Admin" },
      {
        name: "description",
        content: "Recurring revenue by tenant, prepaid wallet balances and usage.",
      },
      { property: "og:title", content: "Billing & Revenue — Kchel Admin" },
      {
        property: "og:description",
        content: "Track MRR, wallet balances and per-tenant usage across the platform.",
      },
    ],
  }),
  component: AdminRevenuePage,
});

type Revenue = Awaited<ReturnType<typeof getPlatformRevenue>>;

function AdminRevenuePage() {
  const [data, setData] = useState<Revenue | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await getPlatformRevenue());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load revenue.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  function exportLedger() {
    if (!data) return;
    downloadCsv(
      `revenue-ledger-${Date.now()}.csv`,
      data.tenants.map((t) => ({
        tenant: t.name,
        workspace: t.workspace_slug,
        status: t.status,
        plan: t.plan,
        mrr: t.mrr,
        minutes: Math.round(t.talk_seconds / 60),
        sms: t.sms_sent,
        wallet: (t.wallet_cents / 100).toFixed(2),
      })),
      ["tenant", "workspace", "status", "plan", "mrr", "minutes", "sms", "wallet"],
    );
    toast.success("Ledger exported");
  }

  if (loading) {
    return (
      <Shell scope="admin" title="Billing & Revenue" description="Loading…">
        <Panel bodyClassName="flex items-center justify-center gap-2 p-12 text-muted-foreground">
          <Loader2 className="size-4 animate-spin" /> Loading…
        </Panel>
      </Shell>
    );
  }

  if (error || !data) {
    return (
      <Shell scope="admin" title="Billing & Revenue">
        <Panel bodyClassName="p-10 text-center">
          <p className="text-sm text-destructive">{error}</p>
          <Button className="mt-4" onClick={() => void load()}>
            Try again
          </Button>
        </Panel>
      </Shell>
    );
  }

  const paying = data.tenants.filter((t) => t.mrr > 0).length;
  const totalMinutes = data.tenants.reduce((s, t) => s + t.talk_seconds, 0);
  const totalSms = data.tenants.reduce((s, t) => s + t.sms_sent, 0);

  return (
    <Shell
      scope="admin"
      title="Billing & Revenue"
      description={`${data.tenants.length} tenant${data.tenants.length === 1 ? "" : "s"} · ${paying} on a paid plan`}
      actions={
        <Button variant="outline" onClick={exportLedger} disabled={data.tenants.length === 0}>
          Export ledger
        </Button>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="MRR" value={formatMoney(data.mrr)} hint="active paid plans" icon={DollarSign} />
        <StatCard
          label="Wallet balances"
          value={formatMoney(data.walletCents / 100)}
          hint="prepaid credit held"
          icon={Wallet}
        />
        <StatCard label="Minutes billed" value={formatMinutes(totalMinutes)} hint="all time" icon={Timer} />
        <StatCard label="SMS sent" value={totalSms.toLocaleString()} hint="all time" icon={MessageSquare} />
      </div>

      <Panel title="Revenue by tenant" description="Plan, usage and prepaid balance" bodyClassName="p-0">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Tenant</TableHead>
                <TableHead>Workspace</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Plan</TableHead>
                <TableHead className="text-right">MRR</TableHead>
                <TableHead className="text-right">Minutes</TableHead>
                <TableHead className="text-right">SMS</TableHead>
                <TableHead className="text-right">Wallet</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.tenants.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="py-12 text-center">
                    <p className="text-sm font-medium">No tenants yet</p>
                    <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
                      Revenue appears here once workspaces sign up and choose a plan.
                    </p>
                  </TableCell>
                </TableRow>
              ) : (
                data.tenants.map((t) => (
                  <TableRow key={t.id}>
                    <TableCell className="font-semibold">{t.name}</TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">
                      {t.workspace_slug}
                    </TableCell>
                    <TableCell>
                      <StatusPill status={t.status} />
                    </TableCell>
                    <TableCell className="text-muted-foreground">{t.plan}</TableCell>
                    <TableCell className="text-right font-mono text-sm">
                      {t.mrr > 0 ? formatMoney(t.mrr) : "—"}
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm">
                      {formatMinutes(t.talk_seconds)}
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm">
                      {t.sms_sent.toLocaleString()}
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm">
                      {t.wallet_cents > 0 ? formatMoney(t.wallet_cents / 100) : "—"}
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
