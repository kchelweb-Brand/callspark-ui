import { createFileRoute } from "@tanstack/react-router";
import { CreditCard, Download, Minus, Plus, ShieldCheck } from "lucide-react";
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

const PLANS = [
  { name: "Growth", price: "$620/mo", minutes: "100,000 minutes" },
  { name: "Scale", price: "$1,480/mo", minutes: "250,000 minutes" },
  { name: "Enterprise", price: "$5,900/mo", minutes: "1,000,000 minutes" },
];

function BillingPage() {
  const [plan, setPlan] = useState<string | null>(null);
  const [upgradeOpen, setUpgradeOpen] = useState(false);
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [billingEmail, setBillingEmail] = useState("");
  const [trunkOpen, setTrunkOpen] = useState(false);
  const [trunkCount, setTrunkCount] = useState(1);
  const [trunkPacks, setTrunkPacks] = useState<{ item: string; date: string; status: string }[]>([]);
  const [loaded, setLoaded] = useState(false);

  // Restore previously chosen plan / billing email / trunk orders.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const settings = await getTenantSettings();
        if (cancelled || !settings.saved) return;
        const b = settings.billing as {
          plan?: string;
          billingEmail?: string;
          trunkPacks?: { item: string; date: string; status: string }[];
        };
        if (b.plan) setPlan(b.plan);
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
          <Button onClick={() => setUpgradeOpen(true)}>{plan ? "Change plan" : "Choose a plan"}</Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Current plan"
          value={plan ?? "No plan yet"}
          hint={plan ? PLANS.find((p) => p.name === plan)?.price ?? "" : "pick one to get started"}
          icon={CreditCard}
        />
        <StatCard label="Minutes used" value="0" hint="no usage yet" />
        <StatCard label="Overage estimate" value="$0.00" hint="0 minutes over" />
        <StatCard label="Next invoice" value="—" hint="no plan active" />
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <Panel title="Usage this period" className="xl:col-span-2" bodyClassName="p-5">
          <div className="flex flex-col gap-5">
            {[
              { label: "Outbound minutes", unit: "" },
              { label: "Recording storage", unit: "GB" },
              { label: "Concurrent channels (peak)", unit: "" },
            ].map((row) => (
              <div key={row.label}>
                <div className="mb-2 flex items-center justify-between text-sm">
                  <span className="font-medium">{row.label}</span>
                  <span className="font-mono text-xs text-muted-foreground">0 {row.unit}</span>
                </div>
                <Meter value={0} max={1} label="0% used" />
              </div>
            ))}
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
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Choose a plan</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-2">
            {PLANS.map((p) => (
              <button
                key={p.name}
                type="button"
                onClick={() => setPlan(p.name)}
                className={cn(
                  "flex items-center justify-between rounded-lg border p-4 text-left transition-colors",
                  plan === p.name ? "border-primary bg-primary/8" : "border-border hover:border-primary/40",
                )}
              >
                <span>
                  <span className="block text-sm font-semibold">{p.name}</span>
                  <span className="text-xs text-muted-foreground">{p.minutes}</span>
                </span>
                <span className="font-mono text-sm font-semibold">{p.price}</span>
              </button>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setUpgradeOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                setUpgradeOpen(false);
                void persistBilling({ plan });
                toast.success(`Switched to the ${plan} plan`, { description: "Takes effect on your next billing cycle." });
              }}
            >
              Confirm
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
