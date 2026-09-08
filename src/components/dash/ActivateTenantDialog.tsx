import { useEffect, useState } from "react";
import { Loader2, ShieldCheck } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { activateTenant, listPlans } from "@/lib/billing-api";
import type { AdminTenant } from "@/lib/auth-api";

type Catalog = Awaited<ReturnType<typeof listPlans>>["plans"];

/**
 * Puts a tenant on a paid plan once payment has been confirmed in Flutterwave.
 *
 * Payment verification happens outside this system by design — an operator
 * sees the money, then activates here. That keeps the grant of a paid plan
 * behind a human, so no bug or forged request can hand one out.
 */
export function ActivateTenantDialog({
  tenant,
  onClose,
  onActivated,
}: {
  tenant: AdminTenant | null;
  onClose: () => void;
  onActivated: () => void;
}) {
  const [catalog, setCatalog] = useState<Catalog>([]);
  const [plan, setPlan] = useState<string>("starter");
  const [notify, setNotify] = useState(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void listPlans()
      .then((r) => setCatalog(r.plans))
      .catch(() => {
        // Non-fatal — the select falls back to whatever is already loaded.
      });
  }, []);

  // Default to the tenant's current plan so re-activating doesn't silently
  // move a paying customer onto something cheaper.
  useEffect(() => {
    if (tenant?.plan && tenant.plan !== "trial") setPlan(tenant.plan);
    else setPlan("starter");
  }, [tenant]);

  async function activate() {
    if (!tenant) return;
    setBusy(true);
    try {
      const result = await activateTenant(tenant.id, plan, notify);
      const planName = catalog.find((p) => p.id === plan)?.name ?? plan;
      toast.success(`${tenant.name} activated on ${planName}`, {
        description: result.notified
          ? `Confirmation emailed to ${result.ownerEmail}`
          : result.ownerEmail
            ? "Account is live — the email could not be sent."
            : "Account is live — no owner email on file to notify.",
      });
      onActivated();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not activate that account.");
    } finally {
      setBusy(false);
    }
  }

  const selected = catalog.find((p) => p.id === plan);

  return (
    <Dialog open={!!tenant} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Activate {tenant?.name}</DialogTitle>
          <DialogDescription>
            Confirm the payment in Flutterwave first. Activating sets the plan, marks the account
            active and emails the owner.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label>Plan</Label>
            <Select value={plan} onValueChange={setPlan}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {catalog.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                    {p.price > 0 ? ` — $${p.price}/agent/mo` : " — free"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {selected && (
              <p className="font-mono text-[11px] text-muted-foreground">
                {selected.limits.agents === null ? "unlimited" : selected.limits.agents} agents ·{" "}
                {selected.limits.contacts === null
                  ? "unlimited"
                  : selected.limits.contacts.toLocaleString()}{" "}
                contacts
              </p>
            )}
          </div>

          <div className="flex items-center justify-between gap-4 rounded-lg border border-border bg-muted/40 p-3">
            <div className="min-w-0">
              <Label htmlFor="notify-owner" className="text-sm font-medium">
                Email the owner
              </Label>
              <p className="truncate text-xs text-muted-foreground">
                {tenant?.owner_email ?? "No owner email on file"}
              </p>
            </div>
            <Switch
              id="notify-owner"
              checked={notify}
              disabled={!tenant?.owner_email}
              onCheckedChange={setNotify}
            />
          </div>

          <div className="flex items-start gap-2 rounded-lg border border-border bg-muted/40 p-3 text-xs text-muted-foreground">
            <ShieldCheck className="mt-0.5 size-3.5 shrink-0" />
            <span>
              Only activate after the payment has cleared. This immediately grants the plan&apos;s
              limits.
            </span>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={busy} onClick={() => void activate()}>
            {busy ? <Loader2 className="size-4 animate-spin" /> : null}
            Activate account
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
