import { useEffect, useState } from "react";
import { Check, Copy, PhoneIncoming, X } from "lucide-react";
import { toast } from "sonner";

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

/** Must match the paths exported from src/server.ts. */
const CARRIERS = [
  {
    id: "signalwire",
    name: "SignalWire",
    path: "/api/voice/signalwire",
    keyName: "SIGNALWIRE_SIGNING_KEY",
    steps: [
      "In the SignalWire dashboard open Phone Numbers and pick the number you registered here.",
      'Set "Handle calls using" to a LaML webhook, and paste the URL above into "When a call comes in" with method POST.',
      "Copy the signing key from API Credentials so webhook signatures can be verified.",
    ],
  },
  {
    id: "telnyx",
    name: "Telnyx",
    path: "/api/voice/telnyx",
    keyName: "TELNYX_PUBLIC_KEY",
    steps: [
      "In the Telnyx portal open Voice → Call Control and create an application.",
      'Set the Webhook URL on that application to the address above, with API version "API v2".',
      "Under Numbers, assign each number you registered here to that Call Control application.",
      "Copy your public key from Account Settings → Keys & Credentials so signatures can be verified.",
    ],
  },
] as const;

interface CheckItem {
  done: boolean;
  label: string;
  detail: string;
}

export function InboundTab({
  numbers,
  menus,
  extensions,
  routing,
  voicemail,
  businessHours,
}: {
  numbers: PhoneNumber[];
  menus: IvrMenu[];
  extensions: Extension[];
  routing: RoutingRule;
  voicemail: VoicemailSettings;
  businessHours: BusinessHoursConfig;
}) {
  // Rendered on the server too, where there's no location — resolve after mount.
  const [origin, setOrigin] = useState("");
  useEffect(() => setOrigin(window.location.origin), []);

  // Both carriers are wired; the tenant uses whichever they have an account
  // with, so show both rather than guessing.
  const [carrierId, setCarrierId] = useState<(typeof CARRIERS)[number]["id"]>("signalwire");
  const carrier = CARRIERS.find((c) => c.id === carrierId) ?? CARRIERS[0];
  const webhookUrl = origin ? `${origin}${carrier.path}` : carrier.path;

  const assigned = numbers.filter((n) => n.ivrMenuId);
  const reachableExtensions = extensions.filter((e) => e.forwardsTo.trim());
  const hasRouting = routing.ringOrder.length > 0;
  const hasVoicemailGreeting = Boolean(
    voicemail.greetingText.trim() || voicemail.greetingFile?.url,
  );

  const checks: CheckItem[] = [
    {
      done: numbers.length > 0,
      label: "A phone number is registered",
      detail:
        numbers.length > 0
          ? `${numbers.length} number${numbers.length === 1 ? "" : "s"} on the Numbers tab`
          : "Add the number you bought from your carrier on the Numbers tab",
    },
    {
      done: menus.length > 0,
      label: "An IVR menu exists",
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
              ? "Calls ring your routing list directly"
              : "Assign a menu on the Numbers tab, or add a ring order under Call Routing",
    },
    {
      done: reachableExtensions.length > 0,
      label: "At least one extension can be reached",
      detail:
        reachableExtensions.length > 0
          ? `${reachableExtensions.length} extension${reachableExtensions.length === 1 ? "" : "s"} forward to a real destination`
          : "Extensions need a 'Forwards to' number or SIP address — an extension number alone can't be dialled",
    },
    {
      done: hasVoicemailGreeting,
      label: "Voicemail is set up",
      detail: hasVoicemailGreeting
        ? "Unanswered calls record a message"
        : "Optional — a default greeting is used if you leave this empty",
    },
    {
      done: Boolean(businessHours.days?.length),
      label: "Business hours are defined",
      detail: businessHours.days?.length
        ? `${businessHours.timezone} — after-hours calls follow your routing fallback`
        : "Optional — with no hours set, calls are answered around the clock",
    },
  ];

  const ready = checks.slice(0, 4).every((c) => c.done);

  async function copyWebhook() {
    try {
      await navigator.clipboard.writeText(webhookUrl);
      toast.success("Webhook URL copied");
    } catch {
      toast.error("Couldn't copy — select the URL and copy it manually.");
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <Panel
        title="Inbound calling"
        description="What your carrier needs so calls to your numbers reach this workspace"
        bodyClassName="p-5"
      >
        <div className="flex flex-col gap-5">
          <div
            className={
              "flex items-start gap-3 rounded-lg border p-4 " +
              (ready
                ? "border-success/30 bg-success/10"
                : "border-border bg-muted/40")
            }
          >
            <PhoneIncoming
              className={"mt-0.5 size-5 shrink-0 " + (ready ? "text-success" : "text-muted-foreground")}
            />
            <div className="min-w-0">
              <p className="text-sm font-semibold">
                {ready ? "Ready to receive calls" : "Not receiving calls yet"}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                {ready
                  ? "Your flow is complete on this side. Calls will be answered as soon as your carrier is pointed at the webhook below."
                  : "Finish the unchecked items below, then point your carrier at the webhook URL."}
              </p>
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <p className="text-sm font-semibold">Your carrier</p>
            <div className="flex flex-wrap gap-2">
              {CARRIERS.map((c) => (
                <Button
                  key={c.id}
                  size="sm"
                  variant={c.id === carrierId ? "default" : "outline"}
                  onClick={() => setCarrierId(c.id)}
                >
                  {c.name}
                </Button>
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <p className="text-sm font-semibold">Webhook URL</p>
            <div className="flex flex-wrap items-center gap-2">
              <code className="min-w-0 flex-1 overflow-x-auto rounded-lg border border-border bg-muted/60 px-3 py-2 font-mono text-xs">
                {webhookUrl}
              </code>
              <Button variant="outline" size="sm" onClick={() => void copyWebhook()}>
                <Copy className="size-3.5" /> Copy
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Your carrier posts every call event here. It must be reachable over HTTPS — this URL
              already is.
            </p>
          </div>

          <div className="flex flex-col gap-2">
            <p className="text-sm font-semibold">Pointing {carrier.name} at it</p>
            <ol className="flex list-decimal flex-col gap-1.5 pl-5 text-sm text-muted-foreground">
              {carrier.steps.map((step) => (
                <li key={step}>{step}</li>
              ))}
            </ol>
            <p className="text-xs text-muted-foreground">
              Until <span className="font-mono text-foreground">{carrier.keyName}</span> is set,
              webhooks are accepted without signature checks — fine while testing, not for
              production.
            </p>
          </div>
        </div>
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

      <Panel title="What happens on a call" bodyClassName="p-5">
        <ol className="flex list-decimal flex-col gap-2 pl-5 text-sm text-muted-foreground">
          <li>The number is matched to this workspace and a call record opens immediately.</li>
          <li>
            Business hours decide the path — open hours use the number&apos;s menu, after hours use your
            routing fallback.
          </li>
          <li>The greeting plays and the caller&apos;s keypress selects an option.</li>
          <li>
            Ringing an extension dials it while keeping the caller on the line, so an unanswered
            agent falls through to the next one rather than dropping the call.
          </li>
          <li>Unanswered calls take a voicemail, which appears under Recordings.</li>
          <li>Every call lands in Call History with its outcome and duration.</li>
        </ol>
      </Panel>
    </div>
  );
}
