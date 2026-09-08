import { createFileRoute } from "@tanstack/react-router";
import { Download, Loader2, Phone, RefreshCw, Search } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

import { Shell } from "@/components/dash/Shell";
import { Panel, StatusPill } from "@/components/dash/bits";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { downloadCsv } from "@/lib/download";
import { listCalls, type CallRecord } from "@/lib/calls-api";
import { useSoftphoneContext } from "@/components/dash/SoftphoneProvider";

export const Route = createFileRoute("/call-history")({
  head: () => ({
    meta: [
      { title: "Call History — Kchel Dialer" },
      {
        name: "description",
        content:
          "Searchable call log with date, contact, agent, duration, outcome and linked recordings.",
      },
      { property: "og:title", content: "Call History — Kchel Dialer" },
      {
        property: "og:description",
        content: "Filter historical calls by agent, outcome or date and open recordings.",
      },
    ],
  }),
  component: CallHistoryPage,
});

const PAGE_SIZE = 50;

function formatWhen(iso: string) {
  const d = new Date(iso);
  const sameDay = new Date().toDateString() === d.toDateString();
  return sameDay
    ? d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    : d.toLocaleDateString(undefined, { month: "short", day: "numeric" }) +
        ", " +
        d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function formatDuration(seconds: number | null) {
  if (seconds == null) return "—";
  const m = String(Math.floor(seconds / 60)).padStart(2, "0");
  const s = String(seconds % 60).padStart(2, "0");
  return `${m}:${s}`;
}

function CallHistoryPage() {
  const { state, dial } = useSoftphoneContext();
  const online = state.status === "ready";

  const [calls, setCalls] = useState<CallRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [outcomes, setOutcomes] = useState<string[]>([]);
  const [agents, setAgents] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [query, setQuery] = useState("");
  const [outcome, setOutcome] = useState<string | null>(null);
  const [agent, setAgent] = useState<string | null>(null);
  const [page, setPage] = useState(1);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params: Parameters<typeof listCalls>[0] = { page, pageSize: PAGE_SIZE };
      if (query.trim()) params.search = query.trim();
      if (outcome) params.outcome = outcome;
      if (agent) params.agent = agent;

      const result = await listCalls(params);
      setCalls(result.calls);
      setTotal(result.total);
      setOutcomes(result.outcomes);
      setAgents(result.agents);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load call history.");
    } finally {
      setLoading(false);
    }
  }, [page, query, outcome, agent]);

  // Debounced so typing in search doesn't fire a request per keystroke.
  useEffect(() => {
    const timer = setTimeout(() => void load(), 300);
    return () => clearTimeout(timer);
  }, [load]);

  function exportLog() {
    downloadCsv(
      `call-history-${Date.now()}.csv`,
      calls.map((c) => ({
        date: c.started_at,
        direction: c.direction,
        contact: c.contact_name ?? "",
        number: c.direction === "outbound" ? (c.to_number ?? "") : (c.from_number ?? ""),
        agent: c.agent_email ?? "",
        duration: formatDuration(c.duration_seconds),
        outcome: c.outcome ?? c.status,
      })),
      ["date", "direction", "contact", "number", "agent", "duration", "outcome"],
    );
    toast.success(`Exported ${calls.length} call${calls.length === 1 ? "" : "s"}`);
  }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <Shell
      scope="tenant"
      title="Call History"
      description={loading ? "Loading…" : `${total.toLocaleString()} call${total === 1 ? "" : "s"}`}
      actions={
        <>
          <Button variant="outline" onClick={() => void load()} disabled={loading}>
            <RefreshCw className={`size-4 ${loading ? "animate-spin" : ""}`} />
          </Button>
          <Button variant="outline" onClick={exportLog} disabled={calls.length === 0}>
            <Download className="size-4" /> Export log
          </Button>
        </>
      }
    >
      <Panel bodyClassName="p-0">
        <div className="flex flex-wrap items-center gap-3 border-b border-border p-4">
          <div className="relative min-w-56 flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search number or contact"
              className="pl-9"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setPage(1);
              }}
            />
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline">{outcome ?? "Outcome"}</Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>Filter by outcome</DropdownMenuLabel>
              {outcomes.length === 0 ? (
                <DropdownMenuLabel className="font-normal text-muted-foreground">
                  No calls yet
                </DropdownMenuLabel>
              ) : (
                outcomes.map((o) => (
                  <DropdownMenuCheckboxItem
                    key={o}
                    checked={outcome === o}
                    onCheckedChange={(on) => {
                      setOutcome(on ? o : null);
                      setPage(1);
                    }}
                  >
                    {o}
                  </DropdownMenuCheckboxItem>
                ))
              )}
            </DropdownMenuContent>
          </DropdownMenu>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline">{agent ?? "Agent"}</Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>Filter by agent</DropdownMenuLabel>
              {agents.length === 0 ? (
                <DropdownMenuLabel className="font-normal text-muted-foreground">
                  No calls yet
                </DropdownMenuLabel>
              ) : (
                agents.map((a) => (
                  <DropdownMenuCheckboxItem
                    key={a}
                    checked={agent === a}
                    onCheckedChange={(on) => {
                      setAgent(on ? a : null);
                      setPage(1);
                    }}
                  >
                    {a}
                  </DropdownMenuCheckboxItem>
                ))
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {error ? (
          <div className="p-8 text-center">
            <p className="text-sm text-destructive">{error}</p>
            <Button className="mt-4" onClick={() => void load()}>
              Try again
            </Button>
          </div>
        ) : loading ? (
          <div className="flex items-center justify-center gap-2 p-12 text-muted-foreground">
            <Loader2 className="size-4 animate-spin" /> Loading calls…
          </div>
        ) : (
          <>
            {/* Seven columns can't fit a phone. Rather than make people drag a
                table sideways, the same rows render as cards below md. */}
            <div className="hidden overflow-x-auto md:block">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>When</TableHead>
                    <TableHead>Contact</TableHead>
                    <TableHead>Number</TableHead>
                    <TableHead>Agent</TableHead>
                    <TableHead className="text-right">Duration</TableHead>
                    <TableHead>Outcome</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {calls.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="py-12 text-center">
                        <p className="text-sm font-medium">
                          {query || outcome || agent ? "No calls match this view." : "No calls yet."}
                        </p>
                        {!query && !outcome && !agent && (
                          <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
                            Calls are logged automatically once agents start dialling.
                          </p>
                        )}
                      </TableCell>
                    </TableRow>
                  ) : (
                    calls.map((c) => {
                      const number = c.direction === "outbound" ? c.to_number : c.from_number;
                      return (
                        <TableRow key={c.id}>
                          <TableCell className="whitespace-nowrap text-muted-foreground">
                            {formatWhen(c.started_at)}
                          </TableCell>
                          <TableCell className="font-semibold">{c.contact_name ?? "—"}</TableCell>
                          <TableCell className="font-mono text-sm">{number ?? "—"}</TableCell>
                          <TableCell className="text-muted-foreground">{c.agent_email ?? "—"}</TableCell>
                          <TableCell className="text-right font-mono text-sm">
                            {formatDuration(c.duration_seconds)}
                          </TableCell>
                          <TableCell>
                            <StatusPill status={c.outcome ?? c.status} />
                          </TableCell>
                          <TableCell className="text-right">
                            <Button
                              variant="ghost"
                              size="sm"
                              disabled={!online || !number || state.call !== "idle"}
                              title={online ? "Call back" : "Go online first"}
                              onClick={() =>
                                void dial(number!, {
                                  ...(c.contact_id ? { contactId: c.contact_id } : {}),
                                })
                              }
                            >
                              <Phone className="size-3.5" /> Call
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </div>

            <ul className="divide-y divide-border md:hidden">
              {calls.length === 0 ? (
                <li className="px-4 py-12 text-center text-sm text-muted-foreground">
                  No calls match these filters.
                </li>
              ) : (
                calls.map((c) => {
                  const number = c.direction === "outbound" ? c.to_number : c.from_number;
                  return (
                    <li key={c.id} className="flex flex-col gap-2 px-4 py-3.5">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate font-semibold">{c.contact_name ?? number ?? "Unknown"}</p>
                          <p className="truncate font-mono text-xs text-muted-foreground">
                            {number ?? "—"}
                          </p>
                        </div>
                        <StatusPill status={c.outcome ?? c.status} />
                      </div>

                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                        <span>{formatWhen(c.started_at)}</span>
                        <span className="font-mono">{formatDuration(c.duration_seconds)}</span>
                        {c.agent_email && <span className="truncate">{c.agent_email}</span>}
                      </div>

                      <Button
                        variant="outline"
                        size="sm"
                        className="self-start"
                        disabled={!online || !number || state.call !== "idle"}
                        onClick={() =>
                          void dial(number!, {
                            ...(c.contact_id ? { contactId: c.contact_id } : {}),
                          })
                        }
                      >
                        <Phone className="size-3.5" /> {online ? "Call back" : "Go online first"}
                      </Button>
                    </li>
                  );
                })
              )}
            </ul>

            {totalPages > 1 && (
              <div className="flex items-center justify-between border-t border-border px-4 py-3">
                <p className="text-sm text-muted-foreground">
                  Page {page} of {totalPages}
                </p>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={page === 1}
                    onClick={() => setPage((p) => p - 1)}
                  >
                    Previous
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={page >= totalPages}
                    onClick={() => setPage((p) => p + 1)}
                  >
                    Next
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </Panel>
    </Shell>
  );
}
