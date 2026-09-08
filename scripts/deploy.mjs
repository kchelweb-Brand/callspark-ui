// Patches Nitro's generated wrangler.json and deploys.
//
// Nitro regenerates .output/server/wrangler.json on every build, so the Worker
// name, R2 binding and compatibility settings have to be reapplied each time.
// Keeping that here means `npm run deploy` is the single correct way to ship.
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";

const CONFIG = ".output/server/wrangler.json";
const WORKER_NAME = "kchel-dialer";

const config = JSON.parse(readFileSync(CONFIG, "utf8"));

config.name = WORKER_NAME;

config.compatibility_flags = ["nodejs_compat", "nodejs_compat_populate_process_env"];

// Nitro stamps the LOCAL date. Cloudflare validates against UTC and rejects
// anything in the future, so past midnight in a UTC+ timezone the local date
// fails. The UTC date is always accepted.
config.compatibility_date = new Date().toISOString().slice(0, 10);

// Greeting audio. Bindings are objects, not env strings — see src/backend/cf-env.ts.
config.r2_buckets = [{ binding: "MEDIA_BUCKET", bucket_name: "kchel-dialer-media" }];

writeFileSync(CONFIG, JSON.stringify(config, null, 2));
console.log(
  `Patched ${CONFIG}\n  name: ${config.name}\n  compatibility_date: ${config.compatibility_date}\n  r2: ${config.r2_buckets[0].bucket_name} -> env.${config.r2_buckets[0].binding}`,
);

// `shell: true` so this resolves npx via PATHEXT on Windows as well as POSIX.
execFileSync("npx", ["wrangler", "deploy", "--config", CONFIG, "--name", WORKER_NAME], {
  stdio: "inherit",
  shell: true,
});
