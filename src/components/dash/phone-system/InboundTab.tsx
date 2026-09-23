import {
  Check,
  Mailbox,
  MessageSquare,
  Phone,
  PhoneIncoming,
  Users,
  X,
} from "lucide-react";

import { Panel } from "@/components/dash/bits";
import { Button } from "@/components/ui/button";
import type {
  BusinessHoursConfig,
  Extension,
  IvrMenu,
  PhoneNumber,
  RoutingRule,
  VoicemailSettings,
} from "@/lib/phone-system-data";

interface CheckItem {
  done: boolean;
  label: string;
  detail: string;
}

/** "09:00"-"17:00" -> "9:00 AM – 5:00 PM". */
function formatRange(start: string, end: string): string {
  const fmt = (t: string) => {
    const [h, m] = t.split(":").map(Number);
    const period = h >= 12 ? "PM" : "AM";
    const hour12 = h % 12 === 0 ? 12 : h % 12;
    return m ? `${hour12}:${String(m).padStart(2, "0")} ${period}` : `${hour12} ${period}`;
  };
  return `${fmt(start)} – ${fmt(end)}`;
}

const DAY_ABBR: Record<string, string> = {
  Monday: "Mon",
  Tuesday: "Tue",
  Wednesday: "Wed",
  Thursday: "Thu",
  Friday: "Fri",
  Saturday: "Sat",
  Sunday: "Sun",
};

/** Groups consecutive open days that share the same hours, the way a real schedule reads. */
function summarizeHours(days: BusinessHoursConfig["days"]): string[] {
  const open = days.filter((d) => d.open);
  if (open.length === 0) return ["Closed every day — every call goes to your after-hours routing"];

  const groups: { start: string; end: string; names: string[] }[] = [];
  for (const d of days) {
    if (!d.open) continue;
    const last = groups[groups.length - 1];
    if (last && last.start === d.start && last.end === d.end) {
      last.names.push(DAY_ABBR[d.day] ?? d.day);
    } else {
      groups.push({ start: d.start, end: d.end, names: [DAY_ABBR[d.day] ?? d.day] });
    }
  }
  const lines = groups.map((g) => {
    const range = g.names.length > 1 ? `${g.names[0]}–${g.names[g.names.length - 1]}` : g.names[0];
    return `${range} · ${formatRange(g.start, g.end)}`;
  });

  const closedDays = days.filter((d) => !d.open).map((d) => DAY_ABBR[d.day] ?? d.day);
  if (closedDays.length) lines.push(`Closed ${closedDays.join(", ")}`);
  return lines;
}

export function InboundTab({
  numbers,
  menus,
  extensions,
  routing,
  voicemail,
  businessHours,
  onNavigate,
}: {
  numbers: PhoneNumber[];
  menus: IvrMenu[];
  extensions: Extension[];
  routing: RoutingRule;
  voicemail: VoicemailSettings;
  businessHours: BusinessHoursConfig;
  onNavigate: (tab: string) => void;
}) {
  const assigned = numbers.filter((n) => n.ivrMenuId);
  const reachableExtensions = extensions.filter((e) => e.forwardsTo.trim());
  const hasRouting = routing.ringOrder.length > 0;
  const hasVoicemailGreeting = Boolean(
    voicemail.greetingText.trim() || voicemail.greetingFile?.url,
  );
  const menuById = new Map(menus.map((m) => [m.id, m]));

  const checks: CheckItem[] = [
    {
      done: numbers.length > 0,
      label: "A phone number is set up",
      detail:
        numbers.length > 0
          ? `${numbers.length} number${numbers.length === 1 ? "" : "s"} ready`
          : "Add a number on the Numbers tab",
    },
    {
      done: menus.length > 0,
      label: "A greeting menu exists",
      detail:
        menus.length > 0
          ? `${menus.length} menu${menus.length === 1 ? "" : "s"} built`
          : "Build one on the IVR Menus tab, or skip it to ring your team directly",
    },
    {
      done: assigned.length > 0 || menus.length === 1 || hasRouting,
      label: "Calls have somewhere to go",
      detail:
        assigned.length > 0
          ? `${assigned.length} number${assigned.length === 1 ? "" : "s"} pointed at a menu`
          : menus.length === 1
            ? "Your only menu answers every number — assign one explicitly once you add a second"
            : hasRouting
              ? "Calls ring your team directly"
              : "Assign a menu on the Numbers tab, or add a ring order under Call Routing",
    },
    {
      done: reachableExtensions.length > 0,
      label: "Someone can actually be reached",
      detail:
        reachableExtensions.length > 0
          ? `${reachableExtensions.length} extension${reachableExtensions.length === 1 ? "" : "s"} forward to a real destination`
          : "Extensions need a phone number or SIP address to ring",
    },
    {
      done: hasVoicemailGreeting,
      label: "Voicemail has a greeting",
      detail: hasVoicemailGreeting
        ? "Unanswered calls record a message"
        : "Optional — a default greeting plays if you leave this empty",
    },
    {
      done: Boolean(businessHours.days?.length),
      label: "Business hours are set",
      detail: businessHours.days?.length
        ? businessHours.timezone
        : "Optional — with no hours set, calls are answered around the clock",
    },
  ];
  const ready = checks.slice(0, 4).every((c) => c.done);

  return (
    <div className="flex flex-col gap-4">
      <Panel bodyClassName="p-5">
        <div
          className={
            "flex items-start gap-3 rounded-lg border p-4 " +
            (ready ? "border-success/30 bg-success/10" : "border-border bg-muted/40")
          }
        >
          <PhoneIncoming
            className={"mt-0.5 size-5 shrink-0 " + (ready ? "text-success" : "text-muted-foreground")}
          />
          <div className="min-w-0">
            <p className="text-sm font-semibold">
              {ready ? "Your team is ready to take calls" : "Not quite ready to take calls"}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              {ready
                ? "Every call to your numbers will be answered the way you've set up below."
                : "Finish the unchecked items below to start answering calls."}
            </p>
          </div>
        </div>
      </Panel>

      <Panel title="How a call is answered" bodyClassName="p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-2">
          {[
            { icon: PhoneIncoming, label: "Call comes in", sub: "Matched to your number" },
            {
              icon: Users,
              label: menus.length ? "Greeting plays" : "Rings your team",
              sub: menus.length ? "Caller picks an option" : "No menu set up",
            },
            { icon: Phone, label: "Rings your team", sub: "In the order you set" },
            { icon: Mailbox, label: "No answer → voicemail", sub: "Shows up in Recordings" },
          ].map((step, i, arr) => (
            <div key={step.label} className="flex flex-1 items-center gap-2">
              <div className="flex flex-1 flex-col items-center gap-2 rounded-lg border border-border bg-muted/30 p-3 text-center">
                <step.icon className="size-5 text-primary" />
                <p className="text-xs font-semibold">{step.label}</p>
                <p className="text-[11px] text-muted-foreground">{step.sub}</p>
              </div>
              {i < arr.length - 1 && (
                <span className="hidden text-muted-foreground sm:block" aria-hidden>
                  →
                </span>
              )}
            </div>
          ))}
        </div>
      </Panel>

      <div className="grid gap-4 sm:grid-cols-2">
        <Panel
          title="Business hours"
          actions={
            <Button size="sm" variant="outline" onClick={() => onNavigate("hours")}>
              Edit
            </Button>
          }
          bodyClassName="p-5"
        >
          <ul className="flex flex-col gap-1.5 text-sm">
            {summarizeHours(businessHours.days ?? []).map((line) => (
              <li key={line} className="text-muted-foreground">
                {line}
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-muted-foreground">
            {businessHours.timezone} · Outside these hours calls follow your after-hours routing
          </p>
        </Panel>

        <Panel
          title="Voicemail"
          actions={
            <Button size="sm" variant="outline" onClick={() => onNavigate("voicemail")}>
              Edit
            </Button>
          }
          bodyClassName="p-5"
        >
          <div className="flex flex-col gap-2 text-sm text-muted-foreground">
            <p>{hasVoicemailGreeting ? "Custom greeting is set" : "Using the default greeting"}</p>
            <p>{voicemail.transcriptionEnabled ? "Transcribes every message" : "Transcription is off"}</p>
            <p>
              {voicemail.emailNotifications && voicemail.notifyEmail
                ? `Emails ${voicemail.notifyEmail} on every message`
                : "No email notifications"}
            </p>
          </div>
        </Panel>
      </div>

      <Panel
        title="Your numbers"
        actions={
          <Button size="sm" variant="outline" onClick={() => onNavigate("numbers")}>
            Manage numbers
          </Button>
        }
        bodyClassName="p-0"
      >
        {numbers.length === 0 ? (
          <div className="p-8 text-center text-sm text-muted-foreground">
            No numbers yet — add one on the Numbers tab.
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {numbers.map((n) => {
              const menu = n.ivrMenuId ? menuById.get(n.ivrMenuId) : undefined;
              return (
                <li key={n.number} className="flex items-center justify-between gap-3 px-5 py-3.5">
                  <div className="min-w-0">
                    <p className="truncate font-mono text-sm font-semibold">{n.number}</p>
                    <p className="text-xs text-muted-foreground">{n.label || n.region || "—"}</p>
                  </div>
                  <div className="flex items-center gap-2 text-right">
                    <span className="text-xs text-muted-foreground">
                      {menu ? menu.name : "Rings your team directly"}
                    </span>
                    {n.smsEnabled && <MessageSquare className="size-3.5 text-muted-foreground" />}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Panel>

      <Panel title="Setup checklist" description="Read from your live configuration" bodyClassName="p-0">
        <ul className="divide-y divide-border">
          {checks.map((c) => (
            <li key={c.label} className="flex items-start gap-3 px-5 py-3.5">
              <span
                className={
                  "mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full " +
                  (c.done ? "bg-success/15 text-success" : "bg-muted text-muted-foreground")
                }
              >
                {c.done ? <Check className="size-3.5" /> : <X className="size-3.5" />}
              </span>
              <div className="min-w-0">
                <p className="text-sm font-medium">{c.label}</p>
                <p className="mt-0.5 text-sm text-muted-foreground">{c.detail}</p>
              </div>
            </li>
          ))}
        </ul>
      </Panel>
    </div>
  );
}
