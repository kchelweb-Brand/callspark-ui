import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { Softphone, initialSoftphoneState, type SoftphoneState } from "@/lib/softphone";

// The API modules are imported lazily rather than statically. This provider is
// mounted from __root.tsx, and a static import chain from the root into the
// server-function graph creates a circular dependency between that chunk and
// the UI vendor chunks — which surfaces at runtime as a CJS interop helper
// being undefined ("__commonJSMin is not a function") because `var` bindings
// are still uninitialised when the cycle re-enters. Deferring these to call
// time keeps the root's module graph acyclic.
const callsApi = () => import("@/lib/calls-api");
const webrtcApi = () => import("@/lib/webrtc-api");

export interface DialOptions {
  /** Links the call record to a contact so Call History can show who was called. */
  contactId?: string;
  /** Display name for the on-screen call banner. */
  label?: string;
}

/**
 * Owns a single Softphone instance and mirrors every call into the `calls`
 * table. Registration is explicit ("Go online") rather than automatic — an
 * agent shouldn't start receiving calls just because they opened a page.
 */
export function useSoftphone() {
  const [state, setState] = useState<SoftphoneState>(initialSoftphoneState);
  const [busy, setBusy] = useState(false);
  const phoneRef = useRef<Softphone | null>(null);

  // The call record currently open, so answer/end can update the right row.
  const callIdRef = useRef<string | null>(null);
  // Set when a call ends for a specific reason we already know (a transfer),
  // so the generic "call went idle" handler doesn't log it as a plain connect.
  const pendingOutcomeRef = useRef<{ status: string; outcome: string } | null>(null);
  const prevCallRef = useRef<SoftphoneState["call"]>("idle");

  if (phoneRef.current === null) {
    phoneRef.current = new Softphone(setState);
  }

  useEffect(() => {
    const phone = phoneRef.current;
    return () => {
      void phone?.disconnect();
    };
  }, []);

  // Translate softphone state transitions into call-record writes. Doing it
  // here (rather than inside each action) means calls that end for reasons we
  // didn't initiate — the far end hanging up, the socket dropping — still get
  // closed out properly instead of leaving an orphaned 'ringing' row.
  useEffect(() => {
    const prev = prevCallRef.current;
    const now = state.call;
    prevCallRef.current = now;
    if (prev === now) return;

    const openCallId = callIdRef.current;

    if (now === "active" && openCallId) {
      void callsApi()
        .then((m) => m.answerCall(openCallId))
        .catch(() => {});
    }

    if (now === "idle" && openCallId) {
      callIdRef.current = null;
      const reason = pendingOutcomeRef.current;
      pendingOutcomeRef.current = null;
      void callsApi()
        .then((m) => (reason ? m.endCall(openCallId, reason) : m.endCall(openCallId)))
        .catch(() => {});
    }

    // Inbound arrives without us having opened a record yet. The caller's
    // number comes off the INVITE, so Call History shows who rang instead of
    // a row of "Unknown".
    if (now === "incoming" && !openCallId) {
      const caller = state.remoteIdentity?.trim();
      void callsApi()
        .then((m) =>
          m.startCall({ direction: "inbound", ...(caller ? { fromNumber: caller } : {}) }),
        )
        .then(({ callId }) => {
          callIdRef.current = callId;
        })
        .catch(() => {});
    }
  }, [state.call, state.remoteIdentity]);

  const goOnline = useCallback(async () => {
    setBusy(true);
    const api = await webrtcApi();
    try {
      const config = await api.getAgentSipConfig();
      await phoneRef.current!.connect(config);
      toast.success("Registered with your carrier", { description: config.label });
      void api.reportRegistration(true).catch(() => {});
    } catch (err) {
      const message = err instanceof Error ? err.message : "Could not connect.";
      toast.error(message);
      void api.reportRegistration(false, message).catch(() => {});
    } finally {
      setBusy(false);
    }
  }, []);

  const goOffline = useCallback(async () => {
    setBusy(true);
    try {
      await phoneRef.current!.disconnect();
      toast.success("Signed off — you won't receive calls");
    } finally {
      setBusy(false);
    }
  }, []);

  const dial = useCallback(async (target: string, options: DialOptions = {}) => {
    const api = await callsApi();
    try {
      // Open the record before dialling so an immediately-failed call is
      // still logged rather than vanishing.
      const { callId } = await api.startCall({
        direction: "outbound",
        toNumber: target,
        ...(options.contactId ? { contactId: options.contactId } : {}),
      });
      callIdRef.current = callId;

      try {
        await phoneRef.current!.dial(target);
      } catch (err) {
        callIdRef.current = null;
        const message = err instanceof Error ? err.message : "Call failed.";
        void api
          .endCall(callId, { status: "failed", outcome: "Failed", error: message })
          .catch(() => {});
        throw err;
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Call failed.");
    }
  }, []);

  const hangup = useCallback(() => phoneRef.current!.hangup(), []);
  const answer = useCallback(() => phoneRef.current!.answer(), []);
  const decline = useCallback(async () => {
    const openCallId = callIdRef.current;
    await phoneRef.current!.decline();
    if (openCallId) {
      callIdRef.current = null;
      void callsApi()
        .then((m) => m.endCall(openCallId, { status: "canceled", outcome: "Declined" }))
        .catch(() => {});
    }
  }, []);
  const toggleMute = useCallback(() => phoneRef.current!.toggleMute(), []);
  const sendDtmf = useCallback((tone: string) => phoneRef.current!.sendDtmf(tone), []);

  const toggleHold = useCallback(async () => {
    try {
      await phoneRef.current!.toggleHold();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Hold failed.");
    }
  }, []);

  const transfer = useCallback(async (target: string) => {
    try {
      await phoneRef.current!.transfer(target);
      // The REFER succeeded, so our leg is about to end. Record why before the
      // hangup arrives and the generic handler closes the row.
      pendingOutcomeRef.current = { status: "completed", outcome: "Transferred" };
      toast.success(`Transferred to ${target}`);
      return true;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Transfer failed.");
      return false;
    }
  }, []);

  return {
    state,
    busy,
    goOnline,
    goOffline,
    dial,
    hangup,
    answer,
    decline,
    toggleMute,
    toggleHold,
    transfer,
    sendDtmf,
  };
}

/** Ticks once a second while a call is up, so the caller can render a live timer. */
export function useCallTimer(startedAt: number | null): string {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!startedAt) return;
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [startedAt]);

  if (!startedAt) return "00:00";
  const total = Math.max(0, Math.floor((now - startedAt) / 1000));
  const mins = String(Math.floor(total / 60)).padStart(2, "0");
  const secs = String(total % 60).padStart(2, "0");
  return `${mins}:${secs}`;
}
