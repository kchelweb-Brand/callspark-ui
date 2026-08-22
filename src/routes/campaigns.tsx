import { createFileRoute } from "@tanstack/react-router";
import { Plus, Search, SlidersHorizontal } from "lucide-react";

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
import { campaigns } from "@/lib/mock-data";

export const Route = createFileRoute("/campaigns")({
  head: () => ({
    meta: [
      { title: "Campaigns — Cadence Dialer" },
      {
        name: "description",
        content: "Manage outbound dialing campaigns, loaded contacts, dial volume and connect rates.",
      },
      { property: "og:title", content: "Campaigns — Cadence Dialer" },
      {
        property: "og:description",
        content: "Create and monitor outbound calling campaigns across your team.",
      },
    ],
  }),
  component: CampaignsPage,
});

function CampaignsPage() {
  return (
    <Shell
      scope="tenant"
      title="Campaigns"
      description="7 campaigns · 3 currently dialing"
      actions={
        <Button>
          <Plus className="size-4" /> Create campaign
        </Button>
      }
    >
      <Panel bodyClassName="p-0">
        <div className="flex flex-wrap items-center gap-3 border-b border-border p-4">
          <div className="relative min-w-56 flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input placeholder="Search campaigns" className="pl-9" />
          </div>
          <Button variant="outline">
            <SlidersHorizontal className="size-4" /> Status
          </Button>
          <Button variant="outline">Owner</Button>
        </div>

        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Campaign</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Contacts loaded</TableHead>
                <TableHead className="text-right">Calls made</TableHead>
                <TableHead className="text-right">Connect rate</TableHead>
                <TableHead>Owner</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {campaigns.map((c) => (
                <TableRow key={c.id}>
                  <TableCell className="font-semibold">{c.name}</TableCell>
                  <TableCell>
                    <StatusPill status={c.status} />
                  </TableCell>
                  <TableCell className="text-right font-mono text-sm">
                    {c.contacts.toLocaleString()}
                  </TableCell>
                  <TableCell className="text-right font-mono text-sm">
                    {c.calls.toLocaleString()}
                  </TableCell>
                  <TableCell className="text-right font-mono text-sm">
                    {c.connect.toFixed(1)}%
                  </TableCell>
                  <TableCell className="text-muted-foreground">{c.owner}</TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="sm">
                      Manage
                    </Button>
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
