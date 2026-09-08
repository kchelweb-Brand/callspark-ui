import { useState, type Dispatch, type SetStateAction } from "react";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Panel, SmsNotice, StatusPill } from "@/components/dash/bits";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { IvrMenu, PhoneNumber } from "@/lib/phone-system-data";

export function NumbersTab({
  numbers,
  setNumbers,
  menus,
}: {
  numbers: PhoneNumber[];
  setNumbers: Dispatch<SetStateAction<PhoneNumber[]>>;
  menus: IvrMenu[];
}) {
  const [configuring, setConfiguring] = useState<PhoneNumber | null>(null);
  const [releasing, setReleasing] = useState<PhoneNumber | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [newNumber, setNewNumber] = useState("");
  const [newLabel, setNewLabel] = useState("");
  const [newType, setNewType] = useState<"Local" | "Toll-free">("Local");

  function save(updated: PhoneNumber) {
    setNumbers((prev) => prev.map((n) => (n.number === updated.number ? updated : n)));
    setConfiguring(null);
    toast.success(`${updated.number} updated`);
  }

  function release(target: PhoneNumber) {
    setNumbers((prev) => prev.filter((n) => n.number !== target.number));
    setReleasing(null);
    toast.success(`${target.number} released`);
  }

  /**
   * Registers a number the tenant already owns at their carrier.
   *
   * Inbound routing looks a call up by the number that was dialled, so this
   * has to be the real E.164 number on the carrier account — an invented one
   * would simply never ring.
   */
  function addNumber() {
    const number = newNumber.trim().replace(/[^\d+]/g, "");
    if (!/^\+[1-9]\d{7,14}$/.test(number)) {
      toast.error("Enter the number in E.164 format, e.g. +14155550134");
      return;
    }
    if (numbers.some((n) => n.number.replace(/\D/g, "") === number.replace(/\D/g, ""))) {
      toast.error("That number is already in your workspace.");
      return;
    }
    const created: PhoneNumber = {
      number,
      label: newLabel.trim() || "Main line",
      type: newType,
      region: number.startsWith("+1") ? "US" : "International",
      status: "Active",
      ivrMenuId: null,
      smsEnabled: false,
    };
    setNumbers((prev) => [created, ...prev]);
    setAddOpen(false);
    setNewNumber("");
    setNewLabel("");
    toast.success(`${number} added`, {
      description: "Point it at this workspace's webhook in your carrier portal to start receiving calls.",
    });
  }

  return (
    <Panel
      title="Phone numbers"
      description="Caller IDs available to voice and SMS campaigns, and the IVR menu each answers to"
      actions={
        <Button size="sm" onClick={() => setAddOpen(true)}>
          <Plus className="size-4" /> Add number
        </Button>
      }
      bodyClassName="p-0"
    >
      <div className="flex flex-wrap items-center gap-3 border-b border-border p-4">
        <SmsNotice />
        <span className="text-xs text-muted-foreground">
          Non-US numbers can place calls but cannot send or receive SMS.
        </span>
      </div>
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Number</TableHead>
              <TableHead>Label</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>IVR menu</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {numbers.map((n) => (
              <TableRow key={n.number}>
                <TableCell className="font-mono text-sm font-semibold">{n.number}</TableCell>
                <TableCell>{n.label}</TableCell>
                <TableCell className="text-muted-foreground">{n.type}</TableCell>
                <TableCell className="text-muted-foreground">
                  {menus.find((m) => m.id === n.ivrMenuId)?.name ?? "Unassigned"}
                </TableCell>
                <TableCell>
                  <StatusPill status={n.status} />
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-1">
                    <Button variant="ghost" size="sm" onClick={() => setConfiguring(n)}>
                      Configure
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => setReleasing(n)}>
                      <Trash2 className="size-3.5" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {configuring && (
        <ConfigureDialog
          initial={configuring}
          menus={menus}
          onCancel={() => setConfiguring(null)}
          onSave={save}
        />
      )}

      <AlertDialog open={!!releasing} onOpenChange={(open) => !open && setReleasing(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Release {releasing?.number}?</AlertDialogTitle>
            <AlertDialogDescription>
              This number will stop ringing into your workspace. It stays on your carrier account —
              remove it there too if you no longer want it.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => releasing && release(releasing)}>Release number</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add a number</DialogTitle>
            <DialogDescription>
              Enter a number you already own at your carrier. Calls to it will be answered by this
              workspace once its webhook is pointed here.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="new-number">Number (E.164)</Label>
              <Input
                id="new-number"
                placeholder="+14155550134"
                value={newNumber}
                onChange={(e) => setNewNumber(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="new-label">Label</Label>
              <Input
                id="new-label"
                placeholder="Main line"
                value={newLabel}
                onChange={(e) => setNewLabel(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label>Type</Label>
              <Select value={newType} onValueChange={(v) => setNewType(v as "Local" | "Toll-free")}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Local">Local</SelectItem>
                  <SelectItem value="Toll-free">Toll-free</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)}>
              Cancel
            </Button>
            <Button onClick={addNumber}>Add number</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Panel>
  );
}

function ConfigureDialog({
  initial,
  menus,
  onCancel,
  onSave,
}: {
  initial: PhoneNumber;
  menus: IvrMenu[];
  onCancel: () => void;
  onSave: (n: PhoneNumber) => void;
}) {
  const [num, setNum] = useState(initial);
  const isUs = num.region.startsWith("US");

  return (
    <Dialog open onOpenChange={(open) => !open && onCancel()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Configure {num.number}</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="num-label">Label</Label>
            <Input id="num-label" value={num.label} onChange={(e) => setNum({ ...num, label: e.target.value })} />
          </div>
          <div className="flex flex-col gap-2">
            <Label>Answers with</Label>
            <Select
              value={num.ivrMenuId ?? "none"}
              onValueChange={(v) => setNum({ ...num, ivrMenuId: v === "none" ? null : v })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No menu — ring routing directly</SelectItem>
                {menus.map((m) => (
                  <SelectItem key={m.id} value={m.id}>
                    {m.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center justify-between gap-4 rounded-lg border border-border bg-muted/40 p-3">
            <div>
              <Label htmlFor="num-sms" className="text-sm font-medium">
                SMS enabled
              </Label>
              {!isUs && <p className="text-xs text-muted-foreground">Only available for US numbers</p>}
            </div>
            <Switch
              id="num-sms"
              checked={num.smsEnabled}
              disabled={!isUs}
              onCheckedChange={(smsEnabled) => setNum({ ...num, smsEnabled })}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onCancel}>
            Cancel
          </Button>
          <Button onClick={() => onSave(num)}>Save changes</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
