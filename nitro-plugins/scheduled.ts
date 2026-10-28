// Runs the renewal check on Cloudflare's schedule (see the cron line in
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
  });
});
