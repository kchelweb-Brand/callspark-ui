import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Radio, Loader2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";

export const Route = createFileRoute("/login")({
  head: () => ({
    meta: [
      { title: "Sign in — Kchel Dialer" },
      {
        name: "description",
        content:
          "Sign in to your Kchel Dialer workspace to run campaigns, take calls and send SMS.",
      },
      { property: "og:title", content: "Sign in — Kchel Dialer" },
      {
        property: "og:description",
        content: "Agent, manager and admin access to your Kchel Dialer workspace.",
      },
    ],
  }),
  component: LoginPage,
});

function LoginPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("mara@bluewaveoutreach.com");
  const [password, setPassword] = useState("");
  const [workspace, setWorkspace] = useState("bluewave");
  const [busy, setBusy] = useState(false);

  return (
    <div className="grid min-h-screen w-full lg:grid-cols-2">
      <div className="hidden flex-col justify-between bg-sidebar p-12 lg:flex">
        <div className="flex items-center gap-3">
          <span className="flex size-10 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
            <Radio className="size-5" />
          </span>
          <span className="text-lg font-bold tracking-tight text-sidebar-accent-foreground">
            Kchel Dialer
          </span>
        </div>
        <div className="max-w-md">
          <h2 className="text-3xl font-bold leading-tight text-sidebar-accent-foreground">
            Your whole call floor, one workspace.
          </h2>
          <p className="mt-3 text-sm text-sidebar-foreground/70">
            Power dialing, live call monitoring, recordings, analytics and US SMS — built for
            outbound teams.
          </p>
        </div>
        <p className="text-xs text-sidebar-foreground/55">
          Bluewave Outreach · workspace on Kchel Dialer
        </p>
      </div>

      <div className="flex items-center justify-center px-5 py-12">
        <form
          className="w-full max-w-sm"
          onSubmit={(event) => {
            event.preventDefault();
            if (!email || !password) {
              toast.error("Enter your email and password to continue.");
              return;
            }
            setBusy(true);
            toast.success("Welcome back", { description: "Opening your workspace…" });
            setTimeout(() => navigate({ to: "/" }), 500);
          }}
        >
          <div className="mb-8 flex items-center gap-3 lg:hidden">
            <span className="flex size-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <Radio className="size-4.5" />
            </span>
            <span className="font-bold tracking-tight">Kchel Dialer</span>
          </div>

          <h1 className="text-2xl font-bold tracking-tight">Sign in to your workspace</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            For agents, supervisors and workspace admins.
          </p>

          <div className="mt-7 flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="workspace">Workspace</Label>
              <div className="flex items-center rounded-md border border-input bg-background pr-3 focus-within:ring-1 focus-within:ring-ring">
                <Input
                  id="workspace"
                  value={workspace}
                  onChange={(e) => setWorkspace(e.target.value)}
                  className="border-0 shadow-none focus-visible:ring-0"
                />
                <span className="shrink-0 font-mono text-xs text-muted-foreground">
                  .kchel.app
                </span>
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="email">Work email</Label>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>

            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="password">Password</Label>
                <button
                  type="button"
                  className="text-xs font-semibold text-primary hover:underline"
                  onClick={() =>
                    toast.success("Reset link sent", {
                      description: `Check ${email || "your inbox"} for instructions.`,
                    })
                  }
                >
                  Forgot password?
                </button>
              </div>
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>

            <label className="flex items-center gap-2 text-sm text-muted-foreground">
              <Checkbox defaultChecked /> Keep me signed in on this device
            </label>

            <Button type="submit" className="w-full" disabled={busy}>
              {busy ? <Loader2 className="size-4 animate-spin" /> : null}
              Sign in
            </Button>
          </div>

          <p className="mt-6 text-center text-sm text-muted-foreground">
            Platform owner?{" "}
            <Link to="/admin/login" className="font-semibold text-primary hover:underline">
              Super admin sign in
            </Link>
          </p>
        </form>
      </div>
    </div>
  );
}
