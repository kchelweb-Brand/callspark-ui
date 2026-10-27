import { createFileRoute } from "@tanstack/react-router";
import { Loader2, Send } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { Shell } from "@/components/dash/Shell";
import { Panel } from "@/components/dash/bits";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { listBroadcasts, previewAudience, sendBroadcast, type Audience, type BroadcastRecord } from "@/lib/team-api";

export const Route = createFileRoute("/admin/outreach")({
  head: () => ({
    meta: [
      { title: "Outreach — Kchel Admin" },
      { name: "description", content: "Tell every user about an update and how to use it." },
      { property: "og:title", content: "Outreach — Kchel Admin" },
      { property: "og:description", content: "Announce changes to your users." },
    ],
  }),
  component: OutreachPage,
});

const ALL = "__all";

function when(iso: string): string {
  return new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

function OutreachPage() {
  const [history, setHistory] = useState<BroadcastRecord[]>([]);
  const [plans, setPlans] = useState<string[]>([]);
  const [tenants, setTenants] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);

  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [howTo, setHowTo] = useState("");
  const [linkUrl, setLinkUrl] = useState("");
  const [linkLabel, setLinkLabel] = useState("");
  const [roles, setRoles] = useState<"all" | "owners" | "agents">("all");
  const [plan, setPlan] = useState(ALL);
  const [tenant, setTenant] = useState(ALL);
  const [email, setEmail] = useState(false);
  const [count, setCount] = useState<{ users: number; workspaces: number } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const audience = useCallback(
    (): Audience => ({
      roles,
      ...(plan !== ALL ? { plans: [plan] } : {}),
      ...(tenant !== ALL ? { tenantIds: [tenant] } : {}),
    }),
    [roles, plan, tenant],
  );

  const load = useCallback(async () => {
    try {
      const r = await listBroadcasts();
      setHistory(r.broadcasts);
      setPlans(r.plans);
      setTenants(r.tenants);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not load outreach.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      previewAudience(audience())
        .then((r) => setCount({ users: r.users, workspaces: r.workspaces }))
        .catch(() => setCount(null));
    }, 250);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [audience]);

  async function send() {
    if (!title.trim() || !body.trim()) {
      toast.error("Add a title and a message first.");
      return;
    }
    const who = count ? `${count.users} people in ${count.workspaces} workspace${count.workspaces === 1 ? "" : "s"}` : "everyone selected";
    if (!window.confirm(`Send this to ${who}? It cannot be unsent.`)) return;
    setSending(true);
    try {
      const r = await sendBroadcast({
        title: title.trim(),
        body: body.trim(),
        audience: audience(),
        sendEmail: email,
        ...(howTo.trim() ? { howTo: howTo.trim() } : {}),
        ...(linkUrl.trim() ? { linkUrl: linkUrl.trim() } : {}),
        ...(linkLabel.trim() ? { linkLabel: linkLabel.trim() } : {}),
      });
      toast.success(`Sent to ${r.recipients} people${r.emailSent ? ` (${r.emailSent} emailed)` : ""}`);
      setTitle("");
      setBody("");
      setHowTo("");
      setLinkUrl("");
      setLinkLabel("");
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not send that.");
    } finally {
      setSending(false);
    }
  }

  return (
    <Shell scope="admin" title="Outreach" description="Tell your users about an update, and how to use it.">
      <Panel title="New announcement" description="Appears in every recipient's notification bell, in the website and the Dialer.">
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="bc-title">Title</Label>
            <Input id="bc-title" maxLength={150} placeholder="New: power dialer is live" value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="bc-body">What changed</Label>
            <Textarea id="bc-body" rows={4} maxLength={4000} value={body} onChange={(e) => setBody(e.target.value)} />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="bc-how">How to use it (one step per line, optional)</Label>
            <Textarea
              id="bc-how"
              rows={4}
              maxLength={2000}
              placeholder={"Open Campaigns\nPick a contact list\nPress Power dial"}
              value={howTo}
              onChange={(e) => setHowTo(e.target.value)}
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-2">
              <Label htmlFor="bc-link">Link (optional)</Label>
              <Input id="bc-link" placeholder="https://…" value={linkUrl} onChange={(e) => setLinkUrl(e.target.value)} />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="bc-link-label">Link button text</Label>
              <Input id="bc-link-label" maxLength={60} placeholder="Read the guide" value={linkLabel} onChange={(e) => setLinkLabel(e.target.value)} />
            </div>
          </div>

          <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Who gets it</p>
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="flex flex-col gap-2">
              <Label>People</Label>
              <Select value={roles} onValueChange={(v) => setRoles(v as typeof roles)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Everyone (owners and agents)</SelectItem>
                  <SelectItem value="owners">Workspace owners only</SelectItem>
                  <SelectItem value="agents">Agents only</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-2">
              <Label>Plan</Label>
              <Select value={plan} onValueChange={setPlan}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>All plans</SelectItem>
                  {plans.map((p) => (
                    <SelectItem key={p} value={p}>
                      {p}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-2">
              <Label>Workspace</Label>
              <Select value={tenant} onValueChange={setTenant}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>All workspaces</SelectItem>
                  {tenants.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <label className="flex items-center gap-3 text-sm">
            <Switch checked={email} onCheckedChange={setEmail} /> Also send as an email
          </label>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-muted-foreground">
              {count ? `${count.users} people in ${count.workspaces} workspace${count.workspaces === 1 ? "" : "s"} will get this.` : "Counting…"}
            </p>
            <Button disabled={sending} onClick={() => void send()}>
              {sending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
              Send announcement
            </Button>
          </div>
        </div>
      </Panel>

      <Panel title="Sent" bodyClassName="p-0">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-left text-sm">
            <thead>
              <tr className="border-b border-border text-xs uppercase tracking-wide text-muted-foreground">
                <th className="px-4 py-3 font-semibold">Announcement</th>
                <th className="px-4 py-3 font-semibold">Sent to</th>
                <th className="px-4 py-3 font-semibold">Opened</th>
                <th className="px-4 py-3 font-semibold">Email</th>
                <th className="px-4 py-3 font-semibold">When</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={5} className="py-10 text-center text-muted-foreground">
                    <Loader2 className="mx-auto size-4 animate-spin" />
                  </td>
                </tr>
              ) : history.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-10 text-center text-muted-foreground">
                    Nothing sent yet.
                  </td>
                </tr>
              ) : (
                history.map((b) => (
                  <tr key={b.id} className="border-b border-border last:border-0">
                    <td className="px-4 py-3">
                      <p className="font-medium">{b.title}</p>
                      <p className="max-w-80 truncate text-xs text-muted-foreground">{b.body}</p>
                    </td>
                    <td className="px-4 py-3">{b.recipient_count}</td>
                    <td className="px-4 py-3">
                      {b.read_count} ({b.recipient_count ? Math.round((b.read_count / b.recipient_count) * 100) : 0}%)
                    </td>
                    <td className="px-4 py-3">
                      {b.send_email ? `${b.email_sent} sent${b.email_failed ? `, ${b.email_failed} failed` : ""}` : "—"}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">{when(b.created_at)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Panel>
    </Shell>
  );
}
