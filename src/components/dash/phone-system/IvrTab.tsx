import { useState, type Dispatch, type SetStateAction } from "react";
import { Plus, Save, Trash2 } from "lucide-react";
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
import { cn } from "@/lib/utils";
import { GreetingEditor } from "./GreetingEditor";
import {
  ivrActionLabels,
  nextId,
  type IvrAction,
  type IvrMenu,
  type IvrOption,
} from "@/lib/phone-system-data";

const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "0", "*", "#"];

export function IvrTab({
  menus,
  setMenus,
}: {
  menus: IvrMenu[];
  setMenus: Dispatch<SetStateAction<IvrMenu[]>>;
}) {
  const [selectedId, setSelectedId] = useState(menus[0]?.id ?? "");
  const [newMenuOpen, setNewMenuOpen] = useState(false);
  const [newMenuName, setNewMenuName] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<IvrMenu | null>(null);
  const [optionDialog, setOptionDialog] = useState<{ menuId: string; option: IvrOption } | null>(null);

  const selected = menus.find((m) => m.id === selectedId) ?? menus[0];

  function updateMenu(id: string, patch: Partial<IvrMenu>) {
    setMenus((prev) => prev.map((m) => (m.id === id ? { ...m, ...patch } : m)));
  }

  function addMenu() {
    if (!newMenuName.trim()) {
      toast.error("Give the menu a name.");
      return;
    }
    const menu: IvrMenu = {
      id: nextId("ivr"),
      name: newMenuName.trim(),
      greetingMode: "tts",
      greetingText: "",
      greetingFileName: null,
      timeoutSeconds: 8,
      repeatCount: 2,
      options: [],
    };
    setMenus((prev) => [...prev, menu]);
    setSelectedId(menu.id);
    setNewMenuName("");
    setNewMenuOpen(false);
    toast.success(`"${menu.name}" menu created`);
  }

  function removeMenu(menu: IvrMenu) {
    setMenus((prev) => prev.filter((m) => m.id !== menu.id));
    if (selectedId === menu.id) {
      setSelectedId(menus.find((m) => m.id !== menu.id)?.id ?? "");
    }
    setDeleteTarget(null);
    toast.success(`"${menu.name}" menu deleted`);
  }

  function saveOption(menuId: string, option: IvrOption, isNew: boolean) {
    if (!option.label.trim()) {
      toast.error("Give this option a label.");
      return;
    }
    setMenus((prev) =>
      prev.map((m) => {
        if (m.id !== menuId) return m;
        const options = isNew
          ? [...m.options, option]
          : m.options.map((o) => (o.id === option.id ? option : o));
        return { ...m, options };
      }),
    );
    setOptionDialog(null);
    toast.success(isNew ? "Option added" : "Option updated");
  }

  function removeOption(menuId: string, optionId: string) {
    setMenus((prev) =>
      prev.map((m) => (m.id === menuId ? { ...m, options: m.options.filter((o) => o.id !== optionId) } : m)),
    );
  }

  if (!selected) {
    return (
      <Panel title="IVR menus" bodyClassName="p-8 text-center">
        <p className="text-sm text-muted-foreground">No menus yet.</p>
        <Button className="mt-4" onClick={() => setNewMenuOpen(true)}>
          <Plus className="size-4" /> New menu
        </Button>
        <NewMenuDialog
          open={newMenuOpen}
          onOpenChange={setNewMenuOpen}
          name={newMenuName}
          onNameChange={setNewMenuName}
          onCreate={addMenu}
        />
      </Panel>
    );
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[260px_1fr]">
      <Panel title="Menus" description="Callers hear these on inbound numbers" bodyClassName="p-0">
        <ul className="divide-y divide-border">
          {menus.map((m) => (
            <li key={m.id}>
              <button
                type="button"
                onClick={() => setSelectedId(m.id)}
                className={cn(
                  "flex w-full items-center justify-between gap-2 px-4 py-3 text-left text-sm transition-colors hover:bg-muted/60",
                  m.id === selectedId && "bg-primary/8 font-semibold",
                )}
              >
                <span className="truncate">{m.name}</span>
                <span className="shrink-0 text-xs text-muted-foreground">{m.options.length} keys</span>
              </button>
            </li>
          ))}
        </ul>
        <div className="border-t border-border p-3">
          <Button variant="outline" className="w-full" onClick={() => setNewMenuOpen(true)}>
            <Plus className="size-4" /> New menu
          </Button>
        </div>
      </Panel>

      <Panel
        title={selected.name}
        description="Greeting, timeout and keypress routing for this menu"
        actions={
          <>
            <Button
              variant="outline"
              size="sm"
              disabled={menus.length <= 1}
              onClick={() => setDeleteTarget(selected)}
            >
              <Trash2 className="size-3.5" /> Delete menu
            </Button>
            <Button
              size="sm"
              onClick={() => toast.success(`"${selected.name}" saved`, { description: "Applies to any number assigned to it." })}
            >
              <Save className="size-3.5" /> Save
            </Button>
          </>
        }
        bodyClassName="p-5"
      >
        <div className="flex flex-col gap-5">
          <div className="flex flex-col gap-2">
            <Label htmlFor="menu-name">Menu name</Label>
            <Input
              id="menu-name"
              value={selected.name}
              onChange={(e) => updateMenu(selected.id, { name: e.target.value })}
            />
          </div>

          <div>
            <Label className="mb-2 block">Greeting</Label>
            <GreetingEditor
              mode={selected.greetingMode}
              text={selected.greetingText}
              file={selected.greetingFile}
              onModeChange={(greetingMode) => updateMenu(selected.id, { greetingMode })}
              onTextChange={(greetingText) => updateMenu(selected.id, { greetingText })}
              onFileChange={(greetingFile) =>
                updateMenu(selected.id, {
                  greetingFile,
                  greetingFileName: greetingFile?.name ?? null,
                })
              }
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-2">
              <Label htmlFor="menu-timeout">No-input timeout (seconds)</Label>
              <Input
                id="menu-timeout"
                type="number"
                min={1}
                max={60}
                value={selected.timeoutSeconds}
                onChange={(e) => updateMenu(selected.id, { timeoutSeconds: Number(e.target.value) || 0 })}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="menu-repeat">Repeat greeting count</Label>
              <Input
                id="menu-repeat"
                type="number"
                min={0}
                max={5}
                value={selected.repeatCount}
                onChange={(e) => updateMenu(selected.id, { repeatCount: Number(e.target.value) || 0 })}
              />
            </div>
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between">
              <Label>Keypress routing</Label>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() =>
                  setOptionDialog({
                    menuId: selected.id,
                    option: { id: "", key: "1", label: "", action: "ring_extension", target: "" },
                  })
                }
              >
                <Plus className="size-3.5" /> Add option
              </Button>
            </div>
            <div className="overflow-x-auto rounded-lg border border-border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-16">Key</TableHead>
                    <TableHead>Label</TableHead>
                    <TableHead>Action</TableHead>
                    <TableHead>Target</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {selected.options.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="py-6 text-center text-sm text-muted-foreground">
                        No keys configured — callers will just hear the greeting.
                      </TableCell>
                    </TableRow>
                  ) : (
                    selected.options.map((opt) => (
                      <TableRow key={opt.id}>
                        <TableCell className="font-mono font-semibold">{opt.key}</TableCell>
                        <TableCell>{opt.label}</TableCell>
                        <TableCell className="text-muted-foreground">{ivrActionLabels[opt.action]}</TableCell>
                        <TableCell className="text-muted-foreground">{opt.target || "—"}</TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setOptionDialog({ menuId: selected.id, option: opt })}
                            >
                              Edit
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => removeOption(selected.id, opt.id)}
                            >
                              <Trash2 className="size-3.5" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </div>
        </div>
      </Panel>

      <NewMenuDialog
        open={newMenuOpen}
        onOpenChange={setNewMenuOpen}
        name={newMenuName}
        onNameChange={setNewMenuName}
        onCreate={addMenu}
      />

      {optionDialog && (
        <OptionDialog
          initial={optionDialog.option}
          onCancel={() => setOptionDialog(null)}
          onSave={(option) => saveOption(optionDialog.menuId, option, !optionDialog.option.id)}
        />
      )}

      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete "{deleteTarget?.name}"?</AlertDialogTitle>
            <AlertDialogDescription>
              Any phone number still assigned to this menu will need a new one. This can't be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => deleteTarget && removeMenu(deleteTarget)}>
              Delete menu
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function NewMenuDialog({
  open,
  onOpenChange,
  name,
  onNameChange,
  onCreate,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  name: string;
  onNameChange: (name: string) => void;
  onCreate: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New IVR menu</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-2">
          <Label htmlFor="new-menu-name">Menu name</Label>
          <Input
            id="new-menu-name"
            placeholder="Holiday hours"
            value={name}
            onChange={(e) => onNameChange(e.target.value)}
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={onCreate}>Create menu</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function OptionDialog({
  initial,
  onCancel,
  onSave,
}: {
  initial: IvrOption;
  onCancel: () => void;
  onSave: (option: IvrOption) => void;
}) {
  const [option, setOption] = useState<IvrOption>(initial);
  const isNew = !initial.id;

  return (
    <Dialog open onOpenChange={(open) => !open && onCancel()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isNew ? "Add keypress option" : "Edit keypress option"}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-2">
            <Label>Key</Label>
            <Select value={option.key} onValueChange={(key) => setOption({ ...option, key })}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {KEYS.map((k) => (
                  <SelectItem key={k} value={k}>
                    {k}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="opt-label">Label</Label>
            <Input
              id="opt-label"
              placeholder="Sales"
              value={option.label}
              onChange={(e) => setOption({ ...option, label: e.target.value })}
            />
          </div>
          <div className="flex flex-col gap-2 sm:col-span-2">
            <Label>Action</Label>
            <Select
              value={option.action}
              onValueChange={(action) => setOption({ ...option, action: action as IvrAction })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(ivrActionLabels) as IvrAction[]).map((a) => (
                  <SelectItem key={a} value={a}>
                    {ivrActionLabels[a]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {option.action !== "hangup" && option.action !== "repeat_menu" && (
            <div className="flex flex-col gap-2 sm:col-span-2">
              <Label htmlFor="opt-target">Target</Label>
              <Input
                id="opt-target"
                placeholder={
                  option.action === "ring_extension"
                    ? "Extension number"
                    : option.action === "goto_menu"
                      ? "Menu name"
                      : "Department or queue name"
                }
                value={option.target}
                onChange={(e) => setOption({ ...option, target: e.target.value })}
              />
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onCancel}>
            Cancel
          </Button>
          <Button onClick={() => onSave(option)}>{isNew ? "Add option" : "Save option"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
