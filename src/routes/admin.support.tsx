import { createFileRoute } from "@tanstack/react-router";
import { CheckCircle2, LifeBuoy, Loader2, Plus, Search, Trash2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { Shell } from "@/components/dash/Shell";
import { Panel, StatCard, StatusPill } from "@/components/dash/bits";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  createTicket,
  deleteTicket,
  listTickets,
  updateTicket,
  type TicketRecord,
} from "@/lib/admin-api";

export const Route = createFileRoute("/admin/support")({
  head: () => ({
    meta: [
      { title: "Support — Kchel Admin" },
      {
        name: "description",
        content: "Tenant support queue with ticket priority and status.",
      },
      { property: "og:title", content: "Support — Kchel Admin" },
      {
        property: "og:description",
        content: "Triage tenant support tickets across the platform.",
      },
    ],
  }),
  component: AdminSupportPage,
});

const STATUSES = ["Open", "In progress", "Waiting on customer", "Escalated", "Resolved"];
const PRIORITIES = ["Low", "Medium", "High"];

function AdminSupportPage() {
  const [tickets, setTickets] = useState<TicketRecord[]>([]);
  const [tenants, setTenants] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [query, setQuery] = useState("");
  const [priority, setPriority] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  const [newOpen, setNewOpen] = useState(false);
  const [form, setForm] = useState({ tenantId: "", subject: "", body: "", priority: "Medium" });
  const [openTicket, setOpenTicket] = useState<TicketRecord | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await listTickets();
      setTickets(result.tickets);
      setTenants(result.tenants);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load tickets.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const priorities = useMemo(() => [...new Set(tickets.map((t) => t.priority))], [tickets]);
  const statuses = useMemo(() => [...new Set(tickets.map((t) => t.status))], [tickets]);

  const visible = tickets.filter(
    (t) =>
      `${t.tenant_name ?? ""} ${t.subject} ${t.ticket_ref}`
        .toLowerCase()
        .includes(query.toLowerCase()) &&
      (!priority || t.priority === priority) &&
      (!status || t.status === status),
  );

  const open = tickets.filter((t) => t.status !== "Resolved").length;
  const high = tickets.filter((t) => t.priority === "High" && t.status !== "Resolved").length;
  const resolved = tickets.filter((t) => t.status === "Resolved").length;

  async function submitTicket() {
    if (!form.subject.trim()) {
      toast.error("Give the ticket a subject.");
      return;
    }
    setBusy(true);
    try {
      const result = await createTicket({
        subject: form.subject.trim(),
        priority: form.priority,
        ...(form.tenantId ? { tenantId: form.tenantId } : {}),
        ...(form.body.trim() ? { body: form.body.trim() } : {}),
      });
      setTickets((prev) => [result.ticket, ...prev]);
      setForm({ tenantId: "", subject: "", body: "", priority: "Medium" });
      setNewOpen(false);
      toast.success(`${result.ticket.ticket_ref} created`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not create that ticket.");
    } finally {
      setBusy(false);
    }
  }

  async function changeStatus(id: string, next: string) {
    try {
      await updateTicket(id, { status: next });
      setTickets((prev) => prev.map((t) => (t.id === id ? { ...t, status: next } : t)));
      setOpenTicket((prev) => (prev && prev.id === id ? { ...prev, status: next } : prev));
      toast.success(`Marked ${next}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not update that ticket.");
    }
  }

  async function removeTicket(id: string, ref: string) {
    try {
      await deleteTicket(id);
      setTickets((prev) => prev.filter((t) => t.id !== id));
      setOpenTicket(null);
      toast.success(`${ref} deleted`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not delete that ticket.");
    }
  }

  return (
    <Shell
      scope="admin"
      title="Support"
      description={
        loading ? "Loading…" : `${open} open · ${tickets.length} total`
      }
      actions={
        <Button onClick={() => setNewOpen(true)}>
          <Plus className="size-4" /> New ticket
        </Button>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <StatCard label="Open tickets" value={String(open)} icon={LifeBuoy} />
        <StatCard
          label="High priority"
          value={String(high)}
          icon={LifeBuoy}
          {...(high > 0 ? { tone: "destructive" as const } : {})}
        />
        <StatCard label="Resolved" value={String(resolved)} icon={CheckCircle2} />
      </div>

      <Panel bodyClassName="p-0">
        <div className="flex flex-wrap items-center gap-3 border-b border-border p-4">
          <div className="relative min-w-56 flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search tickets, tenants or refs"
              className="pl-9"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline">{priority ?? "Priority"}</Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>Filter by priority</DropdownMenuLabel>
              {priorities.length === 0 ? (
                <DropdownMenuLabel className="font-normal text-muted-foreground">
                  No tickets yet
                </DropdownMenuLabel>
              ) : (
                priorities.map((p) => (
                  <DropdownMenuCheckboxItem
                    key={p}
                    checked={priority === p}
                    onCheckedChange={(on) => setPriority(on ? p : null)}
                  >
                    {p}
                  </DropdownMenuCheckboxItem>
                ))
              )}
            </DropdownMenuContent>
          </DropdownMenu>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline">{status ?? "Status"}</Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>Filter by status</DropdownMenuLabel>
              {statuses.length === 0 ? (
                <DropdownMenuLabel className="font-normal text-muted-foreground">
                  No tickets yet
                </DropdownMenuLabel>
              ) : (
                statuses.map((s) => (
                  <DropdownMenuCheckboxItem
                    key={s}
                    checked={status === s}
                    onCheckedChange={(on) => setStatus(on ? s : null)}
                  >
                    {s}
                  </DropdownMenuCheckboxItem>
                ))
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Ticket</TableHead>
                <TableHead>Tenant</TableHead>
                <TableHead>Subject</TableHead>
                <TableHead>Priority</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Updated</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={7} className="py-12 text-center text-sm text-muted-foreground">
                    <span className="inline-flex items-center gap-2">
                      <Loader2 className="size-4 animate-spin" /> Loading tickets…
                    </span>
                  </TableCell>
                </TableRow>
              ) : error ? (
                <TableRow>
                  <TableCell colSpan={7} className="py-10 text-center">
                    <p className="text-sm text-destructive">{error}</p>
                    <Button className="mt-3" size="sm" onClick={() => void load()}>
                      Try again
                    </Button>
                  </TableCell>
                </TableRow>
              ) : visible.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="py-12 text-center">
                    <p className="text-sm font-medium">
                      {tickets.length === 0 ? "No tickets yet" : "No tickets match this view."}
                    </p>
                    {tickets.length === 0 && (
                      <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
                        Raise one against a tenant to start tracking an issue.
                      </p>
                    )}
                  </TableCell>
                </TableRow>
              ) : (
                visible.map((t) => (
                  <TableRow key={t.id}>
                    <TableCell className="font-mono text-sm font-semibold">{t.ticket_ref}</TableCell>
                    <TableCell>{t.tenant_name ?? "—"}</TableCell>
                    <TableCell className="max-w-64 truncate">{t.subject}</TableCell>
                    <TableCell>
                      <StatusPill status={t.priority} />
                    </TableCell>
                    <TableCell>
                      <StatusPill status={t.status} />
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-muted-foreground">
                      {new Date(t.updated_at).toLocaleDateString(undefined, {
                        month: "short",
                        day: "numeric",
                      })}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="sm" onClick={() => setOpenTicket(t)}>
                        Open
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </Panel>

      <Dialog open={newOpen} onOpenChange={setNewOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New ticket</DialogTitle>
            <DialogDescription>Track an issue against a tenant.</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label>Tenant</Label>
              <Select
                value={form.tenantId}
                onValueChange={(tenantId) => setForm({ ...form, tenantId })}
                disabled={tenants.length === 0}
              >
                <SelectTrigger>
                  <SelectValue placeholder={tenants.length === 0 ? "No tenants yet" : "Choose a tenant"} />
                </SelectTrigger>
                <SelectContent>
                  {tenants.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="ticket-subject">Subject</Label>
              <Input
                id="ticket-subject"
                value={form.subject}
                onChange={(e) => setForm({ ...form, subject: e.target.value })}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="ticket-body">Details (optional)</Label>
              <Textarea
                id="ticket-body"
                rows={4}
                value={form.body}
                onChange={(e) => setForm({ ...form, body: e.target.value })}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label>Priority</Label>
              <Select value={form.priority} onValueChange={(p) => setForm({ ...form, priority: p })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PRIORITIES.map((p) => (
                    <SelectItem key={p} value={p}>
                      {p}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNewOpen(false)}>
              Cancel
            </Button>
            <Button disabled={busy} onClick={() => void submitTicket()}>
              {busy ? <Loader2 className="size-4 animate-spin" /> : null}
              Create ticket
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!openTicket} onOpenChange={(o) => !o && setOpenTicket(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{openTicket?.ticket_ref}</DialogTitle>
            <DialogDescription>{openTicket?.tenant_name ?? "No tenant linked"}</DialogDescription>
          </DialogHeader>
          {openTicket && (
            <div className="flex flex-col gap-4">
              <div className="rounded-lg border border-border bg-muted/40 p-3">
                <p className="text-sm font-medium">{openTicket.subject}</p>
                {openTicket.body && (
                  <p className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">
                    {openTicket.body}
                  </p>
                )}
              </div>
              <div className="flex flex-col gap-2">
                <Label>Status</Label>
                <Select
                  value={openTicket.status}
                  onValueChange={(v) => void changeStatus(openTicket.id, v)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {STATUSES.map((s) => (
                      <SelectItem key={s} value={s}>
                        {s}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button
              variant="outline"
              className="text-destructive"
              onClick={() => openTicket && void removeTicket(openTicket.id, openTicket.ticket_ref)}
            >
              <Trash2 className="size-3.5" /> Delete
            </Button>
            <Button variant="outline" onClick={() => setOpenTicket(null)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Shell>
  );
}
