import { useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";

import {
  clearSession,
  getSessionUser,
  hasValidSession,
  msUntilIdleLogout,
  touchSession,
} from "@/lib/auth-api";

type Scope = "tenant" | "admin";

// Interactions that count as "the user is still here".
const ACTIVITY_EVENTS = ["mousedown", "keydown", "scroll", "touchstart", "click"] as const;

/**
 * Wraps dashboard pages: blocks anyone without a live session, and signs the
 * user out after the idle timeout. Sessions live in sessionStorage, so
 * closing the tab or browser also ends them.
 */
export function AuthGuard({ scope, children }: { scope: Scope; children: ReactNode }) {
  const navigate = useNavigate();
  const [checked, setChecked] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const loginPath = scope === "admin" ? "/admin/login" : "/login";

  const signOut = useCallback(
    (reason?: string) => {
      clearSession();
      if (reason) {
        toast.info(reason);
      }
      void navigate({ to: loginPath });
    },
    [navigate, loginPath]
  );

  // Schedules the logout for exactly when the idle window runs out, and
  // reschedules on every interaction rather than polling.
  const scheduleIdleLogout = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    const remaining = msUntilIdleLogout();

    if (remaining <= 0) {
      signOut("You were signed out after 10 minutes of inactivity.");
      return;
    }

    timerRef.current = setTimeout(() => {
      signOut("You were signed out after 10 minutes of inactivity.");
    }, remaining);
  }, [signOut]);

  useEffect(() => {
    if (!hasValidSession()) {
      clearSession();
      void navigate({ to: loginPath });
      return;
    }

    // An admin token shouldn't unlock tenant pages, and vice versa.
    const user = getSessionUser();
    if (scope === "admin" && !user?.is_super_admin) {
      signOut("Admin access required.");
      return;
    }
    if (scope === "tenant" && user?.is_super_admin) {
      void navigate({ to: "/admin" });
      return;
    }

    setChecked(true);
    touchSession();
    scheduleIdleLogout();

    const onActivity = () => {
      touchSession();
      scheduleIdleLogout();
    };

    ACTIVITY_EVENTS.forEach((evt) =>
      window.addEventListener(evt, onActivity, { passive: true })
    );

    // Coming back to the tab after a long time away should log out immediately
    // rather than waiting for the next scheduled tick.
    const onVisibility = () => {
      if (document.visibilityState === "visible") scheduleIdleLogout();
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      ACTIVITY_EVENTS.forEach((evt) => window.removeEventListener(evt, onActivity));
      document.removeEventListener("visibilitychange", onVisibility);
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [navigate, loginPath, scope, signOut, scheduleIdleLogout]);

  // Render nothing until we've confirmed the session, so protected content
  // never flashes on screen before the redirect happens.
  if (!checked) return null;

  return <>{children}</>;
}
