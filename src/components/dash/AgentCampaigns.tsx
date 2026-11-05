// The Campaigns page as an agent sees it: what is running and how far along, with none of the owner's
// controls (creating, starting a broadcast, deleting). Agents work a manual campaign from the Dialer.
import { Loader2 } from "lucide-react";
import { useEffect, useState } from "react";

import { Shell } from "@/components/dash/Shell";
import { Panel, StatusPill } from "@/components/dash/bits";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { listCampaigns } from "@/lib/workspace-api";

type Row = Awaited<ReturnType<typeof listCampaigns>>["campaigns"][number];

export function AgentCampaigns() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    listCampaigns()
      .then((r) => live && setRows(r.campaigns))
      .catch((err) => live && setError(err instanceof Error ? err.message : "Could not load campaigns."));
    return () => {
      live = false;
    };
  }, []);

  return (
    <Shell scope="tenant" title="Campaigns" description="The campaigns your team is working. To dial a manual campaign, open it in the Windows Dialer.">
      <Panel bodyClassName="p-0">
        {error ? (
          <p className="p-8 text-center text-sm text-destructive">{error}</p>
        ) : !rows ? (
          <p className="flex items-center justify-center gap-2 p-10 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" /> Loading…
          </p>
        ) : rows.length === 0 ? (
          <p className="p-10 text-center text-sm text-muted-foreground">No campaigns yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Campaign</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>List</TableHead>
                  <TableHead className="text-right">Progress</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell className="font-semibold">{c.name}</TableCell>
                    <TableCell className="text-muted-foreground">{c.mode === "recording" ? "Voice broadcast" : "Manual dialing"}</TableCell>
                    <TableCell>
                      <StatusPill status={c.status} />
                    </TableCell>
                    <TableCell className="text-muted-foreground">{c.list_name ?? "—"}</TableCell>
                    <TableCell className="text-right font-mono text-sm">
                      {c.mode === "recording" ? `${c.queue_completed + c.queue_failed}/${c.queue_total}` : `${c.calls_made.toLocaleString()} calls`}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </Panel>
    </Shell>
  );
}
