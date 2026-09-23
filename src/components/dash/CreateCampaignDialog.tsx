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
import { createCampaign, type CampaignRecord } from "@/lib/workspace-api";
import { PromptReviewPanel } from "@/components/dash/PromptReviewPanel";

const DEFAULT_AI_PROMPT =
  "Hi {{first_name}}, this is an automated assistant calling on behalf of [Your Business]. " +
  "I'm reaching out about [reason for the call]. Is now an okay time to talk?";

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
  const [mode, setMode] = useState<"manual" | "ai_agent">("manual");
  const [aiPrompt, setAiPrompt] = useState(DEFAULT_AI_PROMPT);
  const [complianceAck, setComplianceAck] = useState(false);
  const [saving, setSaving] = useState(false);
  const [contactLists, setContactLists] = useState<{ id: string; name: string }[]>([]);

  useEffect(() => {
    if (!open) return;
    getContactsMeta()
      .then((meta) => setContactLists(meta.lists))
      .catch(() => {
        // Non-fatal — the dialog still works with no lists yet.
      });
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
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
            Name the campaign, pick a contact list and assign an owner.
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
            if (mode === "ai_agent" && !complianceAck) {
              toast.error("Confirm the consent/disclosure checkbox before creating an AI campaign.");
              return;
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
                    : { aiPrompt: aiPrompt.trim(), complianceAck }),
                });
                onCreated?.(result.campaign);
                const listLabel = contactLists.find((l) => l.id === listId)?.name ?? "No list yet";
                toast.success(`Campaign “${result.campaign.name}” created`, {
                  description:
                    mode === "ai_agent"
                      ? `${listLabel} · use "Start dialing" to begin`
                      : `${listLabel}${startNow ? " · dialing now" : " · saved as draft"}`,
                });
                setName("");
                setScript("");
                setAiPrompt(DEFAULT_AI_PROMPT);
                setComplianceAck(false);
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
                Human-dialed
              </Button>
              <Button
                type="button"
                variant={mode === "ai_agent" ? "default" : "outline"}
                onClick={() => setMode("ai_agent")}
              >
                AI voice agent
              </Button>
            </div>
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
              <div className="flex flex-col gap-2">
                <Label htmlFor="camp-ai-prompt">AI prompt</Label>
                <Textarea
                  id="camp-ai-prompt"
                  rows={6}
                  value={aiPrompt}
                  onChange={(e) => setAiPrompt(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  This is read to the AI agent for every call — keep the disclosure line at the start.
                </p>
              </div>

              <PromptReviewPanel prompt={aiPrompt} onApply={setAiPrompt} />

              <div className="flex items-start gap-2.5 rounded-lg border border-border bg-muted/40 p-3">
                <Checkbox
                  id="camp-compliance"
                  checked={complianceAck}
                  onCheckedChange={(v) => setComplianceAck(v === true)}
                />
                <Label htmlFor="camp-compliance" className="text-xs leading-relaxed font-normal">
                  I confirm these contacts consented to be called and I will disclose this is an
                  automated call, as required by law in my jurisdiction.
                </Label>
              </div>

              <p className="text-xs text-muted-foreground">
                Saved as a draft — use <strong>Start dialing</strong> from the campaign list once you're
                ready, since it needs to build the call queue first.
              </p>
            </>
          )}
        </form>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
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
