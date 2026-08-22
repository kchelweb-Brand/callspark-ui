import { createFileRoute } from "@tanstack/react-router";
import { Search, Upload, Tag, Filter } from "lucide-react";

import { Shell } from "@/components/dash/Shell";
import { Panel } from "@/components/dash/bits";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { contacts } from "@/lib/mock-data";

export const Route = createFileRoute("/contacts")({
  head: () => ({
    meta: [
      { title: "Contacts — Cadence Dialer" },
      {
        name: "description",
        content: "Search, tag and import contact lists via CSV for your outbound calling campaigns.",
      },
      { property: "og:title", content: "Contacts — Cadence Dialer" },
      {
        property: "og:description",
        content: "Import CSV lists, tag contacts and filter your calling database.",
      },
    ],
  }),
  component: ContactsPage,
});

const allTags = ["Enterprise", "SMB", "Renewal", "Trial", "Hot", "Winback", "Do not SMS"];

function ContactsPage() {
  return (
    <Shell
      scope="tenant"
      title="Contacts"
      description="24,318 contacts across 6 lists"
      actions={
        <>
          <Button variant="outline">Export CSV</Button>
          <Button>
            <Upload className="size-4" /> Import CSV
          </Button>
        </>
      }
    >
      <Panel bodyClassName="p-0">
        <div className="flex flex-wrap items-center gap-3 border-b border-border p-4">
          <div className="relative min-w-56 flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input placeholder="Search name, company or number" className="pl-9" />
          </div>
          <Button variant="outline">
            <Filter className="size-4" /> List
          </Button>
          <Button variant="outline">
            <Tag className="size-4" /> Tags
          </Button>
        </div>

        <div className="flex flex-wrap gap-2 border-b border-border px-4 py-3">
          {allTags.map((tag) => (
            <span
              key={tag}
              className="rounded-full border border-border bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground"
            >
              {tag}
            </span>
          ))}
        </div>

        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">
                  <Checkbox aria-label="Select all" />
                </TableHead>
                <TableHead>Company</TableHead>
                <TableHead>Primary contact</TableHead>
                <TableHead>Number</TableHead>
                <TableHead>Tags</TableHead>
                <TableHead>List</TableHead>
                <TableHead>Last touch</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {contacts.map((c) => (
                <TableRow key={c.id}>
                  <TableCell>
                    <Checkbox aria-label={`Select ${c.name}`} />
                  </TableCell>
                  <TableCell className="font-semibold">{c.name}</TableCell>
                  <TableCell>{c.person}</TableCell>
                  <TableCell className="font-mono text-sm">{c.number}</TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {c.tags.map((tag) => (
                        <span
                          key={tag}
                          className="rounded-full border border-primary/25 bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-primary"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{c.list}</TableCell>
                  <TableCell className="text-muted-foreground">{c.last}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </Panel>
    </Shell>
  );
}
