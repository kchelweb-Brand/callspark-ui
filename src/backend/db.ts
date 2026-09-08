import { neon } from "@neondatabase/serverless";
import { env } from "./env";

// Lazily created so `env.databaseUrl` (which throws if unset) is only
// evaluated the first time a query actually runs, not at module load.
let client: ReturnType<typeof neon> | undefined;

function getClient() {
  if (!client) client = neon(env.databaseUrl);
  return client;
}

/** Row shape is intentionally loose — callers cast to the fields they select. */
export function sql(strings: TemplateStringsArray, ...values: unknown[]): Promise<Record<string, unknown>[]> {
  return getClient()(strings, ...values) as Promise<Record<string, unknown>[]>;
}

/** Escape hatch for dynamically-composed queries (variable WHERE clauses etc). */
export function sqlQuery(text: string, params: unknown[] = []): Promise<Record<string, unknown>[]> {
  return getClient().query(text, params) as Promise<Record<string, unknown>[]>;
}
