import { createFileRoute } from "@tanstack/react-router";
import { Search, Loader2, RefreshCw } from "lucide-react";
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

function AdminTenantsPage() {
  const [tenants, setTenants] = useState<AdminTenant[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>("pending");
  const [search, setSearch] = useState("");
  // Tracks which row is mid-update so we can disable just that row's buttons.
  const [updatingId, setUpdatingId] = useState<string | null>(null);

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
        <ActionButton variant="outline" onClick={() => void load()} disabled={loading}>
          <RefreshCw className={`size-4 ${loading ? "animate-spin" : ""}`} /> Refresh
        </ActionButton>
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
                  <TableHead>Status</TableHead>
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
                        <StatusPill status={t.status} />
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
    </Shell>
  );
}
