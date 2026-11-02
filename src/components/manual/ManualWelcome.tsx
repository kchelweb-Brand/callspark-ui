// The welcome pop-up on Overview: offers the manual once per sign-in, and is easy to close.
//
// "Once per sign-in" means once per session token: the token changes every time someone signs in,
// so a reload inside the same sign-in stays quiet while the next sign-in shows it again. People who
// do not want it can switch it off for good with the tick box.
import { ArrowRight, BookOpen, X } from "lucide-react";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { getSessionToken } from "@/lib/auth-api";
import { SLink } from "@/site/blocks";
import { articlePath, getArticle } from "@/manual";

const SEEN_KEY = "kchel-manual-welcome-seen";
const OFF_KEY = "kchel-manual-welcome-off";

const PICKS = ["start-here", "sip-where-to-get", "sip-setup", "import-contacts", "first-campaign"];

function signInId(): string | null {
  try {
    const token = getSessionToken();
    return token ? token.slice(-24) : null;
  } catch {
    return null;
  }
}

function shouldShow(): boolean {
  try {
    const id = signInId();
    if (!id) return false;
    if (window.localStorage.getItem(OFF_KEY) === "1") return false;
    return window.sessionStorage.getItem(SEEN_KEY) !== id;
  } catch {
    return false;
  }
}

export function ManualWelcome() {
  const [open, setOpen] = useState(false);
  const [dontShow, setDontShow] = useState(false);

  useEffect(() => {
    if (shouldShow()) setOpen(true);
  }, []);

  function close() {
    setOpen(false);
    try {
      const id = signInId();
      if (id) window.sessionStorage.setItem(SEEN_KEY, id);
      if (dontShow) window.localStorage.setItem(OFF_KEY, "1");
    } catch {
      // Storage can be blocked; the pop-up then simply shows again next time.
    }
  }

  const picks = PICKS.map((s) => getArticle(s)).filter((a): a is NonNullable<typeof a> => Boolean(a));

  return (
    <Dialog open={open} onOpenChange={(o) => (o ? setOpen(true) : close())}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <div className="mb-1 flex size-11 items-center justify-center rounded-full bg-primary/10 text-primary">
            <BookOpen className="size-5" />
          </div>
          <DialogTitle>Welcome to Kchel Dialer</DialogTitle>
          <DialogDescription>
            The manual walks you through everything with screenshots, from connecting your phone line to expert settings. Read it now, or close this and come back any time from <strong>Manual</strong> in the left menu.
          </DialogDescription>
        </DialogHeader>

        <ul className="flex flex-col gap-1">
          {picks.map((a) => (
            <li key={a.slug}>
              <SLink
                to={articlePath(a.slug)}
                onClick={close}
                className="flex items-start gap-3 rounded-lg border border-border p-3 text-left transition-colors hover:border-primary/50 hover:bg-muted/40"
              >
                <ArrowRight className="mt-0.5 size-4 shrink-0 text-primary" />
                <span className="min-w-0">
                  <span className="block text-sm font-semibold">{a.title}</span>
                  <span className="block text-xs text-muted-foreground">{a.time}</span>
                </span>
              </SLink>
            </li>
          ))}
        </ul>

        <label className="flex cursor-pointer items-center gap-2 text-xs text-muted-foreground">
          <input type="checkbox" checked={dontShow} onChange={(e) => setDontShow(e.target.checked)} className="size-4 accent-[var(--primary)]" />
          Do not show this when I sign in
        </label>

        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="outline" onClick={close}>
            <X className="size-4" /> Close
          </Button>
          <Button asChild>
            <SLink to="/manual" onClick={close}>
              <BookOpen className="size-4" /> Open the manual
            </SLink>
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
