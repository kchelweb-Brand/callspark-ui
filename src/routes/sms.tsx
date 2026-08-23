import { createFileRoute } from "@tanstack/react-router";
import { MessageSquare, Send, Megaphone, Search } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Shell } from "@/components/dash/Shell";
import { ActionButton, Panel, SmsNotice, StatCard, StatusPill } from "@/components/dash/bits";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { smsCampaigns, smsThreads } from "@/lib/mock-data";

export const Route = createFileRoute("/sms")({
  head: () => ({
    meta: [
      { title: "SMS — Kchel Dialer" },
      {
        name: "description",
        content:
          "Two-way SMS inbox, quick compose and bulk SMS campaigns for your contact lists. US numbers only.",
      },
      { property: "og:title", content: "SMS — Kchel Dialer" },
      {
        property: "og:description",
        content: "Message contacts, reply to threads and run bulk SMS campaigns from Kchel Dialer.",
      },
    ],
  }),
  component: SmsPage,
});

type Message = { id: number; from: "us" | "them"; time: string; text: string };

function SmsPage() {
  const [activeId, setActiveId] = useState(smsThreads[0]!.id);
  const [extra, setExtra] = useState<Record<string, Message[]>>({});
  const [reply, setReply] = useState("");
  const [query, setQuery] = useState("");
  const [bulkList, setBulkList] = useState("Q3 Renewals");
  const [bulkBody, setBulkBody] = useState(
    "Hi {{first_name}}, quick reminder that your renewal is coming up. Reply YES and we'll handle it.",
  );

  const thread = smsThreads.find((t) => t.id === activeId)!;
  const messages: Message[] = [...thread.messages, ...(extra[thread.id] ?? [])];
  const visible = smsThreads.filter((t) =>
    `${t.contact} ${t.company} ${t.number}`.toLowerCase().includes(query.toLowerCase()),
  );

  const sendReply = () => {
    if (!reply.trim()) {
      toast.error("Type a message before sending.");
      return;
    }
    setExtra((prev) => ({
      ...prev,
      [thread.id]: [
        ...(prev[thread.id] ?? []),
        {
          id: Date.now(),
          from: "us",
          time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
          text: reply.trim(),
        },
      ],
    }));
    setReply("");
    toast.success(`Message sent to ${thread.contact}`, { description: thread.number });
  };

  return (
    <Shell
      scope="tenant"
      title="SMS"
      description="Two-way messaging, bulk sends and reply tracking"
      actions={
        <>
          <SmsNotice className="hidden sm:inline-flex" />
          <ActionButton variant="outline">Message templates</ActionButton>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Sent today" value="2,710" delta="+8.2%" icon={Send} />
        <StatCard label="Delivery rate" value="97.6%" delta="+0.4 pts" icon={MessageSquare} tone="success" />
        <StatCard label="Replies today" value="246" delta="+11.0%" icon={MessageSquare} />
        <StatCard label="Opt-outs" value="14" hint="STOP keyword" tone="warning" />
      </div>

      <Tabs defaultValue="inbox">
        <TabsList>
          <TabsTrigger value="inbox">Inbox</TabsTrigger>
          <TabsTrigger value="bulk">Bulk SMS campaign</TabsTrigger>
        </TabsList>

        <TabsContent value="inbox" className="mt-4">
          <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
            <Panel title="Conversations" bodyClassName="p-0">
              <div className="border-b border-border p-3">
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    placeholder="Search threads"
                    className="pl-9"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                  />
                </div>
              </div>
              <ul className="max-h-[420px] divide-y divide-border overflow-y-auto">
                {visible.map((t) => (
                  <li key={t.id}>
                    <button
                      type="button"
                      onClick={() => setActiveId(t.id)}
                      className={cn(
                        "w-full px-4 py-3 text-left transition-colors hover:bg-muted/60",
                        t.id === activeId && "bg-primary/8",
                      )}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <p className="truncate text-sm font-semibold">{t.contact}</p>
                        <span className="font-mono text-[11px] text-muted-foreground">{t.last}</span>
                      </div>
                      <p className="truncate text-xs text-muted-foreground">{t.company}</p>
                      <div className="mt-1 flex items-center gap-2">
                        <span className="font-mono text-[11px] text-muted-foreground">{t.number}</span>
                        {t.unread > 0 ? (
                          <span className="rounded-full bg-primary px-1.5 text-[10px] font-bold text-primary-foreground">
                            {t.unread}
                          </span>
                        ) : null}
                      </div>
                    </button>
                  </li>
                ))}
                {visible.length === 0 ? (
                  <li className="px-4 py-6 text-center text-sm text-muted-foreground">
                    No conversations match “{query}”.
                  </li>
                ) : null}
              </ul>
            </Panel>

            <Panel
              title={thread.contact}
              description={`${thread.company} · ${thread.number}`}
              actions={<ActionButton variant="outline" size="sm">Call contact</ActionButton>}
              bodyClassName="p-0"
            >
              <div className="flex max-h-[360px] flex-col gap-3 overflow-y-auto p-5">
                {messages.map((m) => (
                  <div
                    key={m.id}
                    className={cn(
                      "max-w-[78%] rounded-xl px-3.5 py-2.5 text-sm",
                      m.from === "us"
                        ? "self-end bg-primary text-primary-foreground"
                        : "self-start bg-muted",
                    )}
                  >
                    <p className="leading-snug">{m.text}</p>
                    <p
                      className={cn(
                        "mt-1 font-mono text-[10px]",
                        m.from === "us" ? "text-primary-foreground/70" : "text-muted-foreground",
                      )}
                    >
                      {m.time}
                    </p>
                  </div>
                ))}
              </div>

              <div className="border-t border-border p-4">
                <SmsNotice className="mb-3" />
                <div className="flex flex-col gap-2 sm:flex-row">
                  <Textarea
                    rows={2}
                    placeholder={`Reply to ${thread.contact}…`}
                    value={reply}
                    onChange={(e) => setReply(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        sendReply();
                      }
                    }}
                  />
                  <Button className="sm:self-end" onClick={sendReply}>
                    <Send className="size-4" /> Send
                  </Button>
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  {reply.length}/160 characters · sending from +1 415 555 0100
                </p>
              </div>
            </Panel>
          </div>
        </TabsContent>

        <TabsContent value="bulk" className="mt-4 flex flex-col gap-4">
          <Panel
            title="Bulk SMS sender"
            description="Send to an entire contact list"
            bodyClassName="p-5"
          >
            <SmsNotice className="mb-4" />
            <div className="grid gap-4 lg:grid-cols-2">
              <div className="flex flex-col gap-4">
                <div className="flex flex-col gap-2">
                  <Label htmlFor="sms-name">Campaign name</Label>
                  <Input id="sms-name" defaultValue="Renewal reminders — US" />
                </div>
                <div className="flex flex-col gap-2">
                  <Label>Contact list</Label>
                  <Select value={bulkList} onValueChange={setBulkList}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {["Q3 Renewals", "Trial Nurture", "Winback July", "Enterprise Outbound"].map(
                        (l) => (
                          <SelectItem key={l} value={l}>
                            {l}
                          </SelectItem>
                        ),
                      )}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="sms-from">Sending number</Label>
                  <Input id="sms-from" defaultValue="+1 415 555 0100" className="font-mono" />
                </div>
              </div>

              <div className="flex flex-col gap-2">
                <Label htmlFor="sms-body">Message</Label>
                <Textarea
                  id="sms-body"
                  rows={7}
                  value={bulkBody}
                  onChange={(e) => setBulkBody(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  {bulkBody.length} characters · {Math.max(1, Math.ceil(bulkBody.length / 160))}{" "}
                  segment(s) · merge tags: {"{{first_name}}"}, {"{{company}}"}
                </p>
              </div>
            </div>

            <div className="mt-5 flex flex-wrap gap-2">
              <Button
                onClick={() => {
                  if (!bulkBody.trim()) {
                    toast.error("Add message copy before sending.");
                    return;
                  }
                  toast.success(`Bulk SMS queued to ${bulkList}`, {
                    description: "US numbers only — non-US contacts were skipped.",
                  });
                }}
              >
                <Megaphone className="size-4" /> Queue bulk send
              </Button>
              <ActionButton variant="outline">Send test to me</ActionButton>
              <ActionButton variant="outline">Save as draft</ActionButton>
            </div>
          </Panel>

          <Panel title="SMS campaigns" description="Bulk sends this month" bodyClassName="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Campaign</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>List</TableHead>
                    <TableHead className="text-right">Sent</TableHead>
                    <TableHead className="text-right">Delivered</TableHead>
                    <TableHead className="text-right">Replies</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {smsCampaigns.map((c) => (
                    <TableRow key={c.id}>
                      <TableCell className="font-semibold">{c.name}</TableCell>
                      <TableCell>
                        <StatusPill status={c.status} />
                      </TableCell>
                      <TableCell className="text-muted-foreground">{c.list}</TableCell>
                      <TableCell className="text-right font-mono text-sm">
                        {c.sent.toLocaleString()}
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm">
                        {c.delivered.toLocaleString()}
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm">{c.replies}</TableCell>
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
        </TabsContent>
      </Tabs>
    </Shell>
  );
}
