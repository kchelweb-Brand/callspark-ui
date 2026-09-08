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

export function CreateCampaignDialog({
  trigger,
  onCreated,
}: {
  trigger?: ReactNode;
  onCreated?: (campaign: CampaignRecord) => void;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [list, setList] = useState("");
  const [owner, setOwner] = useState(() => getSessionUser()?.email ?? "");
  const [script, setScript] = useState("");
  const [startNow, setStartNow] = useState(true);
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
            void (async () => {
              setSaving(true);
              try {
                const result = await createCampaign({
                  name: name.trim(),
                  status: startNow ? "Active" : "Draft",
                  ...(list ? { listName: list } : {}),
                  ...(owner.trim() ? { owner: owner.trim() } : {}),
                  ...(script.trim() ? { script: script.trim() } : {}),
                });
                onCreated?.(result.campaign);
                toast.success(`Campaign “${result.campaign.name}” created`, {
                  description: `${list || "No list yet"}${startNow ? " · dialing now" : " · saved as draft"}`,
                });
                setName("");
                setScript("");
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
              <Select value={list} onValueChange={setList} disabled={contactLists.length === 0}>
                <SelectTrigger>
                  <SelectValue placeholder={contactLists.length === 0 ? "No lists yet" : "Choose a list"} />
                </SelectTrigger>
                <SelectContent>
                  {contactLists.map((l) => (
                    <SelectItem key={l.id} value={l.name}>
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
