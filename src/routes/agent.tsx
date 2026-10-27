import { createFileRoute } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

import { Shell } from "@/components/dash/Shell";
import { Panel, StatCard } from "@/components/dash/bits";
import { AgentTasks, ChatPanel } from "@/components/dash/TeamPanels";
import { Button } from "@/components/ui/button";
import { getAgentHome, type AgentHome } from "@/lib/team-api";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/agent")({
  head: () => ({
    meta: [
      { title: "My day — Kchel Dialer" },
      { name: "description", content: "Your calls, tasks and messages from your team lead." },
      { property: "og:title", content: "My day — Kchel Dialer" },
      { property: "og:description", content: "Your own dashboard in Kchel Dialer." },
    ],
  }),
  component: AgentPage,
});

type Tab = "home" | "tasks" | "messages";

function talk(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

function AgentPage() {
  const [tab, setTab] = useState<Tab>("home");
  const [home, setHome] = useState<AgentHome | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await getAgentHome();
      setHome(r.home);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load your dashboard.");
    }
  }, []);

  useEffect(() => {
    const wanted = new URLSearchParams(window.location.search).get("tab");
    if (wanted === "tasks" || wanted === "messages") setTab(wanted);
    void load();
    const t = setInterval(() => void load(), 30_000);
    return () => clearInterval(t);
  }, [load]);

  const rate = home && home.today.calls > 0 ? `${Math.round((home.today.connected / home.today.calls) * 100)}%` : "—";

  return (
    <Shell
      scope="agent"
      title={home ? `Hi, ${home.agentName.split(" ")[0]}` : "My day"}
      description={home ? home.workspaceName : "Loading…"}
    >
      <div className="flex gap-2 overflow-x-auto">
        {(
          [
            ["home", "My day"],
            ["tasks", `Tasks${home && home.tasks.open > 0 ? ` (${home.tasks.open})` : ""}`],
            ["messages", `Messages${home && home.unreadMessages > 0 ? ` (${home.unreadMessages})` : ""}`],
          ] as [Tab, string][]
        ).map(([key, label]) => (
          <Button key={key} variant={tab === key ? "default" : "outline"} onClick={() => setTab(key)}>
            {label}
          </Button>
        ))}
      </div>

      {error ? (
        <Panel bodyClassName="p-10 text-center">
          <p className="text-sm text-destructive">{error}</p>
          <Button className="mt-3" size="sm" onClick={() => void load()}>
            Try again
          </Button>
        </Panel>
      ) : !home ? (
        <Panel bodyClassName="flex items-center justify-center gap-2 p-12 text-muted-foreground">
          <Loader2 className="size-4 animate-spin" /> Loading…
        </Panel>
      ) : tab === "home" ? (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard label="Calls today" value={String(home.today.calls)} hint={`${home.today.connected} connected · ${rate}`} />
            <StatCard label="Talk time today" value={talk(home.today.talkSeconds)} />
            <StatCard
              label="Open tasks"
              value={String(home.tasks.open)}
              hint={home.tasks.overdue ? `${home.tasks.overdue} overdue` : `${home.tasks.dueToday} due today`}
              {...(home.tasks.overdue ? { tone: "destructive" as const } : {})}
            />
            <StatCard label="Unread messages" value={String(home.unreadMessages)} />
          </div>

          <Panel title="Up next" description="Your open tasks, soonest first">
            {home.upcoming.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nothing waiting for you. Nice.</p>
            ) : (
              <ul className="flex flex-col divide-y divide-border">
                {home.upcoming.map((t) => (
                  <li key={t.id} className="flex flex-wrap items-center gap-3 py-2.5 text-sm">
                    <span
                      className={cn(
                        "rounded-full px-2 py-0.5 text-[11px] font-semibold",
                        t.priority === "High" ? "bg-destructive/10 text-destructive" : t.priority === "Low" ? "bg-success/12 text-success" : "bg-warning/18 text-warning-foreground",
                      )}
                    >
                      {t.priority}
                    </span>
                    <span className="font-medium">{t.title}</span>
                    <span className={cn("text-xs", t.overdue ? "font-semibold text-destructive" : "text-muted-foreground")}>
                      {t.due_at
                        ? `${t.overdue ? "Overdue · " : "Due "}${new Date(t.due_at).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}`
                        : "No due date"}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            <div className="mt-4 flex gap-2">
              <Button size="sm" variant="outline" onClick={() => setTab("tasks")}>
                All my tasks
              </Button>
              <Button size="sm" variant="outline" onClick={() => setTab("messages")}>
                Messages
              </Button>
            </div>
          </Panel>

          <Panel title="This month">
            <div className="grid gap-4 sm:grid-cols-3">
              <StatCard label="Calls" value={String(home.month.calls)} />
              <StatCard label="Connected" value={String(home.month.connected)} />
              <StatCard label="Talk time" value={talk(home.month.talkSeconds)} />
            </div>
          </Panel>
        </>
      ) : tab === "tasks" ? (
        <AgentTasks onChange={() => void load().then(() => toast.success("Updated"))} />
      ) : (
        <Panel title="Chat with your team lead">
          <ChatPanel viewer="agent" />
        </Panel>
      )}
    </Shell>
  );
}
