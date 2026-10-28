import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Loader2, Lock } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AuthHeading, AuthShell, authButton, authField } from "@/components/auth/AuthShell";
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
      { name: "robots", content: "noindex" },
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
    <AuthShell
      headline="The platform console,"
      accent="for owners only."
      body="Workspaces, revenue, system health, support conversations, announcements and payment links for the whole platform."
      points={["Every workspace, plan and payment in one view", "Reply to customers from the support inbox", "Announce updates to all users at once"]}
      visual="analytics"
      footnote="Restricted to platform owners. Every sign-in uses a one-time code."
    >
      <form onSubmit={step === "email" ? handleSendCode : handleVerifyCode} noValidate>
        <span className="mb-5 inline-flex items-center gap-1.5 rounded-full bg-brand-yellow/30 px-3 py-1 text-[12px] font-bold tracking-wider text-[#6d5600] uppercase">
          <Lock className="size-3.5" /> Platform admin
        </span>

        {step === "email" ? (
          <>
            <AuthHeading title="Super admin sign in" lede="We'll email you a one-time code." />
            <div className="mt-8 space-y-5">
              <div>
                <Label htmlFor="admin-email" className="text-[15px] font-bold">
                  Admin email
                </Label>
                <Input
                  id="admin-email"
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
          </>
        ) : (
          <>
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
                <Label htmlFor="admin-code" className="text-[15px] font-bold">
                  Login code
                </Label>
                <Input
                  id="admin-code"
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
                Verify and enter console
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
          </>
        )}

        <p className="mt-8 text-center text-[15px] text-slate">
          Looking for your call floor?{" "}
          <Link to="/login" className="font-bold text-leaf hover:underline">
            Workspace sign in
          </Link>
        </p>
      </form>
    </AuthShell>
  );
}
