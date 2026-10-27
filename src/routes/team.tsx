import { createFileRoute } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

import { Shell } from "@/components/dash/Shell";
import { Panel } from "@/components/dash/bits";
import { ChatPanel, OwnerTasks } from "@/components/dash/TeamPanels";
import { Button } from "@/components/ui/button";
import { listThreads, type ThreadSummary } from "@/lib/team-api";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/team")({
  head: () => ({
    meta: [
      { title: "Team — Kchel Dialer" },
      { name: "description", content: "Assign tasks to your agents and chat with each of them." },
      { property: "og:title", content: "Team — Kchel Dialer" },
      { property: "og:description", content: "Tasks and direct messages for your agents." },
    ],
  }),
  component: TeamPage,
});

type Tab = "tasks" | "messages";

function TeamPage() {
  const [tab, setTab] = useState<Tab>("tasks");
  const [threads, setThreads] = useState<ThreadSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [active, setActive] = useState<string | null>(null);
  const [assignTo, setAssignTo] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await listThreads();
      setThreads(r.threads);
      setActive((cur) => cur ?? r.threads[0]?.agent_user_id ?? null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not load your team.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const wanted = new URLSearchParams(window.location.search).get("tab");
    if (wanted === "messages" || wanted === "tasks") setTab(wanted);
    const params = new URLSearchParams(window.location.search);
    const agent = params.get("agent");
    if (agent) {
      setActive(agent);
      setTab("messages");
    }
    const assign = params.get("assign");
    if (assign) {
      setAssignTo(assign);
      setTab("tasks");
    }
    void load();
    const t = setInterval(() => void load(), 15_000);
    return () => clearInterval(t);
  }, [load]);

  const assignable = threads.filter((t) => t.status !== "disabled").map((t) => ({ user_id: t.agent_user_id, name: t.name ?? t.email }));
  const unread = threads.reduce((n, t) => n + t.unread, 0);

  return (
    <Shell scope="tenant" title="Team" description="Assign work and chat with each of your agents.">
      <div className="flex gap-2">
        <Button variant={tab === "tasks" ? "default" : "outline"} onClick={() => setTab("tasks")}>
          Tasks
        </Button>
        <Button variant={tab === "messages" ? "default" : "outline"} onClick={() => setTab("messages")}>
          Messages{unread > 0 ? ` (${unread})` : ""}
        </Button>
      </div>

      {loading ? (
        <Panel bodyClassName="flex items-center justify-center gap-2 p-12 text-muted-foreground">
          <Loader2 className="size-4 animate-spin" /> Loading…
        </Panel>
      ) : tab === "tasks" ? (
        <OwnerTasks agents={assignable} presetAssignee={assignTo} />
      ) : threads.length === 0 ? (
        <Panel bodyClassName="p-10 text-center text-sm text-muted-foreground">
          Invite an agent under Agents to start chatting.
        </Panel>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
          <Panel bodyClassName="p-0">
            {threads.map((t) => (
              <button
                key={t.agent_user_id}
                type="button"
                onClick={() => {
                  setActive(t.agent_user_id);
                  setAssignTo(null);
                  void load();
                }}
                className={cn(
                  "flex w-full flex-col gap-0.5 border-b border-border px-4 py-3 text-left transition-colors last:border-0 hover:bg-muted/50",
                  active === t.agent_user_id && "bg-primary/8",
                )}
              >
                <span className="flex items-center justify-between gap-2">
                  <span className="truncate text-sm font-semibold">{t.name ?? t.email}</span>
                  {t.unread > 0 && (
                    <span className="rounded-full bg-primary px-1.5 text-[10px] font-bold text-primary-foreground">{t.unread}</span>
                  )}
                </span>
                <span className="truncate text-xs text-muted-foreground">{t.last_message ?? "No messages yet"}</span>
                {t.status === "invited" && <span className="text-[10px] font-semibold uppercase text-warning-foreground">Invited</span>}
              </button>
            ))}
          </Panel>
          <Panel title={threads.find((t) => t.agent_user_id === active)?.name ?? "Chat"}>
            {active ? <ChatPanel key={active} viewer="admin" agentUserId={active} /> : null}
          </Panel>
        </div>
      )}
    </Shell>
  );
}
