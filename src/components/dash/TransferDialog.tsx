import { useState } from "react";
import { Forward } from "lucide-react";

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

/**
 * Blind transfer: hand the caller to another destination and drop off.
 *
 * Deliberately not offering an "attended" option — sip.js's SimpleUser holds
 * one session at a time, so there is no way to speak to the destination first.
 * A button labelled attended that behaved blindly would lose calls.
 */
export function TransferDialog({
  open,
  onOpenChange,
  onTransfer,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onTransfer: (target: string) => Promise<boolean>;
}) {
  const [target, setTarget] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit() {
    const trimmed = target.trim();
    if (!trimmed) return;
    setBusy(true);
    try {
      if (await onTransfer(trimmed)) {
        setTarget("");
        onOpenChange(false);
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Transfer call</DialogTitle>
          <DialogDescription>
            The caller is handed straight to this destination and you leave the call.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-2">
          <Label htmlFor="transfer-target">Extension, number or SIP address</Label>
          <Input
            id="transfer-target"
            autoFocus
            placeholder="201, +14155550134, or sip:sales@…"
            className="font-mono"
            value={target}
            onChange={(e) => setTarget(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void submit();
            }}
          />
          <p className="text-xs text-muted-foreground">
            Put the caller on hold first if you need a moment — transferring ends your side of
            the call immediately.
          </p>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button disabled={busy || !target.trim()} onClick={() => void submit()}>
            <Forward className="size-4" /> Transfer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
