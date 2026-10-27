import { useNavigate } from "@tanstack/react-router";
import { Bell } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { getSessionUser } from "@/lib/auth-api";
import { listNotifications, markNotificationsRead, type NotificationRow } from "@/lib/team-api";

const POLL_MS = 30_000;

function when(iso: string): string {
  return new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

/** Where a notification should take the person, depending on who they are. */
function destination(n: NotificationRow, isAgent: boolean): string | null {
  const link = n.link ?? "";
  if (link === "tasks" || link === "team-tasks") return isAgent ? "/agent" : "/team";
  if (link.startsWith("messages")) return isAgent ? "/agent" : "/team";
  return null;
}

export function NotificationBell() {
  const navigate = useNavigate();
  const isAgent = getSessionUser()?.role === "agent";
  const [items, setItems] = useState<NotificationRow[]>([]);
  const [unread, setUnread] = useState(0);
  const [open, setOpen] = useState(false);
  const [reading, setReading] = useState<NotificationRow | null>(null);
  const seen = useRef<Set<string> | null>(null);

  const poll = useCallback(async () => {
    try {
      const r = await listNotifications(30);
      const known = seen.current;
      if (known) {
        const fresh = r.notifications.filter((n) => !n.read_at && !known.has(n.id));
        fresh.slice(0, 2).forEach((n) => toast(n.title, n.body ? { description: n.body.slice(0, 120) } : {}));
      }
      seen.current = new Set(r.notifications.map((n) => n.id));
      setItems(r.notifications);
      setUnread(r.unread);
    } catch {
      // Signed out, or offline: try again on the next tick.
    }
  }, []);

  useEffect(() => {
    void poll();
    const t = setInterval(() => void poll(), POLL_MS);
    return () => clearInterval(t);
  }, [poll]);

  async function markAll() {
    await markNotificationsRead({ all: true }).catch(() => undefined);
    void poll();
  }

  async function activate(n: NotificationRow) {
    await markNotificationsRead({ ids: [n.id] }).catch(() => undefined);
    setOpen(false);
    if (n.kind === "announcement") setReading(n);
    else {
      const to = destination(n, isAgent);
      if (to) void navigate({ to });
    }
    void poll();
  }

  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button variant="ghost" size="icon" aria-label="Notifications" className="relative">
            <Bell className="size-5" />
            {unread > 0 && (
              <span className="absolute -right-0.5 -top-0.5 flex min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold leading-4 text-primary-foreground">
                {unread > 99 ? "99+" : unread}
              </span>
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-96 max-w-[calc(100vw-1.5rem)] p-0">
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <p className="text-sm font-bold">Notifications</p>
            <Button variant="ghost" size="sm" onClick={() => void markAll()} disabled={unread === 0}>
              Mark all read
            </Button>
          </div>
          <div className="max-h-96 overflow-y-auto">
            {items.length === 0 ? (
              <p className="p-6 text-center text-sm text-muted-foreground">Nothing yet.</p>
            ) : (
              items.map((n) => (
                <button
                  key={n.id}
                  type="button"
                  onClick={() => void activate(n)}
                  className={cn(
                    "flex w-full flex-col gap-0.5 border-b border-border px-4 py-3 text-left transition-colors hover:bg-muted/50",
                    !n.read_at && "bg-primary/8",
                  )}
                >
                  <span className="text-[10px] font-bold uppercase tracking-wide text-primary">
                    {n.kind === "announcement" ? "Update" : n.kind}
                  </span>
                  <span className="text-sm font-semibold">{n.title}</span>
                  {n.body && <span className="line-clamp-2 whitespace-pre-line text-xs text-muted-foreground">{n.body}</span>}
                  <span className="text-[11px] text-muted-foreground">{when(n.created_at)}</span>
                </button>
              ))
            )}
          </div>
        </PopoverContent>
      </Popover>

      <Dialog open={!!reading} onOpenChange={(o) => !o && setReading(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{reading?.title}</DialogTitle>
            <DialogDescription>{reading ? when(reading.created_at) : ""}</DialogDescription>
          </DialogHeader>
          <p className="max-h-[50vh] overflow-y-auto whitespace-pre-wrap text-sm leading-relaxed">{reading?.body}</p>
          <DialogFooter>
            {reading?.link && /^https?:\/\//.test(reading.link) && (
              <Button asChild>
                <a href={reading.link} target="_blank" rel="noopener noreferrer">
                  Open link
                </a>
              </Button>
            )}
            <Button variant="outline" onClick={() => setReading(null)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
