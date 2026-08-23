import { createFileRoute } from "@tanstack/react-router";
import { Search, LifeBuoy, Clock, CheckCircle2 } from "lucide-react";

import { Shell } from "@/components/dash/Shell";
import { ActionButton, Panel, StatCard, StatusPill } from "@/components/dash/bits";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { supportTickets } from "@/lib/mock-data";

export const Route = createFileRoute("/admin/support")({
  head: () => ({
    meta: [
      { title: "Support — Kchel Admin" },
      {
        name: "description",
        content: "Tenant support queue with ticket priority, status and response time metrics.",
      },
      { property: "og:title", content: "Support — Kchel Admin" },
      {
        property: "og:description",
        content: "Triage tenant support tickets and track response performance.",
      },
    ],
  }),
  component: AdminSupportPage,
});

function AdminSupportPage() {
  return (
    <Shell
      scope="admin"
      title="Support"
      description="6 open conversations across 6 tenants"
      actions={<ActionButton variant="outline">Macros</ActionButton>}
    >
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Open tickets" value="14" icon={LifeBuoy} />
        <StatCard label="High priority" value="3" icon={LifeBuoy} tone="destructive" />
        <StatCard label="Avg first response" value="26m" delta="-8m" icon={Clock} tone="success" />
        <StatCard label="Resolved this week" value="41" delta="+12" icon={CheckCircle2} tone="success" />
      </div>

      <Panel bodyClassName="p-0">
        <div className="flex flex-wrap items-center gap-3 border-b border-border p-4">
          <div className="relative min-w-56 flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input placeholder="Search tickets, tenants or IDs" className="pl-9" />
          </div>
          <ActionButton variant="outline">Priority</ActionButton>
          <ActionButton variant="outline">Status</ActionButton>
        </div>

        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Ticket</TableHead>
                <TableHead>Tenant</TableHead>
                <TableHead>Subject</TableHead>
                <TableHead>Priority</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Updated</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {supportTickets.map((t) => (
                <TableRow key={t.id}>
                  <TableCell className="font-mono text-sm font-semibold">{t.id}</TableCell>
                  <TableCell>{t.tenant}</TableCell>
                  <TableCell className="max-w-64 truncate">{t.subject}</TableCell>
                  <TableCell>
                    <StatusPill status={t.priority} />
                  </TableCell>
                  <TableCell>
                    <StatusPill status={t.status} />
                  </TableCell>
                  <TableCell className="text-muted-foreground">{t.updated}</TableCell>
                  <TableCell className="text-right">
                    <ActionButton variant="ghost" size="sm">
                      Open
                    </ActionButton>
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
