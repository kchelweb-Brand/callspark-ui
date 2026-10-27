import { createFileRoute } from "@tanstack/react-router";
import { CheckCircle2, Inbox, LifeBuoy, Loader2, Plus, Search, Send, Trash2 } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
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
  createTicket,
  deleteTicket,
  getConversation,
  listConversations,
  replyAsSupport,
  updateTicket,
  type Conversation,
  type CustomerProfile,
  type ThreadMessage,
} from "@/lib/admin-api";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/admin/support")({
  head: () => ({
    meta: [
      { title: "Support — Kchel Admin" },
      {
        name: "description",
        content: "Customer conversations with their plan and usage alongside.",
      },
      { property: "og:title", content: "Support — Kchel Admin" },
      {
        property: "og:description",
        content: "Reply to every customer who messages support.",
      },
    ],
  }),
  component: AdminSupportPage,
});

const STATUSES = ["Open", "In progress", "Waiting on customer", "Escalated", "Resolved"];
const PRIORITIES = ["Low", "Medium", "High"];

type Filter = "all" | "unread" | "open";

function when(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function AdminSupportPage() {
  const [items, setItems] = useState<Conversation[]>([]);
  const [tenants, setTenants] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [activeId, setActiveId] = useState<string | null>(null);

  const [newOpen, setNewOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ tenantId: "", subject: "", body: "", priority: "Medium" });

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await listConversations();
      setItems(result.conversations);
      setTenants(result.tenants);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load conversations.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const unread = items.filter((c) => c.admin_unread).length;
  const open = items.filter((c) => c.status !== "Resolved").length;
  const resolved = items.filter((c) => c.status === "Resolved").length;

  const visible = items.filter(
    (c) =>
      `${c.tenant_name ?? ""} ${c.subject} ${c.ticket_ref} ${c.created_by_email ?? ""}`
        .toLowerCase()
        .includes(query.toLowerCase()) &&
      (filter === "all" || (filter === "unread" ? c.admin_unread : c.status !== "Resolved")),
  );

  function patch(id: string, changes: Partial<Conversation>) {
    setItems((prev) => prev.map((c) => (c.id === id ? { ...c, ...changes } : c)));
  }

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
      setForm({ tenantId: "", subject: "", body: "", priority: "Medium" });
      setNewOpen(false);
      toast.success(`${result.ticket.ticket_ref} created`);
      await load();
      setActiveId(result.ticket.id);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not create that ticket.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Shell
      scope="admin"
      title="Support"
      description={loading ? "Loading…" : `${unread} need a reply · ${open} open · ${items.length} total`}
      actions={
        <Button onClick={() => setNewOpen(true)}>
          <Plus className="size-4" /> New ticket
        </Button>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <StatCard
          label="Needs a reply"
          value={String(unread)}
          icon={Inbox}
          {...(unread > 0 ? { tone: "destructive" as const } : {})}
        />
        <StatCard label="Open" value={String(open)} icon={LifeBuoy} />
        <StatCard label="Resolved" value={String(resolved)} icon={CheckCircle2} />
      </div>

      <div className="grid gap-4 lg:grid-cols-[340px_1fr]">
        <Panel bodyClassName="p-0">
          <div className="flex flex-col gap-3 border-b border-border p-3">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search customers or subjects"
                className="pl-9"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
            <div className="flex gap-2">
              {(
                [
                  ["all", "All"],
                  ["unread", `Needs reply (${unread})`],
                  ["open", "Open"],
                ] as [Filter, string][]
              ).map(([key, label]) => (
                <Button
                  key={key}
                  size="sm"
                  variant={filter === key ? "default" : "outline"}
                  onClick={() => setFilter(key)}
                >
                  {label}
                </Button>
              ))}
            </div>
          </div>

          <div className="max-h-[70vh] overflow-y-auto">
            {loading ? (
              <p className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" /> Loading…
              </p>
            ) : error ? (
              <div className="py-10 text-center">
                <p className="text-sm text-destructive">{error}</p>
                <Button className="mt-3" size="sm" onClick={() => void load()}>
                  Try again
                </Button>
              </div>
            ) : visible.length === 0 ? (
              <p className="py-12 text-center text-sm text-muted-foreground">
                {items.length === 0 ? "No conversations yet." : "Nothing matches this view."}
              </p>
            ) : (
              visible.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setActiveId(c.id)}
                  className={cn(
                    "flex w-full flex-col gap-1 border-b border-border px-4 py-3 text-left transition-colors hover:bg-muted/50",
                    activeId === c.id && "bg-primary/8",
                  )}
                >
                  <span className="flex items-center justify-between gap-2">
                    <span className="truncate text-sm font-semibold">
                      {c.tenant_name ?? "No workspace"}
                    </span>
                    {c.admin_unread && <span className="size-2.5 shrink-0 rounded-full bg-primary" />}
                  </span>
                  <span className="flex flex-wrap items-center gap-1.5">
                    {c.plan_name && (
                      <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10.5px] font-semibold text-primary">
                        {c.plan_name}
                      </span>
                    )}
                    <StatusPill status={c.status} />
                    {c.priority === "High" && <StatusPill status="High" />}
                  </span>
                  <span className="truncate text-sm">{c.subject}</span>
                  <span className="truncate text-xs text-muted-foreground">{c.last_message}</span>
                  <span className="text-[11px] text-muted-foreground">{when(c.updated_at)}</span>
                </button>
              ))
            )}
          </div>
        </Panel>

        <ConversationPane
          id={activeId}
          onChanged={(id, changes) => patch(id, changes)}
          onDeleted={(id) => {
            setItems((prev) => prev.filter((c) => c.id !== id));
            setActiveId(null);
          }}
        />
      </div>

      <Dialog open={newOpen} onOpenChange={setNewOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New ticket</DialogTitle>
            <DialogDescription>Start a conversation with a customer.</DialogDescription>
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
              <Label htmlFor="ticket-body">First message (optional)</Label>
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
    </Shell>
  );
}

function ConversationPane({
  id,
  onChanged,
  onDeleted,
}: {
  id: string | null;
  onChanged: (id: string, changes: Partial<Conversation>) => void;
  onDeleted: (id: string) => void;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ticket, setTicket] = useState<{ id: string; ticket_ref: string; subject: string; status: string; priority: string } | null>(null);
  const [messages, setMessages] = useState<ThreadMessage[]>([]);
  const [customer, setCustomer] = useState<CustomerProfile | null>(null);
  const [text, setText] = useState("");
  const [after, setAfter] = useState("Waiting on customer");
  const [sending, setSending] = useState(false);
  const bottom = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!id) {
      setTicket(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    getConversation(id)
      .then((r) => {
        if (cancelled) return;
        setTicket(r.ticket);
        setMessages(r.messages);
        setCustomer(r.customer);
        onChanged(id, { admin_unread: false });
      })
      .catch((err) => !cancelled && setError(err instanceof Error ? err.message : "Could not open that conversation."))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  useEffect(() => {
    bottom.current?.scrollIntoView({ block: "end" });
  }, [messages]);

  if (!id) {
    return (
      <Panel>
        <p className="py-16 text-center text-sm text-muted-foreground">
          Pick a conversation to read it and reply.
        </p>
      </Panel>
    );
  }
  if (loading || !ticket) {
    return (
      <Panel>
        <p className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
          {error ? <span className="text-destructive">{error}</span> : <><Loader2 className="size-4 animate-spin" /> Loading…</>}
        </p>
      </Panel>
    );
  }

  async function send() {
    if (!text.trim() || !ticket) return;
    setSending(true);
    try {
      const r = await replyAsSupport(ticket.id, text.trim(), after);
      setMessages(r.messages);
      setText("");
      setTicket({ ...ticket, status: r.status });
      onChanged(ticket.id, {
        status: r.status,
        last_message: r.messages[r.messages.length - 1]?.body ?? null,
        updated_at: new Date().toISOString(),
      });
      toast.success("Reply sent. The customer was emailed.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not send that reply.");
    } finally {
      setSending(false);
    }
  }

  async function setStatus(next: string) {
    if (!ticket) return;
    try {
      await updateTicket(ticket.id, { status: next });
      setTicket({ ...ticket, status: next });
      onChanged(ticket.id, { status: next });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not update that ticket.");
    }
  }

  async function remove() {
    if (!ticket || !window.confirm("Delete this conversation for good?")) return;
    try {
      await deleteTicket(ticket.id);
      onDeleted(ticket.id);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not delete that ticket.");
    }
  }

  return (
    <Panel>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-mono text-xs font-semibold text-muted-foreground">{ticket.ticket_ref}</p>
          <h2 className="text-base font-semibold">{ticket.subject}</h2>
        </div>
        <div className="flex items-center gap-2">
          <Select value={ticket.status} onValueChange={(v) => void setStatus(v)}>
            <SelectTrigger className="w-44">
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
          <Button variant="outline" size="icon" className="text-destructive" onClick={() => void remove()}>
            <Trash2 className="size-4" />
          </Button>
        </div>
      </div>

      <CustomerCard customer={customer} />

      <div className="mt-4 flex max-h-96 flex-col gap-3 overflow-y-auto pr-1">
        {messages.length === 0 && <p className="text-sm text-muted-foreground">No messages yet.</p>}
        {messages.map((m) => {
          const mine = m.sender_role === "support";
          return (
            <div
              key={m.id}
              className={cn(
                "max-w-[85%] rounded-2xl px-4 py-2.5",
                mine ? "self-end rounded-br-sm bg-primary/12" : "self-start rounded-bl-sm bg-muted",
              )}
            >
              <p className="mb-1 text-[11px] font-semibold text-muted-foreground">
                {mine ? "Kchel support" : (m.sender_email ?? "Customer")} · {when(m.created_at)}
              </p>
              <p className="whitespace-pre-wrap text-sm leading-relaxed">{m.body}</p>
            </div>
          );
        })}
        <div ref={bottom} />
      </div>

      <div className="mt-4 flex flex-col gap-3 border-t border-border pt-4">
        <Textarea
          rows={4}
          maxLength={4000}
          placeholder={`Reply to ${customer?.name ?? "the customer"}…`}
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-sm">
            <span className="text-muted-foreground">After sending, mark as</span>
            <Select value={after} onValueChange={setAfter}>
              <SelectTrigger className="w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {["Waiting on customer", "In progress", "Resolved"].map((s) => (
                  <SelectItem key={s} value={s}>
                    {s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button disabled={sending || !text.trim()} onClick={() => void send()}>
            {sending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
            Send reply
          </Button>
        </div>
      </div>
    </Panel>
  );
}

function CustomerCard({ customer }: { customer: CustomerProfile | null }) {
  if (!customer) {
    return (
      <p className="mt-4 rounded-lg bg-muted/50 p-3 text-sm text-muted-foreground">
        This ticket isn't linked to a workspace.
      </p>
    );
  }
  const rows: [string, string][] = [
    ["Workspace", `${customer.name} (${customer.workspace_slug})`],
    ["Plan", `${customer.plan_name} · $${customer.monthly_usd.toLocaleString()}/mo`],
    ["Account", customer.status],
    ["Owner", customer.owner_email ?? "—"],
    [
      "Signed up as",
      [customer.contact_name, customer.company_name].filter(Boolean).join(" · ") || "—",
    ],
    ["Phone", customer.contact_phone ?? "—"],
    ["Customer since", when(customer.created_at)],
    ...(customer.trial_ends_at ? ([["Trial ends", when(customer.trial_ends_at)]] as [string, string][]) : []),
    ["Users / agents", `${customer.user_count} / ${customer.agent_count}`],
    ["Contacts", customer.contact_count.toLocaleString()],
    ["Phone numbers", String(customer.number_count)],
    [
      "Calls",
      `${customer.call_count.toLocaleString()} · last ${customer.last_call_at ? when(customer.last_call_at) : "never"}`,
    ],
    [
      "Add-ons",
      [customer.dialer_addon ? "Dialer" : "", customer.sip_addon ? "Managed SIP" : ""]
        .filter(Boolean)
        .join(", ") || "None",
    ],
    ["Support", `${customer.open_ticket_count} open · ${customer.ticket_count} total`],
  ];
  return (
    <div className="mt-4 grid gap-x-8 gap-y-1 rounded-lg bg-muted/50 p-4 sm:grid-cols-2">
      {rows.map(([k, v]) => (
        <div key={k} className="flex justify-between gap-3 border-b border-dashed border-border py-1 text-[13px]">
          <span className="text-muted-foreground">{k}</span>
          <span className="break-words text-right font-medium">{v}</span>
        </div>
      ))}
    </div>
  );
}
