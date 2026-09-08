import { useEffect, useState } from "react";
import { Pause, Play } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Waveform } from "@/components/dash/bits";

/** Parses "MM:SS" into seconds. */
function toSeconds(duration: string) {
  const [m, s] = duration.split(":").map(Number);
  return (m || 0) * 60 + (s || 0);
}

function formatSeconds(total: number) {
  const m = Math.floor(total / 60);
  const s = Math.floor(total % 60);
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

/** Shared playback dialog for Call History and Recordings — a real transport UI over a simulated clock. */
export function CallPlayerDialog({
  open,
  onOpenChange,
  title,
  description,
  duration,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  duration: string;
}) {
  const total = toSeconds(duration);
  const [elapsed, setElapsed] = useState(0);
  const [playing, setPlaying] = useState(true);

  useEffect(() => {
    if (!open) return;
    setElapsed(0);
    setPlaying(true);
  }, [open]);

  useEffect(() => {
    if (!open || !playing || total === 0) return;
    const timer = setInterval(() => {
      setElapsed((prev) => {
        if (prev >= total) {
          setPlaying(false);
          return total;
        }
        return prev + 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [open, playing, total]);

  const pct = total === 0 ? 0 : Math.min(100, (elapsed / total) * 100);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col items-center gap-4 rounded-lg border border-border bg-muted/40 p-6">
          <Waveform active={playing} />
          <div className="flex w-full items-center gap-3">
            <Button
              variant="outline"
              size="icon"
              className="shrink-0 rounded-full"
              onClick={() => setPlaying((p) => !p)}
              disabled={total === 0}
              aria-label={playing ? "Pause" : "Play"}
            >
              {playing ? <Pause className="size-4" /> : <Play className="size-4" />}
            </Button>
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-border">
              <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
            </div>
            <span className="w-20 shrink-0 text-right font-mono text-xs text-muted-foreground">
              {formatSeconds(elapsed)} / {duration}
            </span>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
