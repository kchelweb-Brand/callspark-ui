import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Radio, Loader2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { requestLoginCode, verifyLoginCode, saveSession } from "@/lib/auth-api";

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
  const [step, setStep] = useState<"email" | "code">("email");
  const [email, setEmail] = useState("");
  const [workspace, setWorkspace] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);

  async function handleSendCode(event: React.FormEvent) {
    event.preventDefault();
    if (!email) {
      toast.error("Enter your work email to continue.");
      return;
    }
    setBusy(true);
    try {
      await requestLoginCode({ email, purpose: "login", workspaceSlug: workspace });
      toast.success("Code sent", { description: `Check ${email} for your login code.` });
      setStep("code");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not send code.");
    } finally {
      setBusy(false);
    }
  }

  async function handleVerifyCode(event: React.FormEvent) {
    event.preventDefault();
    if (code.trim().length !== 6) {
      toast.error("Enter the 6-digit code from your email.");
      return;
    }
    setBusy(true);
    try {
      const { token, user } = await verifyLoginCode({ email, code, purpose: "login" });
      saveSession(token, user);
      toast.success("Welcome back", { description: "Opening your workspace…" });
      navigate({ to: "/dashboard" });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Invalid or expired code.");
    } finally {
      setBusy(false);
    }
  }

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
          Sign in with a one-time code sent to your email — no password needed.
        </p>
      </div>

      <div className="flex items-center justify-center px-5 py-12">
        {step === "email" ? (
          <form className="w-full max-w-sm" onSubmit={handleSendCode}>
            <div className="mb-8 flex items-center gap-3 lg:hidden">
              <span className="flex size-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                <Radio className="size-4.5" />
              </span>
              <span className="font-bold tracking-tight">Kchel Dialer</span>
            </div>

            <h1 className="text-2xl font-bold tracking-tight">Sign in to your workspace</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              We'll email you a one-time code — no password required.
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
                  onChange={(e) => setEmail(e.target.value.toLowerCase())}
                />
              </div>

              <Button type="submit" className="w-full" disabled={busy}>
                {busy ? <Loader2 className="size-4 animate-spin" /> : null}
                Send login code
              </Button>
            </div>

            <p className="mt-6 text-center text-sm text-muted-foreground">
              New here?{" "}
              <Link to="/signup" className="font-semibold text-primary hover:underline">
                Create an account
              </Link>
            </p>
          </form>
        ) : (
          <form className="w-full max-w-sm" onSubmit={handleVerifyCode}>
            <div className="mb-8 flex items-center gap-3 lg:hidden">
              <span className="flex size-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                <Radio className="size-4.5" />
              </span>
              <span className="font-bold tracking-tight">Kchel Dialer</span>
            </div>

            <h1 className="text-2xl font-bold tracking-tight">Enter your code</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              We sent a 6-digit code to <span className="font-medium">{email}</span>.
            </p>

            <div className="mt-7 flex flex-col gap-4">
              <div className="flex flex-col gap-2">
                <Label htmlFor="code">Login code</Label>
                <Input
                  id="code"
                  inputMode="numeric"
                  maxLength={6}
                  placeholder="123456"
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                  className="font-mono tracking-[0.3em]"
                  autoFocus
                />
              </div>

              <Button type="submit" className="w-full" disabled={busy}>
                {busy ? <Loader2 className="size-4 animate-spin" /> : null}
                Verify & sign in
              </Button>

              <button
                type="button"
                className="text-center text-sm text-muted-foreground hover:underline"
                onClick={() => {
                  setStep("email");
                  setCode("");
                }}
              >
                Use a different email
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
