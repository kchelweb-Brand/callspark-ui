import { createFileRoute } from "@tanstack/react-router";
import {
  Copy,
  Loader2,
  MoreHorizontal,
  Pause,
  Play,
  Search,
  SlidersHorizontal,
  Trash2,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { Shell } from "@/components/dash/Shell";
import { Panel, StatusPill } from "@/components/dash/bits";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { CreateCampaignDialog } from "@/components/dash/CreateCampaignDialog";
import {
  deleteCampaign,
  duplicateCampaign,
  listCampaigns,
  updateCampaign,
  type CampaignRecord,
} from "@/lib/workspace-api";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
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

/** Row shape the table renders, mapped from the stored record. */
interface Campaign {
  id: string;
  name: string;
  status: string;
  contacts: number;
  calls: number;
  connect: number;
  owner: string;
}

function toRow(record: CampaignRecord): Campaign {
  return {
    id: record.id,
    name: record.name,
    status: record.status,
    contacts: record.contacts_loaded,
    calls: record.calls_made,
    connect: record.connect_rate,
    owner: record.owner ?? "—",
  };
}

function CampaignsPage() {
  const [rows, setRows] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [owner, setOwner] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Campaign | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await listCampaigns();
      setRows(result.campaigns.map(toRow));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load campaigns.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function setCampaignStatus(id: string, next: string) {
    const label = rows.find((r) => r.id === id)?.name ?? "Campaign";
    try {
      const result = await updateCampaign(id, { status: next });
      setRows((prev) => prev.map((r) => (r.id === id ? toRow(result.campaign) : r)));
      toast.success(`${label} ${next.toLowerCase()}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not update that campaign.");
    }
  }

  async function handleDuplicate(c: Campaign) {
    try {
      const result = await duplicateCampaign(c.id);
      setRows((prev) => [toRow(result.campaign), ...prev]);
      toast.success(`Duplicated "${c.name}"`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not duplicate that campaign.");
    }
  }

  async function handleDelete(c: Campaign) {
    try {
      await deleteCampaign(c.id);
      setRows((prev) => prev.filter((r) => r.id !== c.id));
      setDeleteTarget(null);
      toast.success(`"${c.name}" deleted`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not delete that campaign.");
    }
  }

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
        <CreateCampaignDialog onCreated={(record) => setRows((prev) => [toRow(record), ...prev])} />
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
              {loading ? (
                <TableRow>
                  <TableCell colSpan={7} className="py-12 text-center text-sm text-muted-foreground">
                    <span className="inline-flex items-center gap-2">
                      <Loader2 className="size-4 animate-spin" /> Loading campaigns…
                    </span>
                  </TableCell>
                </TableRow>
              ) : error ? (
                <TableRow>
                  <TableCell colSpan={7} className="py-10 text-center">
                    <p className="text-sm text-destructive">{error}</p>
                    <Button className="mt-3" size="sm" onClick={() => void load()}>
                      Try again
                    </Button>
                  </TableCell>
                </TableRow>
              ) : visible.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="py-10 text-center text-sm text-muted-foreground">
                    {rows.length === 0
                      ? "No campaigns yet — create your first one to start dialing."
                      : "No campaigns match this view."}
                  </TableCell>
                </TableRow>
              ) : (
                visible.map((c) => (
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
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="sm">
                          <MoreHorizontal className="size-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        {c.status === "Active" ? (
                          <DropdownMenuItem onClick={() => setCampaignStatus(c.id, "Paused")}>
                            <Pause className="size-3.5" /> Pause
                          </DropdownMenuItem>
                        ) : c.status !== "Completed" ? (
                          <DropdownMenuItem onClick={() => setCampaignStatus(c.id, "Active")}>
                            <Play className="size-3.5" /> Resume
                          </DropdownMenuItem>
                        ) : null}
                        <DropdownMenuItem onClick={() => void handleDuplicate(c)}>
                          <Copy className="size-3.5" /> Duplicate
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          className="text-destructive focus:text-destructive"
                          onClick={() => setDeleteTarget(c)}
                        >
                          <Trash2 className="size-3.5" /> Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </Panel>

      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete "{deleteTarget?.name}"?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes the campaign and its dialing history. This can't be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => deleteTarget && void handleDelete(deleteTarget)}>
              Delete campaign
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Shell>
  );
}
