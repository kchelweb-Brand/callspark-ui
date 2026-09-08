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
import { createMyTicket, listMyTickets, type MyTicketRecord } from "@/lib/workspace-api";

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

function SupportPage() {
  const [tickets, setTickets] = useState<MyTicketRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ subject: "", body: "", priority: "Medium" });

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await listMyTickets();
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
      setTickets((prev) => [result.ticket, ...prev]);
      setForm({ subject: "", body: "", priority: "Medium" });
      setOpen(false);
      toast.success(`${result.ticket.ticket_ref} submitted`, {
        description: "We'll get back to you here.",
      });
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
                  <TableRow key={t.id}>
                    <TableCell className="font-mono text-sm font-semibold">{t.ticket_ref}</TableCell>
                    <TableCell>
                      <p className="font-medium">{t.subject}</p>
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
