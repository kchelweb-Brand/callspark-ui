import { useState, type Dispatch, type SetStateAction } from "react";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Panel } from "@/components/dash/bits";
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
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { nextId, type Extension, type ExtensionType } from "@/lib/phone-system-data";

const TYPES: ExtensionType[] = ["User", "Department", "Ring group"];

function emptyExtension(): Extension {
  return { id: "", number: "", label: "", type: "User", forwardsTo: "" };
}

export function ExtensionsTab({
  extensions,
  setExtensions,
}: {
  extensions: Extension[];
  setExtensions: Dispatch<SetStateAction<Extension[]>>;
}) {
  const [editing, setEditing] = useState<Extension | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Extension | null>(null);

  function save(ext: Extension) {
    if (!ext.number.trim() || !ext.label.trim()) {
      toast.error("Extension number and label are required.");
      return;
    }
    if (ext.id) {
      setExtensions((prev) => prev.map((e) => (e.id === ext.id ? ext : e)));
      toast.success("Extension updated");
    } else {
      setExtensions((prev) => [...prev, { ...ext, id: nextId("ext") }]);
      toast.success(`Extension ${ext.number} created`);
    }
    setEditing(null);
  }

  function remove(ext: Extension) {
    setExtensions((prev) => prev.filter((e) => e.id !== ext.id));
    setDeleteTarget(null);
    toast.success(`Extension ${ext.number} deleted`);
  }

  return (
    <Panel
      title="Extensions"
      description="Users, departments and ring groups callers can be routed to"
      actions={
        <Button size="sm" onClick={() => setEditing(emptyExtension())}>
          <Plus className="size-4" /> Add extension
        </Button>
      }
      bodyClassName="p-0"
    >
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Extension</TableHead>
              <TableHead>Label</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Forwards to</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {extensions.map((ext) => (
              <TableRow key={ext.id}>
                <TableCell className="font-mono font-semibold">{ext.number}</TableCell>
                <TableCell>{ext.label}</TableCell>
                <TableCell className="text-muted-foreground">{ext.type}</TableCell>
                <TableCell className="text-muted-foreground">{ext.forwardsTo || "—"}</TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-1">
                    <Button variant="ghost" size="sm" onClick={() => setEditing(ext)}>
                      Edit
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => setDeleteTarget(ext)}>
                      <Trash2 className="size-3.5" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {editing && (
        <ExtensionDialog initial={editing} onCancel={() => setEditing(null)} onSave={save} />
      )}

      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete extension {deleteTarget?.number}?</AlertDialogTitle>
            <AlertDialogDescription>
              Any IVR menu or routing rule pointing at this extension will need to be updated.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => deleteTarget && remove(deleteTarget)}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Panel>
  );
}

function ExtensionDialog({
  initial,
  onCancel,
  onSave,
}: {
  initial: Extension;
  onCancel: () => void;
  onSave: (ext: Extension) => void;
}) {
  const [ext, setExt] = useState(initial);
  const isNew = !initial.id;

  return (
    <Dialog open onOpenChange={(open) => !open && onCancel()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isNew ? "Add extension" : `Edit extension ${ext.number}`}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-2">
            <Label htmlFor="ext-number">Number</Label>
            <Input
              id="ext-number"
              placeholder="1049"
              value={ext.number}
              onChange={(e) => setExt({ ...ext, number: e.target.value })}
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="ext-label">Label</Label>
            <Input
              id="ext-label"
              placeholder="Jordan Ellis"
              value={ext.label}
              onChange={(e) => setExt({ ...ext, label: e.target.value })}
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label>Type</Label>
            <Select value={ext.type} onValueChange={(type) => setExt({ ...ext, type: type as ExtensionType })}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TYPES.map((t) => (
                  <SelectItem key={t} value={t}>
                    {t}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="ext-forward">Forwards to</Label>
            <Input
              id="ext-forward"
              placeholder="Voicemail, or a mobile number"
              value={ext.forwardsTo}
              onChange={(e) => setExt({ ...ext, forwardsTo: e.target.value })}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onCancel}>
            Cancel
          </Button>
          <Button onClick={() => onSave(ext)}>{isNew ? "Add extension" : "Save changes"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
