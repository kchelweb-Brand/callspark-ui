import { createFileRoute } from "@tanstack/react-router";
import { Search, Loader2, RefreshCw, PauseCircle } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { Shell } from "@/components/dash/Shell";
import { ActionButton, Panel, StatusPill } from "@/components/dash/bits";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { listTenants, setTenantStatus, type AdminTenant } from "@/lib/auth-api";
import { holdExpiredBatch, setDialerAddon, setSipAddon, setTenantHold } from "@/lib/billing-api";
import { ActivateTenantDialog } from "@/components/dash/ActivateTenantDialog";

export const Route = createFileRoute("/admin/tenants")({
  head: () => ({
    meta: [
      { title: "Tenants — Kchel Admin" },
      {
        name: "description",
        content:
          "All tenant accounts with status, owner and team size, plus approve, suspend and reactivate controls.",
      },
      { property: "og:title", content: "Tenants — Kchel Admin" },
      {
        property: "og:description",
        content: "Approve new signups and manage tenant accounts across the dialer platform.",
      },
    ],
  }),
  component: AdminTenantsPage,
});

const FILTERS = [
  { key: "pending", label: "Pending approval" },
  { key: "active", label: "Active" },
  { key: "suspended", label: "Suspended" },
  { key: "", label: "All" },
] as const;

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

/** How the plan stands today, in words an admin can scan down a column. */
function planState(t: AdminTenant): { label: string; tone: string } | null {
  if (t.status !== "active") return null;
  if (t.renewal_state === "hold")
    return { label: t.plan_expired ? "Expired, on hold" : "On hold (by you)", tone: "border-red-300 bg-red-50 text-red-800" };
  if (t.renewal_state === "grace") return { label: "Expired, in grace", tone: "border-amber-300 bg-amber-50 text-amber-900" };
  if (t.renewal_state === "upcoming") return { label: "Ending soon", tone: "border-amber-300 bg-amber-50 text-amber-900" };
  return null;
}

function AdminTenantsPage() {
  const [tenants, setTenants] = useState<AdminTenant[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Signups go live immediately now — nothing lands in "pending" on its own,
  // so defaulting there would show an empty tab on every page load. The
  // filter itself stays: an admin can still move a tenant back to pending by
  // hand, and this is where they'd go to find it again.
  const [filter, setFilter] = useState<string>("active");
  const [search, setSearch] = useState("");
  // Tracks which row is mid-update so we can disable just that row's buttons.
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [activating, setActivating] = useState<AdminTenant | null>(null);
  const [holdingAll, setHoldingAll] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { tenants: rows } = await listTenants(filter || undefined);
      setTenants(rows);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load tenants.");
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    void load();
  }, [load]);

  async function changeStatus(
    tenant: AdminTenant,
    status: "active" | "suspended" | "pending"
  ) {
    setUpdatingId(tenant.id);
    try {
      await setTenantStatus(tenant.id, status);
      toast.success(
        status === "active"
          ? `${tenant.name} approved`
          : status === "suspended"
            ? `${tenant.name} suspended`
            : `${tenant.name} moved back to pending`,
        {
          description:
            status === "active" ? "The owner has been emailed that they can sign in." : undefined,
        }
      );
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not update that tenant.");
    } finally {
      setUpdatingId(null);
    }
  }

  async function changeHold(tenant: AdminTenant, hold: boolean) {
    if (
      hold &&
      !window.confirm(
        `Put ${tenant.name} on hold? The owner can still sign in and open Billing and Support, but cannot do any new work, and is emailed that the account is on hold.`
      )
    )
      return;
    setUpdatingId(tenant.id);
    try {
      await setTenantHold(tenant.id, hold);
      toast.success(hold ? `${tenant.name} is on hold` : `Hold lifted for ${tenant.name}`, {
        description: hold ? "The owner has been emailed." : undefined,
      });
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not change the hold.");
    } finally {
      setUpdatingId(null);
    }
  }

  /** Holds every expired account now, a few per request, until none are left. */
  async function holdAllExpired() {
    if (
      !window.confirm(
        "Put every account whose plan or trial has already ended on hold right now? Each owner is emailed. Accounts that can still sign in keep access to Billing and Support, and accounts with no end date are not touched."
      )
    )
      return;
    setHoldingAll(true);
    let done = 0;
    let failed = 0;
    try {
      for (let guard = 0; guard < 400; guard++) {
        const r = await holdExpiredBatch();
        done += r.processed;
        failed += r.failed;
        if (r.remaining === 0 || r.processed + r.failed === 0) break;
      }
      toast.success(done === 0 ? "No expired accounts needed a hold." : `${done} expired account${done === 1 ? "" : "s"} put on hold`, {
        description: failed > 0 ? `${failed} could not be emailed but are on hold.` : done > 0 ? "Their owners have been emailed." : undefined,
      });
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not hold the expired accounts.");
      await load();
    } finally {
      setHoldingAll(false);
    }
  }

  async function toggleDialerAddon(tenant: AdminTenant) {
    setUpdatingId(tenant.id);
    try {
      const enabled = !tenant.dialer_addon_enabled;
      await setDialerAddon(tenant.id, enabled);
      toast.success(
        enabled ? `Desktop Dialer enabled for ${tenant.name}` : `Desktop Dialer disabled for ${tenant.name}`,
        { description: enabled ? "The owner has been emailed that it's ready." : undefined }
      );
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not update the Desktop Dialer add-on.");
    } finally {
      setUpdatingId(null);
    }
  }

  async function toggleSipAddon(tenant: AdminTenant) {
    setUpdatingId(tenant.id);
    try {
      const enabled = !tenant.sip_addon_enabled;
      await setSipAddon(tenant.id, enabled);
      toast.success(
        enabled ? `Managed SIP enabled for ${tenant.name}` : `Managed SIP disabled for ${tenant.name}`,
        { description: enabled ? "The owner has been emailed that it's ready." : undefined }
      );
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not update the Managed SIP add-on.");
    } finally {
      setUpdatingId(null);
    }
  }

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return tenants;
    return tenants.filter(
      (t) =>
        t.name.toLowerCase().includes(q) ||
        t.workspace_slug.toLowerCase().includes(q) ||
        (t.owner_email || "").toLowerCase().includes(q)
    );
  }, [tenants, search]);

  const pendingCount = tenants.filter((t) => t.status === "pending").length;

  return (
    <Shell
      scope="admin"
      title="Tenants"
      description={
        loading
          ? "Loading accounts…"
          : filter === "pending"
            ? `${pendingCount} awaiting approval`
            : `${visible.length} account${visible.length === 1 ? "" : "s"} shown`
      }
      actions={
        <>
          <ActionButton variant="outline" onClick={() => void holdAllExpired()} disabled={holdingAll || loading}>
            {holdingAll ? <Loader2 className="size-4 animate-spin" /> : <PauseCircle className="size-4" />} Put all expired accounts on hold
          </ActionButton>
          <ActionButton variant="outline" onClick={() => void load()} disabled={loading}>
            <RefreshCw className={`size-4 ${loading ? "animate-spin" : ""}`} /> Refresh
          </ActionButton>
        </>
      }
    >
      <Panel bodyClassName="p-0">
        <div className="flex flex-wrap items-center gap-3 border-b border-border p-4">
          <div className="relative min-w-56 flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search company, workspace or owner email"
              className="pl-9"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="flex flex-wrap gap-1">
            {FILTERS.map((f) => (
              <ActionButton
                key={f.key || "all"}
                size="sm"
                variant={filter === f.key ? "default" : "outline"}
                onClick={() => setFilter(f.key)}
              >
                {f.label}
              </ActionButton>
            ))}
          </div>
        </div>

        {error ? (
          <div className="p-8 text-center">
            <p className="text-sm text-destructive">{error}</p>
            <ActionButton className="mt-4" onClick={() => void load()}>
              Try again
            </ActionButton>
          </div>
        ) : loading ? (
          <div className="flex items-center justify-center gap-2 p-12 text-muted-foreground">
            <Loader2 className="size-4 animate-spin" /> Loading tenants…
          </div>
        ) : visible.length === 0 ? (
          <div className="p-12 text-center text-sm text-muted-foreground">
            {filter === "pending"
              ? "No signups waiting for approval."
              : "No accounts match this view."}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Account</TableHead>
                  <TableHead>Workspace</TableHead>
                  <TableHead>Owner</TableHead>
                  <TableHead>Plan</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Dialer</TableHead>
                  <TableHead>SIP</TableHead>
                  <TableHead className="text-right">Users</TableHead>
                  <TableHead>Joined</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visible.map((t) => {
                  const busy = updatingId === t.id;
                  return (
                    <TableRow key={t.id}>
                      <TableCell>
                        <p className="font-semibold">{t.name}</p>
                        <p className="font-mono text-xs text-muted-foreground">
                          {t.id.slice(0, 8)}
                        </p>
                      </TableCell>
                      <TableCell className="font-mono text-sm">
                        {t.workspace_slug}.kchel.app
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {t.owner_email || "—"}
                      </TableCell>
                      <TableCell>
                        <span className="rounded-full border border-border bg-muted px-2.5 py-0.5 text-[11px] font-semibold capitalize text-muted-foreground">
                          {t.plan}
                        </span>
                        {(() => {
                          const state = planState(t);
                          return state ? (
                            <span className={`ml-1.5 whitespace-nowrap rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${state.tone}`}>
                              {state.label}
                            </span>
                          ) : null;
                        })()}
                        {t.paid_until ? (
                          <p className="mt-1 text-xs text-muted-foreground">Paid to {formatDate(t.paid_until)}</p>
                        ) : null}
                      </TableCell>
                      <TableCell>
                        <StatusPill status={t.status} />
                      </TableCell>
                      <TableCell>
                        <ActionButton
                          size="sm"
                          variant={t.dialer_addon_enabled ? "default" : "outline"}
                          disabled={busy}
                          onClick={() => void toggleDialerAddon(t)}
                        >
                          {busy ? <Loader2 className="size-3.5 animate-spin" /> : null}
                          {t.dialer_addon_enabled ? "Enabled" : "Enable"}
                        </ActionButton>
                      </TableCell>
                      <TableCell>
                        <ActionButton
                          size="sm"
                          variant={t.sip_addon_enabled ? "default" : "outline"}
                          disabled={busy}
                          onClick={() => void toggleSipAddon(t)}
                        >
                          {busy ? <Loader2 className="size-3.5 animate-spin" /> : null}
                          {t.sip_addon_enabled ? "Enabled" : "Enable"}
                        </ActionButton>
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm">
                        {t.user_count}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-muted-foreground">
                        {formatDate(t.created_at)}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          {t.status === "pending" && (
                            <ActionButton
                              size="sm"
                              disabled={busy}
                              onClick={() => void changeStatus(t, "active")}
                            >
                              {busy ? <Loader2 className="size-3.5 animate-spin" /> : null}
                              Approve
                            </ActionButton>
                          )}
                          {t.status === "active" && (
                            <ActionButton
                              size="sm"
                              variant="outline"
                              disabled={busy}
                              onClick={() => void changeStatus(t, "suspended")}
                            >
                              {busy ? <Loader2 className="size-3.5 animate-spin" /> : null}
                              Suspend
                            </ActionButton>
                          )}
                          {t.status === "active" &&
                            (t.renewal_state === "hold" ? (
                              // An expired plan is reopened by activating it, not by lifting the hold.
                              t.plan_expired ? null : (
                                <ActionButton size="sm" variant="outline" disabled={busy} onClick={() => void changeHold(t, false)}>
                                  {busy ? <Loader2 className="size-3.5 animate-spin" /> : null}
                                  Lift hold
                                </ActionButton>
                              )
                            ) : (
                              <ActionButton size="sm" variant="outline" disabled={busy} onClick={() => void changeHold(t, true)}>
                                {busy ? <Loader2 className="size-3.5 animate-spin" /> : null}
                                Put on hold
                              </ActionButton>
                            ))}
                          <ActionButton
                            size="sm"
                            variant="outline"
                            disabled={busy}
                            onClick={() => setActivating(t)}
                          >
                            Activate
                          </ActionButton>
                          {t.status === "suspended" && (
                            <ActionButton
                              size="sm"
                              disabled={busy}
                              onClick={() => void changeStatus(t, "active")}
                            >
                              {busy ? <Loader2 className="size-3.5 animate-spin" /> : null}
                              Reactivate
                            </ActionButton>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </Panel>
      <ActivateTenantDialog
        tenant={activating}
        onClose={() => setActivating(null)}
        onActivated={() => {
          setActivating(null);
          void load();
        }}
      />

    </Shell>
  );
}
