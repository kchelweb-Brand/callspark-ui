import { createFileRoute } from "@tanstack/react-router";
import { Download, CreditCard, ShieldCheck } from "lucide-react";

import { Shell } from "@/components/dash/Shell";
import { ActionButton, Meter, Panel, StatCard, StatusPill } from "@/components/dash/bits";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { invoices } from "@/lib/mock-data";

export const Route = createFileRoute("/billing")({
  head: () => ({
    meta: [
      { title: "Billing — Kchel Dialer" },
      {
        name: "description",
        content:
          "Current plan, minutes used versus allotted, SIP credential purchases and invoice history.",
      },
      { property: "og:title", content: "Billing — Kchel Dialer" },
      {
        property: "og:description",
        content: "Review plan usage, SIP purchases and download past invoices.",
      },
    ],
  }),
  component: BillingPage,
});

function BillingPage() {
  return (
    <Shell
      scope="tenant"
      title="Billing"
      description="Billing period Aug 1 – Aug 31, 2026"
      actions={
        <>
          <ActionButton variant="outline">Payment method</ActionButton>
          <ActionButton>Upgrade plan</ActionButton>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Current plan" value="Scale" hint="$1,480 / month" icon={CreditCard} />
        <StatCard label="Minutes used" value="184,200" hint="of 250,000" tone="warning" />
        <StatCard label="Overage estimate" value="$0.00" hint="0 minutes over" tone="success" />
        <StatCard label="Next invoice" value="Sep 1" hint="auto-charged" />
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <Panel title="Usage this period" className="xl:col-span-2" bodyClassName="p-5">
          <div className="flex flex-col gap-5">
            {[
              { label: "Outbound minutes", value: 184200, max: 250000 },
              { label: "Recording storage", value: 412, max: 1000, unit: "GB" },
              { label: "Concurrent channels (peak)", value: 186, max: 240 },
            ].map((row) => (
              <div key={row.label}>
                <div className="mb-2 flex items-center justify-between text-sm">
                  <span className="font-medium">{row.label}</span>
                  <span className="font-mono text-xs text-muted-foreground">
                    {row.value.toLocaleString()} / {row.max.toLocaleString()} {row.unit ?? ""}
                  </span>
                </div>
                <Meter value={row.value} max={row.max} />
              </div>
            ))}
          </div>
        </Panel>

        <Panel title="SIP credentials" description="Purchase status" bodyClassName="p-5">
          <div className="flex items-center gap-3 rounded-lg border border-success/25 bg-success/8 p-4">
            <ShieldCheck className="size-5 text-success" />
            <div className="min-w-0">
              <p className="text-sm font-semibold">4 trunks provisioned</p>
              <p className="text-xs text-muted-foreground">$420 / month · renews Sep 1</p>
            </div>
          </div>
          <ul className="mt-4 flex flex-col gap-3 text-sm">
            {[
              { item: "Trunk pack × 2", date: "Aug 14, 2026", status: "Provisioned" },
              { item: "Trunk pack × 2", date: "Feb 12, 2026", status: "Provisioned" },
              { item: "Toll-free add-on", date: "Aug 20, 2026", status: "Pending" },
            ].map(({ item, date, status }) => (
              <li key={item + date} className="flex items-center justify-between gap-3">
                <span>
                  <span className="block font-medium">{item}</span>
                  <span className="text-xs text-muted-foreground">{date}</span>
                </span>
                <StatusPill status={status} />
              </li>
            ))}

          </ul>
          <ActionButton variant="outline" className="mt-4 w-full">
            Buy more trunks
          </ActionButton>
        </Panel>
      </div>

      <Panel title="Invoice history" bodyClassName="p-0">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Invoice</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Plan</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">PDF</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {invoices.map((inv) => (
                <TableRow key={inv.id}>
                  <TableCell className="font-mono text-sm font-semibold">{inv.id}</TableCell>
                  <TableCell className="text-muted-foreground">{inv.date}</TableCell>
                  <TableCell>{inv.plan}</TableCell>
                  <TableCell className="text-right font-mono text-sm">{inv.amount}</TableCell>
                  <TableCell>
                    <StatusPill status={inv.status} />
                  </TableCell>
                  <TableCell className="text-right">
                    <ActionButton variant="ghost" size="sm">
                      <Download className="size-3.5" /> Download
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
