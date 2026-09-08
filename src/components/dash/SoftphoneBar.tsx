import { useState } from "react";
import { Forward, Mic, MicOff, Pause, PhoneIncoming, PhoneOff, Play } from "lucide-react";
import { Link } from "@tanstack/react-router";

import { Button } from "@/components/ui/button";
import { TransferDialog } from "@/components/dash/TransferDialog";
import { useCallTimer } from "@/hooks/use-softphone";
import { useOptionalSoftphone } from "@/components/dash/SoftphoneProvider";

/**
 * Floating call bar shown on every tenant page except Live Calls (which has
 * the full dialpad). Click-to-call from Contacts or Call History navigates
 * nowhere — the call just starts, and this is where the agent controls it.
 */
export function SoftphoneBar() {
  const softphone = useOptionalSoftphone();
  const elapsed = useCallTimer(softphone?.state.startedAt ?? null);
  const [transferOpen, setTransferOpen] = useState(false);

  if (!softphone) return null;
  const { state, hangup, answer, decline, toggleMute, toggleHold, transfer } = softphone;

  // Nothing happening — stay out of the way entirely.
  if (state.call === "idle") return null;

  const incoming = state.call === "incoming";
  const active = state.call === "active";

  return (
    <div className="fixed bottom-4 left-1/2 z-50 w-[min(26rem,calc(100vw-2rem))] -translate-x-1/2">
      <div className="flex items-center gap-3 rounded-xl border border-border bg-card p-3 shadow-lift">
        <span
          className={`relative size-2.5 shrink-0 rounded-full ${active ? "bg-success pulse-dot" : "bg-warning"}`}
        />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">{state.remoteIdentity ?? "Unknown"}</p>
          <p className="font-mono text-xs text-muted-foreground">
            {active ? (state.held ? `On hold · ${elapsed}` : elapsed) : incoming ? "Incoming call" : "Dialling…"}
          </p>
        </div>

        {incoming ? (
          <>
            <Button size="sm" onClick={() => void answer()}>
              <PhoneIncoming className="size-4" /> Answer
            </Button>
            <Button size="sm" variant="destructive" onClick={() => void decline()}>
              <PhoneOff className="size-4" />
            </Button>
          </>
        ) : (
          <>
            <Button
              size="icon"
              variant="outline"
              disabled={!active}
              aria-label={state.muted ? "Unmute" : "Mute"}
              onClick={toggleMute}
            >
              {state.muted ? <MicOff className="size-4" /> : <Mic className="size-4" />}
            </Button>
            <Button
              size="icon"
              variant={state.held ? "default" : "outline"}
              disabled={!active}
              aria-label={state.held ? "Resume call" : "Put call on hold"}
              onClick={() => void toggleHold()}
            >
              {state.held ? <Play className="size-4" /> : <Pause className="size-4" />}
            </Button>
            <Button
              size="icon"
              variant="outline"
              disabled={!active}
              aria-label="Transfer call"
              onClick={() => setTransferOpen(true)}
            >
              <Forward className="size-4" />
            </Button>
            <Button size="sm" variant="destructive" onClick={() => void hangup()}>
              <PhoneOff className="size-4" /> End
            </Button>
          </>
        )}

        <Button size="sm" variant="ghost" asChild>
          <Link to="/live-calls">Open</Link>
        </Button>
      </div>

      <TransferDialog open={transferOpen} onOpenChange={setTransferOpen} onTransfer={transfer} />
    </div>
  );
}
