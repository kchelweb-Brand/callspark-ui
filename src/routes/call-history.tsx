import { createFileRoute } from "@tanstack/react-router";
import { Search, CalendarDays, Filter, Download, Play } from "lucide-react";

import { Shell } from "@/components/dash/Shell";
import { Panel, StatusPill } from "@/components/dash/bits";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { callHistory } from "@/lib/mock-data";

export const Route = createFileRoute("/call-history")({
  head: () => ({
    meta: [
      { title: "Call History — Cadence Dialer" },
      {
        name: "description",
        content:
          "Searchable call log with date, contact, agent, duration, outcome and linked recordings.",
      },
      { property: "og:title", content: "Call History — Cadence Dialer" },
      {
        property: "og:description",
        content: "Filter historical calls by agent, outcome or date and open recordings.",
      },
    ],
  }),
  component: CallHistoryPage,
});

function CallHistoryPage() {
  return (
    <Shell
      scope="tenant"
      title="Call History"
      description="9 of 42,118 calls · showing today"
      actions={
        <Button variant="outline">
          <Download className="size-4" /> Export log
        </Button>
      }
    >
      <Panel bodyClassName="p-0">
        <div className="flex flex-wrap items-center gap-3 border-b border-border p-4">
          <div className="relative min-w-56 flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input placeholder="Search number, contact or call ID" className="pl-9" />
          </div>
          <Button variant="outline">
            <CalendarDays className="size-4" /> Aug 22, 2026
          </Button>
          <Button variant="outline">
            <Filter className="size-4" /> Outcome
          </Button>
          <Button variant="outline">Agent</Button>
        </div>

        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Contact</TableHead>
                <TableHead>Number</TableHead>
                <TableHead>Agent</TableHead>
                <TableHead className="text-right">Duration</TableHead>
                <TableHead>Outcome</TableHead>
                <TableHead className="text-right">Recording</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {callHistory.map((c) => (
                <TableRow key={c.id}>
                  <TableCell className="whitespace-nowrap text-muted-foreground">{c.date}</TableCell>
                  <TableCell className="font-semibold">{c.contact}</TableCell>
                  <TableCell className="font-mono text-sm">{c.number}</TableCell>
                  <TableCell>{c.agent}</TableCell>
                  <TableCell className="text-right font-mono text-sm">{c.duration}</TableCell>
                  <TableCell>
                    <StatusPill status={c.outcome} />
                  </TableCell>
                  <TableCell className="text-right">
                    {c.outcome === "Connected" ? (
                      <Button variant="ghost" size="sm">
                        <Play className="size-3.5" /> Play
                      </Button>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </Panel>
    </Shell>
  );
}
