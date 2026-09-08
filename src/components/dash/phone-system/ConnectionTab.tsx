import { useCallback, useEffect, useState } from "react";
import { KeyRound, Loader2, Pencil, PlugZap, ShoppingCart, Trash2, TriangleAlert } from "lucide-react";
import { toast } from "sonner";

import { Panel, StatusPill } from "@/components/dash/bits";
import { Button } from "@/components/ui/button";
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  deleteSipConnection,
  getSipConnection,
  saveByoSip,
  type SipConnectionView,
  type SipTransport,
} from "@/lib/sip-api";

const TRANSPORT_LABELS: Record<SipTransport, string> = {
  wss: "WSS — SIP over secure WebSocket",
  tls: "TLS — SIP over TLS (port 5061)",
  tcp: "TCP — SIP over TCP (port 5060)",
  udp: "UDP — SIP over UDP (port 5060)",
};

export function ConnectionTab() {
  const [connection, setConnection] = useState<SipConnectionView | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [byoOpen, setByoOpen] = useState(false);
  const [removeOpen, setRemoveOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await getSipConnection();
      setConnection(result.connection);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load your connection.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function remove() {
    try {
      await deleteSipConnection();
      setConnection(null);
      setRemoveOpen(false);
      toast.success("Connection removed");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not remove that connection.");
    }
  }

  if (loading) {
    return (
      <Panel bodyClassName="flex items-center justify-center gap-2 p-12 text-muted-foreground">
        <Loader2 className="size-4 animate-spin" /> Loading connection…
      </Panel>
    );
  }

  if (error) {
    return (
      <Panel bodyClassName="p-8 text-center">
        <p className="text-sm text-destructive">{error}</p>
        <Button className="mt-4" onClick={() => void load()}>
          Try again
        </Button>
      </Panel>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {connection ? (
        <Panel
          title={connection.label}
          description={
            connection.mode === "byo" ? "Your own carrier" : "Provisioned by Kchel"
          }
          actions={
            <>
              {connection.mode === "byo" && (
                <Button variant="outline" size="sm" onClick={() => setByoOpen(true)}>
                  <Pencil className="size-3.5" /> Edit
                </Button>
              )}
              <Button variant="outline" size="sm" onClick={() => setRemoveOpen(true)}>
                <Trash2 className="size-3.5" /> Remove
              </Button>
            </>
          }
          bodyClassName="p-5"
        >
          <div className="flex items-center gap-3 rounded-lg border border-border bg-muted/40 p-4">
            <PlugZap className="size-5 text-muted-foreground" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold">
                {connection.status === "active"
                  ? "Connected"
                  : connection.status === "failed"
                    ? "Connection failed"
                    : "Saved — not yet registered"}
              </p>
              <p className="text-xs text-muted-foreground">
                {connection.last_error
                  ? connection.last_error
                  : connection.status === "pending"
                    ? "Registration is verified the first time an agent connects."
                    : `Last registered ${connection.last_registered_at ?? "—"}`}
              </p>
            </div>
            <StatusPill status={connection.status === "active" ? "Active" : connection.status === "failed" ? "Failed" : "Pending"} />
          </div>

          {connection.mode === "byo" && !connection.browserReachable && (
            <div className="mt-4 flex items-start gap-2 rounded-lg border border-warning/35 bg-warning/10 p-3 text-xs text-warning-foreground">
              <TriangleAlert className="mt-0.5 size-3.5 shrink-0" />
              <span>
                Saved. Agents can&apos;t register their browser with a{" "}
                {connection.sip_transport.toUpperCase()} trunk — a web page can only open
                WebSocket connections, so this is a browser limit rather than a setting.
                This trunk still works as a routing destination: set an
                extension&apos;s <strong>Forwards to</strong> to <code>trunk</code> and inbound
                calls will be delivered to it. For click-to-call from the browser, ask your
                carrier for their SIP-over-WSS (WebRTC) endpoint.
              </span>
            </div>
          )}

          {connection.mode === "byo" && (
            <dl className="mt-4 grid gap-3 sm:grid-cols-2">
              {[
                ["Transport", connection.sip_transport.toUpperCase()],
                ["SIP host", connection.sip_host],
                ...(connection.sip_transport === "wss"
                  ? [["WebSocket URL", connection.sip_wss_url] as [string, string | null]]
                  : []),
                ["Username", connection.sip_username],
                ["Password", connection.hasPassword ? "••••••••" : "Not set"],
                ["Realm", connection.sip_realm || "—"],
                ["Port", connection.sip_port ? String(connection.sip_port) : "default"],
              ].map(([k, v]) => (
                <div key={k as string} className="min-w-0 rounded-lg border border-border bg-muted/50 p-3">
                  <dt className="text-xs text-muted-foreground">{k}</dt>
                  <dd className="truncate font-mono text-sm font-semibold">{v}</dd>
                </div>
              ))}
            </dl>
          )}
        </Panel>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          <Panel title="Buy a trunk from Kchel" description="Easiest — we handle the carrier" bodyClassName="p-5">
            <ul className="flex flex-col gap-2 text-sm text-muted-foreground">
              <li>• Numbers and minutes billed through your wallet</li>
              <li>• Nothing to configure — calling works immediately</li>
              <li>• Spend caps so a campaign can't overrun your budget</li>
            </ul>
            <Button className="mt-5 w-full" disabled>
              <ShoppingCart className="size-4" /> Coming soon
            </Button>
            <p className="mt-2 text-center text-xs text-muted-foreground">
              Awaiting carrier reseller approval.
            </p>
          </Panel>

          <Panel title="Connect your own SIP" description="Use a carrier you already pay for" bodyClassName="p-5">
            <ul className="flex flex-col gap-2 text-sm text-muted-foreground">
              <li>• Keep your existing carrier and rates</li>
              <li>• You're billed for the dialer only, not minutes</li>
              <li>• Any transport — WSS, TLS, TCP or UDP</li>
            </ul>
            <Button className="mt-5 w-full" onClick={() => setByoOpen(true)}>
              <KeyRound className="size-4" /> Add SIP credentials
            </Button>
          </Panel>
        </div>
      )}

      {byoOpen && (
        <ByoDialog
          initial={connection?.mode === "byo" ? connection : null}
          onCancel={() => setByoOpen(false)}
          onSaved={(saved) => {
            setConnection(saved);
            setByoOpen(false);
          }}
        />
      )}

      <AlertDialog open={removeOpen} onOpenChange={setRemoveOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove this connection?</AlertDialogTitle>
            <AlertDialogDescription>
              Agents won't be able to make or receive calls until another one is set up.
              Your saved credentials are deleted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => void remove()}>Remove</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function ByoDialog({
  initial,
  onCancel,
  onSaved,
}: {
  initial: SipConnectionView | null;
  onCancel: () => void;
  onSaved: (connection: SipConnectionView) => void;
}) {
  const isEdit = Boolean(initial);
  const [busy, setBusy] = useState(false);
  const [transport, setTransport] = useState<SipTransport>(initial?.sip_transport ?? "wss");
  const [form, setForm] = useState({
    label: initial?.label ?? "My SIP trunk",
    sipHost: initial?.sip_host ?? "",
    sipWssUrl: initial?.sip_wss_url ?? "",
    sipUsername: initial?.sip_username ?? "",
    sipPassword: "",
    sipRealm: initial?.sip_realm ?? "",
    sipPort: initial?.sip_port ? String(initial.sip_port) : "",
  });

  async function save() {
    setBusy(true);
    try {
      const payload = {
        label: form.label,
        sipHost: form.sipHost,
        sipWssUrl: transport === "wss" ? form.sipWssUrl : "",
        sipTransport: transport,
        sipUsername: form.sipUsername,
        ...(form.sipPassword ? { sipPassword: form.sipPassword } : {}),
        ...(form.sipRealm.trim() ? { sipRealm: form.sipRealm } : {}),
        ...(form.sipPort.trim() ? { sipPort: Number(form.sipPort) } : {}),
      };
      const result = await saveByoSip(payload);
      toast.success(isEdit ? "Credentials updated" : "SIP credentials saved");
      onSaved(result.connection);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save those credentials.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onCancel()}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit SIP credentials" : "Connect your own SIP"}</DialogTitle>
          <DialogDescription>
            Get these from your carrier's portal. They're encrypted before being stored.
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-start gap-2 rounded-lg border border-warning/35 bg-warning/10 p-3 text-xs text-warning-foreground">
          <TriangleAlert className="mt-0.5 size-3.5 shrink-0" />
          {transport === "wss" ? (
            <span>
              <strong>WSS is the only transport a browser can register with</strong>, so this is
              the one that powers click-to-call and the on-screen softphone. Ask your carrier for
              their &ldquo;SIP over WSS&rdquo; or &ldquo;WebRTC&rdquo; endpoint.
            </span>
          ) : (
            <span>
              A browser cannot open {transport.toUpperCase()} sockets, so agents won&apos;t be able
              to register the on-screen softphone with this trunk. It will still be saved and can
              receive calls routed to it &mdash; point an extension&apos;s <strong>Forwards to</strong>{" "}
              at <code>trunk</code>. Choose <strong>WSS</strong> if your carrier offers it.
            </span>
          )}
        </div>

        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="sip-label">Label</Label>
            <Input
              id="sip-label"
              value={form.label}
              onChange={(e) => setForm({ ...form, label: e.target.value })}
            />
          </div>

          <div className="flex flex-col gap-2">
            <Label>Transport</Label>
            <Select value={transport} onValueChange={(v) => setTransport(v as SipTransport)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(TRANSPORT_LABELS) as SipTransport[]).map((t) => (
                  <SelectItem key={t} value={t}>
                    {TRANSPORT_LABELS[t]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {transport === "wss" && (
            <div className="flex flex-col gap-2">
              <Label htmlFor="sip-wss">WebSocket URL</Label>
              <Input
                id="sip-wss"
                placeholder="wss://sip.yourprovider.com:443"
                className="font-mono"
                value={form.sipWssUrl}
                onChange={(e) => setForm({ ...form, sipWssUrl: e.target.value })}
              />
            </div>
          )}

          <div className="flex flex-col gap-2">
            <Label htmlFor="sip-host">
              SIP host / domain{transport === "wss" ? " (optional)" : ""}
            </Label>
            <Input
              id="sip-host"
              placeholder="sip.yourprovider.com"
              className="font-mono"
              value={form.sipHost}
              onChange={(e) => setForm({ ...form, sipHost: e.target.value })}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-2">
              <Label htmlFor="sip-user">SIP username</Label>
              <Input
                id="sip-user"
                className="font-mono"
                value={form.sipUsername}
                onChange={(e) => setForm({ ...form, sipUsername: e.target.value })}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="sip-pass">SIP password</Label>
              <Input
                id="sip-pass"
                type="password"
                placeholder={isEdit ? "Leave blank to keep current" : ""}
                value={form.sipPassword}
                onChange={(e) => setForm({ ...form, sipPassword: e.target.value })}
              />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-2">
              <Label htmlFor="sip-realm">Realm (optional)</Label>
              <Input
                id="sip-realm"
                className="font-mono"
                value={form.sipRealm}
                onChange={(e) => setForm({ ...form, sipRealm: e.target.value })}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="sip-port">Port (optional)</Label>
              <Input
                id="sip-port"
                inputMode="numeric"
                placeholder={transport === "wss" ? "443" : transport === "tls" ? "5061" : "5060"}
                value={form.sipPort}
                onChange={(e) => setForm({ ...form, sipPort: e.target.value.replace(/\D/g, "") })}
              />
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onCancel}>
            Cancel
          </Button>
          <Button disabled={busy} onClick={() => void save()}>
            {busy ? <Loader2 className="size-4 animate-spin" /> : null}
            {isEdit ? "Save changes" : "Save credentials"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
