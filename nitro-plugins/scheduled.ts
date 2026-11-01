// Runs the renewal check and the voice-broadcast wake-up on Cloudflare's schedule (see the cron line in
// scripts/deploy.mjs). Nitro hands scheduled invocations to this hook; the app's
// own request handler never sees them.
import { definePlugin } from "nitro";

export default definePlugin((nitroApp) => {
  nitroApp.hooks.hook("cloudflare:scheduled", async () => {
    const { runRenewalSweep } = await import("../src/backend/billing-lifecycle.server");
    try {
      await runRenewalSweep();
    } catch (err) {
      console.error("[renewals] the scheduled check failed", err);
    }

    // Voice broadcasts: start scheduled ones, resume ones waiting for calling hours or a retry.
    try {
      const { runBroadcastSweep } = await import("../src/backend/broadcast-sweep.server");
      await runBroadcastSweep();
    } catch (err) {
      console.error("[broadcast-sweep] the scheduled check failed", err);
    }
  });
});
