import { Loader2, Plus, Send, Trash2 } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { Panel, StatusPill } from "@/components/dash/bits";
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import {
  createTask,
  deleteTask,
  getThread,
  listTasks,
  sendMessage,
  updateTask,
  type ChatMessage,
  type TaskRow,
} from "@/lib/team-api";
import { listContacts } from "@/lib/contacts-api";

export const PRIORITIES = ["Low", "Medium", "High"] as const;

function when(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

function toLocalInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

function PriorityChip({ priority }: { priority: string }) {
  return (
    <span
      className={cn(
        "rounded-full px-2 py-0.5 text-[11px] font-semibold",
        priority === "High" ? "bg-destructive/10 text-destructive" : priority === "Low" ? "bg-success/12 text-success" : "bg-warning/18 text-warning-foreground",
      )}
    >
      {priority}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Agent: my tasks
// ---------------------------------------------------------------------------

export function AgentTasks({ onChange }: { onChange?: () => void }) {
  const [tasks, setTasks] = useState<TaskRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAll, setShowAll] = useState(false);
  const [doneFor, setDoneFor] = useState<TaskRow | null>(null);
  const [note, setNote] = useState("");

  const load = useCallback(async () => {
    try {
      const r = await listTasks(showAll ? {} : { status: "open" });
      setTasks(r.tasks);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not load your tasks.");
    } finally {
      setLoading(false);
    }
  }, [showAll]);

  useEffect(() => {
    void load();
  }, [load]);

  async function move(task: TaskRow, status: string, withNote?: string) {
    try {
      await updateTask(task.id, { status, ...(withNote ? { note: withNote } : {}) });
      setDoneFor(null);
      setNote("");
      await load();
      onChange?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not update that task.");
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex gap-2">
        <Button size="sm" variant={showAll ? "outline" : "default"} onClick={() => setShowAll(false)}>
          Open
        </Button>
        <Button size="sm" variant={showAll ? "default" : "outline"} onClick={() => setShowAll(true)}>
          All
        </Button>
      </div>
      {loading ? (
        <Panel bodyClassName="flex items-center justify-center gap-2 p-10 text-muted-foreground">
          <Loader2 className="size-4 animate-spin" /> Loading…
        </Panel>
      ) : tasks.length === 0 ? (
        <Panel bodyClassName="p-10 text-center text-sm text-muted-foreground">
          {showAll ? "No tasks yet." : "No open tasks. You're all caught up."}
        </Panel>
      ) : (
        tasks.map((t) => (
          <Panel key={t.id} className={t.status === "Done" ? "opacity-70" : ""}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <PriorityChip priority={t.priority} />
                <StatusPill status={t.status} />
              </div>
              <span className={cn("text-xs", t.overdue ? "font-semibold text-destructive" : "text-muted-foreground")}>
                {t.due_at ? `${t.overdue ? "Overdue · " : "Due "}${when(t.due_at)}` : "No due date"}
              </span>
            </div>
            <h3 className="mt-3 text-base font-semibold">{t.title}</h3>
            {t.details && <p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">{t.details}</p>}
            {t.contact_name && (
              <p className="mt-2 text-sm">
                Contact: <strong>{t.contact_name}</strong> <span className="font-mono text-muted-foreground">{t.contact_phone}</span>
              </p>
            )}
            {t.completion_note && <p className="mt-2 text-xs text-muted-foreground">Your note: {t.completion_note}</p>}
            <div className="mt-4 flex flex-wrap gap-2">
              {t.status === "To do" && (
                <Button size="sm" variant="outline" onClick={() => void move(t, "In progress")}>
                  Start
                </Button>
              )}
              {t.status !== "Done" ? (
                <Button size="sm" onClick={() => setDoneFor(t)}>
                  Mark done
                </Button>
              ) : (
                <Button size="sm" variant="outline" onClick={() => void move(t, "To do")}>
                  Reopen
                </Button>
              )}
            </div>
          </Panel>
        ))
      )}

      <Dialog open={!!doneFor} onOpenChange={(o) => !o && setDoneFor(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Mark as done</DialogTitle>
            <DialogDescription>{doneFor?.title}</DialogDescription>
          </DialogHeader>
          <Label htmlFor="done-note">Note for your team lead (optional)</Label>
          <Textarea id="done-note" rows={3} value={note} onChange={(e) => setNote(e.target.value)} />
          <DialogFooter>
            <Button variant="outline" onClick={() => setDoneFor(null)}>
              Cancel
            </Button>
            <Button onClick={() => doneFor && void move(doneFor, "Done", note.trim())}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Owner: team tasks
// ---------------------------------------------------------------------------

export interface AssignableAgent {
  user_id: string;
  name: string;
}

export function OwnerTasks({ agents, presetAssignee }: { agents: AssignableAgent[]; presetAssignee?: string | null }) {
  const [tasks, setTasks] = useState<TaskRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAll, setShowAll] = useState(false);
  const [editing, setEditing] = useState<TaskRow | "new" | null>(null);
  const [form, setForm] = useState({ assigneeId: "", title: "", details: "", priority: "Medium", dueAt: "", phone: "" });
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await listTasks(showAll ? {} : { status: "open" });
      setTasks(r.tasks);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not load tasks.");
    } finally {
      setLoading(false);
    }
  }, [showAll]);

  useEffect(() => {
    void load();
  }, [load]);

  function openForm(t: TaskRow | "new") {
    if (t === "new" && agents.length === 0) {
      toast.error("Invite an agent first, under Agents.");
      return;
    }
    setEditing(t);
    setForm(
      t === "new"
        ? { assigneeId: presetAssignee ?? agents[0]?.user_id ?? "", title: "", details: "", priority: "Medium", dueAt: "", phone: "" }
        : { assigneeId: t.assignee_id, title: t.title, details: t.details ?? "", priority: t.priority, dueAt: toLocalInput(t.due_at), phone: "" },
    );
  }

  useEffect(() => {
    if (presetAssignee && agents.length > 0) openForm("new");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [presetAssignee, agents.length]);

  async function save() {
    if (!form.title.trim()) {
      toast.error("Give the task a title.");
      return;
    }
    setBusy(true);
    try {
      const dueAt = form.dueAt ? new Date(form.dueAt).toISOString() : undefined;
      if (editing === "new") {
        let contactId: string | undefined;
        if (form.phone.trim()) {
          const found = await listContacts({ search: form.phone.trim(), pageSize: 1 });
          if (found.contacts.length === 0) throw new Error("No contact has that phone number. Add them under Contacts first.");
          contactId = found.contacts[0]!.id;
        }
        await createTask({
          assigneeId: form.assigneeId,
          title: form.title.trim(),
          priority: form.priority,
          ...(form.details.trim() ? { details: form.details.trim() } : {}),
          ...(dueAt ? { dueAt } : {}),
          ...(contactId ? { contactId } : {}),
        });
        toast.success("Task assigned");
      } else if (editing) {
        await updateTask(editing.id, {
          assigneeId: form.assigneeId,
          title: form.title.trim(),
          details: form.details,
          priority: form.priority,
          dueAt: dueAt ?? null,
        });
      }
      setEditing(null);
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save that task.");
    } finally {
      setBusy(false);
    }
  }

  async function remove(t: TaskRow) {
    if (!window.confirm("Delete this task? It disappears from the agent's list too.")) return;
    try {
      await deleteTask(t.id);
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not delete that task.");
    }
  }

  async function setStatus(t: TaskRow, status: string) {
    try {
      await updateTask(t.id, { status });
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not update that task.");
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex gap-2">
          <Button size="sm" variant={showAll ? "outline" : "default"} onClick={() => setShowAll(false)}>
            Open
          </Button>
          <Button size="sm" variant={showAll ? "default" : "outline"} onClick={() => setShowAll(true)}>
            All
          </Button>
        </div>
        <Button onClick={() => openForm("new")}>
          <Plus className="size-4" /> Assign task
        </Button>
      </div>

      <Panel bodyClassName="p-0">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead>
              <tr className="border-b border-border text-xs uppercase tracking-wide text-muted-foreground">
                <th className="px-4 py-3 font-semibold">Task</th>
                <th className="px-4 py-3 font-semibold">Agent</th>
                <th className="px-4 py-3 font-semibold">Priority</th>
                <th className="px-4 py-3 font-semibold">Due</th>
                <th className="px-4 py-3 font-semibold">Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={6} className="py-10 text-center text-muted-foreground">
                    <Loader2 className="mx-auto size-4 animate-spin" />
                  </td>
                </tr>
              ) : tasks.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-10 text-center text-muted-foreground">
                    {showAll ? "No tasks yet." : "No open tasks. Assign one to get your team moving."}
                  </td>
                </tr>
              ) : (
                tasks.map((t) => (
                  <tr key={t.id} className="border-b border-border last:border-0">
                    <td className="px-4 py-3">
                      <p className="font-medium">{t.title}</p>
                      {t.details && <p className="max-w-80 truncate text-xs text-muted-foreground">{t.details}</p>}
                      {t.contact_name && <p className="text-xs text-muted-foreground">Contact: {t.contact_name}</p>}
                      {t.completion_note && <p className="text-xs text-muted-foreground">Note: {t.completion_note}</p>}
                    </td>
                    <td className="px-4 py-3">{t.assignee_name ?? t.assignee_email}</td>
                    <td className="px-4 py-3">
                      <PriorityChip priority={t.priority} />
                    </td>
                    <td className={cn("whitespace-nowrap px-4 py-3", t.overdue && "font-semibold text-destructive")}>{when(t.due_at)}</td>
                    <td className="px-4 py-3">
                      <Select value={t.status} onValueChange={(v) => void setStatus(t, v)}>
                        <SelectTrigger className="h-8 w-32">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {["To do", "In progress", "Done"].map((s) => (
                            <SelectItem key={s} value={s}>
                              {s}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right">
                      <Button size="sm" variant="ghost" onClick={() => openForm(t)}>
                        Edit
                      </Button>
                      <Button size="icon" variant="ghost" className="text-destructive" onClick={() => void remove(t)}>
                        <Trash2 className="size-4" />
                      </Button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Panel>

      <Dialog open={editing !== null} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing === "new" ? "Assign a task" : "Edit task"}</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label>Assign to</Label>
              <Select value={form.assigneeId} onValueChange={(v) => setForm({ ...form, assigneeId: v })}>
                <SelectTrigger>
                  <SelectValue placeholder="Choose an agent" />
                </SelectTrigger>
                <SelectContent>
                  {agents.map((a) => (
                    <SelectItem key={a.user_id} value={a.user_id}>
                      {a.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="task-title">What needs doing?</Label>
              <Input id="task-title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="task-details">Details (optional)</Label>
              <Textarea id="task-details" rows={3} value={form.details} onChange={(e) => setForm({ ...form, details: e.target.value })} />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-2">
                <Label>Priority</Label>
                <Select value={form.priority} onValueChange={(v) => setForm({ ...form, priority: v })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PRIORITIES.map((p) => (
                      <SelectItem key={p} value={p}>
                        {p}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="task-due">Due (optional)</Label>
                <Input id="task-due" type="datetime-local" value={form.dueAt} onChange={(e) => setForm({ ...form, dueAt: e.target.value })} />
              </div>
            </div>
            {editing === "new" && (
              <div className="flex flex-col gap-2">
                <Label htmlFor="task-phone">Contact's phone (optional)</Label>
                <Input id="task-phone" placeholder="+14155550134" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>
              Cancel
            </Button>
            <Button disabled={busy} onClick={() => void save()}>
              {busy ? <Loader2 className="size-4 animate-spin" /> : null}
              {editing === "new" ? "Assign" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Chat
// ---------------------------------------------------------------------------

export function ChatPanel({ viewer, agentUserId }: { viewer: "agent" | "admin"; agentUserId?: string }) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState("");
  const [taskId, setTaskId] = useState("");
  const [openTasks, setOpenTasks] = useState<TaskRow[]>([]);
  const [sending, setSending] = useState(false);
  const bottom = useRef<HTMLDivElement>(null);
  const lastAt = useRef<string | null>(null);

  const refresh = useCallback(
    async (initial: boolean) => {
      try {
        const r = await getThread(agentUserId, initial ? undefined : (lastAt.current ?? undefined));
        if (initial) setMessages(r.messages);
        else if (r.messages.length > 0) setMessages((prev) => [...prev, ...r.messages.filter((m) => !prev.some((p) => p.id === m.id))]);
        const last = r.messages[r.messages.length - 1];
        if (last) lastAt.current = last.created_at;
      } catch (err) {
        if (initial) toast.error(err instanceof Error ? err.message : "Could not load the chat.");
      } finally {
        if (initial) setLoading(false);
      }
    },
    [agentUserId],
  );

  useEffect(() => {
    lastAt.current = null;
    setMessages([]);
    setLoading(true);
    void refresh(true);
    const t = setInterval(() => void refresh(false), 5000);
    return () => clearInterval(t);
  }, [refresh]);

  useEffect(() => {
    if (viewer !== "admin" || !agentUserId) return;
    listTasks({ assigneeId: agentUserId, status: "open" })
      .then((r) => setOpenTasks(r.tasks))
      .catch(() => setOpenTasks([]));
  }, [viewer, agentUserId]);

  useEffect(() => {
    bottom.current?.scrollIntoView({ block: "end" });
  }, [messages]);

  async function send() {
    const body = text.trim();
    if (!body) return;
    setSending(true);
    try {
      await sendMessage(body, agentUserId, taskId || undefined);
      setText("");
      setTaskId("");
      await refresh(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not send that.");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex h-[min(52vh,460px)] flex-col gap-3 overflow-y-auto pr-1">
        {loading ? (
          <p className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" /> Loading…
          </p>
        ) : messages.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted-foreground">No messages yet. Say hello.</p>
        ) : (
          messages.map((m) => {
            const own = viewer === "agent" ? m.sender_role === "agent" : m.sender_role === "admin";
            return (
              <div
                key={m.id}
                className={cn("max-w-[85%] rounded-2xl px-4 py-2.5", own ? "self-end rounded-br-sm bg-primary/12" : "self-start rounded-bl-sm bg-muted")}
              >
                <p className="mb-1 text-[11px] font-semibold text-muted-foreground">
                  {own ? "You" : (m.sender_email ?? "Team")} · {when(m.created_at)}
                </p>
                {m.task_id && (
                  <p className="mb-1.5 rounded-lg border border-border bg-background/70 px-2.5 py-1.5 text-xs">
                    <strong>Task</strong> {m.task_title ?? "(deleted)"}{" "}
                    <span className="text-muted-foreground">
                      {m.task_status}
                      {m.task_due_at ? ` · due ${when(m.task_due_at)}` : ""}
                    </span>
                  </p>
                )}
                <p className="whitespace-pre-wrap text-sm leading-relaxed">{m.body}</p>
              </div>
            );
          })
        )}
        <div ref={bottom} />
      </div>
      <div className="flex flex-wrap items-end gap-2">
        <Textarea
          rows={2}
          maxLength={2000}
          className="min-w-48 flex-1"
          placeholder="Write a message…"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void send();
            }
          }}
        />
        {viewer === "admin" && openTasks.length > 0 && (
          <Select value={taskId || "none"} onValueChange={(v) => setTaskId(v === "none" ? "" : v)}>
            <SelectTrigger className="w-48">
              <SelectValue placeholder="Attach a task" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">No task attached</SelectItem>
              {openTasks.map((t) => (
                <SelectItem key={t.id} value={t.id}>
                  {t.title}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        <Button disabled={sending || !text.trim()} onClick={() => void send()}>
          {sending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
          Send
        </Button>
      </div>
    </div>
  );
}
