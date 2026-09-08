/**
 * `cloudflare:workers` is provided by the Workers runtime, not by a package,
 * so TypeScript needs to be told it exists. `env` is typed loosely here —
 * src/backend/cf-env.ts narrows individual bindings before use.
 */
declare module "cloudflare:workers" {
  export const env: Record<string, unknown>;
}
