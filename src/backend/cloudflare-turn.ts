// Mints short-lived TURN credentials from Cloudflare Realtime.
//
// Without a TURN relay, the browser softphone's WebRTC signaling can
// complete fine (the call rings) while no actual audio ever connects —
// anyone behind a symmetric NAT or restrictive firewall has no other path.
// A public/free TURN server is not a substitute: it's shared, best-effort,
// and empirically unreliable (confirmed by testing against two independent
// networks). This is Cloudflare's own paid-tier-quality TURN service,
// same account as everything else this app already runs on.

import { env } from "./env";

export interface IceServer {
  urls: string | string[];
  username?: string;
  credential?: string;
}

/** Null when not configured or the request fails — callers fall back to STUN-only rather than block registration on this. */
export async function getTurnIceServers(): Promise<IceServer[] | null> {
  const keyId = env.cloudflareTurnKeyId;
  const token = env.cloudflareTurnToken;
  if (!keyId || !token) return null;

  try {
    const response = await fetch(
      `https://rtc.live.cloudflare.com/v1/turn/keys/${keyId}/credentials/generate-ice-servers`,
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${token}`,
          "content-type": "application/json",
        },
        // One call's worth of headroom — credentials are minted fresh per registration anyway.
        body: JSON.stringify({ ttl: 3600 }),
      },
    );
    if (!response.ok) {
      console.error(`[cloudflare-turn] ${response.status}: "${await response.text()}"`);
      return null;
    }
    const body = (await response.json()) as { iceServers?: IceServer[] };
    return body.iceServers ?? null;
  } catch (err) {
    console.error("[cloudflare-turn] request failed", err);
    return null;
  }
}
