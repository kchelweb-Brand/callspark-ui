// Browser softphone: registers with the tenant's carrier over SIP-over-WebSocket
// and places/receives calls using WebRTC.
//
// sip.js is loaded via dynamic import inside connect() so it never runs during
// SSR — it touches WebRTC globals that don't exist on the server.
//
// The SIP password lives only in this module's memory for the lifetime of the
// page. It is deliberately never written to localStorage/sessionStorage.
import type { SimpleUser } from "sip.js/lib/platform/web";

import type { AgentSipConfig } from "./webrtc-api";

export type PhoneStatus = "offline" | "connecting" | "ready" | "failed";
export type CallState = "idle" | "dialing" | "incoming" | "active";

export interface SoftphoneState {
  status: PhoneStatus;
  call: CallState;
  /** Who we're talking to — number for outbound, caller ID for inbound. */
  remoteIdentity: string | null;
  muted: boolean;
  /** True while the caller is parked on hold and hearing nothing from us. */
  held: boolean;
  error: string | null;
  /** epoch ms the current call connected, for the on-screen timer */
  startedAt: number | null;
}

export const initialSoftphoneState: SoftphoneState = {
  status: "offline",
  call: "idle",
  remoteIdentity: null,
  muted: false,
  held: false,
  error: null,
  startedAt: null,
};

/** Digits, +, and * # only — everything else is stripped before dialling. */
export function normalizeDialTarget(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed.startsWith("sip:")) return trimmed;

  const cleaned = trimmed.replace(/[^\d+*#]/g, "");
  // Extensions and service codes stay as dialled; longer numbers get E.164
  // treatment, which is what carriers expect for PSTN destinations.
  if (cleaned.length <= 6 || cleaned.startsWith("+") || cleaned.startsWith("*") || cleaned.startsWith("#")) {
    return cleaned;
  }
  if (cleaned.length === 10) return `+1${cleaned}`;
  if (cleaned.length === 11 && cleaned.startsWith("1")) return `+${cleaned}`;
  return `+${cleaned}`;
}

/** Maps raw transport/SIP errors onto something a user can act on. */
function explainRegistrationError(raw: string, config: AgentSipConfig): string {
  const text = raw.toLowerCase();
  if (text.includes("1006") || text.includes("websocket closed") || text.includes("failed to construct")) {
    return `Could not reach ${config.wssUrl}. Check the WebSocket URL with your carrier — it must be their SIP-over-WSS endpoint.`;
  }
  if (text.includes("401") || text.includes("403") || text.includes("unauthorized") || text.includes("forbidden")) {
    return "The carrier rejected these credentials. Check the SIP username, password and realm.";
  }
  if (text.includes("404")) {
    return "The carrier did not recognise that SIP user. Check the username and SIP host.";
  }
  if (text.includes("timeout") || text.includes("timed out")) {
    return "The carrier did not respond. Check the WebSocket URL and that your account is active.";
  }
  return raw;
}

/** The slice of sip.js's Session we need; see readRemoteIdentity for why. */
interface SessionWithRefer {
  refer?: (target: unknown) => Promise<unknown>;
  remoteIdentity?: { displayName?: string; uri?: { user?: string } };
}

export class Softphone {
  private user: SimpleUser | undefined;
  private audio: HTMLAudioElement | undefined;
  private config: AgentSipConfig | undefined;
  private state: SoftphoneState = { ...initialSoftphoneState };

  constructor(private readonly onChange: (state: SoftphoneState) => void) {}

  private patch(next: Partial<SoftphoneState>) {
    this.state = { ...this.state, ...next };
    this.onChange(this.state);
  }

  /**
   * Asks for the microphone up front. Without this a permission problem
   * surfaces later as an opaque SIP/SDP failure, which is far harder to
   * diagnose than "you denied the mic".
   */
  private async ensureMicrophone(): Promise<void> {
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      throw new Error("This browser cannot access a microphone. Try Chrome or Edge over HTTPS.");
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      // Release it immediately — sip.js opens its own when a call starts.
      stream.getTracks().forEach((t) => t.stop());
    } catch (err) {
      const name = (err as { name?: string })?.name ?? "";
      if (name === "NotAllowedError" || name === "SecurityError") {
        throw new Error(
          "Microphone access was blocked. Allow it in your browser's site settings, then go online again.",
        );
      }
      if (name === "NotFoundError") {
        throw new Error("No microphone found. Plug one in, then go online again.");
      }
      throw new Error("Could not access your microphone.");
    }
  }

  /** Registers with the carrier. Resolves once registered, rejects on failure. */
  async connect(config: AgentSipConfig): Promise<void> {
    if (this.user) await this.disconnect();

    this.config = config;
    this.patch({ status: "connecting", error: null });

    await this.ensureMicrophone();

    const { SimpleUser } = await import("sip.js/lib/platform/web");

    // SimpleUser needs a real media element to attach the far end's audio to.
    const audio = document.createElement("audio");
    audio.autoplay = true;
    audio.style.display = "none";
    document.body.appendChild(audio);
    this.audio = audio;

    const user = new SimpleUser(config.wssUrl, {
      aor: `sip:${config.username}@${config.host}`,
      media: { remote: { audio } },
      userAgentOptions: {
        authorizationUsername: config.username,
        authorizationPassword: config.password,
        displayName: config.username,
      },
      delegate: {
        onCallCreated: () => this.patch({ call: "dialing" }),
        onCallReceived: () =>
          this.patch({
            call: "incoming",
            remoteIdentity: this.readRemoteIdentity() ?? "Incoming call",
          }),
        onCallAnswered: () => this.patch({ call: "active", startedAt: Date.now(), held: false }),
        // The carrier can put us on hold too, so mirror what actually happened
        // rather than assuming our own hold() call is the only source of truth.
        onCallHold: (held: boolean) => this.patch({ held }),
        onCallHangup: () =>
          this.patch({
            call: "idle",
            remoteIdentity: null,
            startedAt: null,
            muted: false,
            held: false,
          }),
        onRegistered: () => this.patch({ status: "ready", error: null }),
        onUnregistered: () => this.patch({ status: "offline" }),
        onServerDisconnect: (error?: Error) =>
          this.patch({
            status: "failed",
            error: error?.message ?? "Lost connection to the carrier.",
          }),
      },
    });

    this.user = user;

    try {
      await user.connect();
      await user.register();
    } catch (err) {
      const raw = err instanceof Error ? err.message : "Could not register with the carrier.";
      this.patch({ status: "failed", error: explainRegistrationError(raw, config) });
      throw new Error(explainRegistrationError(raw, config));
    }
  }

  async disconnect(): Promise<void> {
    const user = this.user;
    this.user = undefined;

    if (user) {
      // Best-effort teardown — a half-open socket shouldn't block cleanup.
      try {
        await user.unregister();
      } catch {
        /* already gone */
      }
      try {
        await user.disconnect();
      } catch {
        /* already gone */
      }
    }

    this.audio?.remove();
    this.audio = undefined;
    this.config = undefined;
    this.patch({ ...initialSoftphoneState });
  }

  async dial(target: string): Promise<void> {
    if (!this.user || !this.config) throw new Error("Phone is not connected.");

    const dialled = normalizeDialTarget(target);
    if (!dialled) throw new Error("Enter a number to call.");

    const uri = dialled.startsWith("sip:") ? dialled : `sip:${dialled}@${this.config.host}`;
    this.patch({ call: "dialing", remoteIdentity: dialled, error: null });

    try {
      await this.user.call(uri);
    } catch (err) {
      this.patch({ call: "idle", remoteIdentity: null });
      throw new Error(err instanceof Error ? err.message : "Call failed.");
    }
  }

  /**
   * The caller's number, read off the incoming INVITE.
   *
   * SimpleUser keeps its Session private and its delegate hands us nothing, so
   * there is no supported accessor for this — but the caller's identity is the
   * single most useful fact about an inbound call, and logging every one as
   * "Unknown" is worse than reaching for it. Every step is guarded so a shape
   * change in sip.js downgrades to the generic label instead of throwing
   * inside a delegate callback.
   */
  private readRemoteIdentity(): string | null {
    const session = (
      this.user as unknown as {
        session?: { remoteIdentity?: { displayName?: string; uri?: { user?: string } } };
      }
    )?.session;

    const uriUser = session?.remoteIdentity?.uri?.user?.trim();
    if (uriUser) return uriUser;

    // Some carriers send only a display name (an anonymous or named caller).
    const displayName = session?.remoteIdentity?.displayName?.trim();
    return displayName || null;
  }

  async answer(): Promise<void> {
    await this.user?.answer();
  }

  async decline(): Promise<void> {
    await this.user?.decline();
    this.patch({ call: "idle", remoteIdentity: null });
  }

  async hangup(): Promise<void> {
    try {
      await this.user?.hangup();
    } finally {
      this.patch({ call: "idle", remoteIdentity: null, startedAt: null, muted: false, held: false });
    }
  }

  /**
   * Puts the far end on hold (or takes them off it).
   *
   * This is a re-INVITE, not a local mute: the caller stops hearing the agent
   * *and* the agent stops hearing them, which is the difference between
   * parking someone and just muting your own microphone.
   */
  async toggleHold(): Promise<void> {
    const user = this.user;
    if (!user || this.state.call !== "active") return;

    const wantHeld = !this.state.held;
    try {
      if (wantHeld) {
        await user.hold();
      } else {
        await user.unhold();
      }
      this.patch({ held: wantHeld });
    } catch (err) {
      // A rejected re-INVITE leaves the call up and un-held. Surfacing it
      // matters because the agent otherwise believes the caller can't hear
      // them and says something they shouldn't.
      const raw = err instanceof Error ? err.message : "Hold failed.";
      throw new Error(
        wantHeld
          ? `Could not place the call on hold — ${raw}`
          : `Could not take the call off hold — ${raw}`,
      );
    }
  }

  /**
   * Blind-transfers the call and drops out of it (a SIP REFER).
   *
   * Attended transfer — speaking to the destination first — needs a second
   * concurrent session, and sip.js's SimpleUser explicitly handles only one.
   * Offering a fake "attended" flow that silently behaved as a blind transfer
   * would be worse than not offering it.
   */
  async transfer(target: string): Promise<void> {
    const user = this.user;
    const config = this.config;
    if (!user || !config) throw new Error("Phone is not connected.");
    if (this.state.call !== "active") throw new Error("You can only transfer a connected call.");

    const dialled = normalizeDialTarget(target);
    if (!dialled) throw new Error("Enter a number or extension to transfer to.");

    const session = (this.user as unknown as { session?: SessionWithRefer }).session;
    if (!session?.refer) {
      throw new Error("This call can no longer be transferred.");
    }

    const { UserAgent } = await import("sip.js");
    const uriText = dialled.startsWith("sip:") ? dialled : `sip:${dialled}@${config.host}`;
    const uri = UserAgent.makeURI(uriText);
    if (!uri) throw new Error(`"${target}" isn't a valid transfer destination.`);

    try {
      await session.refer(uri);
    } catch (err) {
      const raw = err instanceof Error ? err.message : "Transfer failed.";
      throw new Error(`Could not transfer to ${dialled} — ${raw}`);
    }
  }

  toggleMute(): void {
    if (!this.user) return;
    if (this.state.muted) {
      this.user.unmute();
    } else {
      this.user.mute();
    }
    this.patch({ muted: !this.state.muted });
  }

  async sendDtmf(tone: string): Promise<void> {
    await this.user?.sendDTMF(tone);
  }
}
