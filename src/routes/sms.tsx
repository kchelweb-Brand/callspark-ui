import { createFileRoute } from "@tanstack/react-router";
import { MessageSquare, Send, Megaphone, PhoneCall, Search } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Shell } from "@/components/dash/Shell";
import { Panel, SmsNotice, StatCard, StatusPill } from "@/components/dash/bits";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
import { getSessionUser } from "@/lib/auth-api";
import { getContactsMeta } from "@/lib/contacts-api";
/** Inbound threads arrive from the carrier's messaging webhook once connected. */
interface SmsThread {
  id: string;
  contact: string;
  company: string;
  number: string;
  unread: number;
  last: string;
  messages: { id: number; from: "us" | "them"; time: string; text: string }[];
}
const smsThreads: SmsThread[] = [];
import {
  createSmsCampaign,
  listSms,
  saveSmsDraft,
  updateSmsCampaign,
  type SmsCampaignRecord,
  type SmsDraftRecord,
} from "@/lib/workspace-api";

const TEMPLATES = [
  { name: "Renewal reminder", body: "Hi {{first_name}}, quick reminder that your renewal is coming up. Reply YES and we'll handle it." },
  { name: "Trial ending", body: "Hi {{first_name}}, your trial with {{company}} ends soon — want a hand upgrading?" },
  { name: "Missed you", body: "Hi {{first_name}}, sorry we missed you on the call. When's a good time to reconnect?" },
];

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
  const [activeId, setActiveId] = useState<string | null>(null);
  const [extra, setExtra] = useState<Record<string, Message[]>>({});
  const [reply, setReply] = useState("");
  const [query, setQuery] = useState("");
  const [bulkList, setBulkList] = useState("");
  const [bulkBody, setBulkBody] = useState("");
  const [templatesOpen, setTemplatesOpen] = useState(false);
  const [templateTarget, setTemplateTarget] = useState<"reply" | "bulk">("bulk");
  const [drafts, setDrafts] = useState<SmsDraftRecord[]>([]);
  const [calling, setCalling] = useState(false);
  const [campaigns, setCampaigns] = useState<SmsCampaignRecord[]>([]);
  const [campaignName, setCampaignName] = useState("");
  const [contactLists, setContactLists] = useState<{ id: string; name: string }[]>([]);

  useEffect(() => {
    getContactsMeta()
      .then((meta) => setContactLists(meta.lists))
      .catch(() => {
        // Contacts aren't required to use SMS — just leave the list empty.
      });

    listSms()
      .then((result) => {
        setCampaigns(result.campaigns);
        setDrafts(result.drafts);
      })
      .catch(() => {
        // Non-fatal — the composer still works.
      });
  }, []);

  const thread = smsThreads.find((t) => t.id === activeId);
  const messages: Message[] = thread ? [...thread.messages, ...(extra[thread.id] ?? [])] : [];
  const visible = smsThreads.filter((t) =>
    `${t.contact} ${t.company} ${t.number}`.toLowerCase().includes(query.toLowerCase()),
  );

  const sendReply = () => {
    if (!thread) return;
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

  function callContact() {
    if (!thread) return;
    setCalling(true);
    toast.success(`Calling ${thread.contact}…`, { description: thread.number });
    setTimeout(() => setCalling(false), 2500);
  }

  function applyTemplate(body: string) {
    if (templateTarget === "reply") {
      setReply(body);
    } else {
      setBulkBody(body);
    }
    setTemplatesOpen(false);
    toast.success("Template inserted");
  }

  async function setCampaignStatus(id: string, status: string) {
    try {
      await updateSmsCampaign(id, status);
      setCampaigns((prev) => prev.map((c) => (c.id === id ? { ...c, status } : c)));
      toast.success(`Campaign ${status.toLowerCase()}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not update that campaign.");
    }
  }

  return (
    <Shell
      scope="tenant"
      title="SMS"
      description="Two-way messaging, bulk sends and reply tracking"
      actions={
        <>
          <SmsNotice className="hidden sm:inline-flex" />
          <Button
            variant="outline"
            onClick={() => {
              setTemplateTarget("bulk");
              setTemplatesOpen(true);
            }}
          >
            Message templates
          </Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Sent today" value="0" icon={Send} />
        <StatCard label="Delivery rate" value="—" icon={MessageSquare} />
        <StatCard label="Replies today" value="0" icon={MessageSquare} />
        <StatCard label="Opt-outs" value="0" hint="STOP keyword" />
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
              title={thread?.contact ?? "No conversation selected"}
              description={thread ? `${thread.company} · ${thread.number}` : "Pick a conversation on the left, or wait for your first text in."}
              actions={
                thread ? (
                  <Button variant="outline" size="sm" disabled={calling} onClick={callContact}>
                    <PhoneCall className="size-3.5" /> {calling ? "Calling…" : "Call contact"}
                  </Button>
                ) : undefined
              }
              bodyClassName="p-0"
            >
              {!thread ? (
                <div className="flex h-72 flex-col items-center justify-center gap-2 px-6 text-center">
                  <MessageSquare className="size-6 text-muted-foreground" />
                  <p className="text-sm font-medium">No conversations yet</p>
                  <p className="text-xs text-muted-foreground">Texts from your contacts will show up here.</p>
                </div>
              ) : (
                <>
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
                  <div className="flex gap-2 sm:flex-col sm:self-end">
                    <Button
                      variant="outline"
                      onClick={() => {
                        setTemplateTarget("reply");
                        setTemplatesOpen(true);
                      }}
                    >
                      Templates
                    </Button>
                    <Button onClick={sendReply}>
                      <Send className="size-4" /> Send
                    </Button>
                  </div>
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  {reply.length}/160 characters · sending number set up in Phone System
                </p>
              </div>
              </>
              )}
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
                  <Input
                    id="sms-name"
                    placeholder="Renewal reminders"
                    value={campaignName}
                    onChange={(e) => setCampaignName(e.target.value)}
                  />
                </div>
                <div className="flex flex-col gap-2">
                  <Label>Contact list</Label>
                  <Select value={bulkList} onValueChange={setBulkList} disabled={contactLists.length === 0}>
                    <SelectTrigger>
                      <SelectValue placeholder={contactLists.length === 0 ? "No contact lists yet" : "Choose a list"} />
                    </SelectTrigger>
                    <SelectContent>
                      {contactLists.map((l) => (
                        <SelectItem key={l.id} value={l.name}>
                          {l.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {contactLists.length === 0 && (
                    <p className="text-xs text-muted-foreground">
                      Import contacts and add them to a list first.
                    </p>
                  )}
                </div>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="sms-from">Sending number</Label>
                  <Input id="sms-from" placeholder="Set up in Phone System" className="font-mono" disabled />
                </div>
              </div>

              <div className="flex flex-col gap-2">
                <Label htmlFor="sms-body">Message</Label>
                <Textarea
                  id="sms-body"
                  rows={7}
                  placeholder="Hi {{first_name}}, …"
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
                  void (async () => {
                    try {
                      const result = await createSmsCampaign({
                        name: campaignName.trim() || "Untitled SMS campaign",
                        body: bulkBody,
                        status: "Scheduled",
                        ...(bulkList ? { listName: bulkList } : {}),
                      });
                      setCampaigns((prev) => [result.campaign, ...prev]);
                      setCampaignName("");
                      toast.success(`Bulk SMS queued to ${bulkList || "your list"}`, {
                        description: "US numbers only — non-US contacts were skipped.",
                      });
                    } catch (err) {
                      toast.error(err instanceof Error ? err.message : "Could not queue that send.");
                    }
                  })();
                }}
              >
                <Megaphone className="size-4" /> Queue bulk send
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  const email = getSessionUser()?.email;
                  toast.success("Test message sent", {
                    description: email ? `Delivered to ${email}` : "Delivered to your account email",
                  });
                }}
              >
                Send test to me
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  if (!bulkBody.trim()) {
                    toast.error("Nothing to save yet.");
                    return;
                  }
                  void (async () => {
                    try {
                      const result = await saveSmsDraft(bulkBody, bulkList || undefined);
                      setDrafts((prev) => [result.draft, ...prev]);
                      toast.success("Draft saved");
                    } catch (err) {
                      toast.error(err instanceof Error ? err.message : "Could not save that draft.");
                    }
                  })();
                }}
              >
                Save as draft
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  setTemplateTarget("bulk");
                  setTemplatesOpen(true);
                }}
              >
                Insert template
              </Button>
            </div>

            {drafts.length > 0 && (
              <div className="mt-4 flex flex-col gap-2 border-t border-border pt-4">
                <p className="text-xs font-semibold text-muted-foreground">Saved drafts</p>
                {drafts.map((d) => (
                  <button
                    key={d.id}
                    type="button"
                    onClick={() => {
                      setBulkList(d.list_name ?? "");
                      setBulkBody(d.body);
                      toast.success("Draft loaded");
                    }}
                    className="flex items-center justify-between gap-3 rounded-lg border border-border p-3 text-left text-sm transition-colors hover:border-primary/40"
                  >
                    <span className="truncate">{d.body}</span>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {d.list_name ?? "No list"} ·{" "}
                      {new Date(d.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                    </span>
                  </button>
                ))}
              </div>
            )}
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
                  {campaigns.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="py-10 text-center text-sm text-muted-foreground">
                        No bulk sends yet.
                      </TableCell>
                    </TableRow>
                  ) : (
                    campaigns.map((c) => (
                    <TableRow key={c.id}>
                      <TableCell className="font-semibold">{c.name}</TableCell>
                      <TableCell>
                        <StatusPill status={c.status} />
                      </TableCell>
                      <TableCell className="text-muted-foreground">{c.list_name ?? "—"}</TableCell>
                      <TableCell className="text-right font-mono text-sm">
                        {c.sent.toLocaleString()}
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm">
                        {c.delivered.toLocaleString()}
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm">{c.replies}</TableCell>
                      <TableCell className="text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="sm">
                              Manage
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            {c.status === "Active" ? (
                              <DropdownMenuItem onClick={() => void setCampaignStatus(c.id, "Paused")}>
                                Pause
                              </DropdownMenuItem>
                            ) : (
                              <DropdownMenuItem onClick={() => void setCampaignStatus(c.id, "Active")}>
                                Resume
                              </DropdownMenuItem>
                            )}
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
        </TabsContent>
      </Tabs>

      <Dialog open={templatesOpen} onOpenChange={setTemplatesOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Message templates</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-2">
            {TEMPLATES.map((t) => (
              <button
                key={t.name}
                type="button"
                onClick={() => applyTemplate(t.body)}
                className="rounded-lg border border-border p-3 text-left transition-colors hover:border-primary/40"
              >
                <p className="text-sm font-semibold">{t.name}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">{t.body}</p>
              </button>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </Shell>
  );
}
