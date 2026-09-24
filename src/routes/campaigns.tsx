import { createFileRoute } from "@tanstack/react-router";
import {
  Copy,
  List,
  Loader2,
  MoreHorizontal,
  Pause,
  Play,
  Search,
  SlidersHorizontal,
  Trash2,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { Shell } from "@/components/dash/Shell";
import { Panel, StatusPill } from "@/components/dash/bits";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { CreateCampaignDialog } from "@/components/dash/CreateCampaignDialog";
import {
  deleteCampaign,
  duplicateCampaign,
  getCampaignCallLog,
  listCampaigns,
  pauseCampaignDialing,
  reconcileCampaign,
  startCampaignDialing,
  updateCampaign,
  type CampaignCallLogRow,
  type CampaignRecord,
} from "@/lib/workspace-api";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export const Route = createFileRoute("/campaigns")({
  head: () => ({
    meta: [
      { title: "Campaigns — Kchel Dialer" },
      {
        name: "description",
        content: "Manage outbound dialing campaigns, loaded contacts, dial volume and connect rates.",
      },
      { property: "og:title", content: "Campaigns — Kchel Dialer" },
      {
        property: "og:description",
        content: "Create and monitor outbound calling campaigns across your team.",
      },
    ],
  }),
  component: CampaignsPage,
});

/** Row shape the table renders, mapped from the stored record. */
interface Campaign {
  id: string;
  name: string;
  status: string;
  mode: "manual" | "ai_agent";
  contacts: number;
  calls: number;
  connect: number;
  owner: string;
  queueTotal: number;
  queueCompleted: number;
  queueFailed: number;
}

function toRow(record: CampaignRecord): Campaign {
  return {
    id: record.id,
    name: record.name,
    status: record.status,
    mode: record.mode ?? "manual",
    contacts: record.contacts_loaded,
    calls: record.calls_made,
    connect: record.connect_rate,
    owner: record.owner ?? "—",
    queueTotal: record.queue_total ?? 0,
    queueCompleted: record.queue_completed ?? 0,
    queueFailed: record.queue_failed ?? 0,
  };
}

function CampaignsPage() {
  const [rows, setRows] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [owner, setOwner] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Campaign | null>(null);
  const [logTarget, setLogTarget] = useState<Campaign | null>(null);
  const [logRows, setLogRows] = useState<CampaignCallLogRow[]>([]);
  const [logLoading, setLogLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await listCampaigns();
      setRows(result.campaigns.map(toRow));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load campaigns.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function setCampaignStatus(id: string, next: string) {
    const label = rows.find((r) => r.id === id)?.name ?? "Campaign";
    try {
      const result = await updateCampaign(id, { status: next });
      setRows((prev) => prev.map((r) => (r.id === id ? toRow(result.campaign) : r)));
      toast.success(`${label} ${next.toLowerCase()}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not update that campaign.");
    }
  }

  // AI-agent campaigns can't go through the generic status update above —
  // "Active" needs the call queue seeded first, which these dedicated
  // endpoints handle before flipping status.
  async function startAiCampaign(c: Campaign) {
    try {
      await startCampaignDialing(c.id, window.location.origin);
      await load();
      toast.success(`${c.name} is dialing`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not start dialing.");
    }
  }

  async function pauseAiCampaign(c: Campaign) {
    try {
      await pauseCampaignDialing(c.id);
      await load();
      toast.success(`${c.name} paused`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not pause that campaign.");
    }
  }

  const refreshLog = useCallback(async (c: Campaign) => {
    try {
      setLogRows(await getCampaignCallLog(c.id));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not load the call log.");
    }
  }, []);

  async function openCallLog(c: Campaign) {
    setLogTarget(c);
    setLogLoading(true);
    await refreshLog(c);
    setLogLoading(false);
  }

  // While the log is open on a live campaign, poll for progress — reconcile
  // first so a stalled row (accepted but never got its status callback)
  // gets nudged forward before the refreshed log is read. Fetches directly
  // rather than through `load()`, which would flip the whole table into its
  // loading state on every tick.
  useEffect(() => {
    if (!logTarget || logTarget.status !== "Active") return;
    const interval = setInterval(async () => {
      try {
        await reconcileCampaign(logTarget.id, window.location.origin);
      } catch {
        // Best-effort — the log still refreshes even if reconcile fails.
      }
      await refreshLog(logTarget);
      try {
        const result = await listCampaigns();
        const mapped = result.campaigns.map(toRow);
        setRows(mapped);
        const updated = mapped.find((r) => r.id === logTarget.id);
        if (updated) setLogTarget(updated);
      } catch {
        // Best-effort — the log itself already refreshed above.
      }
    }, 4000);
    return () => clearInterval(interval);
  }, [logTarget, refreshLog]);

  async function handleDuplicate(c: Campaign) {
    try {
      const result = await duplicateCampaign(c.id);
      setRows((prev) => [toRow(result.campaign), ...prev]);
      toast.success(`Duplicated "${c.name}"`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not duplicate that campaign.");
    }
  }

  async function handleDelete(c: Campaign) {
    try {
      await deleteCampaign(c.id);
      setRows((prev) => prev.filter((r) => r.id !== c.id));
      setDeleteTarget(null);
      toast.success(`"${c.name}" deleted`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not delete that campaign.");
    }
  }

  const owners = useMemo(() => [...new Set(rows.map((r) => r.owner))], [rows]);
  const statuses = useMemo(() => [...new Set(rows.map((r) => r.status))], [rows]);

  const visible = rows.filter(
    (r) =>
      r.name.toLowerCase().includes(query.toLowerCase()) &&
      (!status || r.status === status) &&
      (!owner || r.owner === owner),
  );

  const dialing = rows.filter((r) => r.status === "Active").length;

  return (
    <Shell
      scope="tenant"
      title="Campaigns"
      description={`${rows.length} campaigns · ${dialing} currently dialing`}
      actions={
        <CreateCampaignDialog onCreated={(record) => setRows((prev) => [toRow(record), ...prev])} />
      }
    >
      <Panel bodyClassName="p-0">
        <div className="flex flex-wrap items-center gap-3 border-b border-border p-4">
          <div className="relative min-w-56 flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search campaigns"
              className="pl-9"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline">
                <SlidersHorizontal className="size-4" /> {status ?? "Status"}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>Filter by status</DropdownMenuLabel>
              {statuses.map((s) => (
                <DropdownMenuCheckboxItem
                  key={s}
                  checked={status === s}
                  onCheckedChange={(on) => setStatus(on ? s : null)}
                >
                  {s}
                </DropdownMenuCheckboxItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline">{owner ?? "Owner"}</Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>Filter by owner</DropdownMenuLabel>
              {owners.map((o) => (
                <DropdownMenuCheckboxItem
                  key={o}
                  checked={owner === o}
                  onCheckedChange={(on) => setOwner(on ? o : null)}
                >
                  {o}
                </DropdownMenuCheckboxItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Campaign</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Contacts loaded</TableHead>
                <TableHead className="text-right">Progress</TableHead>
                <TableHead className="text-right">Connect rate</TableHead>
                <TableHead>Owner</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={7} className="py-12 text-center text-sm text-muted-foreground">
                    <span className="inline-flex items-center gap-2">
                      <Loader2 className="size-4 animate-spin" /> Loading campaigns…
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
                  <TableCell colSpan={7} className="py-10 text-center text-sm text-muted-foreground">
                    {rows.length === 0
                      ? "No campaigns yet — create your first one to start dialing."
                      : "No campaigns match this view."}
                  </TableCell>
                </TableRow>
              ) : (
                visible.map((c) => (
                <TableRow key={c.id}>
                  <TableCell className="font-semibold">
                    {c.name}
                    {c.mode === "ai_agent" && (
                      <span className="ml-2 rounded-full border border-border bg-muted px-2 py-0.5 text-[10px] font-semibold uppercase text-muted-foreground">
                        AI
                      </span>
                    )}
                  </TableCell>
                  <TableCell>
                    <StatusPill status={c.status} />
                  </TableCell>
                  <TableCell className="text-right font-mono text-sm">
                    {c.contacts.toLocaleString()}
                  </TableCell>
                  <TableCell className="text-right font-mono text-sm">
                    {c.mode === "ai_agent"
                      ? `${c.queueCompleted + c.queueFailed}/${c.queueTotal}`
                      : c.calls.toLocaleString()}
                  </TableCell>
                  <TableCell className="text-right font-mono text-sm">
                    {c.connect.toFixed(1)}%
                  </TableCell>
                  <TableCell className="text-muted-foreground">{c.owner}</TableCell>
                  <TableCell className="text-right">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="sm">
                          <MoreHorizontal className="size-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        {c.mode === "ai_agent" ? (
                          c.status === "Active" ? (
                            <DropdownMenuItem onClick={() => void pauseAiCampaign(c)}>
                              <Pause className="size-3.5" /> Pause
                            </DropdownMenuItem>
                          ) : (
                            <DropdownMenuItem onClick={() => void startAiCampaign(c)}>
                              <Play className="size-3.5" /> {c.queueTotal > 0 ? "Resume" : "Start"} dialing
                            </DropdownMenuItem>
                          )
                        ) : c.status === "Active" ? (
                          <DropdownMenuItem onClick={() => setCampaignStatus(c.id, "Paused")}>
                            <Pause className="size-3.5" /> Pause
                          </DropdownMenuItem>
                        ) : c.status !== "Completed" ? (
                          <DropdownMenuItem onClick={() => setCampaignStatus(c.id, "Active")}>
                            <Play className="size-3.5" /> Resume
                          </DropdownMenuItem>
                        ) : null}
                        {c.mode === "ai_agent" && c.queueTotal > 0 && (
                          <DropdownMenuItem onClick={() => void openCallLog(c)}>
                            <List className="size-3.5" /> View call log
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuItem onClick={() => void handleDuplicate(c)}>
                          <Copy className="size-3.5" /> Duplicate
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          className="text-destructive focus:text-destructive"
                          onClick={() => setDeleteTarget(c)}
                        >
                          <Trash2 className="size-3.5" /> Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </Panel>

      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete "{deleteTarget?.name}"?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes the campaign and its dialing history. This can't be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => deleteTarget && void handleDelete(deleteTarget)}>
              Delete campaign
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={!!logTarget} onOpenChange={(open) => !open && setLogTarget(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{logTarget?.name} — call log</DialogTitle>
            <DialogDescription>
              {logTarget?.status === "Active"
                ? "Updates automatically while this campaign is dialing."
                : "Every contact this campaign has attempted."}
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-[60vh] overflow-y-auto">
            {logLoading ? (
              <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" /> Loading…
              </div>
            ) : logRows.length === 0 ? (
              <p className="py-10 text-center text-sm text-muted-foreground">Nothing dialed yet.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Contact</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Outcome</TableHead>
                    <TableHead className="text-right">Duration</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {logRows.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell>
                        <p className="font-medium">{row.contact_name || "—"}</p>
                        <p className="font-mono text-xs text-muted-foreground">{row.phone}</p>
                      </TableCell>
                      <TableCell>
                        <StatusPill
                          status={
                            row.status === "completed"
                              ? "Successfully dialed"
                              : row.status.charAt(0).toUpperCase() + row.status.slice(1)
                          }
                        />
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">{row.outcome ?? "—"}</TableCell>
                      <TableCell className="text-right font-mono text-sm">
                        {row.duration_seconds ? `${row.duration_seconds}s` : "—"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </Shell>
  );
}
