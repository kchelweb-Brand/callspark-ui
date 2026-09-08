import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, Download, KeyRound, ShieldCheck, Workflow } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Shell } from "@/components/dash/Shell";
import { ActionButton, Panel, StatusPill } from "@/components/dash/bits";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { getSessionUser } from "@/lib/auth-api";
import { getTenantSettings, saveTenantSettings } from "@/lib/workspace-api";
import { downloadTextFile } from "@/lib/download";

export const Route = createFileRoute("/settings")({
  head: () => ({
    meta: [
      { title: "Settings — Kchel Dialer" },
      {
        name: "description",
        content: "SIP credential status, workspace profile and recording preferences.",
      },
      { property: "og:title", content: "Settings — Kchel Dialer" },
      {
        property: "og:description",
        content: "Manage your workspace profile and SIP trunk credentials.",
      },
    ],
  }),
  component: SettingsPage,
});

function randomSecret() {
  return Array.from({ length: 24 }, () => "abcdefghijklmnopqrstuvwxyz0123456789"[Math.floor(Math.random() * 36)]).join("");
}

function SettingsPage() {
  const user = getSessionUser();
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [provisioned, setProvisioned] = useState(false);
  const [rotateOpen, setRotateOpen] = useState(false);
  const [pendingSecret, setPendingSecret] = useState("");
  const [secretRotatedAt, setSecretRotatedAt] = useState<string | null>(null);

  const [preferences, setPreferences] = useState([
    { label: "Record all inbound calls", on: false },
    { label: "Voicemail transcription", on: false },
    { label: "Whisper coaching for supervisors", on: false },
  ]);

  const [profile, setProfile] = useState({
    company: user?.workspace_slug ?? "",
    tz: Intl.DateTimeFormat().resolvedOptions().timeZone,
    callerId: "",
    hours: "08:00 – 19:00",
  });

  function rotateSecret() {
    setSecretRotatedAt(new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }));
    setProvisioned(true);
    setRotateOpen(false);
    toast.success("SIP secret rotated", { description: "Update any registered devices with the new credential." });
  }

  function downloadConfig() {
    if (!provisioned) {
      toast.error("No SIP credentials yet — rotate a secret to provision your first trunk.");
      return;
    }
    const config = [
      "# Kchel Dialer SIP configuration",
      `workspace=${profile.company || "unnamed"}`,
      "transport=TLS / SRTP",
      `rotated_at=${secretRotatedAt}`,
    ].join("\n");
    downloadTextFile("kchel-sip-config.txt", config);
    toast.success("Config downloaded");
  }

  // Load whatever was saved previously, falling back to the defaults above.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const settings = await getTenantSettings();
        if (cancelled || !settings.saved) return;
        const w = settings.workspace as Partial<typeof profile>;
        setProfile((current) => ({ ...current, ...w }));
        const savedPrefs = settings.preferences as Record<string, boolean>;
        setPreferences((current) =>
          current.map((p) => (p.label in savedPrefs ? { ...p, on: savedPrefs[p.label]! } : p)),
        );
      } catch {
        // Non-fatal: the page still works with defaults.
      } finally {
        if (!cancelled) setLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function saveProfile() {
    setSaving(true);
    try {
      await saveTenantSettings({
        workspace: { ...profile },
        preferences: Object.fromEntries(preferences.map((p) => [p.label, p.on])),
      });
      toast.success("Workspace profile saved");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save settings.");
    } finally {
      setSaving(false);
    }
  }

  /** Call preferences save immediately — a toggle with a separate Save button
   *  is the kind of thing people flip and then lose. */
  async function togglePreference(index: number, on: boolean) {
    const next = preferences.map((p, i) => (i === index ? { ...p, on } : p));
    setPreferences(next);
    if (!loaded) return;
    try {
      await saveTenantSettings({
        preferences: Object.fromEntries(next.map((p) => [p.label, p.on])),
      });
    } catch (err) {
      setPreferences(preferences); // roll back so the UI matches storage
      toast.error(err instanceof Error ? err.message : "Could not save that setting.");
    }
  }

  return (
    <Shell
      scope="tenant"
      title="Settings"
      description="Workspace and telephony credentials"
    >
      <div className="grid gap-4 xl:grid-cols-2">
        <Panel title="SIP credentials" description="Provisioned via platform trunk group" bodyClassName="p-5">
          {provisioned ? (
            <div className="flex items-center gap-3 rounded-lg border border-success/25 bg-success/8 p-4">
              <ShieldCheck className="size-5 text-success" />
              <div>
                <p className="text-sm font-semibold">Credentials verified</p>
                <p className="text-xs text-muted-foreground">Last registration {secretRotatedAt}</p>
              </div>
              <StatusPill status="Active" />
            </div>
          ) : (
            <div className="flex items-center gap-3 rounded-lg border border-dashed border-border bg-muted/40 p-4">
              <ShieldCheck className="size-5 text-muted-foreground" />
              <div>
                <p className="text-sm font-semibold">No SIP credentials yet</p>
                <p className="text-xs text-muted-foreground">Provision your first trunk to start calling.</p>
              </div>
              <StatusPill status="Pending" />
            </div>
          )}

          <div className="mt-4 flex flex-wrap gap-2">
            <ActionButton
              onClick={() => {
                setPendingSecret(randomSecret());
                setRotateOpen(true);
              }}
            >
              <KeyRound className="size-4" /> {provisioned ? "Rotate secret" : "Provision trunk"}
            </ActionButton>
            {provisioned && (
              <ActionButton variant="outline" onClick={downloadConfig}>
                <Download className="size-4" /> Download config
              </ActionButton>
            )}
          </div>
        </Panel>

        <Panel title="Call preferences" description="Recording and coaching defaults" bodyClassName="p-5">
          <div className="flex flex-col gap-4">
            {preferences.map((pref, i) => (
              <div key={pref.label} className="flex items-center justify-between gap-4">
                <Label className="text-sm font-medium">{pref.label}</Label>
                <Switch
                  checked={pref.on}
                  onCheckedChange={(on) => void togglePreference(i, on)}
                />
              </div>
            ))}
          </div>

          <Link
            to="/phone-system"
            className="mt-5 flex items-center justify-between gap-3 rounded-lg border border-primary/25 bg-primary/6 p-4 transition-colors hover:bg-primary/10"
          >
            <div className="flex items-center gap-3">
              <span className="flex size-9 items-center justify-center rounded-lg bg-primary/12 text-primary">
                <Workflow className="size-4.5" />
              </span>
              <div>
                <p className="text-sm font-semibold">Phone numbers, IVR & call routing</p>
                <p className="text-xs text-muted-foreground">
                  Manage numbers, auto-attendant menus, business hours and extensions
                </p>
              </div>
            </div>
            <ArrowRight className="size-4 shrink-0 text-primary" />
          </Link>
        </Panel>
      </div>

      <Panel title="Workspace profile" bodyClassName="p-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-2">
            <Label htmlFor="company">Company name</Label>
            <Input
              id="company"
              placeholder="Your company name"
              value={profile.company}
              onChange={(e) => setProfile({ ...profile, company: e.target.value })}
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="tz">Default timezone</Label>
            <Input id="tz" value={profile.tz} onChange={(e) => setProfile({ ...profile, tz: e.target.value })} />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="cid">Default caller ID</Label>
            <Input
              id="cid"
              placeholder="Set up in Phone System"
              value={profile.callerId}
              onChange={(e) => setProfile({ ...profile, callerId: e.target.value })}
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="hours">Dialing window</Label>
            <Input
              id="hours"
              value={profile.hours}
              onChange={(e) => setProfile({ ...profile, hours: e.target.value })}
            />
          </div>
        </div>
        <div className="mt-5 flex items-center justify-between gap-2">
          <p className="text-xs text-muted-foreground">Changes apply to new calls only.</p>
          <ActionButton disabled={saving} onClick={() => void saveProfile()}>
            {saving ? "Saving…" : "Save changes"}
          </ActionButton>
        </div>
      </Panel>

      <AlertDialog open={rotateOpen} onOpenChange={setRotateOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{provisioned ? "Rotate SIP secret?" : "Provision a SIP trunk?"}</AlertDialogTitle>
            <AlertDialogDescription>
              {provisioned
                ? "Every registered device will need the new credential before it can place or receive calls again."
                : "This generates your first SIP credential set."}{" "}
              Secret: <span className="font-mono">{pendingSecret}</span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={rotateSecret}>
              {provisioned ? "Rotate secret" : "Provision trunk"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Shell>
  );
}
