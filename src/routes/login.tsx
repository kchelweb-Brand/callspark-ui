import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { requestLoginCode, verifyLoginCode, saveSession } from "@/lib/auth-api";
import { AuthHeading, AuthShell, authButton, authField } from "@/components/auth/AuthShell";

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

  // The invitation email links here with the workspace and address filled in.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const w = params.get("workspace");
    const e = params.get("email");
    if (w) setWorkspace(w);
    if (e) setEmail(e);
  }, []);

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
      const { token, user } = await verifyLoginCode({
        email,
        code,
        purpose: "login",
        ...(workspace.trim() ? { workspaceSlug: workspace.trim() } : {}),
      });
      saveSession(token, user);
      toast.success("Welcome back", { description: "Opening your workspace…" });
      // Invited agents have their own, narrower dashboard.
      navigate({ to: user.role === "agent" ? "/agent" : "/dashboard" });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Invalid or expired code.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthShell
      headline="Your whole call floor,"
      accent="one workspace."
      body="Power dialing, AI voice agents, live call monitoring, recordings, analytics and text messaging, in one place built for teams that live on the phone."
      points={["Call over your own SIP line, from a browser or Windows", "AI voice agents work your list and tag every call", "Menus, extensions and voicemail you control"]}
      visual="queue"
      footnote="Sign in with a one-time code sent to your email. There is no password to remember."
    >
      {step === "email" ? (
        <form onSubmit={handleSendCode} noValidate>
          <AuthHeading title="Sign in to your workspace" lede="We'll email you a one-time code. No password needed." />

          <div className="mt-8 space-y-5">
            <div>
              <Label htmlFor="workspace" className="text-[15px] font-bold">
                Workspace
              </Label>
              <div className="mt-2 flex h-12 items-center rounded-md border border-ink/25 bg-white pr-3.5 focus-within:border-leaf focus-within:ring-2 focus-within:ring-leaf/25">
                <Input
                  id="workspace"
                  value={workspace}
                  autoComplete="organization"
                  onChange={(e) => setWorkspace(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))}
                  className="h-full flex-1 border-0 bg-transparent px-3.5 text-[16px] shadow-none focus-visible:ring-0"
                />
                <span className="shrink-0 font-mono text-[13px] text-slate">.kchel.app</span>
              </div>
            </div>

            <div>
              <Label htmlFor="email" className="text-[15px] font-bold">
                Work email
              </Label>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value.toLowerCase())}
                className={authField}
              />
            </div>

            <button type="submit" className={authButton} disabled={busy}>
              {busy ? <Loader2 className="size-4 animate-spin" /> : null}
              Send login code
            </button>
          </div>

          <p className="mt-8 text-center text-[15px] text-slate">
            New to Kchel?{" "}
            <Link to="/signup" className="font-bold text-leaf hover:underline">
              Start your free trial
            </Link>
          </p>
        </form>
      ) : (
        <form onSubmit={handleVerifyCode} noValidate>
          <AuthHeading
            title="Enter your code"
            lede={
              <>
                We sent a 6-digit code to <span className="font-bold text-ink">{email}</span>.
              </>
            }
          />

          <div className="mt-8 space-y-5">
            <div>
              <Label htmlFor="code" className="text-[15px] font-bold">
                Login code
              </Label>
              <Input
                id="code"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                placeholder="123456"
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                className={`${authField} text-center font-mono text-[22px] tracking-[0.4em]`}
                autoFocus
              />
            </div>

            <button type="submit" className={authButton} disabled={busy}>
              {busy ? <Loader2 className="size-4 animate-spin" /> : null}
              Verify and sign in
            </button>

            <button
              type="button"
              className="block w-full text-center text-[15px] font-semibold text-slate hover:text-ink hover:underline"
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
    </AuthShell>
  );
}
