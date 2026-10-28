import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { TriangleAlert } from "lucide-react";
import { useEffect, useState } from "react";

import { getPlanUsage } from "@/lib/billing-api";

type Renewal = Awaited<ReturnType<typeof getPlanUsage>>["renewal"];

/** Pages an account on hold may still open: enough to renew, ask for help, and see its data. */
const OPEN_WHEN_ON_HOLD = ["/billing", "/support", "/settings"];

const dayLabel = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" }) : "";

/**
 * A strip across the top of the app when the plan is about to end, has ended, or
 * the account is on hold. On hold, it also steers the owner to Billing, because
 * that is the only thing they can usefully do.
 */
export function PlanBanner() {
  const [renewal, setRenewal] = useState<Renewal | null>(null);
  const path = useRouterState({ select: (s) => s.location.pathname });
  const navigate = useNavigate();

  useEffect(() => {
    let live = true;
    getPlanUsage()
      .then((r) => live && setRenewal(r.renewal))
      .catch(() => {
        // The banner is a courtesy: the page works without it.
      });
    return () => {
      live = false;
    };
  }, []);

  useEffect(() => {
    if (renewal?.state === "hold" && !OPEN_WHEN_ON_HOLD.some((p) => path.startsWith(p))) {
      void navigate({ to: "/billing" });
    }
  }, [renewal, path, navigate]);

  if (!renewal || renewal.state === "none" || renewal.state === "ok") return null;

  let tone = "border-amber-300 bg-amber-50 text-amber-950";
  let text: string;
  if (renewal.state === "upcoming") {
    const n = renewal.daysLeft ?? 0;
    text = `Your plan ends in ${n} day${n === 1 ? "" : "s"} (${dayLabel(renewal.endsAt)}). Renew to keep everything running.`;
  } else if (renewal.state === "grace") {
    tone = "border-red-300 bg-red-50 text-red-950";
    const n = renewal.daysToHold ?? 0;
    text = `Your plan ended on ${dayLabel(renewal.endsAt)}. Renew within ${n} day${n === 1 ? "" : "s"} or the account is put on hold.`;
  } else {
    tone = "border-red-300 bg-red-50 text-red-950";
    text =
      renewal.reason === "trial_ended"
        ? "Your free trial has ended and the account is on hold. Choose a plan to start working again. Your data is safe."
        : renewal.reason === "admin"
          ? "Your account is on hold. Contact support or complete your payment to start working again. Your data is safe."
          : "Your plan ended and the account is on hold. Renew to start working again. Your data is safe.";
  }

  return (
    <div role="status" className={`flex flex-wrap items-center gap-x-4 gap-y-1 border-b px-4 py-2.5 text-[14px] font-semibold md:px-8 ${tone}`}>
      <TriangleAlert className="size-4 shrink-0" />
      <span className="flex-1">{text}</span>
      <Link to="/billing" className="rounded-md bg-ink px-3 py-1 text-[13px] font-bold text-white hover:bg-ink/90">
        {renewal.state === "hold" && renewal.reason === "trial_ended" ? "Choose a plan" : "Renew now"}
      </Link>
    </div>
  );
}
