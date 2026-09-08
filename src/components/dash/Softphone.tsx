import { useState } from "react";
import {
  Delete,
  Forward,
  Loader2,
  Mic,
  MicOff,
  Pause,
  Phone,
  PhoneIncoming,
  PhoneOff,
  Play,
  PowerOff,
  Wifi,
} from "lucide-react";

import { Panel, StatusPill, Waveform } from "@/components/dash/bits";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { useCallTimer } from "@/hooks/use-softphone";
import { useSoftphoneContext } from "@/components/dash/SoftphoneProvider";
import { TransferDialog } from "@/components/dash/TransferDialog";

const KEYPAD = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "*", "0", "#"];

export function Softphone() {
  const {
    state,
    busy,
    goOnline,
    goOffline,
    dial,
    hangup,
    answer,
    decline,
    toggleMute,
    toggleHold,
    transfer,
    sendDtmf,
  } = useSoftphoneContext();
  const [number, setNumber] = useState("");
  const [transferOpen, setTransferOpen] = useState(false);
  const elapsed = useCallTimer(state.startedAt);

  const online = state.status === "ready";
  const onCall = state.call === "active";
  const incoming = state.call === "incoming";
  const dialing = state.call === "dialing";

  function press(key: string) {
    if (onCall) {
      // Mid-call keypresses are DTMF (IVR navigation), not dialling.
      void sendDtmf(key);
      return;
    }
    setNumber((prev) => prev + key);
  }

  return (
    <Panel
      title="Softphone"
      description={
        online
          ? "Registered — you can make and receive calls"
          : "Go online to make and receive calls"
      }
      actions={
        online ? (
          <Button variant="outline" size="sm" disabled={busy} onClick={() => void goOffline()}>
            <PowerOff className="size-3.5" /> Go offline
          </Button>
        ) : (
          <Button size="sm" disabled={busy} onClick={() => void goOnline()}>
            {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Wifi className="size-3.5" />}
            Go online
          </Button>
        )
      }
      bodyClassName="p-5"
    >
      <div className="mx-auto flex w-full max-w-xs flex-col gap-4">
        {/* Status / active call banner */}
        <div
          className={cn(
            "flex items-center gap-3 rounded-lg border p-3",
            state.status === "failed"
              ? "border-destructive/25 bg-destructive/8"
              : online
                ? "border-success/25 bg-success/8"
                : "border-border bg-muted/40",
          )}
        >
          <div className="min-w-0 flex-1">
            {onCall || dialing || incoming ? (
              <>
                <p className="truncate text-sm font-semibold">
                  {state.remoteIdentity ?? "Unknown"}
                </p>
                <p className="font-mono text-xs text-muted-foreground">
                  {onCall
                    ? state.held
                      ? `On hold · ${elapsed}`
                      : elapsed
                    : incoming
                      ? "Incoming…"
                      : "Dialling…"}
                </p>
              </>
            ) : (
              <>
                <p className="text-sm font-semibold">
                  {state.status === "failed"
                    ? "Registration failed"
                    : online
                      ? "Ready"
                      : state.status === "connecting"
                        ? "Connecting…"
                        : "Offline"}
                </p>
                <p className="truncate text-xs text-muted-foreground">
                  {state.error ?? (online ? "Waiting for calls" : "Not registered")}
                </p>
              </>
            )}
          </div>
          <StatusPill
            status={
              onCall ? "On call" : state.status === "failed" ? "Failed" : online ? "Active" : "Offline"
            }
          />
        </div>

        {onCall && <Waveform />}

        {/* Number entry */}
        <Input
          value={onCall ? (state.remoteIdentity ?? "") : number}
          onChange={(e) => setNumber(e.target.value)}
          placeholder="+1 415 555 0134"
          disabled={onCall || incoming}
          className="text-center font-mono text-lg"
          onKeyDown={(e) => {
            if (e.key === "Enter" && online && !onCall) void dial(number);
          }}
        />

        {/* Keypad — doubles as DTMF while on a call */}
        <div className="grid grid-cols-3 gap-2">
          {KEYPAD.map((key) => (
            <Button
              key={key}
              variant="outline"
              className="h-12 font-mono text-base"
              disabled={!online || incoming}
              onClick={() => press(key)}
            >
              {key}
            </Button>
          ))}
        </div>

        {/* Call controls */}
        {incoming ? (
          <div className="grid grid-cols-2 gap-2">
            <Button onClick={() => void answer()}>
              <PhoneIncoming className="size-4" /> Answer
            </Button>
            <Button variant="destructive" onClick={() => void decline()}>
              <PhoneOff className="size-4" /> Decline
            </Button>
          </div>
        ) : onCall || dialing ? (
          <div className="grid grid-cols-2 gap-2">
            <Button variant="outline" disabled={!onCall} onClick={toggleMute}>
              {state.muted ? <MicOff className="size-4" /> : <Mic className="size-4" />}
              {state.muted ? "Unmute" : "Mute"}
            </Button>
            <Button
              variant={state.held ? "default" : "outline"}
              disabled={!onCall}
              onClick={() => void toggleHold()}
            >
              {state.held ? <Play className="size-4" /> : <Pause className="size-4" />}
              {state.held ? "Resume" : "Hold"}
            </Button>
            <Button variant="outline" disabled={!onCall} onClick={() => setTransferOpen(true)}>
              <Forward className="size-4" /> Transfer
            </Button>
            <Button variant="destructive" onClick={() => void hangup()}>
              <PhoneOff className="size-4" /> Hang up
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-[1fr_auto] gap-2">
            <Button disabled={!online || !number} onClick={() => void dial(number)}>
              <Phone className="size-4" /> Call
            </Button>
            <Button
              variant="outline"
              disabled={!number}
              aria-label="Backspace"
              onClick={() => setNumber((prev) => prev.slice(0, -1))}
            >
              <Delete className="size-4" />
            </Button>
          </div>
        )}

        {/* Only when nothing is configured — a *failed* registration already
            shows the carrier's own error above, and saying "needs a connection"
            there would contradict it. */}
        {state.status === "offline" && (
          <p className="text-center text-xs text-muted-foreground">
            Needs a SIP connection under Phone System → Connection.
          </p>
        )}
        {state.status === "failed" && (
          <p className="text-center text-xs text-muted-foreground">
            Check your credentials and WebSocket URL under Phone System → Connection.
          </p>
        )}
      </div>

      <TransferDialog open={transferOpen} onOpenChange={setTransferOpen} onTransfer={transfer} />
    </Panel>
  );
}
