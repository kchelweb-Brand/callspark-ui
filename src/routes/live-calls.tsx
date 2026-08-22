import { createFileRoute } from "@tanstack/react-router";
import { PhoneCall, Users, Timer, Activity } from "lucide-react";

import { Shell } from "@/components/dash/Shell";
import { Panel, StatCard, StatusPill, Waveform } from "@/components/dash/bits";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { liveQueue, waitingQueue } from "@/lib/mock-data";

export const Route = createFileRoute("/live-calls")({
  head: () => ({
    meta: [
      { title: "Live Calls — Cadence Dialer" },
      {
        name: "description",
        content:
          "Real-time call queue with agent availability, live call duration and audio activity indicators.",
      },
      { property: "og:title", content: "Live Calls — Cadence Dialer" },
      {
        property: "og:description",
        content: "Monitor the live dialer floor: who is on call, wrapping up or available.",
      },
    ],
  }),
  component: LiveCallsPage,
});

function LiveCallsPage() {
  return (
    <Shell
      scope="tenant"
      title="Live Calls"
      description="Updating every second · 3 calls in progress"
      actions={
        <>
          <Button variant="outline">Barge settings</Button>
          <Button variant="destructive">Pause dialer</Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Calls in progress" value="3" icon={PhoneCall} />
        <StatCard label="Agents available" value="2" icon={Users} tone="success" />
        <StatCard label="Avg talk time" value="05:12" icon={Timer} />
        <StatCard label="Queue waiting" value="3" hint="longest 01:12" icon={Activity} tone="warning" />
      </div>

      <Panel title="Agent queue" description="Status, live duration and audio" bodyClassName="p-0">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Agent</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Contact</TableHead>
                <TableHead>Number</TableHead>
                <TableHead>Campaign</TableHead>
                <TableHead>Duration</TableHead>
                <TableHead className="w-44">Audio</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {liveQueue.map((row) => (
                <TableRow key={row.ext}>
                  <TableCell>
                    <p className="font-semibold">{row.agent}</p>
                    <p className="text-xs text-muted-foreground">Ext {row.ext}</p>
                  </TableCell>
                  <TableCell>
                    <StatusPill status={row.status} />
                  </TableCell>
                  <TableCell>{row.contact}</TableCell>
                  <TableCell className="font-mono text-sm">{row.number}</TableCell>
                  <TableCell className="text-muted-foreground">{row.campaign}</TableCell>
                  <TableCell className="font-mono text-sm">{row.duration}</TableCell>
                  <TableCell>
                    {row.status === "On call" ? (
                      <Waveform />
                    ) : (
                      <span className="text-xs text-muted-foreground">No active audio</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="sm" disabled={row.status !== "On call"}>
                      Listen
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </Panel>

      <Panel title="Waiting queue" description="Callers pending agent assignment" bodyClassName="p-0">
        <ul className="divide-y divide-border">
          {waitingQueue.map((q) => (
            <li key={q.position} className="flex flex-wrap items-center gap-3 px-5 py-3.5">
              <span className="flex size-7 items-center justify-center rounded-full bg-muted text-xs font-bold">
                {q.position}
              </span>
              <span className="font-mono text-sm">{q.number}</span>
              <span className="text-xs text-muted-foreground">{q.campaign}</span>
              <span className="ml-auto font-mono text-sm text-warning-foreground">
                waiting {q.waiting}
              </span>
            </li>
          ))}
        </ul>
      </Panel>
    </Shell>
  );
}
