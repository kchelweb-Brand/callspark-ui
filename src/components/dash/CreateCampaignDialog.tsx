import { Plus } from "lucide-react";
import { useState, type ReactNode } from "react";
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

export function CreateCampaignDialog({
  trigger,
  onCreated,
}: {
  trigger?: ReactNode;
  onCreated?: (campaign: { name: string; list: string; owner: string }) => void;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [list, setList] = useState("Q3 Renewals");
  const [owner, setOwner] = useState("Mara Owusu");
  const [script, setScript] = useState("");
  const [startNow, setStartNow] = useState(true);

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
            onCreated?.({ name: name.trim(), list, owner });
            toast.success(`Campaign “${name.trim()}” created`, {
              description: `${list} · owner ${owner}${startNow ? " · dialing now" : " · saved as draft"}`,
            });
            setName("");
            setScript("");
            setOpen(false);
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
              <Select value={list} onValueChange={setList}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {["Q3 Renewals", "Trial Nurture", "Winback July", "Enterprise Outbound", "Cold List — Midwest"].map(
                    (l) => (
                      <SelectItem key={l} value={l}>
                        {l}
                      </SelectItem>
                    ),
                  )}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-2">
              <Label>Owner</Label>
              <Select value={owner} onValueChange={setOwner}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {["Mara Owusu", "Dane Whitlock", "Priya Nair", "Ines Duarte", "Tomas Feld"].map(
                    (o) => (
                      <SelectItem key={o} value={o}>
                        {o}
                      </SelectItem>
                    ),
                  )}
                </SelectContent>
              </Select>
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
          <Button type="submit" form="create-campaign-form">
            Create campaign
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
