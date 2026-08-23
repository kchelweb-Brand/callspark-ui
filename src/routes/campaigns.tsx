import { createFileRoute } from "@tanstack/react-router";
import { Search, SlidersHorizontal } from "lucide-react";
import { useMemo, useState } from "react";

import { Shell } from "@/components/dash/Shell";
import { ActionButton, Panel, StatusPill } from "@/components/dash/bits";
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
import { CreateCampaignDialog } from "@/components/dash/CreateCampaignDialog";
import { campaigns as seedCampaigns } from "@/lib/mock-data";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export const Route = createFileRoute("/campaigns")({
  head: () => ({
    meta: [
      { title: "Campaigns — Kchel Dialer" },
      {
        name: "description",
        content: "Manage outbound dialing campaigns, loaded contacts, dial volume and connect rates.",
      },
      { property: "og:title", content: "Campaigns — Kchel Dialer" },
      {
        property: "og:description",
        content: "Create and monitor outbound calling campaigns across your team.",
      },
    ],
  }),
  component: CampaignsPage,
});

type Campaign = (typeof seedCampaigns)[number];

function CampaignsPage() {
  const [rows, setRows] = useState<Campaign[]>(seedCampaigns);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [owner, setOwner] = useState<string | null>(null);

  const owners = useMemo(() => [...new Set(rows.map((r) => r.owner))], [rows]);
  const statuses = useMemo(() => [...new Set(rows.map((r) => r.status))], [rows]);

  const visible = rows.filter(
    (r) =>
      r.name.toLowerCase().includes(query.toLowerCase()) &&
      (!status || r.status === status) &&
      (!owner || r.owner === owner),
  );

  const dialing = rows.filter((r) => r.status === "Active").length;

  return (
    <Shell
      scope="tenant"
      title="Campaigns"
      description={`${rows.length} campaigns · ${dialing} currently dialing`}
      actions={
        <CreateCampaignDialog
          onCreated={(c) =>
            setRows((prev) => [
              {
                id: `cmp_${prev.length + 1}`,
                name: c.name,
                status: "Active",
                contacts: 0,
                calls: 0,
                connect: 0,
                owner: c.owner,
              },
              ...prev,
            ])
          }
        />
      }
    >
      <Panel bodyClassName="p-0">
        <div className="flex flex-wrap items-center gap-3 border-b border-border p-4">
          <div className="relative min-w-56 flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search campaigns"
              className="pl-9"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline">
                <SlidersHorizontal className="size-4" /> {status ?? "Status"}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>Filter by status</DropdownMenuLabel>
              {statuses.map((s) => (
                <DropdownMenuCheckboxItem
                  key={s}
                  checked={status === s}
                  onCheckedChange={(on) => setStatus(on ? s : null)}
                >
                  {s}
                </DropdownMenuCheckboxItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline">{owner ?? "Owner"}</Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>Filter by owner</DropdownMenuLabel>
              {owners.map((o) => (
                <DropdownMenuCheckboxItem
                  key={o}
                  checked={owner === o}
                  onCheckedChange={(on) => setOwner(on ? o : null)}
                >
                  {o}
                </DropdownMenuCheckboxItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
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
              {visible.map((c) => (
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
                    <ActionButton variant="ghost" size="sm">
                      Manage
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
