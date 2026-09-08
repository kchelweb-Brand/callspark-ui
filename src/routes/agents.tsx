import { createFileRoute } from "@tanstack/react-router";
import { Loader2, MoreVertical, Trash2, UserPlus } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

import { Shell } from "@/components/dash/Shell";
import { Panel, StatusPill } from "@/components/dash/bits";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
  createAgent,
  deleteAgent,
  listAgents,
  updateAgent,
  type AgentRecord,
} from "@/lib/workspace-api";

export const Route = createFileRoute("/agents")({
  head: () => ({
    meta: [
      { title: "Agents — Kchel Dialer" },
      {
        name: "description",
        content: "Agent roster with live status, calls handled today, talk time and connect performance.",
      },
      { property: "og:title", content: "Agents — Kchel Dialer" },
      {
        property: "og:description",
        content: "Track agent availability and daily performance on the dialer floor.",
      },
    ],
  }),
  component: AgentsPage,
});

type Agent = AgentRecord;
const STATUSES = ["Available", "On call", "Wrap-up", "Offline"];

function initials(name: string) {
  return name
    .split(" ")
    .map((n) => n[0])
    .join("");
}

/** Stored as seconds; shown as "3h 41m" / "22m". */
function formatTalk(seconds: number): string {
  if (!seconds) return "0m";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

function AgentsPage() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", ext: "", role: "Agent" });
  const [removeTarget, setRemoveTarget] = useState<Agent | null>(null);

  const signedIn = agents.filter((a) => a.status !== "Offline").length;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await listAgents();
      setAgents(result.agents);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not load agents.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function invite() {
    if (!form.name.trim() || !form.email.trim()) {
      toast.error("Name and email are required.");
      return;
    }
    setBusy(true);
    try {
      const result = await createAgent({
        name: form.name.trim(),
        email: form.email.trim(),
        ...(form.ext.trim() ? { extension: form.ext.trim() } : {}),
        role: form.role,
      });
      setAgents((prev) => [...prev, result.agent]);
      toast.success(`Invited ${result.agent.name}`, {
        description: `Extension ${result.agent.extension}`,
      });
      setForm({ name: "", email: "", ext: "", role: "Agent" });
      setInviteOpen(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not invite that agent.");
    } finally {
      setBusy(false);
    }
  }

  async function setStatus(id: string, status: string) {
    try {
      const result = await updateAgent(id, { status });
      setAgents((prev) => prev.map((a) => (a.id === id ? result.agent : a)));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not update that agent.");
    }
  }

  async function remove(agent: Agent) {
    try {
      await deleteAgent(agent.id);
      setAgents((prev) => prev.filter((a) => a.id !== agent.id));
      setRemoveTarget(null);
      toast.success(`${agent.name} removed from the team`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not remove that agent.");
    }
  }

  return (
    <Shell
      scope="tenant"
      title="Agents"
      description={`${agents.length} seats · ${signedIn} signed in today`}
      actions={
        <Button onClick={() => setInviteOpen(true)}>
          <UserPlus className="size-4" /> Invite agent
        </Button>
      }
    >
      {loading ? (
        <Panel bodyClassName="flex items-center justify-center gap-2 p-12 text-muted-foreground">
          <Loader2 className="size-4 animate-spin" /> Loading agents…
        </Panel>
      ) : agents.length === 0 ? (
        <Panel bodyClassName="p-10 text-center">
          <p className="text-sm font-medium">No agents yet</p>
          <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
            Invite your team to start taking and making calls.
          </p>
        </Panel>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {agents.map((a) => (
          <div key={a.id} className="card-surface p-5">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <span className="flex size-10 items-center justify-center rounded-full bg-primary/12 text-sm font-bold text-primary">
                  {initials(a.name)}
                </span>
                <div>
                  <p className="text-sm font-semibold">{a.name}</p>
                  <p className="text-xs text-muted-foreground">Ext {a.extension}</p>
                </div>
              </div>
              <div className="flex items-center gap-1.5">
                <StatusPill status={a.status} />
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="size-7" aria-label={`Actions for ${a.name}`}>
                      <MoreVertical className="size-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuLabel>Set status</DropdownMenuLabel>
                    {STATUSES.map((s) => (
                      <DropdownMenuItem key={s} onClick={() => void setStatus(a.id, s)}>
                        {s}
                      </DropdownMenuItem>
                    ))}
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      className="text-destructive focus:text-destructive"
                      onClick={() => setRemoveTarget(a)}
                    >
                      <Trash2 className="size-3.5" /> Remove agent
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>
            <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
              <div>
                <dt className="text-xs text-muted-foreground">Calls today</dt>
                <dd className="font-mono font-semibold">{a.calls_today}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Talk time</dt>
                <dd className="font-mono font-semibold">{formatTalk(a.talk_seconds)}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Connect rate</dt>
                <dd className="font-mono font-semibold">{a.connect_rate.toFixed(1)}%</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">CSAT</dt>
                <dd className="font-mono font-semibold">{a.csat ? a.csat.toFixed(1) : "—"}</dd>
              </div>
            </dl>
          </div>
        ))}
      </div>

      {agents.length > 0 && (
      <Panel title="Performance table" description="Today, all agents" bodyClassName="p-0">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Agent</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Calls handled</TableHead>
                <TableHead className="text-right">Talk time</TableHead>
                <TableHead className="text-right">Connect rate</TableHead>
                <TableHead className="text-right">CSAT</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {agents.map((a) => (
                <TableRow key={a.id}>
                  <TableCell className="font-semibold">{a.name}</TableCell>
                  <TableCell>
                    <StatusPill status={a.status} />
                  </TableCell>
                  <TableCell className="text-right font-mono text-sm">{a.calls_today}</TableCell>
                  <TableCell className="text-right font-mono text-sm">{formatTalk(a.talk_seconds)}</TableCell>
                  <TableCell className="text-right font-mono text-sm">{a.connect_rate.toFixed(1)}%</TableCell>
                  <TableCell className="text-right font-mono text-sm">
                    {a.csat ? a.csat.toFixed(1) : "—"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </Panel>
      )}

      <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Invite agent</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-2 sm:col-span-2">
              <Label htmlFor="agent-name">Full name</Label>
              <Input id="agent-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div className="flex flex-col gap-2 sm:col-span-2">
              <Label htmlFor="agent-email">Email</Label>
              <Input
                id="agent-email"
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="agent-ext">Extension</Label>
              <Input
                id="agent-ext"
                placeholder="Auto-assigned"
                value={form.ext}
                onChange={(e) => setForm({ ...form, ext: e.target.value })}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label>Role</Label>
              <Select value={form.role} onValueChange={(role) => setForm({ ...form, role })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {["Agent", "Team lead", "Supervisor", "Admin"].map((r) => (
                    <SelectItem key={r} value={r}>
                      {r}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setInviteOpen(false)}>
              Cancel
            </Button>
            <Button disabled={busy} onClick={() => void invite()}>
              {busy ? <Loader2 className="size-4 animate-spin" /> : null}
              Send invite
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!removeTarget} onOpenChange={(open) => !open && setRemoveTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove {removeTarget?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              They'll lose access to the dialer immediately. Their call history is kept.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => removeTarget && void remove(removeTarget)}>Remove</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Shell>
  );
}
