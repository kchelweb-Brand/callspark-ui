import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ShieldCheck, Loader2, Lock } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { requestLoginCode, verifyLoginCode, saveSession } from "@/lib/auth-api";

export const Route = createFileRoute("/admin/login")({
  head: () => ({
    meta: [
      { title: "Super Admin Sign In — Kchel Admin" },
      {
        name: "description",
        content:
          "Restricted platform owner access to the Kchel Dialer super admin console: tenants, system health and revenue.",
      },
      { property: "og:title", content: "Super Admin Sign In — Kchel Admin" },
      {
        property: "og:description",
        content: "Platform owner entry point for the Kchel Dialer admin console.",
      },
    ],
  }),
  component: AdminLoginPage,
});

function AdminLoginPage() {
  const navigate = useNavigate();
  const [step, setStep] = useState<"email" | "code">("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);

  async function handleSendCode(event: React.FormEvent) {
    event.preventDefault();
    if (!email) {
      toast.error("Admin email is required.");
      return;
    }
    setBusy(true);
    try {
      await requestLoginCode({ email, purpose: "admin_login" });
      toast.success("Code sent", { description: `Check ${email} for your admin login code.` });
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
      const { token, user } = await verifyLoginCode({ email, code, purpose: "admin_login" });
      saveSession(token, user);
      toast.success("Admin session started", { description: "Opening the platform console…" });
      navigate({ to: "/admin" });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Invalid or expired code.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen w-full items-center justify-center bg-sidebar px-5 py-12">
      <form
        className="w-full max-w-md rounded-xl border border-sidebar-border bg-sidebar-accent/50 p-7 shadow-lift"
        onSubmit={step === "email" ? handleSendCode : handleVerifyCode}
      >
        <div className="flex items-center gap-3">
          <span className="flex size-10 items-center justify-center rounded-lg bg-warning/20 text-warning-foreground">
            <ShieldCheck className="size-5" />
          </span>
          <div>
            <p className="text-sm font-bold tracking-tight text-sidebar-accent-foreground">
              Kchel Dialer
            </p>
            <span className="mt-0.5 inline-flex items-center gap-1 rounded-full border border-warning/40 bg-warning/20 px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.16em] text-warning-foreground">
              <Lock className="size-3" /> Platform admin
            </span>
          </div>
        </div>

        {step === "email" ? (
          <>
            <h1 className="mt-6 text-2xl font-bold tracking-tight text-sidebar-accent-foreground">
              Super admin sign in
            </h1>
            <p className="mt-1 text-sm text-sidebar-foreground/70">
              Restricted to platform owners. We'll email you a one-time code.
            </p>

            <div className="mt-7 flex flex-col gap-4">
              <div className="flex flex-col gap-2">
                <Label htmlFor="admin-email" className="text-sidebar-foreground/80">
                  Admin email
                </Label>
                <Input
                  id="admin-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="border-sidebar-border bg-sidebar text-sidebar-accent-foreground"
                />
              </div>

              <Button type="submit" className="w-full" disabled={busy}>
                {busy ? <Loader2 className="size-4 animate-spin" /> : null}
                Send login code
              </Button>
            </div>
          </>
        ) : (
          <>
            <h1 className="mt-6 text-2xl font-bold tracking-tight text-sidebar-accent-foreground">
              Enter your code
            </h1>
            <p className="mt-1 text-sm text-sidebar-foreground/70">
              We sent a 6-digit code to <span className="font-medium">{email}</span>.
            </p>

            <div className="mt-7 flex flex-col gap-4">
              <div className="flex flex-col gap-2">
                <Label htmlFor="admin-code" className="text-sidebar-foreground/80">
                  Login code
                </Label>
                <Input
                  id="admin-code"
                  inputMode="numeric"
                  maxLength={6}
                  placeholder="123456"
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                  className="border-sidebar-border bg-sidebar font-mono tracking-[0.3em] text-sidebar-accent-foreground"
                  autoFocus
                />
              </div>

              <Button type="submit" className="w-full" disabled={busy}>
                {busy ? <Loader2 className="size-4 animate-spin" /> : null}
                Verify & enter console
              </Button>

              <button
                type="button"
                className="text-center text-sm text-sidebar-foreground/70 hover:underline"
                onClick={() => {
                  setStep("email");
                  setCode("");
                }}
              >
                Use a different email
              </button>
            </div>
          </>
        )}

        <p className="mt-6 text-center text-sm text-sidebar-foreground/70">
          Looking for your call floor?{" "}
          <Link to="/login" className="font-semibold text-sidebar-primary-foreground underline">
            Tenant sign in
          </Link>
        </p>
      </form>
    </div>
  );
}
