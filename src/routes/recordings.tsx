import { createFileRoute } from "@tanstack/react-router";
import { AudioLines, Loader2, Play, Search } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

import { Shell } from "@/components/dash/Shell";
import { Panel, Waveform } from "@/components/dash/bits";
import { CallPlayerDialog } from "@/components/dash/CallPlayerDialog";
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
import { getTenantSettings, saveTenantSettings } from "@/lib/workspace-api";
import { formatDuration, listRecordings } from "@/lib/metrics-api";

export const Route = createFileRoute("/recordings")({
  head: () => ({
    meta: [
      { title: "Recordings — Kchel Dialer" },
      {
        name: "description",
        content: "Browse, play back and download call recordings with duration and outcome.",
      },
      { property: "og:title", content: "Recordings — Kchel Dialer" },
      {
        property: "og:description",
        content: "Review call recordings from your agents with quick playback.",
      },
    ],
  }),
  component: RecordingsPage,
});

type Recordings = Awaited<ReturnType<typeof listRecordings>>;
type Recording = Recordings["recordings"][number];

function RecordingsPage() {
  const [query, setQuery] = useState("");
  const [data, setData] = useState<Recordings | null>(null);
  const [loading, setLoading] = useState(true);
  const [playing, setPlaying] = useState<Recording | null>(null);
  const [retentionOpen, setRetentionOpen] = useState(false);
  const [retentionDays, setRetentionDays] = useState("90");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setData(await listRecordings(query.trim() || undefined));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not load recordings.");
    } finally {
      setLoading(false);
    }
  }, [query]);

  // Debounced so typing doesn't fire a request per keystroke.
  useEffect(() => {
    const timer = setTimeout(() => void load(), 300);
    return () => clearTimeout(timer);
  }, [load]);

  useEffect(() => {
    getTenantSettings()
      .then((settings) => {
        const days = (settings.preferences as { retentionDays?: string }).retentionDays;
        if (days) setRetentionDays(String(days));
      })
      .catch(() => {
        // Non-fatal — falls back to the default window.
      });
  }, []);

  const recordings = data?.recordings ?? [];

  return (
    <Shell
      scope="tenant"
      title="Recordings"
      description={
        loading
          ? "Loading…"
          : `${recordings.length} recording${recordings.length === 1 ? "" : "s"} · ${retentionDays}-day retention`
      }
      actions={
        <Button variant="outline" onClick={() => setRetentionOpen(true)}>
          Retention settings
        </Button>
      }
    >
      <Panel bodyClassName="p-4">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search recordings by contact or number"
            className="pl-9"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
      </Panel>

      {loading ? (
        <Panel bodyClassName="flex items-center justify-center gap-2 p-12 text-muted-foreground">
          <Loader2 className="size-4 animate-spin" /> Loading…
        </Panel>
      ) : recordings.length === 0 ? (
        <Panel bodyClassName="p-12 text-center">
          <AudioLines className="mx-auto size-6 text-muted-foreground" />
          <p className="mt-2 text-sm font-medium">
            {query ? `No recordings match "${query}"` : "No recordings yet"}
          </p>
          {/* Distinguishing "no calls" from "calls happened but weren't
              recorded" is the difference between waiting and debugging. */}
          {!query && (
            <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
              {data && data.completedCalls > 0
                ? `You have ${data.completedCalls} completed call${data.completedCalls === 1 ? "" : "s"}, but none were recorded — call recording needs a carrier connection before audio can be captured.`
                : "Recordings appear here once your agents start taking calls."}
            </p>
          )}
        </Panel>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {recordings.map((r) => {
            const number = r.direction === "outbound" ? r.to_number : r.from_number;
            return (
              <div key={r.id} className="card-surface p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">
                      {r.contact_name ?? number ?? "Unknown"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {r.agent_email ?? "—"} · {new Date(r.started_at).toLocaleString()}
                    </p>
                  </div>
                  {r.outcome && (
                    <span className="shrink-0 rounded-full border border-border bg-muted px-2.5 py-0.5 text-[11px] font-semibold text-muted-foreground">
                      {r.outcome}
                    </span>
                  )}
                </div>

                <div className="mt-4 flex items-center gap-3">
                  <Button
                    size="icon"
                    className="rounded-full"
                    aria-label={`Play recording for ${r.contact_name ?? number ?? "call"}`}
                    onClick={() => setPlaying(r)}
                  >
                    <Play className="size-4" />
                  </Button>
                  <div className="flex-1 overflow-hidden">
                    <Waveform active={false} />
                  </div>
                  <span className="font-mono text-xs text-muted-foreground">
                    {formatDuration(r.recording_seconds ?? r.duration_seconds)}
                  </span>
                </div>

                <div className="mt-4 flex items-center justify-between text-xs text-muted-foreground">
                  <span className="font-mono">{number ?? "—"}</span>
                  <a
                    href={r.recording_url}
                    download
                    className="font-semibold text-primary hover:underline"
                  >
                    Download
                  </a>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <CallPlayerDialog
        open={!!playing}
        onOpenChange={(open) => !open && setPlaying(null)}
        title={playing ? (playing.contact_name ?? "Call recording") : ""}
        description={playing ? new Date(playing.started_at).toLocaleString() : ""}
        duration={formatDuration(playing?.recording_seconds ?? playing?.duration_seconds ?? 0)}
      />

      <Dialog open={retentionOpen} onOpenChange={setRetentionOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Retention settings</DialogTitle>
            <DialogDescription>Recordings older than this are automatically deleted.</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-2">
            <Label htmlFor="retention-days">Retention window (days)</Label>
            <Input
              id="retention-days"
              type="number"
              min={1}
              max={365}
              value={retentionDays}
              onChange={(e) => setRetentionDays(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button
              onClick={() => {
                setRetentionOpen(false);
                void saveTenantSettings({ preferences: { retentionDays } })
                  .then(() => toast.success(`Retention set to ${retentionDays} days`))
                  .catch((err) =>
                    toast.error(err instanceof Error ? err.message : "Could not save retention."),
                  );
              }}
            >
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Shell>
  );
}
