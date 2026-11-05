// What the signed-in person may open: everything for an owner, what the owner switched on for an agent.
// The server enforces it on every request; this only decides what to show.
import { useEffect, useState } from "react";

import { getMyAccessFn } from "@/backend/agent-home.server";
import type { AgentPermissions } from "@/backend/permissions";
import { getSessionToken, getSessionUser } from "./auth-api";

export interface MyAccess {
  /** False until we know. Owners are known at once. */
  ready: boolean;
  isAgent: boolean;
  permissions: AgentPermissions | null;
}

const KEY = "kchel-my-access";

function cached(): AgentPermissions | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as AgentPermissions) : null;
  } catch {
    return null;
  }
}

/** Fetches an agent's current permissions. An owner needs no call. */
export function useMyAccess(): MyAccess {
  const user = getSessionUser();
  const agent = user?.role === "agent";
  const [permissions, setPermissions] = useState<AgentPermissions | null>(agent ? cached() : null);
  const [ready, setReady] = useState(!agent || cached() !== null);

  useEffect(() => {
    if (!agent) return;
    const token = getSessionToken();
    if (!token) return;
    let live = true;
    getMyAccessFn({ data: { token } })
      .then((r) => {
        if (!live) return;
        setPermissions(r.permissions);
        setReady(true);
        try {
          if (r.permissions) sessionStorage.setItem(KEY, JSON.stringify(r.permissions));
        } catch {
          // Without storage the navigation simply loads a moment later each time.
        }
      })
      .catch(() => live && setReady(true));
    return () => {
      live = false;
    };
  }, [agent]);

  return { ready, isAgent: agent, permissions };
}
