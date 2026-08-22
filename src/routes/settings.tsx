import { createFileRoute } from "@tanstack/react-router";
import { ShieldCheck, Phone, GitBranch, KeyRound, Plus } from "lucide-react";

import { Shell } from "@/components/dash/Shell";
import { Panel, StatusPill } from "@/components/dash/bits";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { phoneNumbers } from "@/lib/mock-data";

export const Route = createFileRoute("/settings")({
  head: () => ({
    meta: [
      { title: "Settings — Cadence Dialer" },
      {
        name: "description",
        content: "SIP credential status, phone number management and IVR routing configuration.",
      },
      { property: "og:title", content: "Settings — Cadence Dialer" },
      {
        property: "og:description",
        content: "Configure SIP trunks, caller IDs and inbound routing for your workspace.",
      },
    ],
  }),
  component: SettingsPage,
});

function SettingsPage() {
  return (
    <Shell
      scope="tenant"
      title="Settings"
      description="Workspace, telephony and routing configuration"
      actions={<Button variant="outline">View change log</Button>}
    >
      <div className="grid gap-4 xl:grid-cols-2">
        <Panel title="SIP credentials" description="Provisioned via platform trunk group" bodyClassName="p-5">
          <div className="flex items-center gap-3 rounded-lg border border-success/25 bg-success/8 p-4">
            <ShieldCheck className="size-5 text-success" />
            <div>
              <p className="text-sm font-semibold">Credentials verified</p>
              <p className="text-xs text-muted-foreground">
                Last registration 09:41 · 4 of 4 trunks registered
              </p>
            </div>
            <StatusPill status="Active" />
          </div>

          <dl className="mt-4 grid gap-3 sm:grid-cols-2">
            {[
              ["SIP username", "bw_outreach_01"],
              ["Realm", "sip.telnyx.cadence.io"],
              ["Transport", "TLS / SRTP"],
              ["Concurrency", "240 channels"],
            ].map(([k, v]) => (
              <div key={k} className="rounded-lg border border-border bg-muted/50 p-3">
                <dt className="text-xs text-muted-foreground">{k}</dt>
                <dd className="font-mono text-sm font-semibold">{v}</dd>
              </div>
            ))}
          </dl>

          <div className="mt-4 flex flex-wrap gap-2">
            <Button variant="outline">
              <KeyRound className="size-4" /> Rotate secret
            </Button>
            <Button variant="outline">Download config</Button>
          </div>
        </Panel>

        <Panel title="IVR & routing" description="Inbound call flow placeholder" bodyClassName="p-5">
          <div className="flex h-40 flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border bg-muted/40 text-center">
            <GitBranch className="size-6 text-muted-foreground" />
            <p className="text-sm font-semibold">Flow builder coming from your API</p>
            <p className="max-w-xs text-xs text-muted-foreground">
              Greeting → menu (1 Sales, 2 Support) → skill-based queue → voicemail fallback
            </p>
          </div>

          <div className="mt-4 flex flex-col gap-4">
            {[
              ["Record all inbound calls", true],
              ["Voicemail transcription", true],
              ["After-hours routing", false],
              ["Whisper coaching for supervisors", true],
            ].map(([label, on]) => (
              <div key={label as string} className="flex items-center justify-between gap-4">
                <Label className="text-sm font-medium">{label as string}</Label>
                <Switch defaultChecked={on as boolean} />
              </div>
            ))}
          </div>
        </Panel>
      </div>

      <Panel
        title="Phone numbers"
        description="Caller IDs available to campaigns"
        actions={
          <Button>
            <Plus className="size-4" /> Buy number
          </Button>
        }
        bodyClassName="p-0"
      >
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Number</TableHead>
                <TableHead>Label</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Region</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {phoneNumbers.map((n) => (
                <TableRow key={n.number}>
                  <TableCell className="font-mono text-sm font-semibold">{n.number}</TableCell>
                  <TableCell>{n.label}</TableCell>
                  <TableCell className="text-muted-foreground">{n.type}</TableCell>
                  <TableCell className="text-muted-foreground">{n.region}</TableCell>
                  <TableCell>
                    <StatusPill status={n.status} />
                  </TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="sm">
                      Configure
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </Panel>

      <Panel title="Workspace profile" bodyClassName="p-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-2">
            <Label htmlFor="company">Company name</Label>
            <Input id="company" defaultValue="Bluewave Outreach" />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="tz">Default timezone</Label>
            <Input id="tz" defaultValue="America/Los_Angeles" />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="cid">Default caller ID</Label>
            <Input id="cid" defaultValue="+1 415 555 0100" />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="hours">Dialing window</Label>
            <Input id="hours" defaultValue="08:00 – 19:00" />
          </div>
        </div>
        <div className="mt-5 flex items-center gap-2 text-xs text-muted-foreground">
          <Phone className="size-3.5" /> Changes apply to new calls only.
        </div>
      </Panel>
    </Shell>
  );
}
