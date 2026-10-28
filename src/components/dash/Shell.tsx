import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { ArrowLeftRight, LifeBuoy, LogOut, Menu, Search } from "lucide-react";
import { useState, type ReactNode } from "react";

import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { AuthGuard } from "@/components/auth/AuthGuard";
import { SoftphoneBar } from "@/components/dash/SoftphoneBar";
import { clearSession, getSessionUser } from "@/lib/auth-api";
import { tenantNavGroups, adminNav, agentNav, type NavGroup } from "./nav";
import { NotificationBell } from "./NotificationBell";
import { Logo } from "@/components/brand/Logo";

type Scope = "tenant" | "admin" | "agent";

function NavGroups({ groups, onNavigate }: { groups: NavGroup[]; onNavigate?: (() => void) | undefined }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  return (
    <nav className="flex flex-col gap-5 px-3" aria-label="Main">
      {groups.map((group) => (
        <div key={group.label}>
          <p className="mb-1.5 px-3 text-[11px] font-bold tracking-[0.14em] text-sidebar-foreground/50 uppercase">
            {group.label}
          </p>
          <div className="flex flex-col gap-0.5">
            {group.items.map((item) => {
              const active =
                item.to === "/" || item.to === "/admin" ? pathname === item.to : pathname.startsWith(item.to);
              return (
                <Link
                  key={item.to}
                  to={item.to}
                  onClick={onNavigate}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "group relative flex items-center gap-3 rounded-md px-3 py-2 text-[14px] font-semibold transition-colors",
                    active
                      ? "bg-sidebar-accent text-white"
                      : "text-sidebar-foreground/80 hover:bg-sidebar-accent/60 hover:text-white",
                  )}
                >
                  {active && <span className="absolute top-1.5 bottom-1.5 left-0 w-[3px] rounded-r bg-brand-green" />}
                  <item.icon className={cn("size-[18px] shrink-0", active ? "text-brand-green" : "opacity-80")} />
                  <span className="truncate">{item.label}</span>
                </Link>
              );
            })}
          </div>
        </div>
      ))}
    </nav>
  );
}

function SidebarBody({ scope, onNavigate }: { scope: Scope; onNavigate?: (() => void) | undefined }) {
  const sessionUser = getSessionUser();
  const groups: NavGroup[] =
    scope === "admin"
      ? [{ label: "Platform", items: adminNav }]
      : scope === "agent"
        ? [{ label: "Workspace", items: agentNav }]
        : tenantNavGroups;

  return (
    <div className="flex h-full flex-col bg-sidebar py-5">
      <Link to="/" onClick={onNavigate} className="mb-5 flex items-center px-6" aria-label="Kchel Dialer website">
        <Logo markClassName="size-9" className="text-[1.1rem] [&_span]:!text-white" />
      </Link>

      <div className="mb-5 px-4">
        <div className="rounded-lg border border-sidebar-border bg-sidebar-accent/50 px-3.5 py-3">
          <p className="text-[11px] font-bold tracking-[0.14em] text-sidebar-foreground/55 uppercase">
            {scope === "admin" ? "Platform owner" : scope === "agent" ? "Agent" : "Workspace"}
          </p>
          <p className="mt-0.5 flex items-center gap-2 truncate text-[14px] font-bold text-white">
            <span className="size-2 shrink-0 rounded-full bg-brand-green" />
            <span className="truncate">
              {scope === "admin"
                ? "Admin console"
                : sessionUser?.workspace_slug
                  ? `${sessionUser.workspace_slug}.kchel.app`
                  : "Your workspace"}
            </span>
          </p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto pb-4 [scrollbar-color:#1c4167_transparent] [scrollbar-width:thin]">
        <NavGroups groups={groups} onNavigate={onNavigate} />
      </div>

      <div className="mt-2 flex flex-col gap-0.5 border-t border-sidebar-border px-3 pt-4">
        {scope !== "agent" && (
          <Link
            to={scope === "admin" ? "/dashboard" : "/admin"}
            onClick={onNavigate}
            className="flex items-center gap-3 rounded-md px-3 py-2 text-[14px] font-semibold text-sidebar-foreground/80 transition-colors hover:bg-sidebar-accent/60 hover:text-white"
          >
            <ArrowLeftRight className="size-[18px] opacity-80" />
            {scope === "admin" ? "Workspace view" : "Platform console"}
          </Link>
        )}
        <Link
          to="/faq"
          onClick={onNavigate}
          className="flex items-center gap-3 rounded-md px-3 py-2 text-[14px] font-semibold text-sidebar-foreground/80 transition-colors hover:bg-sidebar-accent/60 hover:text-white"
        >
          <LifeBuoy className="size-[18px] opacity-80" />
          Help centre
        </Link>
        <SignOutButton scope={scope} onNavigate={onNavigate} />
      </div>
    </div>
  );
}

function SignOutButton({ scope, onNavigate }: { scope: Scope; onNavigate?: (() => void) | undefined }) {
  const navigate = useNavigate();

  return (
    <button
      type="button"
      onClick={() => {
        clearSession();
        onNavigate?.();
        void navigate({ to: scope === "admin" ? "/admin/login" : "/login" });
      }}
      className="flex items-center gap-3 rounded-md px-3 py-2 text-[14px] font-semibold text-sidebar-foreground/80 transition-colors hover:bg-sidebar-accent/60 hover:text-white"
    >
      <LogOut className="size-[18px] opacity-80" />
      Sign out
    </button>
  );
}

export function Shell({
  scope,
  title,
  description,
  actions,
  children,
}: {
  scope: Scope;
  title: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const user = getSessionUser();

  return (
    <AuthGuard scope={scope}>
      <div className="min-h-screen w-full bg-background font-sans text-foreground antialiased">
        <aside className="fixed inset-y-0 left-0 z-30 hidden w-[264px] border-r border-sidebar-border lg:block">
          <SidebarBody scope={scope} />
        </aside>

        <div className="lg:pl-[264px]">
          <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-border bg-white px-4 md:px-8">
            <Sheet open={open} onOpenChange={setOpen}>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon" className="lg:hidden" aria-label="Open navigation">
                  <Menu className="size-5" />
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="w-72 border-sidebar-border bg-sidebar p-0">
                <SidebarBody scope={scope} onNavigate={() => setOpen(false)} />
              </SheetContent>
            </Sheet>

            <div className="relative hidden max-w-md flex-1 md:block">
              <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-slate" />
              <Input
                placeholder="Search contacts, agents, campaigns…"
                aria-label="Search"
                className="h-10 rounded-md border-transparent bg-mist pl-10 text-[14.5px] shadow-none focus-visible:border-leaf focus-visible:bg-white"
              />
            </div>

            <div className="ml-auto flex items-center gap-3">
              <NotificationBell />
              <span className="hidden h-6 w-px bg-border sm:block" />
              <div className="flex items-center gap-2.5">
                <span className="flex size-9 items-center justify-center rounded-full bg-navy text-[13px] font-extrabold text-white">
                  {(user?.email || "?").slice(0, 2).toUpperCase()}
                </span>
                <span className="hidden max-w-[11rem] truncate text-[13.5px] font-semibold md:block">{user?.email}</span>
              </div>
            </div>
          </header>

          <main className="px-4 py-8 md:px-8 md:py-10">
            <div className="mx-auto flex max-w-[1400px] flex-col gap-7">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
                <div className="min-w-0">
                  <h1 className="text-[1.75rem] leading-tight font-extrabold tracking-tight md:text-[2rem]">{title}</h1>
                  {description ? (
                    <p className="mt-1.5 max-w-3xl text-[15px] leading-relaxed text-muted-foreground">{description}</p>
                  ) : null}
                </div>
                {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
              </div>
              {children}
            </div>
          </main>
        </div>

        {/* Tenant only — the platform admin console has no carrier connection. */}
        {scope !== "admin" && <SoftphoneBar />}
      </div>
    </AuthGuard>
  );
}
