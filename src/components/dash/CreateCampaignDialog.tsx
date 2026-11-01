import { Loader2, Plus } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { getSessionUser } from "@/lib/auth-api";
import { getContactsMeta } from "@/lib/contacts-api";
import { deleteGreeting } from "@/lib/media-api";
import { createCampaign, type CampaignRecord } from "@/lib/workspace-api";
import { getPhoneSystem } from "@/lib/phone-system-api";
import { RecordingSettingsForm } from "@/components/dash/RecordingSettingsForm";
import { DEFAULT_RECORDING_SETTINGS, recordingSettingsProblem, type RecordingSettings } from "@/backend/recording-options";

export function CreateCampaignDialog({
  trigger,
  onCreated,
}: {
  trigger?: ReactNode;
  onCreated?: (campaign: CampaignRecord) => void;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [listId, setListId] = useState("");
  const [owner, setOwner] = useState(() => getSessionUser()?.email ?? "");
  const [script, setScript] = useState("");
  const [startNow, setStartNow] = useState(true);
  const [mode, setMode] = useState<"manual" | "recording">("manual");
  const [recording, setRecording] = useState<RecordingSettings>(DEFAULT_RECORDING_SETTINGS);
  const [complianceAck, setComplianceAck] = useState(false);
  const [saving, setSaving] = useState(false);
  const [contactLists, setContactLists] = useState<{ id: string; name: string }[]>([]);
  const [phoneMeta, setPhoneMeta] = useState<{ numbers: { number: string; label: string }[]; zone: string }>({ numbers: [], zone: "" });

  useEffect(() => {
    if (!open) return;
    getContactsMeta()
      .then((meta) => setContactLists(meta.lists))
      .catch(() => {
        // Non-fatal — the dialog still works with no lists yet.
      });
    getPhoneSystem()
      .then((ps) => {
        const zone = ps.businessHours?.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone;
        setPhoneMeta({ numbers: ps.numbers.map((n) => ({ number: n.number, label: n.label })), zone });
        // A new campaign's calling hours start in the workspace's own zone, unless the owner already changed it.
        setRecording((r) => (r.window.zone === DEFAULT_RECORDING_SETTINGS.window.zone ? { ...r, window: { ...r.window, zone } } : r));
      })
      .catch(() => {
        // Non-fatal — the caller ID list just stays empty.
      });
  }, [open]);

  function reset() {
    setName("");
    setScript("");
    setRecording(DEFAULT_RECORDING_SETTINGS);
    setComplianceAck(false);
  }

  function handleOpenChange(next: boolean) {
    // Closing without creating: a recording uploaded just now has no campaign to belong to.
    if (!next && recording.file) {
      void deleteGreeting(recording.file.key).catch(() => {});
      setRecording(DEFAULT_RECORDING_SETTINGS);
    }
    setOpen(next);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button>
            <Plus className="size-4" /> Create campaign
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Create campaign</DialogTitle>
          <DialogDescription>
            Name the campaign, pick a contact list and choose how it is dialed.
          </DialogDescription>
        </DialogHeader>

        <form
          id="create-campaign-form"
          className="flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            if (!name.trim()) {
              toast.error("Give the campaign a name.");
              return;
            }
            if (mode === "recording") {
              if (!listId) {
                toast.error("Choose a contact list.");
                return;
              }
              if (!recording.file) {
                toast.error("Upload the recording first.");
                return;
              }
              const problem = recordingSettingsProblem(recording);
              if (problem) {
                toast.error(problem);
                return;
              }
              if (!complianceAck) {
                toast.error("Confirm the consent checkbox before creating a voice broadcast.");
                return;
              }
            }
            void (async () => {
              setSaving(true);
              try {
                const result = await createCampaign({
                  name: name.trim(),
                  status: mode === "manual" ? (startNow ? "Active" : "Draft") : "Draft",
                  ...(listId ? { listId } : {}),
                  ...(owner.trim() ? { owner: owner.trim() } : {}),
                  mode,
                  ...(mode === "manual"
                    ? { ...(script.trim() ? { script: script.trim() } : {}) }
                    : { recording, complianceAck }),
                });
                onCreated?.(result.campaign);
                const listLabel = contactLists.find((l) => l.id === listId)?.name ?? "No list yet";
                toast.success(`Campaign “${result.campaign.name}” created`, {
                  description:
                    mode === "recording"
                      ? `${listLabel} · use "Start broadcast" to begin`
                      : `${listLabel}${startNow ? " · dialing now" : " · saved as draft"}`,
                });
                reset();
                setOpen(false);
              } catch (err) {
                toast.error(err instanceof Error ? err.message : "Could not create that campaign.");
              } finally {
                setSaving(false);
              }
            })();
          }}
        >
          <div className="flex flex-col gap-2">
            <Label>How is this campaign dialed?</Label>
            <div className="grid grid-cols-2 gap-2">
              <Button
                type="button"
                variant={mode === "manual" ? "default" : "outline"}
                onClick={() => setMode("manual")}
              >
                Manual dialing
              </Button>
              <Button
                type="button"
                variant={mode === "recording" ? "default" : "outline"}
                onClick={() => setMode("recording")}
              >
                Voice broadcast
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              {mode === "manual"
                ? "Your team calls the list from the Dialer, one contact after another."
                : "Your recording is played automatically to everyone on the list who answers. You can add keys to connect them to a person or to stop future calls."}
            </p>
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="camp-name">Campaign name</Label>
            <Input
              id="camp-name"
              placeholder="Q4 Renewals"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-2">
              <Label>Contact list</Label>
              <Select value={listId} onValueChange={setListId} disabled={contactLists.length === 0}>
                <SelectTrigger>
                  <SelectValue placeholder={contactLists.length === 0 ? "No lists yet" : "Choose a list"} />
                </SelectTrigger>
                <SelectContent>
                  {contactLists.map((l) => (
                    <SelectItem key={l.id} value={l.id}>
                      {l.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="camp-owner">Owner</Label>
              <Input
                id="camp-owner"
                placeholder="you@company.com"
                value={owner}
                onChange={(e) => setOwner(e.target.value)}
              />
            </div>
          </div>

          {mode === "manual" ? (
            <>
              <div className="flex flex-col gap-2">
                <Label htmlFor="camp-script">Opening script (optional)</Label>
                <Textarea
                  id="camp-script"
                  rows={4}
                  placeholder="Hi {{first_name}}, this is … calling about your renewal."
                  value={script}
                  onChange={(e) => setScript(e.target.value)}
                />
              </div>

              <div className="flex items-center justify-between gap-4 rounded-lg border border-border bg-muted/40 p-3">
                <Label htmlFor="camp-start" className="text-sm font-medium">
                  Start dialing immediately
                </Label>
                <Switch id="camp-start" checked={startNow} onCheckedChange={setStartNow} />
              </div>
            </>
          ) : (
            <>
              <RecordingSettingsForm
                value={recording}
                onChange={setRecording}
                numbers={phoneMeta.numbers}
                defaultZone={phoneMeta.zone}
              />

              <div className="flex items-start gap-2.5 rounded-lg border border-border bg-muted/40 p-3">
                <Checkbox
                  id="camp-compliance"
                  checked={complianceAck}
                  onCheckedChange={(v) => setComplianceAck(v === true)}
                />
                <Label htmlFor="camp-compliance" className="text-xs leading-relaxed font-normal">
                  I confirm these contacts agreed to receive recorded calls, the recording says who is calling and how to
                  opt out, and I will follow the calling rules where I operate.
                </Label>
              </div>

              <p className="text-xs text-muted-foreground">
                Saved as a draft. Use <strong>Send me a test call</strong> to hear it, then <strong>Start broadcast</strong>{" "}
                from the campaign list.
              </p>
            </>
          )}
        </form>

        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)}>
            Cancel
          </Button>
          <Button type="submit" form="create-campaign-form" disabled={saving}>
            {saving ? <Loader2 className="size-4 animate-spin" /> : null}
            Create campaign
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
