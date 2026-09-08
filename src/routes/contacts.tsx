import { createFileRoute } from "@tanstack/react-router";
import { Search, Upload, Loader2, Phone, Plus, Trash2, RefreshCw, FileWarning } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { Shell } from "@/components/dash/Shell";
import { ActionButton, Panel } from "@/components/dash/bits";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  listContacts,
  getContactsMeta,
  createContact,
  importContacts,
  deleteContacts,
  type Contact,
  type ContactList,
} from "@/lib/contacts-api";
import { csvToContacts, type ParsedContactRow } from "@/lib/csv";
import { useSoftphoneContext } from "@/components/dash/SoftphoneProvider";

export const Route = createFileRoute("/contacts")({
  head: () => ({
    meta: [
      { title: "Contacts — Kchel Dialer" },
      {
        name: "description",
        content: "Search, tag and import contact lists via CSV for your outbound calling campaigns.",
      },
      { property: "og:title", content: "Contacts — Kchel Dialer" },
      {
        property: "og:description",
        content: "Import CSV lists, tag contacts and filter your calling database.",
      },
    ],
  }),
  component: ContactsPage,
});

const PAGE_SIZE = 50;

function formatPhone(e164: string) {
  const m = /^\+1(\d{3})(\d{3})(\d{4})$/.exec(e164);
  return m ? `+1 (${m[1]}) ${m[2]}-${m[3]}` : e164;
}

function formatWhen(iso: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  const days = Math.floor((Date.now() - d.getTime()) / 86_400_000);
  if (days === 0) return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days} days ago`;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function ContactsPage() {
  const { state: phoneState, dial } = useSoftphoneContext();
  const canCall = phoneState.status === "ready" && phoneState.call === "idle";

  const [contacts, setContacts] = useState<Contact[]>([]);
  const [lists, setLists] = useState<ContactList[]>([]);
  const [tags, setTags] = useState<string[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [activeList, setActiveList] = useState<string | null>(null);
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const [addOpen, setAddOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const [form, setForm] = useState({
    company: "",
    person: "",
    phone: "",
    email: "",
    listName: "",
    tags: "",
  });

  const [pending, setPending] = useState<{
    rows: ParsedContactRow[];
    fileName: string;
    skipped: number;
    listName: string;
  } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params: Parameters<typeof listContacts>[0] = { page, pageSize: PAGE_SIZE };
      if (search.trim()) params.search = search.trim();
      if (activeList) params.listId = activeList;
      if (activeTag) params.tag = activeTag;

      const result = await listContacts(params);
      setContacts(result.contacts);
      setTotal(result.total);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load contacts.");
    } finally {
      setLoading(false);
    }
  }, [page, search, activeList, activeTag]);

  const loadMeta = useCallback(async () => {
    try {
      const meta = await getContactsMeta();
      setLists(meta.lists);
      setTags(meta.tags);
    } catch {
      // Filters are a nice-to-have; a failure here shouldn't block the table.
    }
  }, []);

  // Debounce so typing in search doesn't fire a request per keystroke.
  useEffect(() => {
    const timer = setTimeout(() => void load(), 300);
    return () => clearTimeout(timer);
  }, [load]);

  useEffect(() => {
    void loadMeta();
  }, [loadMeta]);

  async function handleAdd() {
    if (!form.phone.trim()) {
      toast.error("A phone number is required.");
      return;
    }
    setBusy(true);
    try {
      const payload: Parameters<typeof createContact>[0] = { phone: form.phone.trim() };
      if (form.company.trim()) payload.company = form.company.trim();
      if (form.person.trim()) payload.person = form.person.trim();
      if (form.email.trim()) payload.email = form.email.trim();
      if (form.listName.trim()) payload.listName = form.listName.trim();
      const parsedTags = form.tags
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean);
      if (parsedTags.length) payload.tags = parsedTags;

      await createContact(payload);
      toast.success("Contact added");
      setAddOpen(false);
      setForm({ company: "", person: "", phone: "", email: "", listName: "", tags: "" });
      await Promise.all([load(), loadMeta()]);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not add that contact.");
    } finally {
      setBusy(false);
    }
  }

  function handleFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      const { rows, skippedNoPhone } = csvToContacts(String(reader.result || ""));
      if (rows.length === 0) {
        toast.error("No usable rows found", {
          description: "Make sure your file has a phone number column.",
        });
        return;
      }
      setPending({
        rows,
        fileName: file.name,
        skipped: skippedNoPhone,
        listName: file.name.replace(/\.csv$/i, ""),
      });
      setImportOpen(true);
    };
    reader.readAsText(file);
    event.target.value = "";
  }

  async function handleImport() {
    if (!pending) return;
    setBusy(true);
    try {
      const result = await importContacts(pending.rows, pending.listName.trim() || undefined);
      toast.success(`${result.imported} contacts imported`, {
        description: [
          result.duplicates ? `${result.duplicates} already existed` : null,
          result.invalidCount ? `${result.invalidCount} had invalid numbers` : null,
        ]
          .filter(Boolean)
          .join(" · ") || undefined,
      });
      setImportOpen(false);
      setPending(null);
      setPage(1);
      await Promise.all([load(), loadMeta()]);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Import failed.");
    } finally {
      setBusy(false);
    }
  }

  async function handleDeleteSelected() {
    if (selected.size === 0) return;
    setBusy(true);
    try {
      const result = await deleteContacts([...selected]);
      toast.success(`${result.deleted} contact${result.deleted === 1 ? "" : "s"} deleted`);
      setSelected(new Set());
      await Promise.all([load(), loadMeta()]);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not delete those contacts.");
    } finally {
      setBusy(false);
    }
  }

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const allOnPageSelected = contacts.length > 0 && contacts.every((c) => selected.has(c.id));
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <Shell
      scope="tenant"
      title="Contacts"
      description={
        loading
          ? "Loading…"
          : `${total.toLocaleString()} contact${total === 1 ? "" : "s"}${
              lists.length ? ` across ${lists.length} list${lists.length === 1 ? "" : "s"}` : ""
            }`
      }
      actions={
        <>
          <input
            ref={fileRef}
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={handleFile}
          />
          <ActionButton variant="outline" onClick={() => setAddOpen(true)}>
            <Plus className="size-4" /> Add contact
          </ActionButton>
          <ActionButton onClick={() => fileRef.current?.click()}>
            <Upload className="size-4" /> Import CSV
          </ActionButton>
        </>
      }
    >
      <Panel bodyClassName="p-0">
        <div className="flex flex-wrap items-center gap-3 border-b border-border p-4">
          <div className="relative min-w-56 flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search name, company or number"
              className="pl-9"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
            />
          </div>
          <ActionButton variant="outline" onClick={() => void load()} disabled={loading}>
            <RefreshCw className={`size-4 ${loading ? "animate-spin" : ""}`} />
          </ActionButton>
          {selected.size > 0 && (
            <ActionButton variant="outline" disabled={busy} onClick={() => void handleDeleteSelected()}>
              <Trash2 className="size-4" /> Delete {selected.size}
            </ActionButton>
          )}
        </div>

        {(lists.length > 0 || tags.length > 0) && (
          <div className="flex flex-wrap gap-2 border-b border-border px-4 py-3">
            <button
              onClick={() => {
                setActiveList(null);
                setActiveTag(null);
                setPage(1);
              }}
              className={`rounded-full border px-2.5 py-0.5 text-xs font-medium transition ${
                !activeList && !activeTag
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border bg-muted text-muted-foreground hover:border-primary/40"
              }`}
            >
              All
            </button>
            {lists.map((l) => (
              <button
                key={l.id}
                onClick={() => {
                  setActiveList(activeList === l.id ? null : l.id);
                  setActiveTag(null);
                  setPage(1);
                }}
                className={`rounded-full border px-2.5 py-0.5 text-xs font-medium transition ${
                  activeList === l.id
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border bg-muted text-muted-foreground hover:border-primary/40"
                }`}
              >
                {l.name} · {l.contact_count}
              </button>
            ))}
            {tags.map((tag) => (
              <button
                key={tag}
                onClick={() => {
                  setActiveTag(activeTag === tag ? null : tag);
                  setActiveList(null);
                  setPage(1);
                }}
                className={`rounded-full border px-2.5 py-0.5 text-xs font-medium transition ${
                  activeTag === tag
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border bg-muted text-muted-foreground hover:border-primary/40"
                }`}
              >
                {tag}
              </button>
            ))}
          </div>
        )}

        {error ? (
          <div className="p-8 text-center">
            <p className="text-sm text-destructive">{error}</p>
            <ActionButton className="mt-4" onClick={() => void load()}>
              Try again
            </ActionButton>
          </div>
        ) : loading ? (
          <div className="flex items-center justify-center gap-2 p-12 text-muted-foreground">
            <Loader2 className="size-4 animate-spin" /> Loading contacts…
          </div>
        ) : contacts.length === 0 ? (
          <div className="p-12 text-center">
            <p className="text-sm font-medium">
              {search || activeList || activeTag ? "No contacts match this view." : "No contacts yet."}
            </p>
            {!search && !activeList && !activeTag && (
              <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
                Import a CSV to get started — we'll match your columns automatically.
              </p>
            )}
          </div>
        ) : (
          <>
            {/* Eight columns don't belong on a phone; the same rows render as
                cards below md, selection checkbox and all. */}
            <div className="hidden overflow-x-auto md:block">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10">
                      <Checkbox
                        aria-label="Select all"
                        checked={allOnPageSelected}
                        onCheckedChange={(checked) => {
                          setSelected((prev) => {
                            const next = new Set(prev);
                            contacts.forEach((c) =>
                              checked ? next.add(c.id) : next.delete(c.id)
                            );
                            return next;
                          });
                        }}
                      />
                    </TableHead>
                    <TableHead>Company</TableHead>
                    <TableHead>Contact</TableHead>
                    <TableHead>Number</TableHead>
                    <TableHead>Tags</TableHead>
                    <TableHead>List</TableHead>
                    <TableHead>Added</TableHead>
                    <TableHead className="text-right">Call</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {contacts.map((c) => (
                    <TableRow key={c.id}>
                      <TableCell>
                        <Checkbox
                          aria-label={`Select ${c.company || c.phone}`}
                          checked={selected.has(c.id)}
                          onCheckedChange={() => toggle(c.id)}
                        />
                      </TableCell>
                      <TableCell className="font-semibold">{c.company || "—"}</TableCell>
                      <TableCell>{c.person || "—"}</TableCell>
                      <TableCell className="font-mono text-sm">{formatPhone(c.phone)}</TableCell>
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
                          {c.do_not_sms && (
                            <span className="rounded-full border border-destructive/25 bg-destructive/10 px-2 py-0.5 text-[11px] font-semibold text-destructive">
                              No SMS
                            </span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-muted-foreground">{c.list_name || "—"}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {formatWhen(c.created_at)}
                      </TableCell>
                      <TableCell className="text-right">
                        <ActionButton
                          variant="ghost"
                          size="sm"
                          disabled={!canCall || c.do_not_call}
                          title={
                            c.do_not_call
                              ? "This contact is marked do-not-call"
                              : canCall
                                ? `Call ${formatPhone(c.phone)}`
                                : "Go online from Live Calls first"
                          }
                          onClick={() =>
                            void dial(c.phone, { contactId: c.id, label: c.company || c.person || c.phone })
                          }
                        >
                          <Phone className="size-3.5" />
                        </ActionButton>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            <ul className="divide-y divide-border md:hidden">
              {contacts.map((c) => (
                <li key={c.id} className="flex items-start gap-3 px-4 py-3.5">
                  <Checkbox
                    className="mt-1"
                    aria-label={`Select ${c.company || c.phone}`}
                    checked={selected.has(c.id)}
                    onCheckedChange={() => toggle(c.id)}
                  />

                  <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                    <p className="truncate font-semibold">{c.company || c.person || "—"}</p>
                    <p className="truncate font-mono text-xs text-muted-foreground">
                      {formatPhone(c.phone)}
                      {c.person && c.company ? ` · ${c.person}` : ""}
                    </p>

                    {(c.tags.length > 0 || c.do_not_sms) && (
                      <div className="flex flex-wrap gap-1">
                        {c.tags.map((tag) => (
                          <span
                            key={tag}
                            className="rounded-full border border-primary/25 bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-primary"
                          >
                            {tag}
                          </span>
                        ))}
                        {c.do_not_sms && (
                          <span className="rounded-full border border-destructive/25 bg-destructive/10 px-2 py-0.5 text-[11px] font-semibold text-destructive">
                            No SMS
                          </span>
                        )}
                      </div>
                    )}

                    {c.list_name && (
                      <p className="truncate text-xs text-muted-foreground">{c.list_name}</p>
                    )}
                  </div>

                  <ActionButton
                    variant="outline"
                    size="sm"
                    className="shrink-0"
                    disabled={!canCall || c.do_not_call}
                    title={
                      c.do_not_call
                        ? "This contact is marked do-not-call"
                        : canCall
                          ? `Call ${formatPhone(c.phone)}`
                          : "Go online from Live Calls first"
                    }
                    onClick={() =>
                      void dial(c.phone, { contactId: c.id, label: c.company || c.person || c.phone })
                    }
                  >
                    <Phone className="size-3.5" />
                  </ActionButton>
                </li>
              ))}
            </ul>

            {totalPages > 1 && (
              <div className="flex items-center justify-between border-t border-border px-4 py-3">
                <p className="text-sm text-muted-foreground">
                  Page {page} of {totalPages}
                </p>
                <div className="flex gap-2">
                  <ActionButton
                    variant="outline"
                    size="sm"
                    disabled={page === 1}
                    onClick={() => setPage((p) => p - 1)}
                  >
                    Previous
                  </ActionButton>
                  <ActionButton
                    variant="outline"
                    size="sm"
                    disabled={page >= totalPages}
                    onClick={() => setPage((p) => p + 1)}
                  >
                    Next
                  </ActionButton>
                </div>
              </div>
            )}
          </>
        )}
      </Panel>

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add contact</DialogTitle>
            <DialogDescription>
              Only a phone number is required — everything else is optional.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="c-phone">Phone number</Label>
              <Input
                id="c-phone"
                placeholder="+1 415 555 0134"
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
              />
              <p className="text-xs text-muted-foreground">
                10-digit numbers are treated as US.
              </p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-2">
                <Label htmlFor="c-company">Company</Label>
                <Input
                  id="c-company"
                  value={form.company}
                  onChange={(e) => setForm({ ...form, company: e.target.value })}
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="c-person">Contact name</Label>
                <Input
                  id="c-person"
                  value={form.person}
                  onChange={(e) => setForm({ ...form, person: e.target.value })}
                />
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-2">
                <Label htmlFor="c-list">List</Label>
                <Input
                  id="c-list"
                  placeholder="Q3 Renewals"
                  value={form.listName}
                  onChange={(e) => setForm({ ...form, listName: e.target.value })}
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="c-tags">Tags</Label>
                <Input
                  id="c-tags"
                  placeholder="Hot, Enterprise"
                  value={form.tags}
                  onChange={(e) => setForm({ ...form, tags: e.target.value })}
                />
              </div>
            </div>
          </div>

          <DialogFooter>
            <ActionButton variant="outline" onClick={() => setAddOpen(false)}>
              Cancel
            </ActionButton>
            <ActionButton disabled={busy} onClick={() => void handleAdd()}>
              {busy ? <Loader2 className="size-4 animate-spin" /> : null}
              Add contact
            </ActionButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={importOpen} onOpenChange={setImportOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Import contacts</DialogTitle>
            <DialogDescription>
              {pending
                ? `${pending.rows.length.toLocaleString()} row${
                    pending.rows.length === 1 ? "" : "s"
                  } ready from ${pending.fileName}`
                : ""}
            </DialogDescription>
          </DialogHeader>

          {pending && (
            <div className="flex flex-col gap-4">
              {pending.skipped > 0 && (
                <p className="flex items-start gap-2 rounded-md border border-warning/35 bg-warning/10 p-3 text-xs text-warning-foreground">
                  <FileWarning className="mt-0.5 size-3.5 shrink-0" />
                  {pending.skipped} row{pending.skipped === 1 ? "" : "s"} had no phone number and
                  will be skipped.
                </p>
              )}

              <div className="flex flex-col gap-2">
                <Label htmlFor="import-list">Add to list</Label>
                <Input
                  id="import-list"
                  value={pending.listName}
                  onChange={(e) => setPending({ ...pending, listName: e.target.value })}
                />
                <p className="text-xs text-muted-foreground">
                  Created if it doesn't exist. Duplicates are skipped automatically.
                </p>
              </div>

              <div className="rounded-md border border-border">
                <p className="border-b border-border px-3 py-2 text-xs font-semibold text-muted-foreground">
                  Preview
                </p>
                <div className="divide-y divide-border">
                  {pending.rows.slice(0, 3).map((r, i) => (
                    <div key={i} className="px-3 py-2 text-sm">
                      <span className="font-mono">{r.phone}</span>
                      {r.company ? (
                        <span className="text-muted-foreground"> · {r.company}</span>
                      ) : null}
                      {r.person ? <span className="text-muted-foreground"> · {r.person}</span> : null}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          <DialogFooter>
            <ActionButton variant="outline" onClick={() => setImportOpen(false)}>
              Cancel
            </ActionButton>
            <ActionButton disabled={busy} onClick={() => void handleImport()}>
              {busy ? <Loader2 className="size-4 animate-spin" /> : null}
              Import {pending?.rows.length.toLocaleString()} contacts
            </ActionButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Shell>
  );
}
