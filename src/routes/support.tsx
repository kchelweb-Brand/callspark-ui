import { createFileRoute } from "@tanstack/react-router";
import { LifeBuoy, Loader2, Plus, Send } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

import { Shell } from "@/components/dash/Shell";
import { Panel, StatusPill } from "@/components/dash/bits";
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  createMyTicket,
  getMyConversation,
  listMyConversations,
  replyAsCustomer,
  type MyConversation,
  type SupportThreadMessage,
} from "@/lib/workspace-api";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/support")({
  head: () => ({
    meta: [
      { title: "Support — Kchel Dialer" },
      {
        name: "description",
        content: "Raise a support request and track the status of your open tickets.",
      },
      { property: "og:title", content: "Support — Kchel Dialer" },
      {
        property: "og:description",
        content: "Get help with your Kchel Dialer workspace.",
      },
    ],
  }),
  component: SupportPage,
});

const PRIORITIES = [
  { value: "Low", hint: "A question — no rush" },
  { value: "Medium", hint: "Something isn't working right" },
  { value: "High", hint: "Calls are down or blocked" },
];

function ThreadDialog({ id, onClose }: { id: string | null; onClose: () => void }) {
  const [ticket, setTicket] = useState<{ ticket_ref: string; subject: string; status: string } | null>(null);
  const [messages, setMessages] = useState<SupportThreadMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    setLoading(true);
    setTicket(null);
    getMyConversation(id)
      .then((r) => {
        if (cancelled) return;
        setTicket(r.ticket);
        setMessages(r.messages);
      })
      .catch((err) => toast.error(err instanceof Error ? err.message : "Could not open that request."))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [id]);

  async function send() {
    if (!id || !text.trim()) return;
    setSending(true);
    try {
      const r = await replyAsCustomer(id, text.trim());
      setMessages(r.messages);
      setText("");
      setTicket((t) => (t ? { ...t, status: r.status } : t));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not send that reply.");
    } finally {
      setSending(false);
    }
  }

  return (
    <Dialog open={!!id} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>{ticket ? `${ticket.ticket_ref} · ${ticket.subject}` : "Support"}</DialogTitle>
          <DialogDescription>{ticket ? `Status: ${ticket.status}` : "Loading…"}</DialogDescription>
        </DialogHeader>
        {loading ? (
          <p className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" /> Loading…
          </p>
        ) : (
          <div className="flex max-h-80 flex-col gap-3 overflow-y-auto pr-1">
            {messages.map((m) => {
              const mine = m.sender_role === "customer";
              return (
                <div
                  key={m.id}
                  className={cn(
                    "max-w-[85%] rounded-2xl px-4 py-2.5",
                    mine ? "self-end rounded-br-sm bg-primary/12" : "self-start rounded-bl-sm bg-muted",
                  )}
                >
                  <p className="mb-1 text-[11px] font-semibold text-muted-foreground">
                    {mine ? "You" : "Kchel support"} ·{" "}
                    {new Date(m.created_at).toLocaleString(undefined, {
                      month: "short",
                      day: "numeric",
                      hour: "numeric",
                      minute: "2-digit",
                    })}
                  </p>
                  <p className="whitespace-pre-wrap text-sm leading-relaxed">{m.body}</p>
                </div>
              );
            })}
          </div>
        )}
        <Textarea
          rows={3}
          maxLength={4000}
          placeholder="Write a reply…"
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
          <Button disabled={sending || !text.trim()} onClick={() => void send()}>
            {sending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
            Send reply
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SupportPage() {
  const [tickets, setTickets] = useState<MyConversation[]>([]);
  const [openId, setOpenId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ subject: "", body: "", priority: "Medium" });

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await listMyConversations();
      setTickets(result.tickets);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load your tickets.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function submit() {
    if (!form.subject.trim()) {
      toast.error("Tell us what the problem is.");
      return;
    }
    setBusy(true);
    try {
      const result = await createMyTicket({
        subject: form.subject.trim(),
        priority: form.priority,
        ...(form.body.trim() ? { body: form.body.trim() } : {}),
      });
      setForm({ subject: "", body: "", priority: "Medium" });
      setOpen(false);
      toast.success(`${result.ticket.ticket_ref} submitted`, {
        description: "We'll reply here and by email.",
      });
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not submit that request.");
    } finally {
      setBusy(false);
    }
  }

  const openCount = tickets.filter((t) => t.status !== "Resolved").length;

  return (
    <Shell
      scope="tenant"
      title="Support"
      description={
        loading
          ? "Loading…"
          : tickets.length === 0
            ? "Get help with your workspace"
            : `${openCount} open · ${tickets.length} total`
      }
      actions={
        <Button onClick={() => setOpen(true)}>
          <Plus className="size-4" /> New request
        </Button>
      }
    >
      <Panel bodyClassName="p-0">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Ref</TableHead>
                <TableHead>Subject</TableHead>
                <TableHead>Priority</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Last update</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={5} className="py-12 text-center text-sm text-muted-foreground">
                    <span className="inline-flex items-center gap-2">
                      <Loader2 className="size-4 animate-spin" /> Loading…
                    </span>
                  </TableCell>
                </TableRow>
              ) : error ? (
                <TableRow>
                  <TableCell colSpan={5} className="py-10 text-center">
                    <p className="text-sm text-destructive">{error}</p>
                    <Button className="mt-3" size="sm" onClick={() => void load()}>
                      Try again
                    </Button>
                  </TableCell>
                </TableRow>
              ) : tickets.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="py-12 text-center">
                    <LifeBuoy className="mx-auto size-6 text-muted-foreground" />
                    <p className="mt-2 text-sm font-medium">No support requests</p>
                    <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
                      Something not working? Raise a request and we'll pick it up.
                    </p>
                  </TableCell>
                </TableRow>
              ) : (
                tickets.map((t) => (
                  <TableRow key={t.id} className="cursor-pointer" onClick={() => setOpenId(t.id)}>
                    <TableCell className="font-mono text-sm font-semibold">{t.ticket_ref}</TableCell>
                    <TableCell>
                      <p className="font-medium">
                        {t.subject}
                        {t.customer_unread && (
                          <span className="ml-2 rounded-full bg-primary/15 px-2 py-0.5 text-[11px] font-semibold text-primary">
                            New reply
                          </span>
                        )}
                      </p>
                      {t.body && (
                        <p className="mt-0.5 max-w-96 truncate text-xs text-muted-foreground">
                          {t.body}
                        </p>
                      )}
                    </TableCell>
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
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </Panel>

      <ThreadDialog
        id={openId}
        onClose={() => {
          setOpenId(null);
          void load();
        }}
      />

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New support request</DialogTitle>
            <DialogDescription>
              Describe the problem and we'll follow up on this page.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="req-subject">What's wrong?</Label>
              <Input
                id="req-subject"
                placeholder="Outbound calls fail with a busy tone"
                value={form.subject}
                onChange={(e) => setForm({ ...form, subject: e.target.value })}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="req-body">Details (optional)</Label>
              <Textarea
                id="req-body"
                rows={5}
                placeholder="When it started, which numbers are affected, anything you've already tried…"
                value={form.body}
                onChange={(e) => setForm({ ...form, body: e.target.value })}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label>Urgency</Label>
              <Select value={form.priority} onValueChange={(p) => setForm({ ...form, priority: p })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PRIORITIES.map((p) => (
                    <SelectItem key={p.value} value={p.value}>
                      {p.value} — {p.hint}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button disabled={busy} onClick={() => void submit()}>
              {busy ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
              Submit request
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Shell>
  );
}
