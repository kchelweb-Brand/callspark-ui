import { createFileRoute } from "@tanstack/react-router";
import { Search, Filter, Plus } from "lucide-react";

import { Shell } from "@/components/dash/Shell";
import { ActionButton, Meter, Panel, StatusPill } from "@/components/dash/bits";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { tenants } from "@/lib/mock-data";

export const Route = createFileRoute("/admin/tenants")({
  head: () => ({
    meta: [
      { title: "Tenants — Kchel Admin" },
      {
        name: "description",
        content:
          "All tenant accounts with plan, status, minutes used and join date, plus suspend or activate controls.",
      },
      { property: "og:title", content: "Tenants — Kchel Admin" },
      {
        property: "og:description",
        content: "Manage tenant accounts, plans and usage across the dialer platform.",
      },
    ],
  }),
  component: AdminTenantsPage,
});

function AdminTenantsPage() {
  return (
    <Shell
      scope="admin"
      title="Tenants"
      description="8 of 74 accounts shown"
      actions={
        <ActionButton>
          <Plus className="size-4" /> Provision tenant
        </ActionButton>
      }
    >
      <Panel bodyClassName="p-0">
        <div className="flex flex-wrap items-center gap-3 border-b border-border p-4">
          <div className="relative min-w-56 flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input placeholder="Search company or tenant ID" className="pl-9" />
          </div>
          <ActionButton variant="outline">
            <Filter className="size-4" /> Plan
          </ActionButton>
          <ActionButton variant="outline">Status</ActionButton>
        </div>

        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Company</TableHead>
                <TableHead>Plan</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Minutes used</TableHead>
                <TableHead className="w-40">Allotment</TableHead>
                <TableHead>Joined</TableHead>
                <TableHead className="text-right">MRR</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {tenants.map((t) => (
                <TableRow key={t.id}>
                  <TableCell>
                    <p className="font-semibold">{t.company}</p>
                    <p className="font-mono text-xs text-muted-foreground">{t.id}</p>
                  </TableCell>
                  <TableCell>{t.plan}</TableCell>
                  <TableCell>
                    <StatusPill status={t.status} />
                  </TableCell>
                  <TableCell className="text-right font-mono text-sm">
                    {t.minutes.toLocaleString()}
                  </TableCell>
                  <TableCell>
                    <Meter value={t.minutes} max={t.cap} />
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-muted-foreground">{t.joined}</TableCell>
                  <TableCell className="text-right font-mono text-sm">{t.mrr}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <ActionButton variant="ghost" size="sm">
                        Usage
                      </ActionButton>
                      {t.status === "Suspended" ? (
                        <ActionButton size="sm">Activate</ActionButton>
                      ) : (
                        <ActionButton variant="outline" size="sm">
                          Suspend
                        </ActionButton>
                      )}
                    </div>
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
