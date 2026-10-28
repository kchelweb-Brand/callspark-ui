import { createFileRoute } from "@tanstack/react-router";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

import { Shell } from "@/components/dash/Shell";
import { Panel } from "@/components/dash/bits";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { deletePaymentLink, listPaymentLinks, savePaymentLink, type PaymentLinkRow } from "@/lib/payments-api";

export const Route = createFileRoute("/admin/payments")({
  head: () => ({
    meta: [
      { title: "Payment links — Kchel Admin" },
      { name: "description", content: "Regional prices and ways to pay: card, bank, crypto and gift card." },
      { property: "og:title", content: "Payment links — Kchel Admin" },
      { property: "og:description", content: "Manage how customers pay." },
    ],
  }),
  component: PaymentsPage,
});

const PLAN_IDS = ["starter", "professional", "business", "managed"];

const blank = {
  id: undefined as string | undefined,
  region: "default",
  planId: "starter",
  seats: 1,
  interval: "monthly",
  method: "crypto",
  label: "",
  amountUsd: 0,
  url: "",
  active: true,
};

type Draft = typeof blank;

function selectClass() {
  return "h-9 w-full rounded-md border border-input bg-background px-3 text-sm";
}

function PaymentsPage() {
  const [links, setLinks] = useState<PaymentLinkRow[]>([]);
  const [regions, setRegions] = useState<{ id: string; label: string }[]>([]);
  const [methods, setMethods] = useState<{ id: string; label: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await listPaymentLinks();
      setLinks(r.links);
      setRegions(r.regions);
      setMethods(r.methods);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not load the links.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function save() {
    if (!draft) return;
    setSaving(true);
    try {
      await savePaymentLink({
        ...(draft.id ? { id: draft.id } : {}),
        region: draft.region,
        planId: draft.planId,
        seats: Number(draft.seats),
        interval: draft.interval,
        method: draft.method,
        label: draft.label,
        amountUsd: Number(draft.amountUsd),
        url: draft.url,
        active: draft.active,
      });
      toast.success("Saved");
      setDraft(null);
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save that.");
    } finally {
      setSaving(false);
    }
  }

  async function remove(id: string) {
    try {
      await deletePaymentLink(id);
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not delete that.");
    }
  }

  const set = (patch: Partial<Draft>) => setDraft((d) => (d ? { ...d, ...patch } : d));

  return (
    <Shell scope="admin" title="Payment links" description="Regional prices, and ways to pay beyond cards: crypto, gift cards and bank transfer.">
      <Panel
        title="How this works"
        description="Each link is a fixed-amount payment page you create at your payment provider. Customers see the links for their own region, and a regional link replaces the standard one for the same plan, seats, interval and method. Paying activates nothing by itself: you confirm the money and activate the plan, and customers tell you they've paid from the Billing page."
      >
        <p className="text-sm text-muted-foreground">
          To offer a regional price, create a payment link for the lower amount, then add it here for the
          Emerging markets region. Countries in that region are listed in the signup form's country list.
        </p>
      </Panel>

      <Panel
        title="Links"
        actions={
          <Button size="sm" onClick={() => setDraft({ ...blank })}>
            <Plus className="size-4" /> Add link
          </Button>
        }
      >
        {loading ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" /> Loading…
          </p>
        ) : links.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nothing added yet. The built-in card links keep working; add links here for other ways to pay.
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            {links.map((l) => (
              <div key={l.id} className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border p-3">
                <div className="flex min-w-0 flex-col gap-0.5">
                  <span className="text-sm font-medium">
                    {l.plan_id} · {l.seats} seat{l.seats === 1 ? "" : "s"} · {l.interval} · ${l.amount_usd}
                  </span>
                  <span className="truncate text-xs text-muted-foreground">
                    {regions.find((r) => r.id === l.region)?.label ?? l.region} · {l.method}
                    {l.label ? ` · ${l.label}` : ""} · {l.active ? "shown to customers" : "hidden"}
                  </span>
                  <span className="truncate font-mono text-xs text-muted-foreground">{l.url}</span>
                </div>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      setDraft({
                        id: l.id,
                        region: l.region,
                        planId: l.plan_id,
                        seats: l.seats,
                        interval: l.interval,
                        method: l.method,
                        label: l.label,
                        amountUsd: l.amount_usd,
                        url: l.url,
                        active: l.active,
                      })
                    }
                  >
                    Edit
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => void remove(l.id)}>
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Panel>

      {draft && (
        <Panel title={draft.id ? "Edit link" : "Add link"}>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-2">
              <Label>Region</Label>
              <select className={selectClass()} value={draft.region} onChange={(e) => set({ region: e.target.value })}>
                {regions.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-2">
              <Label>Paid by</Label>
              <select className={selectClass()} value={draft.method} onChange={(e) => set({ method: e.target.value })}>
                {methods.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-2">
              <Label>Plan</Label>
              <select className={selectClass()} value={draft.planId} onChange={(e) => set({ planId: e.target.value })}>
                {PLAN_IDS.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-2">
              <Label>Billing</Label>
              <select className={selectClass()} value={draft.interval} onChange={(e) => set({ interval: e.target.value })}>
                <option value="monthly">Monthly</option>
                <option value="annual">Annual</option>
              </select>
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="pl-seats">Seats</Label>
              <Input id="pl-seats" type="number" min={1} value={draft.seats} onChange={(e) => set({ seats: Number(e.target.value) })} />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="pl-amount">Amount in US dollars</Label>
              <Input id="pl-amount" type="number" min={1} step="0.01" value={draft.amountUsd} onChange={(e) => set({ amountUsd: Number(e.target.value) })} />
            </div>
            <div className="flex flex-col gap-2 sm:col-span-2">
              <Label htmlFor="pl-label">Button text (optional)</Label>
              <Input id="pl-label" placeholder="Crypto (USDT)" value={draft.label} onChange={(e) => set({ label: e.target.value })} />
            </div>
            <div className="flex flex-col gap-2 sm:col-span-2">
              <Label htmlFor="pl-url">Payment link</Label>
              <Input id="pl-url" placeholder="https://" value={draft.url} onChange={(e) => set({ url: e.target.value })} />
            </div>
            <div className="flex items-center gap-3 sm:col-span-2">
              <Switch checked={draft.active} onCheckedChange={(on) => set({ active: on })} />
              <span className="text-sm">Show to customers</span>
            </div>
          </div>
          <div className="mt-4 flex gap-2">
            <Button onClick={() => void save()} disabled={saving}>
              {saving ? <Loader2 className="size-4 animate-spin" /> : null}
              Save
            </Button>
            <Button variant="outline" onClick={() => setDraft(null)}>
              Cancel
            </Button>
          </div>
        </Panel>
      )}
    </Shell>
  );
}
