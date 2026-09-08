import { createFileRoute } from "@tanstack/react-router";
import { Activity, Ear, Mic, MicOff, PauseCircle, PhoneCall, Timer, Users } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

import { Shell } from "@/components/dash/Shell";
import { Panel, StatCard, StatusPill, Waveform } from "@/components/dash/bits";
import { Softphone } from "@/components/dash/Softphone";
import { getTenantSettings, saveTenantSettings } from "@/lib/workspace-api";
import { formatDuration, getLiveFloor } from "@/lib/metrics-api";
import { Loader2 } from "lucide-react";
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
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
type LiveFloor = Awaited<ReturnType<typeof getLiveFloor>>;

/** How long a call has been up, from its answer time. */
function elapsedSince(iso: string | null): string {
  if (!iso) return "—";
  const secs = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  const m = String(Math.floor(secs / 60)).padStart(2, "0");
  const s = String(secs % 60).padStart(2, "0");
  return `${m}:${s}`;
}

export const Route = createFileRoute("/live-calls")({
  head: () => ({
    meta: [
      { title: "Live Calls — Kchel Dialer" },
      {
        name: "description",
        content:
          "Real-time call queue with agent availability, live call duration and audio activity indicators.",
      },
      { property: "og:title", content: "Live Calls — Kchel Dialer" },
      {
        property: "og:description",
        content: "Monitor the live dialer floor: who is on call, wrapping up or available.",
      },
    ],
  }),
  component: LiveCallsPage,
});

type MonitorMode = "listen" | "whisper" | "barge" | null;

function LiveCallsPage() {
  const [paused, setPaused] = useState(false);
  const [pauseConfirmOpen, setPauseConfirmOpen] = useState(false);
  const [bargeOpen, setBargeOpen] = useState(false);
  const [bargePerms, setBargePerms] = useState({ monitor: true, whisper: true, barge: false });

  useEffect(() => {
    getTenantSettings()
      .then((settings) => {
        const saved = (settings.preferences as { bargePerms?: typeof bargePerms }).bargePerms;
        if (saved) setBargePerms(saved);
      })
      .catch(() => {
        // Non-fatal — supervisor defaults apply.
      });
  }, []);
  const [monitorRow, setMonitorRow] = useState<LiveFloor["agents"][number] | null>(null);
  const [monitorMode, setMonitorMode] = useState<MonitorMode>(null);

  const [floor, setFloor] = useState<LiveFloor | null>(null);
  const [loadingFloor, setLoadingFloor] = useState(true);

  const loadFloor = useCallback(async () => {
    try {
      setFloor(await getLiveFloor());
    } catch {
      // Non-fatal — the softphone still works if the roster fails to load.
    } finally {
      setLoadingFloor(false);
    }
  }, []);

  // "Live" means live: re-poll while the page is open.
  useEffect(() => {
    void loadFloor();
    const id = setInterval(() => void loadFloor(), 10000);
    return () => clearInterval(id);
  }, [loadFloor]);

  const agents = floor?.agents ?? [];
  const waiting = floor?.waiting ?? [];
  const onCall = agents.filter((a) => a.call_id).length;
  const available = agents.filter((a) => a.status === "Available" && !a.call_id).length;

  return (
    <Shell
      scope="tenant"
      title="Live Calls"
      description={paused ? "Dialer paused · no new calls will start" : `${onCall} call${onCall === 1 ? "" : "s"} in progress · refreshes every 10s`}
      actions={
        <>
          <Button variant="outline" onClick={() => setBargeOpen(true)}>
            Barge settings
          </Button>
          <Button
            variant={paused ? "default" : "destructive"}
            onClick={() => (paused ? setPaused(false) : setPauseConfirmOpen(true))}
          >
            <PauseCircle className="size-4" /> {paused ? "Resume dialer" : "Pause dialer"}
          </Button>
        </>
      }
    >
      {paused && (
        <div className="flex items-center gap-2 rounded-lg border border-warning/35 bg-warning/12 px-4 py-3 text-sm font-medium text-warning-foreground">
          <PauseCircle className="size-4" /> Dialer is paused. Agents already on a call can finish, but no new calls will be placed.
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Calls in progress" value={String(onCall)} icon={PhoneCall} />
        <StatCard label="Agents available" value={String(available)} icon={Users} {...(available > 0 ? { tone: "success" as const } : {})} />
        <StatCard label="Avg talk time" value={floor && floor.avgTalkSeconds > 0 ? formatDuration(floor.avgTalkSeconds) : "—"} hint="today, answered calls" icon={Timer} />
        <StatCard label="Queue waiting" value={String(waiting.length)} hint={waiting.length === 0 ? "no callers waiting" : "ringing now"} icon={Activity} />
      </div>

      <div className="grid gap-4 xl:grid-cols-[380px_1fr]">
        <Softphone />

        <Panel title="Waiting queue" description="Callers pending agent assignment" bodyClassName="p-0">
          {waiting.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">No callers waiting.</p>
          ) : (
            <ul className="divide-y divide-border">
              {waiting.map((q, i) => (
                <li key={q.id} className="flex flex-wrap items-center gap-3 px-5 py-3.5">
                  <span className="flex size-7 items-center justify-center rounded-full bg-muted text-xs font-bold">
                    {i + 1}
                  </span>
                  <span className="font-mono text-sm">
                    {q.direction === "outbound" ? q.to_number : q.from_number}
                  </span>
                  <span className="text-xs text-muted-foreground">{q.direction}</span>
                  <span className="ml-auto font-mono text-sm text-warning-foreground">
                    waiting {elapsedSince(q.started_at)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      <Panel title="Agent queue" description="Status, live duration and audio" bodyClassName="p-0">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Agent</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Contact</TableHead>
                <TableHead>Number</TableHead>
                <TableHead>Direction</TableHead>
                <TableHead>Duration</TableHead>
                <TableHead className="w-44">Audio</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loadingFloor ? (
                <TableRow>
                  <TableCell colSpan={8} className="py-10 text-center text-sm text-muted-foreground">
                    <span className="inline-flex items-center gap-2">
                      <Loader2 className="size-4 animate-spin" /> Loading floor…
                    </span>
                  </TableCell>
                </TableRow>
              ) : agents.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="py-10 text-center">
                    <p className="text-sm font-medium">No agents yet</p>
                    <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
                      Invite your team from the Agents page and they will appear here.
                    </p>
                  </TableCell>
                </TableRow>
              ) : (
                agents.map((row) => (
                <TableRow key={row.id}>
                  <TableCell>
                    <p className="font-semibold">{row.name}</p>
                    <p className="text-xs text-muted-foreground">Ext {row.extension}</p>
                  </TableCell>
                  <TableCell>
                    <StatusPill status={row.call_id ? "On call" : row.status} />
                  </TableCell>
                  <TableCell>{row.contact_name ?? "—"}</TableCell>
                  <TableCell className="font-mono text-sm">
                    {row.call_id ? (row.direction === "outbound" ? row.to_number : row.from_number) : "—"}
                  </TableCell>
                  <TableCell className="text-muted-foreground">{row.direction ?? "—"}</TableCell>
                  <TableCell className="font-mono text-sm">
                    {row.call_id ? elapsedSince(row.answered_at ?? row.started_at) : "—"}
                  </TableCell>
                  <TableCell>
                    {row.call_id ? (
                      <Waveform />
                    ) : (
                      <span className="text-xs text-muted-foreground">No active audio</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={!row.call_id}
                      onClick={() => {
                        setMonitorRow(row);
                        setMonitorMode(null);
                      }}
                    >
                      Listen
                    </Button>
                  </TableCell>
                </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </Panel>

      <AlertDialog open={pauseConfirmOpen} onOpenChange={setPauseConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Pause the dialer?</AlertDialogTitle>
            <AlertDialogDescription>
              Agents on active calls can keep talking, but no new outbound calls will be placed
              across any campaign until you resume.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setPaused(true);
                setPauseConfirmOpen(false);
                toast.success("Dialer paused");
              }}
            >
              Pause dialer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={bargeOpen} onOpenChange={setBargeOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Barge settings</DialogTitle>
            <DialogDescription>Supervisor permissions for live call monitoring.</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-4">
            {(
              [
                ["monitor", "Allow silent monitoring", "Listen in without either party hearing you"],
                ["whisper", "Allow whisper", "Coach the agent — only they can hear you"],
                ["barge", "Allow barge-in", "Join the call so all parties can hear you"],
              ] as const
            ).map(([key, label, hint]) => (
              <div key={key} className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-sm font-medium">{label}</p>
                  <p className="text-xs text-muted-foreground">{hint}</p>
                </div>
                <Switch
                  checked={bargePerms[key]}
                  onCheckedChange={(v) => setBargePerms((prev) => ({ ...prev, [key]: v }))}
                />
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button
              onClick={() => {
                setBargeOpen(false);
                void saveTenantSettings({ preferences: { bargePerms } })
                  .then(() => toast.success("Barge settings saved"))
                  .catch((err) =>
                    toast.error(err instanceof Error ? err.message : "Could not save settings."),
                  );
              }}
            >
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!monitorRow} onOpenChange={(open) => !open && setMonitorRow(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Monitor {monitorRow?.name}</DialogTitle>
            <DialogDescription>
              {monitorRow?.contact_name ?? "Unknown"} · Ext {monitorRow?.extension}
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col items-center gap-4 rounded-lg border border-border bg-muted/40 p-6">
            <Waveform active={!!monitorMode} />
            <p className="text-sm text-muted-foreground">
              {monitorMode ? `${monitorMode === "listen" ? "Listening" : monitorMode === "whisper" ? "Whispering to agent" : "On the call"} — live` : "Choose how to join this call"}
            </p>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <Button
              variant={monitorMode === "listen" ? "default" : "outline"}
              disabled={!bargePerms.monitor}
              onClick={() => {
                setMonitorMode("listen");
                toast.success(`Listening to ${monitorRow?.name}`);
              }}
            >
              <Ear className="size-4" /> Listen
            </Button>
            <Button
              variant={monitorMode === "whisper" ? "default" : "outline"}
              disabled={!bargePerms.whisper}
              onClick={() => {
                setMonitorMode("whisper");
                toast.success(`Whispering to ${monitorRow?.name}`);
              }}
            >
              <MicOff className="size-4" /> Whisper
            </Button>
            <Button
              variant={monitorMode === "barge" ? "default" : "outline"}
              disabled={!bargePerms.barge}
              onClick={() => {
                setMonitorMode("barge");
                toast.success(`Joined the call with ${monitorRow?.name}`);
              }}
            >
              <Mic className="size-4" /> Barge in
            </Button>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setMonitorRow(null);
                setMonitorMode(null);
              }}
            >
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Shell>
  );
}
