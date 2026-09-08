import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { Menu, Search, Bell, ArrowLeftRight, LogOut } from "lucide-react";
import { useState, type ReactNode } from "react";

import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { AuthGuard } from "@/components/auth/AuthGuard";
import { SoftphoneBar } from "@/components/dash/SoftphoneBar";
import { clearSession, getSessionUser } from "@/lib/auth-api";
import { tenantNav, adminNav, type NavItem } from "./nav";
import { LogoMark } from "@/components/brand/Logo";

type Scope = "tenant" | "admin";

function NavList({ items, onNavigate }: { items: NavItem[]; onNavigate?: (() => void) | undefined }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  return (
    <nav className="flex flex-col gap-1 px-3">
      {items.map((item) => {
        const active =
          item.to === "/" || item.to === "/admin"
            ? pathname === item.to
            : pathname.startsWith(item.to);
        return (
          <Link
            key={item.to}
            to={item.to}
            onClick={onNavigate}
            className={cn(
              "group flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
              active
                ? "bg-sidebar-primary text-sidebar-primary-foreground shadow-lift"
                : "text-sidebar-foreground/75 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
            )}
          >
            <item.icon className="size-4 shrink-0" />
            <span className="truncate">{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

function SidebarBody({ scope, onNavigate }: { scope: Scope; onNavigate?: (() => void) | undefined }) {
  const sessionUser = getSessionUser();
  const items = scope === "admin" ? adminNav : tenantNav;

  return (
    <div className="flex h-full flex-col bg-sidebar py-5">
      <div className="mb-6 flex items-center gap-3 px-6">
        <LogoMark className="size-9" />
        <span className="leading-tight">
          <span className="block text-sm font-bold tracking-tight text-sidebar-accent-foreground">
            Kchel Dialer
          </span>
          <span className="block text-[11px] font-medium uppercase tracking-[0.14em] text-sidebar-foreground/55">
            {scope === "admin" ? "Platform admin" : "Dialer suite"}
          </span>
        </span>
      </div>

      <div className="mb-3 px-6">
        <div className="rounded-lg border border-sidebar-border bg-sidebar-accent/60 px-3 py-2.5">
          <p className="text-[11px] uppercase tracking-wider text-sidebar-foreground/55">
            {scope === "admin" ? "Environment" : "Workspace"}
          </p>
          <p className="truncate text-sm font-semibold text-sidebar-accent-foreground">
            {scope === "admin"
              ? "Production · US-East"
              : sessionUser?.workspace_slug
                ? `${sessionUser.workspace_slug}.kchel.app`
                : "Workspace"}
          </p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        <NavList items={items} onNavigate={onNavigate} />
      </div>

      <div className="mt-4 flex flex-col gap-1 px-3">
        <Link
          to={scope === "admin" ? "/" : "/admin"}
          onClick={onNavigate}
          className="flex items-center gap-3 rounded-lg border border-sidebar-border px-3 py-2 text-sm font-medium text-sidebar-foreground/80 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
        >
          <ArrowLeftRight className="size-4" />
          {scope === "admin" ? "Tenant dashboard" : "Super admin"}
        </Link>
        <SignOutButton scope={scope} onNavigate={onNavigate} />
      </div>
    </div>
  );
}

function SignOutButton({
  scope,
  onNavigate,
}: {
  scope: Scope;
  onNavigate?: (() => void) | undefined;
}) {
  const navigate = useNavigate();

  return (
    <button
      type="button"
      onClick={() => {
        clearSession();
        onNavigate?.();
        void navigate({ to: scope === "admin" ? "/admin/login" : "/login" });
      }}
      className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-sidebar-foreground/70 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
    >
      <LogOut className="size-4" />
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
    <div className="min-h-screen w-full bg-background">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 border-r border-sidebar-border lg:block">
        <SidebarBody scope={scope} />
      </aside>

      <div className="lg:pl-64">
        <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-border bg-card/85 px-4 backdrop-blur md:px-6">
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

          <div className="relative hidden max-w-sm flex-1 md:block">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input placeholder="Search contacts, agents, campaigns…" className="pl-9" />
          </div>

          <div className="ml-auto flex items-center gap-2">
            <Button variant="ghost" size="icon" aria-label="Notifications">
              <Bell className="size-5" />
            </Button>
            <span className="flex size-9 items-center justify-center rounded-full bg-primary/12 text-sm font-bold text-primary">
              {(user?.email || "?").slice(0, 2).toUpperCase()}
            </span>
          </div>
        </header>

        <main className="px-4 py-6 md:px-6 md:py-8">
          <div className="mx-auto flex max-w-[1400px] flex-col gap-6">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <h1 className="text-2xl font-bold tracking-tight md:text-3xl">{title}</h1>
                {description ? (
                  <p className="mt-1 text-sm text-muted-foreground">{description}</p>
                ) : null}
              </div>
              {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
            </div>
            {children}
          </div>
        </main>
      </div>

      {/* Tenant only — the platform admin console has no carrier connection. */}
      {scope === "tenant" && <SoftphoneBar />}
    </div>
    </AuthGuard>
  );
}
