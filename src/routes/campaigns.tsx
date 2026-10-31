import { createFileRoute } from "@tanstack/react-router";
import {
  Copy,
  List,
  Loader2,
  MoreHorizontal,
  Pause,
  PhoneCall,
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
  DialogFooter,
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
import { RecordingSettingsForm } from "@/components/dash/RecordingSettingsForm";
import { Checkbox } from "@/components/ui/checkbox";
import { deleteGreeting } from "@/lib/media-api";
import {
  DEFAULT_RECORDING_SETTINGS,
  recordingSettingsProblem,
  sanitizeRecordingSettings,
  type RecordingSettings,
} from "@/backend/recording-options";
import {
  deleteCampaign,
  deleteCampaigns,
  duplicateCampaign,
  getCampaignCallLog,
  listCampaigns,
  getCampaignOutcomes,
  pauseCampaignDialing,
  recallCampaign,
  reconcileCampaign,
  sendTestCall,
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
  mode: "manual" | "recording";
  contacts: number;
  calls: number;
  connect: number;
  owner: string;
  queueTotal: number;
  queueCompleted: number;
  queueFailed: number;
  recording: RecordingSettings;
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
    recording: sanitizeRecordingSettings(record.recording, DEFAULT_RECORDING_SETTINGS),
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
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [logTarget, setLogTarget] = useState<Campaign | null>(null);
  const [logRows, setLogRows] = useState<CampaignCallLogRow[]>([]);
  const [logLoading, setLogLoading] = useState(false);
  const [settingsTarget, setSettingsTarget] = useState<Campaign | null>(null);
  const [settingsDraft, setSettingsDraft] = useState<RecordingSettings>(DEFAULT_RECORDING_SETTINGS);
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [testTarget, setTestTarget] = useState<Campaign | null>(null);
  const [testPhone, setTestPhone] = useState("");
  const [testBusy, setTestBusy] = useState(false);
  const [recallTarget, setRecallTarget] = useState<Campaign | null>(null);
  const [recallOptions, setRecallOptions] = useState<{ key: string; label: string; count: number }[]>([]);
  const [recallPicked, setRecallPicked] = useState<Set<string>>(new Set());
  const [recallBusy, setRecallBusy] = useState(false);

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

  // Voice broadcasts can't go through the generic status update above:
  // "Active" needs the call queue seeded first, which these dedicated
  // endpoints handle before flipping status.
  async function startBroadcast(c: Campaign) {
    try {
      await startCampaignDialing(c.id, window.location.origin);
      await load();
      toast.success(`${c.name} is dialing`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not start the broadcast.");
    }
  }

  function openSettings(c: Campaign) {
    setSettingsDraft(c.recording);
    setSettingsTarget(c);
  }

  /** Closing without saving: a recording uploaded just now has nothing to belong to. */
  function closeSettings() {
    if (settingsTarget && settingsDraft.file && settingsDraft.file.key !== settingsTarget.recording.file?.key) {
      void deleteGreeting(settingsDraft.file.key).catch(() => {});
    }
    setSettingsTarget(null);
  }

  /** Saves the dialog's values; returns the updated row, or null when it could not be saved. */
  async function saveSettings(): Promise<Campaign | null> {
    if (!settingsTarget) return null;
    const problem = recordingSettingsProblem(settingsDraft);
    if (problem) {
      toast.error(problem);
      return null;
    }
    setSettingsSaving(true);
    try {
      const result = await updateCampaign(settingsTarget.id, { recording: settingsDraft });
      const row = toRow(result.campaign);
      setRows((prev) => prev.map((r) => (r.id === row.id ? row : r)));
      toast.success("Recording and options saved", { description: "Applies to the next call placed." });
      return row;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save that.");
      return null;
    } finally {
      setSettingsSaving(false);
    }
  }

  async function runTestCall() {
    if (!testTarget) return;
    setTestBusy(true);
    try {
      const result = await sendTestCall(testTarget.id, testPhone);
      toast.success(`Calling ${result.to}`, { description: "Pick up to hear exactly what your contacts will hear." });
      setTestTarget(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not place the test call.");
    } finally {
      setTestBusy(false);
    }
  }

  async function openRecall(c: Campaign) {
    setRecallTarget(c);
    setRecallOptions([]);
    setRecallPicked(new Set());
    try {
      const result = await getCampaignOutcomes(c.id);
      setRecallOptions(result.outcomes);
      setRecallPicked(new Set(result.outcomes.filter((o) => ["no_answer", "voicemail", "call_back"].includes(o.key)).map((o) => o.key)));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not load the results.");
    }
  }

  async function runRecall() {
    if (!recallTarget) return;
    setRecallBusy(true);
    try {
      const result = await recallCampaign(recallTarget.id, [...recallPicked]);
      toast.success(`${result.requeued} ${result.requeued === 1 ? "contact" : "contacts"} queued again`, {
        description: "Press Start broadcast to call them.",
      });
      setRecallTarget(null);
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not queue them again.");
    } finally {
      setRecallBusy(false);
    }
  }

  async function pauseBroadcast(c: Campaign) {
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

  // Only campaigns that still exist count as selected (a reload or a delete can remove some).
  const selectedRows = rows.filter((r) => selected.has(r.id));

  async function handleBulkDelete() {
    const ids = selectedRows.map((r) => r.id);
    if (ids.length === 0) return;
    setBulkBusy(true);
    try {
      const result = await deleteCampaigns(ids);
      setRows((prev) => prev.filter((r) => !ids.includes(r.id)));
      setSelected(new Set());
      setBulkOpen(false);
      toast.success(`${result.deleted} ${result.deleted === 1 ? "campaign" : "campaigns"} deleted`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not delete those campaigns.");
    } finally {
      setBulkBusy(false);
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
          <div className="ml-auto flex items-center gap-2">
            {selectedRows.length > 0 && (
              <>
                <span className="text-sm text-muted-foreground">{selectedRows.length} selected</span>
                <Button variant="ghost" size="sm" onClick={() => setSelected(new Set())}>
                  Clear
                </Button>
              </>
            )}
            <Button variant="destructive" disabled={selectedRows.length === 0} onClick={() => setBulkOpen(true)}>
              <Trash2 className="size-4" /> Delete selected
            </Button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">
                  <Checkbox
                    aria-label="Select all campaigns in this view"
                    disabled={visible.length === 0}
                    checked={
                      visible.length > 0 && visible.every((r) => selected.has(r.id))
                        ? true
                        : visible.some((r) => selected.has(r.id))
                          ? "indeterminate"
                          : false
                    }
                    onCheckedChange={(on) =>
                      setSelected((prev) => {
                        const next = new Set(prev);
                        for (const r of visible) {
                          if (on === true) next.add(r.id);
                          else next.delete(r.id);
                        }
                        return next;
                      })
                    }
                  />
                </TableHead>
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
                  <TableCell colSpan={8} className="py-12 text-center text-sm text-muted-foreground">
                    <span className="inline-flex items-center gap-2">
                      <Loader2 className="size-4 animate-spin" /> Loading campaigns…
                    </span>
                  </TableCell>
                </TableRow>
              ) : error ? (
                <TableRow>
                  <TableCell colSpan={8} className="py-10 text-center">
                    <p className="text-sm text-destructive">{error}</p>
                    <Button className="mt-3" size="sm" onClick={() => void load()}>
                      Try again
                    </Button>
                  </TableCell>
                </TableRow>
              ) : visible.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="py-10 text-center text-sm text-muted-foreground">
                    {rows.length === 0
                      ? "No campaigns yet. Create your first one to start dialing."
                      : "No campaigns match this view."}
                  </TableCell>
                </TableRow>
              ) : (
                visible.map((c) => (
                <TableRow key={c.id} data-state={selected.has(c.id) ? "selected" : undefined}>
                  <TableCell className="w-10">
                    <Checkbox
                      aria-label={`Select ${c.name}`}
                      checked={selected.has(c.id)}
                      onCheckedChange={(on) =>
                        setSelected((prev) => {
                          const next = new Set(prev);
                          if (on === true) next.add(c.id);
                          else next.delete(c.id);
                          return next;
                        })
                      }
                    />
                  </TableCell>
                  <TableCell className="font-semibold">
                    {c.name}
                    {c.mode === "recording" && (
                      <span className="ml-2 rounded-full border border-border bg-muted px-2 py-0.5 text-[10px] font-semibold uppercase text-muted-foreground">
                        Broadcast
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
                    {c.mode === "recording"
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
                        {c.mode === "recording" ? (
                          c.status === "Active" ? (
                            <DropdownMenuItem onClick={() => void pauseBroadcast(c)}>
                              <Pause className="size-3.5" /> Pause
                            </DropdownMenuItem>
                          ) : (
                            <DropdownMenuItem onClick={() => void startBroadcast(c)}>
                              <Play className="size-3.5" /> {c.queueTotal > 0 ? "Resume" : "Start"} broadcast
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
                        {c.mode === "recording" && c.queueTotal > 0 && (
                          <DropdownMenuItem onClick={() => void openCallLog(c)}>
                            <List className="size-3.5" /> View call log
                          </DropdownMenuItem>
                        )}
                        {c.mode === "recording" && c.queueTotal > 0 && (
                          <DropdownMenuItem onClick={() => void openRecall(c)}>
                            <Play className="size-3.5" /> Call people again…
                          </DropdownMenuItem>
                        )}
                        {c.mode === "recording" && (
                          <DropdownMenuItem
                            onClick={() => {
                              setTestPhone("");
                              setTestTarget(c);
                            }}
                            disabled={!c.recording.file}
                          >
                            <PhoneCall className="size-3.5" /> Send me a test call…
                          </DropdownMenuItem>
                        )}
                        {c.mode === "recording" && (
                          <DropdownMenuItem onClick={() => openSettings(c)}>
                            <List className="size-3.5" /> Recording and options…
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

      <AlertDialog open={bulkOpen} onOpenChange={(open) => !open && !bulkBusy && setBulkOpen(false)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Delete {selectedRows.length} {selectedRows.length === 1 ? "campaign" : "campaigns"}?
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="flex flex-col gap-2">
                <p>This removes the selected campaigns, their dialing history and their recordings. This can't be undone.</p>
                <ul className="list-disc pl-5">
                  {selectedRows.slice(0, 6).map((r) => (
                    <li key={r.id}>{r.name}</li>
                  ))}
                  {selectedRows.length > 6 && <li>and {selectedRows.length - 6} more</li>}
                </ul>
                {selectedRows.some((r) => r.status === "Active") && (
                  <p className="font-medium text-destructive">
                    Some of these are dialing right now. Deleting them stops those calls.
                  </p>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={bulkBusy}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={bulkBusy}
              className="bg-destructive text-white hover:bg-destructive/90"
              onClick={(e) => {
                e.preventDefault();
                void handleBulkDelete();
              }}
            >
              {bulkBusy ? <Loader2 className="size-4 animate-spin" /> : null}
              Delete {selectedRows.length === 1 ? "campaign" : "campaigns"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={!!settingsTarget} onOpenChange={(open) => !open && closeSettings()}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>{settingsTarget?.name} — recording and options</DialogTitle>
            <DialogDescription>What contacts hear and what they can do. Applies to the next call placed.</DialogDescription>
          </DialogHeader>
          <RecordingSettingsForm
            value={settingsDraft}
            onChange={setSettingsDraft}
            savedKey={settingsTarget?.recording.file?.key ?? null}
          />
          <DialogFooter>
            <Button variant="outline" onClick={closeSettings}>
              Cancel
            </Button>
            <Button
              variant="outline"
              disabled={settingsSaving || !settingsDraft.file}
              onClick={() =>
                void (async () => {
                  const saved = await saveSettings();
                  if (!saved) return;
                  setSettingsTarget(null);
                  setTestPhone("");
                  setTestTarget(saved);
                })()
              }
            >
              <PhoneCall className="size-4" /> Save and test
            </Button>
            <Button
              disabled={settingsSaving}
              onClick={() =>
                void (async () => {
                  if (await saveSettings()) setSettingsTarget(null);
                })()
              }
            >
              {settingsSaving ? <Loader2 className="size-4 animate-spin" /> : null}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!testTarget} onOpenChange={(open) => !open && setTestTarget(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Send me a test call</DialogTitle>
            <DialogDescription>
              {testTarget?.name} rings the number below and plays the recording just as a contact would hear it. Your
              keys work too, so press them to try them.
            </DialogDescription>
          </DialogHeader>
          <Input
            placeholder="Your mobile number, e.g. +14155550134"
            value={testPhone}
            onChange={(e) => setTestPhone(e.target.value)}
            autoFocus
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setTestTarget(null)}>
              Cancel
            </Button>
            <Button onClick={() => void runTestCall()} disabled={testBusy || !testPhone.trim()}>
              {testBusy ? <Loader2 className="size-4 animate-spin" /> : <PhoneCall className="size-4" />}
              Call me
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!recallTarget} onOpenChange={(open) => !open && setRecallTarget(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Call people again</DialogTitle>
            <DialogDescription>
              Choose who goes back in the queue of {recallTarget?.name}. Do-not-call contacts, wrong numbers and
              transferred calls are never included.
            </DialogDescription>
          </DialogHeader>
          {recallOptions.length === 0 ? (
            <p className="text-sm text-muted-foreground">No finished calls to choose from yet.</p>
          ) : (
            <div className="flex flex-col gap-2">
              {recallOptions.map((o) => (
                <label key={o.key} className="flex items-center gap-3 rounded-md border border-border p-3 text-sm">
                  <Checkbox
                    checked={recallPicked.has(o.key)}
                    onCheckedChange={(on) => {
                      const next = new Set(recallPicked);
                      if (on === true) next.add(o.key);
                      else next.delete(o.key);
                      setRecallPicked(next);
                    }}
                  />
                  <span className="flex-1">{o.label}</span>
                  <span className="text-muted-foreground">{o.count}</span>
                </label>
              ))}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setRecallTarget(null)}>
              Cancel
            </Button>
            <Button onClick={() => void runRecall()} disabled={recallBusy || recallPicked.size === 0}>
              {recallBusy ? <Loader2 className="size-4 animate-spin" /> : null}
              Queue them again
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
