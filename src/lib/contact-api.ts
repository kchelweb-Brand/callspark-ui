// Client wrapper for the public contact form.
import { submitContactFn } from "@/backend/contact.server";

export function sendContact(input: { name: string; email: string; company?: string; teamSize?: string; message: string; website?: string }) {
  return submitContactFn({ data: input });
}
