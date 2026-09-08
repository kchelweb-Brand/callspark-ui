import type { ComponentProps, ReactNode } from "react";
import { MessageSquare } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";

export function StatCard({
  label,
  value,
  delta,
  hint,
  icon: Icon,
  tone = "default",
}: {
  label: string;
  value: string;
  delta?: string;
  hint?: string;
  icon?: LucideIcon;
  tone?: "default" | "success" | "warning" | "destructive";
}) {
  const toneClass = {
    default: "text-primary bg-primary/10",
    success: "text-success bg-success/12",
    warning: "text-warning bg-warning/15",
    destructive: "text-destructive bg-destructive/10",
  }[tone];

  return (
    <div className="card-surface p-5">
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-medium text-muted-foreground">{label}</p>
        {Icon ? (
          <span className={cn("flex size-9 items-center justify-center rounded-lg", toneClass)}>
            <Icon className="size-4.5" />
          </span>
        ) : null}
      </div>
      <p className="mt-3 text-3xl font-bold tracking-tight">{value}</p>
      <div className="mt-1.5 flex items-center gap-2 text-xs">
        {delta ? (
          <span
            className={cn(
              "font-semibold",
              delta.trim().startsWith("-") ? "text-destructive" : "text-success",
            )}
          >
            {delta}
          </span>
        ) : null}
        {hint ? <span className="text-muted-foreground">{hint}</span> : null}
      </div>
    </div>
  );
}

export function Panel({
  title,
  description,
  actions,
  children,
  className,
  bodyClassName,
}: {
  title?: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <section className={cn("card-surface flex flex-col", className)}>
      {title ? (
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-4">
          <div>
            <h2 className="text-sm font-bold tracking-tight">{title}</h2>
            {description ? (
              <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
            ) : null}
          </div>
          {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
        </header>
      ) : null}
      <div className={cn("p-5", bodyClassName)}>{children}</div>
    </section>
  );
}

const statusTones: Record<string, string> = {
  active: "bg-success/12 text-success border-success/25",
  connected: "bg-success/12 text-success border-success/25",
  available: "bg-success/12 text-success border-success/25",
  provisioned: "bg-success/12 text-success border-success/25",
  paid: "bg-success/12 text-success border-success/25",
  resolved: "bg-success/12 text-success border-success/25",
  online: "bg-success/12 text-success border-success/25",
  "on call": "bg-primary/12 text-primary border-primary/25",
  "in progress": "bg-primary/12 text-primary border-primary/25",
  scheduled: "bg-primary/12 text-primary border-primary/25",
  trial: "bg-primary/12 text-primary border-primary/25",
  open: "bg-primary/12 text-primary border-primary/25",
  "wrap-up": "bg-warning/18 text-warning-foreground border-warning/35",
  pending: "bg-warning/18 text-warning-foreground border-warning/35",
  paused: "bg-warning/18 text-warning-foreground border-warning/35",
  warning: "bg-warning/18 text-warning-foreground border-warning/35",
  voicemail: "bg-warning/18 text-warning-foreground border-warning/35",
  "waiting on customer": "bg-warning/18 text-warning-foreground border-warning/35",
  medium: "bg-warning/18 text-warning-foreground border-warning/35",
  suspended: "bg-destructive/10 text-destructive border-destructive/25",
  "past due": "bg-destructive/10 text-destructive border-destructive/25",
  failed: "bg-destructive/10 text-destructive border-destructive/25",
  critical: "bg-destructive/10 text-destructive border-destructive/25",
  escalated: "bg-destructive/10 text-destructive border-destructive/25",
  high: "bg-destructive/10 text-destructive border-destructive/25",
  refunded: "bg-destructive/10 text-destructive border-destructive/25",
};

export function StatusPill({ status, dot = true }: { status: string; dot?: boolean }) {
  const tone = statusTones[status.toLowerCase()] ?? "bg-muted text-muted-foreground border-border";
  const live = status.toLowerCase() === "on call";

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap",
        tone,
      )}
    >
      {dot ? (
        <span className={cn("relative size-1.5 rounded-full bg-current", live && "pulse-dot")} />
      ) : null}
      {status}
    </span>
  );
}

export function Waveform({ active = true }: { active?: boolean }) {
  const bars = [8, 16, 26, 14, 22, 32, 12, 20, 28, 10, 18, 24, 9, 15];
  if (!active) {
    return <span className="block h-8 w-full rounded bg-muted" aria-hidden />;
  }
  return (
    <span className="flex h-8 items-center gap-[3px]" aria-hidden>
      {bars.map((h, i) => (
        <span
          key={i}
          className="w-[3px] rounded-full bg-primary/70 animate-pulse"
          style={{ height: `${h}px`, animationDelay: `${i * 90}ms`, animationDuration: "1.1s" }}
        />
      ))}
    </span>
  );
}

export function Meter({ value, max, label }: { value: number; max: number; label?: string }) {
  const pct = Math.min(100, Math.round((value / max) * 100));
  return (
    <div className="min-w-32">
      <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
        <div
          className={cn(
            "h-full rounded-full",
            pct > 90 ? "bg-destructive" : pct > 70 ? "bg-warning" : "bg-primary",
          )}
          style={{ width: `${pct}%` }}
        />
      </div>
      <p className="mt-1 text-xs text-muted-foreground">{label ?? `${pct}% used`}</p>
    </div>
  );
}

/**
 * Thin `Button` wrapper kept for call-site consistency across the dash.
 * It no longer fires an automatic toast — every action button now owns
 * real behavior (state change, dialog, navigation, download, etc.) via
 * its own `onClick`, so a stray click never silently does nothing.
 */
export function ActionButton({
  children,
  ...props
}: ComponentProps<typeof Button>) {
  return <Button {...props}>{children}</Button>;
}

export function SmsNotice({ className }: { className?: string }) {
  return (
    <p
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border border-warning/35 bg-warning/15 px-2.5 py-1 text-xs font-semibold text-warning-foreground",
        className,
      )}
    >
      <MessageSquare className="size-3.5" /> SMS available for US numbers only
    </p>
  );
}
