import { createServerFn } from "@tanstack/react-start";

import { deleteGreeting, uploadGreeting } from "./media-store";

// The storage code lives in media-store.ts and is only used inside the handlers
// below, so the browser bundle never has to load the Cloudflare bindings.

export const uploadGreetingFn = createServerFn({ method: "POST" })
  .validator((data: { token: string; fileName: string; contentType: string; base64: string }) => data)
  .handler(async ({ data }) => uploadGreeting(data));

export const deleteGreetingFn = createServerFn({ method: "POST" })
  .validator((data: { token: string; key: string }) => data)
  .handler(async ({ data }) => deleteGreeting(data));
