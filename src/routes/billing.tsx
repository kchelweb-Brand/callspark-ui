import { createFileRoute } from "@tanstack/react-router";
import { CreditCard, Download, Minus, Plus, ShieldCheck, Users } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Shell } from "@/components/dash/Shell";
import { Meter, Panel, StatCard, StatusPill } from "@/components/dash/bits";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
/** Populated from the payment processor once billing is connected. */
interface Invoice {
  id: string;
  date: string;
  amount: string;
  plan: string;
  status: string;
}
const invoices: Invoice[] = [];
import { getTenantSettings, saveTenantSettings } from "@/lib/workspace-api";
import { USAGE_LABELS, formatUsage, getPlanUsage, listPlans } from "@/lib/billing-api";
import { downloadTextFile } from "@/lib/download";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/billing")({
  head: () => ({
    meta: [
      { title: "Billing — Kchel Dialer" },
      {
        name: "description",
        content:
          "Current plan, minutes used versus allotted, SIP credential purchases and invoice history.",
      },
      { property: "og:title", content: "Billing — Kchel Dialer" },
      {
        property: "og:description",
        content: "Review plan usage, SIP purchases and download past invoices.",
      },
    ],
  }),
  component: BillingPage,
});

type PlanUsage = Awaited<ReturnType<typeof getPlanUsage>>;
type Catalog = Awaited<ReturnType<typeof listPlans>>["plans"];

function BillingPage() {
  // The plan a tenant is on is server state, not a local choice — it gates
  // what they can actually do, so it can only come from the backend.
  const [planUsage, setPlanUsage] = useState<PlanUsage | null>(null);
  const [catalog, setCatalog] = useState<Catalog>([]);
  const [upgradeOpen, setUpgradeOpen] = useState(false);
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [billingEmail, setBillingEmail] = useState("");
  const [trunkOpen, setTrunkOpen] = useState(false);
  const [trunkCount, setTrunkCount] = useState(1);
  const [trunkPacks, setTrunkPacks] = useState<{ item: string; date: string; status: string }[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    void getPlanUsage()
      .then(setPlanUsage)
      .catch(() => {
        // Non-fatal — the rest of the page still renders.
      });
    void listPlans()
      .then((r) => setCatalog(r.plans))
      .catch(() => {});
  }, []);

  // Restore billing email / trunk orders.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const settings = await getTenantSettings();
        if (cancelled || !settings.saved) return;
        const b = settings.billing as {
          billingEmail?: string;
          trunkPacks?: { item: string; date: string; status: string }[];
        };
        if (b.billingEmail) setBillingEmail(b.billingEmail);
        if (Array.isArray(b.trunkPacks)) setTrunkPacks(b.trunkPacks);
      } catch {
        // Non-fatal — the page still renders with defaults.
      } finally {
        if (!cancelled) setLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  /** Persists the billing slice; called whenever a choice actually changes. */
  async function persistBilling(patch: Record<string, unknown>) {
    if (!loaded) return;
    try {
      await saveTenantSettings({ billing: patch });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save billing settings.");
    }
  }

  function downloadInvoice(inv: (typeof invoices)[number]) {
    const html = `Invoice ${inv.id}\nDate: ${inv.date}\nPlan: ${inv.plan}\nAmount: ${inv.amount}\nStatus: ${inv.status}\n\nKchel Dialer`;
    downloadTextFile(`${inv.id}.txt`, html);
    toast.success(`${inv.id} downloaded`);
  }

  function buyTrunks() {
    const next = [
      {
        item: `Trunk pack × ${trunkCount}`,
        date: new Date().toLocaleDateString(undefined, { month: "short", day: "2-digit", year: "numeric" }),
        status: "Pending",
      },
      ...trunkPacks,
    ];
    setTrunkPacks(next);
    setTrunkOpen(false);
    void persistBilling({ trunkPacks: next });
    toast.success(`${trunkCount} trunk${trunkCount === 1 ? "" : "s"} ordered`);
  }

  /** "3 of 5" for a stat card, or an em dash before usage has loaded. */
  function usageValue(key: string): string {
    const row = planUsage?.usage.find((u) => u.key === key);
    return row ? formatUsage(row.used, row.limit) : "—";
  }

  const periodLabel = new Date().toLocaleDateString(undefined, { month: "long", year: "numeric" });

  return (
    <Shell
      scope="tenant"
      title="Billing"
      description={`Billing period · ${periodLabel}`}
      actions={
        <>
          <Button variant="outline" onClick={() => setPaymentOpen(true)}>
            Payment method
          </Button>
          <Button onClick={() => setUpgradeOpen(true)}>
            {planUsage?.plan.id === "trial" ? "Upgrade" : "Compare plans"}
          </Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Current plan"
          value={planUsage?.plan.name ?? "…"}
          hint={
            planUsage
              ? planUsage.plan.price === 0
                ? "free"
                : `$${planUsage.plan.price}/agent/month`
              : "loading"
          }
          icon={CreditCard}
        />
        <StatCard
          label="Agents"
          value={usageValue("agents")}
          hint="seats in use"
          icon={Users}
        />
        <StatCard label="Contacts" value={usageValue("contacts")} hint="stored" />
        <StatCard
          label={planUsage?.plan.id === "trial" ? "Trial" : "Status"}
          value={
            planUsage?.plan.id === "trial"
              ? planUsage.trialExpired
                ? "Ended"
                : `${planUsage.daysRemaining ?? 0}d left`
              : "Active"
          }
          hint={planUsage?.trialExpired ? "upgrade to resume" : "in good standing"}
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <Panel
          title="Plan usage"
          description="What you're using against what your plan allows"
          className="xl:col-span-2"
          bodyClassName="p-5"
        >
          <div className="flex flex-col gap-5">
            {(planUsage?.usage ?? []).map((row) => {
              const limit = row.limit;
              const unlimited = limit === null;
              const pct = limit === null || limit === 0 ? 0 : Math.min(100, (row.used / limit) * 100);
              return (
                <div key={row.key}>
                  <div className="mb-2 flex items-center justify-between text-sm">
                    <span className="font-medium">{USAGE_LABELS[row.key] ?? row.key}</span>
                    <span className="font-mono text-xs text-muted-foreground">
                      {formatUsage(row.used, row.limit)}
                    </span>
                  </div>
                  <Meter
                    value={unlimited ? 0 : row.used}
                    max={unlimited ? 1 : Math.max(1, limit)}
                    label={unlimited ? "unlimited" : `${Math.round(pct)}% used`}
                  />
                </div>
              );
            })}
            {!planUsage && <p className="text-sm text-muted-foreground">Loading usage…</p>}
          </div>
        </Panel>

        <Panel title="SIP credentials" description="Purchase status" bodyClassName="p-5">
          {trunkPacks.length === 0 ? (
            <div className="flex items-center gap-3 rounded-lg border border-dashed border-border bg-muted/40 p-4">
              <ShieldCheck className="size-5 text-muted-foreground" />
              <div className="min-w-0">
                <p className="text-sm font-semibold">No trunks provisioned yet</p>
                <p className="text-xs text-muted-foreground">Buy a trunk to start making calls.</p>
              </div>
            </div>
          ) : (
            <ul className="flex flex-col gap-3 text-sm">
              {trunkPacks.map(({ item, date, status }, i) => (
                <li key={item + date + i} className="flex items-center justify-between gap-3">
                  <span>
                    <span className="block font-medium">{item}</span>
                    <span className="text-xs text-muted-foreground">{date}</span>
                  </span>
                  <StatusPill status={status} />
                </li>
              ))}
            </ul>
          )}
          <Button variant="outline" className="mt-4 w-full" onClick={() => setTrunkOpen(true)}>
            Buy trunks
          </Button>
        </Panel>
      </div>

      <Panel title="Invoice history" bodyClassName="p-0">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Invoice</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Plan</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">PDF</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {invoices.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="py-10 text-center text-sm text-muted-foreground">
                    No invoices yet.
                  </TableCell>
                </TableRow>
              ) : (
                invoices.map((inv) => (
                <TableRow key={inv.id}>
                  <TableCell className="font-mono text-sm font-semibold">{inv.id}</TableCell>
                  <TableCell className="text-muted-foreground">{inv.date}</TableCell>
                  <TableCell>{inv.plan}</TableCell>
                  <TableCell className="text-right font-mono text-sm">{inv.amount}</TableCell>
                  <TableCell>
                    <StatusPill status={inv.status} />
                  </TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="sm" onClick={() => downloadInvoice(inv)}>
                      <Download className="size-3.5" /> Download
                    </Button>
                  </TableCell>
                </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </Panel>

      <Dialog open={upgradeOpen} onOpenChange={setUpgradeOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Plans</DialogTitle>
            <DialogDescription>
              Priced per agent seat. Your carrier minutes are billed by your own SIP provider
              unless you are on Managed.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-2">
            {catalog.map((p) => {
              const current = planUsage?.plan.id === p.id;
              return (
                <div
                  key={p.id}
                  className={cn(
                    "rounded-lg border p-4",
                    current ? "border-primary bg-primary/8" : "border-border",
                  )}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold">
                        {p.name}
                        {current && (
                          <span className="ml-2 rounded-full bg-primary/15 px-2 py-0.5 text-[11px] font-semibold text-primary">
                            Current
                          </span>
                        )}
                      </p>
                      <p className="mt-0.5 text-xs text-muted-foreground">{p.blurb}</p>
                    </div>
                    <span className="shrink-0 font-mono text-sm font-semibold">
                      {p.price === 0 ? "Free" : `$${p.price}`}
                      {p.price > 0 && (
                        <span className="text-xs font-normal text-muted-foreground">/agent</span>
                      )}
                    </span>
                  </div>
                  <p className="mt-2 font-mono text-[11px] text-muted-foreground">
                    {p.limits.agents === null ? "unlimited" : p.limits.agents} agents ·{" "}
                    {p.limits.contacts === null ? "unlimited" : p.limits.contacts.toLocaleString()} contacts ·{" "}
                    {p.limits.ivrMenus === null ? "unlimited" : p.limits.ivrMenus} IVR menus
                  </p>
                </div>
              );
            })}
          </div>

          {/* Plans change only once payment clears, so this deliberately has no
              self-serve switch — a button here would hand out paid limits free. */}
          <p className="text-xs text-muted-foreground">
            To move plans, contact us and we'll send a payment link. Your plan updates as soon as
            payment clears.
          </p>

          <DialogFooter>
            <Button variant="outline" onClick={() => setUpgradeOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={paymentOpen} onOpenChange={setPaymentOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Payment method</DialogTitle>
            <DialogDescription>
              Card details are managed by your payment processor once connected — this only
              updates where receipts are sent.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-4">
            <div className="flex items-center gap-3 rounded-lg border border-dashed border-border bg-muted/40 p-4">
              <CreditCard className="size-5 text-muted-foreground" />
              <div>
                <p className="text-sm font-semibold">No payment method on file</p>
                <p className="text-xs text-muted-foreground">Add one before upgrading to a paid plan.</p>
              </div>
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="billing-email">Billing email</Label>
              <Input
                id="billing-email"
                type="email"
                placeholder="billing@yourcompany.com"
                value={billingEmail}
                onChange={(e) => setBillingEmail(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              onClick={() => {
                setPaymentOpen(false);
                void persistBilling({ billingEmail });
                toast.success("Billing email updated");
              }}
            >
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={trunkOpen} onOpenChange={setTrunkOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Buy more trunks</DialogTitle>
            <DialogDescription>$120/mo per trunk, billed with your next invoice.</DialogDescription>
          </DialogHeader>
          <div className="flex items-center justify-center gap-4">
            <Button variant="outline" size="icon" onClick={() => setTrunkCount((c) => Math.max(1, c - 1))}>
              <Minus className="size-4" />
            </Button>
            <span className="w-12 text-center font-mono text-2xl font-bold">{trunkCount}</span>
            <Button variant="outline" size="icon" onClick={() => setTrunkCount((c) => Math.min(20, c + 1))}>
              <Plus className="size-4" />
            </Button>
          </div>
          <p className="text-center text-sm text-muted-foreground">
            ${(trunkCount * 120).toLocaleString()}/mo added to your subscription
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTrunkOpen(false)}>
              Cancel
            </Button>
            <Button onClick={buyTrunks}>Confirm purchase</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Shell>
  );
}
