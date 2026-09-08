import { useState, type Dispatch, type SetStateAction } from "react";
import { Copy, KeyRound, Save } from "lucide-react";
import { toast } from "sonner";

import { Panel } from "@/components/dash/bits";
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
import { Switch } from "@/components/ui/switch";
import { GreetingEditor } from "./GreetingEditor";
import type { VoicemailSettings } from "@/lib/phone-system-data";

function generatePin() {
  return String(Math.floor(1000 + Math.random() * 9000));
}

export function VoicemailTab({
  voicemail,
  setVoicemail,
}: {
  voicemail: VoicemailSettings;
  setVoicemail: Dispatch<SetStateAction<VoicemailSettings>>;
}) {
  const [newPin, setNewPin] = useState<string | null>(null);

  function patch(update: Partial<VoicemailSettings>) {
    setVoicemail((prev) => ({ ...prev, ...update }));
  }

  return (
    <div className="flex flex-col gap-4">
      <Panel
        title="Voicemail greeting"
        actions={
          <Button size="sm" onClick={() => toast.success("Voicemail settings saved")}>
            <Save className="size-3.5" /> Save
          </Button>
        }
        bodyClassName="p-5"
      >
        <GreetingEditor
          mode={voicemail.greetingMode}
          text={voicemail.greetingText}
          file={voicemail.greetingFile}
          onModeChange={(greetingMode) => patch({ greetingMode })}
          onTextChange={(greetingText) => patch({ greetingText })}
          onFileChange={(greetingFile) =>
            patch({ greetingFile, greetingFileName: greetingFile?.name ?? null })
          }
        />
      </Panel>

      <Panel title="Delivery" bodyClassName="p-5">
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-medium">Voicemail transcription</p>
              <p className="text-xs text-muted-foreground">Adds a text transcript to each voicemail</p>
            </div>
            <Switch
              checked={voicemail.transcriptionEnabled}
              onCheckedChange={(transcriptionEnabled) => patch({ transcriptionEnabled })}
            />
          </div>
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-medium">Email notifications</p>
              <p className="text-xs text-muted-foreground">Send new voicemails to an inbox</p>
            </div>
            <Switch
              checked={voicemail.emailNotifications}
              onCheckedChange={(emailNotifications) => patch({ emailNotifications })}
            />
          </div>
          {voicemail.emailNotifications && (
            <div className="flex flex-col gap-2 sm:max-w-sm">
              <Label htmlFor="vm-email">Notify email</Label>
              <Input
                id="vm-email"
                type="email"
                value={voicemail.notifyEmail}
                onChange={(e) => patch({ notifyEmail: e.target.value })}
              />
            </div>
          )}
        </div>
      </Panel>

      <Panel title="Voicemail PIN" description="Required to check voicemail by phone" bodyClassName="p-5">
        <Button variant="outline" onClick={() => setNewPin(generatePin())}>
          <KeyRound className="size-4" /> Reset PIN
        </Button>
      </Panel>

      <Dialog open={!!newPin} onOpenChange={(open) => !open && setNewPin(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New voicemail PIN</DialogTitle>
            <DialogDescription>
              This is shown once — save it somewhere safe.
            </DialogDescription>
          </DialogHeader>
          <div className="flex items-center justify-between gap-3 rounded-lg border border-border bg-muted/40 p-4">
            <span className="font-mono text-2xl font-bold tracking-widest">{newPin}</span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                if (newPin) void navigator.clipboard.writeText(newPin);
                toast.success("PIN copied");
              }}
            >
              <Copy className="size-3.5" /> Copy
            </Button>
          </div>
          <DialogFooter>
            <Button onClick={() => setNewPin(null)}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
