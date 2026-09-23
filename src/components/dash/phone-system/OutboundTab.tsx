import { useCallback, useEffect, useState } from "react";
import { Globe2, IdCard, Loader2, PhoneCall, PlugZap } from "lucide-react";

import { Panel, StatusPill } from "@/components/dash/bits";
import { Button } from "@/components/ui/button";
import { getSipConnection, type SipConnectionView } from "@/lib/sip-api";

export function OutboundTab({ onNavigate }: { onNavigate: (tab: string) => void }) {
  const [connection, setConnection] = useState<SipConnectionView | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await getSipConnection();
      setConnection(result.connection);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const connected = connection?.status === "active";
  const ready = Boolean(connection);

  return (
    <div className="flex flex-col gap-4">
      <Panel bodyClassName="p-5">
        <div
          className={
            "flex items-start gap-3 rounded-lg border p-4 " +
            (connected ? "border-success/30 bg-success/10" : "border-border bg-muted/40")
          }
        >
          <PhoneCall
            className={"mt-0.5 size-5 shrink-0 " + (connected ? "text-success" : "text-muted-foreground")}
          />
          <div className="min-w-0">
            <p className="text-sm font-semibold">
              {connected
                ? "You can make outbound calls"
                : ready
                  ? "A connection is saved, but not registered yet"
                  : "No connection set up yet"}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              {connected
                ? "Agents can dial out from the softphone on Live Calls."
                : "Set up a connection so agents can dial out."}
            </p>
          </div>
        </div>
      </Panel>

      <Panel
        title="Connection"
        actions={
          <Button size="sm" variant="outline" onClick={() => onNavigate("connection")}>
            Manage connection
          </Button>
        }
        bodyClassName="p-5"
      >
        {loading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" /> Loading…
          </div>
        ) : connection ? (
          <div className="flex items-center gap-3 rounded-lg border border-border bg-muted/40 p-4">
            <PlugZap className="size-5 text-muted-foreground" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold">{connection.label}</p>
              <p className="text-xs text-muted-foreground">
                {connection.mode === "byo" ? "Your own carrier" : "Provisioned by Kchel"}
              </p>
            </div>
            <StatusPill
              status={
                connection.status === "active" ? "Active" : connection.status === "failed" ? "Failed" : "Pending"
              }
            />
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            Nothing connected yet — set one up under Connection.
          </p>
        )}
      </Panel>

      <Panel title="Caller ID" bodyClassName="p-5">
        <div className="flex items-start gap-3">
          <IdCard className="mt-0.5 size-5 shrink-0 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            The number shown to the person you're calling is set on your carrier's own side — for a
            SIP trunk, that's usually a "default caller ID" or "send as" setting on the credential
            itself. Kchel doesn't override it per call.
          </p>
        </div>
      </Panel>

      <Panel title="Calling other countries" bodyClassName="p-5">
        <div className="flex items-start gap-3">
          <Globe2 className="mt-0.5 size-5 shrink-0 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            Most carriers only enable calling to your home country by default. If calls to another
            country fail immediately without ringing, check your carrier's international or
            "geographic permissions" setting — that's usually where it's blocked, not here.
          </p>
        </div>
      </Panel>
    </div>
  );
}
