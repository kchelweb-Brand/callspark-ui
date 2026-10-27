import { createFileRoute } from "@tanstack/react-router";
import { Loader2, Save } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

import { Shell } from "@/components/dash/Shell";
import { Panel, StatusPill } from "@/components/dash/bits";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  getAutomationsFn,
  listAutoTextsFn,
  saveAutomationsFn,
  type Automations,
  type AutoTextRow,
} from "@/backend/automation.server";
import { getNumberHealthFn, restNumberFn } from "@/backend/reputation.server";
import { getSessionToken } from "@/lib/auth-api";

export const Route = createFileRoute("/automations")({
  head: () => ({
    meta: [
      { title: "Automations — Kchel Dialer" },
      {
        name: "description",
        content:
          "Missed-call text-back, an AI receptionist and number rotation, plus the health of each of your numbers.",
      },
      { property: "og:title", content: "Automations — Kchel Dialer" },
      {
        property: "og:description",
        content: "Never lose a lead to a missed call, and keep your numbers out of the spam folder.",
      },
    ],
  }),
  component: AutomationsPage,
});

type Features = {
  powerDialer: boolean;
  numberHealth: boolean;
  numberRotation: boolean;
  missedCallTextBack: boolean;
  callSummaries: boolean;
  aiReceptionist: boolean;
};

type NumberRow = Awaited<ReturnType<typeof getNumberHealthFn>>["numbers"][number];
type AutoText = AutoTextRow;

const UNLOCK = { missedCallTextBack: "Starter", numberRotation: "Professional", aiReceptionist: "Business" } as const;

function token(): string {
  const t = getSessionToken();
  if (!t) throw new Error("Not signed in.");
  return t;
}

function pct(v: number | null): string {
  return v === null ? "—" : `${Math.round(v * 100)}%`;
}

function AutomationsPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [features, setFeatures] = useState<Features | null>(null);
  const [planName, setPlanName] = useState("");
  const [auto, setAuto] = useState<Automations | null>(null);
  const [texts, setTexts] = useState<AutoText[]>([]);
  const [numbers, setNumbers] = useState<NumberRow[]>([]);
  const [dailyCap, setDailyCap] = useState(100);
  const [canRotate, setCanRotate] = useState(false);
  const [healthError, setHealthError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [a, t] = await Promise.all([
        getAutomationsFn({ data: { token: token() } }),
        listAutoTextsFn({ data: { token: token() } }),
      ]);
      setAuto(a.automations);
      setFeatures(a.features);
      setPlanName(a.planName);
      setTexts(t.texts);
      try {
        const h = await getNumberHealthFn({ data: { token: token() } });
        setNumbers(h.numbers);
        setDailyCap(h.dailyCap);
        setCanRotate(h.canRotate);
        setHealthError(null);
      } catch (err) {
        setHealthError(err instanceof Error ? err.message : "Number health isn't available.");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load your automations.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function save() {
    if (!auto) return;
    setSaving(true);
    try {
      const r = await saveAutomationsFn({ data: { token: token(), automations: auto } });
      setAuto(r.automations);
      toast.success("Automations saved");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save.");
    } finally {
      setSaving(false);
    }
  }

  async function rest(id: string, resume: boolean) {
    try {
      await restNumberFn({ data: { token: token(), id, ...(resume ? { resume: true } : { days: 3 }) } });
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not update that number.");
    }
  }

  if (loading || !auto || !features) {
    return (
      <Shell scope="tenant" title="Automations" description="Loading…">
        <p className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
          {error ? <span className="text-destructive">{error}</span> : <><Loader2 className="size-4 animate-spin" /> Loading…</>}
        </p>
      </Shell>
    );
  }

  const locked = (key: keyof typeof UNLOCK) =>
    features[key] ? null : (
      <p className="rounded-lg bg-warning/15 px-3 py-2 text-xs text-warning-foreground">
        Included from the {UNLOCK[key]} plan (you're on {planName}). Upgrade in Billing to switch this on.
      </p>
    );

  return (
    <Shell
      scope="tenant"
      title="Automations"
      description="Things that happen on their own, so no call or lead slips away."
      actions={
        <Button disabled={saving} onClick={() => void save()}>
          {saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
          Save changes
        </Button>
      }
    >
      <Panel
        title="Missed-call text-back"
        description="When a call isn't answered, text the caller straight away so the lead doesn't go cold."
        actions={
          <Switch
            checked={auto.missedCallTextBack.enabled}
            disabled={!features.missedCallTextBack}
            onCheckedChange={(on) =>
              setAuto({ ...auto, missedCallTextBack: { ...auto.missedCallTextBack, enabled: on } })
            }
          />
        }
      >
        <div className="flex flex-col gap-3">
          {locked("missedCallTextBack")}
          <Label htmlFor="tb-msg">Message</Label>
          <Textarea
            id="tb-msg"
            rows={3}
            maxLength={320}
            disabled={!features.missedCallTextBack}
            value={auto.missedCallTextBack.message}
            onChange={(e) =>
              setAuto({ ...auto, missedCallTextBack: { ...auto.missedCallTextBack, message: e.target.value } })
            }
          />
          <p className="text-xs text-muted-foreground">
            Use {"{business}"} for your workspace name. One text per caller every 6 hours, never to contacts marked
            do-not-call, sent from the number they called.
          </p>
        </div>
      </Panel>

      <Panel
        title="AI receptionist"
        description="An automated assistant answers when nobody can, finds out who is calling and why, and takes a message. You get a written summary on the call."
        actions={
          <Switch
            checked={auto.aiReceptionist.enabled}
            disabled={!features.aiReceptionist}
            onCheckedChange={(on) =>
              setAuto({ ...auto, aiReceptionist: { ...auto.aiReceptionist, enabled: on } })
            }
          />
        }
      >
        <div className="flex flex-col gap-4">
          {locked("aiReceptionist")}
          <div className="flex flex-col gap-2">
            <Label>When should it answer?</Label>
            <Select
              value={auto.aiReceptionist.mode}
              disabled={!features.aiReceptionist}
              onValueChange={(mode) =>
                setAuto({ ...auto, aiReceptionist: { ...auto.aiReceptionist, mode: mode as Automations["aiReceptionist"]["mode"] } })
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="after_hours">Only when you're closed</SelectItem>
                <SelectItem value="unanswered">When you're closed or nobody picks up</SelectItem>
                <SelectItem value="always">Every call (front desk)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="ai-name">Business name</Label>
            <Input
              id="ai-name"
              disabled={!features.aiReceptionist}
              value={auto.aiReceptionist.businessName}
              onChange={(e) => setAuto({ ...auto, aiReceptionist: { ...auto.aiReceptionist, businessName: e.target.value } })}
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="ai-about">What should it know about your business?</Label>
            <Textarea
              id="ai-about"
              rows={5}
              maxLength={1500}
              placeholder="Hours, services, prices you're happy to share, address, how to book…"
              disabled={!features.aiReceptionist}
              value={auto.aiReceptionist.about}
              onChange={(e) => setAuto({ ...auto, aiReceptionist: { ...auto.aiReceptionist, about: e.target.value } })}
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="ai-urgent">Urgent line (optional)</Label>
            <Input
              id="ai-urgent"
              placeholder="+14155550134"
              disabled={!features.aiReceptionist}
              value={auto.aiReceptionist.transferNumber}
              onChange={(e) => setAuto({ ...auto, aiReceptionist: { ...auto.aiReceptionist, transferNumber: e.target.value } })}
            />
          </div>
          <p className="text-xs text-muted-foreground">
            It always says it is an automated assistant, only answers from the description above, and never asks
            for card numbers or passwords. If you set an urgent line, it tells callers to use that number for
            emergencies.
          </p>
        </div>
      </Panel>

      <Panel
        title="Number rotation"
        description="Spreads automated outbound calls across your numbers, caps each one per day, and rests numbers whose answer rate collapses."
        actions={
          <Switch
            checked={auto.numberRotation.enabled}
            disabled={!features.numberRotation}
            onCheckedChange={(on) => setAuto({ ...auto, numberRotation: { ...auto.numberRotation, enabled: on } })}
          />
        }
      >
        <div className="flex flex-col gap-3">
          {locked("numberRotation")}
          <Label htmlFor="nr-cap">Calls per number per day</Label>
          <Input
            id="nr-cap"
            type="number"
            min={10}
            max={1000}
            className="max-w-40"
            disabled={!features.numberRotation}
            value={auto.numberRotation.dailyCap}
            onChange={(e) => setAuto({ ...auto, numberRotation: { ...auto.numberRotation, dailyCap: Number(e.target.value) } })}
          />
          <p className="text-xs text-muted-foreground">
            Around 75–150 a day per number is the usual guidance. Rotation applies to AI campaign calls. Calls from
            the desktop softphone go out on the caller ID your SIP trunk sets.
          </p>
        </div>
      </Panel>

      <Panel
        title="Number health"
        description="Scores come from your own call results over the last 7 days: answer rate, answered calls that end within seconds, failures and daily volume. They are not a lookup against carrier spam databases, so they can't show a label a carrier has already applied."
        bodyClassName="p-0"
      >
        {healthError ? (
          <p className="p-5 text-sm text-muted-foreground">{healthError}</p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Number</TableHead>
                  <TableHead>Health</TableHead>
                  <TableHead>Answer rate</TableHead>
                  <TableHead>Today</TableHead>
                  <TableHead>What to do</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {numbers.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} className="py-10 text-center text-sm text-muted-foreground">
                      No numbers yet. Add one under Phone System.
                    </TableCell>
                  </TableRow>
                )}
                {numbers.map((n) => (
                  <TableRow key={n.id}>
                    <TableCell className="font-mono text-sm">{n.number}</TableCell>
                    <TableCell>
                      <StatusPill status={n.status === "Healthy" ? "Active" : n.status === "At risk" ? "Failed" : n.status === "Watch" ? "Warning" : n.status === "Resting" ? "Paused" : "Trial"} />
                      <span className="ml-2 text-xs text-muted-foreground">
                        {n.status}
                        {n.score === null ? "" : ` · ${n.score}`}
                      </span>
                    </TableCell>
                    <TableCell>{pct(n.answer_rate)}</TableCell>
                    <TableCell className={n.over_cap ? "font-semibold text-destructive" : ""}>
                      {n.calls_today} / {dailyCap}
                    </TableCell>
                    <TableCell className="max-w-72 text-xs text-muted-foreground">{n.advice}</TableCell>
                    <TableCell className="text-right">
                      {canRotate &&
                        (n.status === "Resting" ? (
                          <Button size="sm" variant="outline" onClick={() => void rest(n.id, true)}>
                            Resume
                          </Button>
                        ) : (
                          <Button size="sm" variant="outline" onClick={() => void rest(n.id, false)}>
                            Rest 3 days
                          </Button>
                        ))}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </Panel>

      <Panel title="Recent text-backs" bodyClassName="p-0">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>To</TableHead>
                <TableHead>Message</TableHead>
                <TableHead>Result</TableHead>
                <TableHead>When</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {texts.length === 0 && (
                <TableRow>
                  <TableCell colSpan={4} className="py-10 text-center text-sm text-muted-foreground">
                    No text-backs sent yet.
                  </TableCell>
                </TableRow>
              )}
              {texts.map((t) => (
                <TableRow key={t.id}>
                  <TableCell className="font-mono text-sm">{t.to_number}</TableCell>
                  <TableCell className="max-w-96 truncate text-sm">{t.body}</TableCell>
                  <TableCell title={t.error ?? ""}>
                    <StatusPill status={t.status === "sent" ? "Active" : "Failed"} />
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-muted-foreground">
                    {new Date(t.created_at).toLocaleString(undefined, {
                      month: "short",
                      day: "numeric",
                      hour: "numeric",
                      minute: "2-digit",
                    })}
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
