import { createFileRoute } from "@tanstack/react-router";
import { Search, Download, Play } from "lucide-react";

import { Shell } from "@/components/dash/Shell";
import { Panel, Waveform } from "@/components/dash/bits";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { recordings } from "@/lib/mock-data";

export const Route = createFileRoute("/recordings")({
  head: () => ({
    meta: [
      { title: "Recordings — Cadence Dialer" },
      {
        name: "description",
        content: "Browse, play back and download call recordings with tags, duration and file size.",
      },
      { property: "og:title", content: "Recordings — Cadence Dialer" },
      {
        property: "og:description",
        content: "Review call recordings from your agents with quick playback.",
      },
    ],
  }),
  component: RecordingsPage,
});

function RecordingsPage() {
  return (
    <Shell
      scope="tenant"
      title="Recordings"
      description="812 recordings stored · 90-day retention"
      actions={<Button variant="outline">Retention settings</Button>}
    >
      <Panel bodyClassName="p-4">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Search recordings by contact, agent or tag" className="pl-9" />
        </div>
      </Panel>

      <div className="grid gap-4 md:grid-cols-2">
        {recordings.map((r) => (
          <div key={r.id} className="card-surface p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold">{r.contact}</p>
                <p className="text-xs text-muted-foreground">
                  {r.agent} · {r.date}
                </p>
              </div>
              <span className="rounded-full border border-border bg-muted px-2.5 py-0.5 text-[11px] font-semibold text-muted-foreground">
                {r.tag}
              </span>
            </div>

            <div className="mt-4 flex items-center gap-3">
              <Button size="icon" className="rounded-full" aria-label={`Play ${r.contact} recording`}>
                <Play className="size-4" />
              </Button>
              <div className="flex-1 overflow-hidden">
                <Waveform />
              </div>
              <span className="font-mono text-xs text-muted-foreground">{r.duration}</span>
            </div>

            <div className="mt-4 flex items-center justify-between text-xs text-muted-foreground">
              <span className="font-mono">
                {r.id} · {r.size}
              </span>
              <Button variant="ghost" size="sm">
                <Download className="size-3.5" /> Download
              </Button>
            </div>
          </div>
        ))}
      </div>
    </Shell>
  );
}
