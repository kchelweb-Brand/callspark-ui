import { createFileRoute } from "@tanstack/react-router";
import { UserPlus } from "lucide-react";

import { Shell } from "@/components/dash/Shell";
import { Panel, StatusPill } from "@/components/dash/bits";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { agents } from "@/lib/mock-data";

export const Route = createFileRoute("/agents")({
  head: () => ({
    meta: [
      { title: "Agents — Cadence Dialer" },
      {
        name: "description",
        content: "Agent roster with live status, calls handled today, talk time and connect performance.",
      },
      { property: "og:title", content: "Agents — Cadence Dialer" },
      {
        property: "og:description",
        content: "Track agent availability and daily performance on the dialer floor.",
      },
    ],
  }),
  component: AgentsPage,
});

function AgentsPage() {
  return (
    <Shell
      scope="tenant"
      title="Agents"
      description="7 seats · 6 signed in today"
      actions={
        <Button>
          <UserPlus className="size-4" /> Invite agent
        </Button>
      }
    >
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {agents.map((a) => (
          <div key={a.ext} className="card-surface p-5">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <span className="flex size-10 items-center justify-center rounded-full bg-primary/12 text-sm font-bold text-primary">
                  {a.name
                    .split(" ")
                    .map((n) => n[0])
                    .join("")}
                </span>
                <div>
                  <p className="text-sm font-semibold">{a.name}</p>
                  <p className="text-xs text-muted-foreground">Ext {a.ext}</p>
                </div>
              </div>
              <StatusPill status={a.status} />
            </div>
            <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
              <div>
                <dt className="text-xs text-muted-foreground">Calls today</dt>
                <dd className="font-mono font-semibold">{a.calls}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Talk time</dt>
                <dd className="font-mono font-semibold">{a.talk}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Connect rate</dt>
                <dd className="font-mono font-semibold">{a.connect.toFixed(1)}%</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">CSAT</dt>
                <dd className="font-mono font-semibold">{a.csat ? a.csat.toFixed(1) : "—"}</dd>
              </div>
            </dl>
          </div>
        ))}
      </div>

      <Panel title="Performance table" description="Today, all agents" bodyClassName="p-0">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Agent</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Calls handled</TableHead>
                <TableHead className="text-right">Talk time</TableHead>
                <TableHead className="text-right">Connect rate</TableHead>
                <TableHead className="text-right">CSAT</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {agents.map((a) => (
                <TableRow key={a.ext}>
                  <TableCell className="font-semibold">{a.name}</TableCell>
                  <TableCell>
                    <StatusPill status={a.status} />
                  </TableCell>
                  <TableCell className="text-right font-mono text-sm">{a.calls}</TableCell>
                  <TableCell className="text-right font-mono text-sm">{a.talk}</TableCell>
                  <TableCell className="text-right font-mono text-sm">{a.connect.toFixed(1)}%</TableCell>
                  <TableCell className="text-right font-mono text-sm">
                    {a.csat ? a.csat.toFixed(1) : "—"}
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
