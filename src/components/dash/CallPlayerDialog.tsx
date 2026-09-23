import { useEffect, useRef, useState } from "react";
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

/**
 * Shared playback dialog for Recordings. Plays the carrier's recording URL
 * directly through an <audio> element — no fallback simulation, since a
 * recording that can't actually play needs to surface that, not fake it.
 */
export function CallPlayerDialog({
  open,
  onOpenChange,
  title,
  description,
  duration,
  audioUrl,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  duration: string;
  audioUrl: string | null | undefined;
}) {
  const fallbackTotal = toSeconds(duration);
  const audioRef = useRef<HTMLAudioElement>(null);
  const [elapsed, setElapsed] = useState(0);
  const [total, setTotal] = useState(fallbackTotal);
  const [playing, setPlaying] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!open) return;
    setElapsed(0);
    setTotal(fallbackTotal);
    setError(false);
    setPlaying(false);
    const audio = audioRef.current;
    if (audio && audioUrl) {
      audio.currentTime = 0;
      void audio.play().then(() => setPlaying(true)).catch(() => setError(true));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, audioUrl]);

  const pct = total === 0 ? 0 : Math.min(100, (elapsed / total) * 100);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        {audioUrl ? (
          <audio
            ref={audioRef}
            src={audioUrl}
            onLoadedMetadata={(e) => setTotal(e.currentTarget.duration || fallbackTotal)}
            onTimeUpdate={(e) => setElapsed(e.currentTarget.currentTime)}
            onPlay={() => setPlaying(true)}
            onPause={() => setPlaying(false)}
            onEnded={() => setPlaying(false)}
            onError={() => setError(true)}
          />
        ) : null}
        <div className="flex flex-col items-center gap-4 rounded-lg border border-border bg-muted/40 p-6">
          <Waveform active={playing} />
          {error ? (
            <p className="text-sm text-muted-foreground">
              This recording couldn&apos;t be played back. Try downloading it instead.
            </p>
          ) : (
            <div className="flex w-full items-center gap-3">
              <Button
                variant="outline"
                size="icon"
                className="shrink-0 rounded-full"
                onClick={() => {
                  const audio = audioRef.current;
                  if (!audio) return;
                  if (playing) audio.pause();
                  else void audio.play().catch(() => setError(true));
                }}
                disabled={!audioUrl}
                aria-label={playing ? "Pause" : "Play"}
              >
                {playing ? <Pause className="size-4" /> : <Play className="size-4" />}
              </Button>
              <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-border">
                <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
              </div>
              <span className="w-20 shrink-0 text-right font-mono text-xs text-muted-foreground">
                {formatSeconds(elapsed)} / {formatSeconds(total)}
              </span>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
