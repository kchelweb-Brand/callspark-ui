// Thin client-side wrappers around the server functions in
// src/backend/contacts.server.ts — same pattern as auth-api.ts.
import {
  createContactFn,
  deleteContactsFn,
  getContactsMetaFn,
  importContactsFn,
  listContactsFn,
} from "@/backend/contacts.server";
import { getSessionToken } from "./auth-api";

export interface Contact {
  id: string;
  company: string | null;
  person: string | null;
  phone: string;
  email: string | null;
  tags: string[];
  do_not_call: boolean;
  do_not_sms: boolean;
  last_touched_at: string | null;
  created_at: string;
  list_id: string | null;
  list_name: string | null;
}

export interface ContactList {
  id: string;
  name: string;
  contact_count: number;
}

export interface ImportRow {
  company?: string;
  person?: string;
  phone: string;
  email?: string;
  tags?: string[];
}

function requireToken(): string {
  const token = getSessionToken();
  if (!token) throw new Error("Not signed in.");
  return token;
}

export interface ListContactsParams {
  search?: string;
  listId?: string;
  tag?: string;
  page?: number;
  pageSize?: number;
}

export function listContacts(params: ListContactsParams = {}) {
  return listContactsFn({ data: { token: requireToken(), ...params } });
}

export function getContactsMeta() {
  return getContactsMetaFn({ data: { token: requireToken() } });
}

export function createContact(payload: {
  company?: string;
  person?: string;
  phone: string;
  email?: string;
  tags?: string[];
  listName?: string;
}) {
  return createContactFn({ data: { token: requireToken(), ...payload } });
}

export function importContacts(rows: ImportRow[], listName?: string) {
  return importContactsFn({ data: { token: requireToken(), rows, ...(listName ? { listName } : {}) } });
}

export function deleteContacts(ids: string[]) {
  return deleteContactsFn({ data: { token: requireToken(), ids } });
}
