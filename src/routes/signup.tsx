import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Radio, Loader2, Check, X, CircleCheck } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  checkSlugAvailability,
  submitSignup,
  verifySignup,
  type AccountType,
} from "@/lib/auth-api";

export const Route = createFileRoute("/signup")({
  head: () => ({
    meta: [
      { title: "Create your account — Kchel Dialer" },
      {
        name: "description",
        content:
          "Create a Kchel Dialer workspace for your team or yourself: outbound and inbound calling, US SMS, and live call analytics.",
      },
    ],
  }),
  component: SignupPage,
});

type Step = "details" | "code" | "done";

function SignupPage() {
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>("details");
  const [busy, setBusy] = useState(false);

  const [accountType, setAccountType] = useState<AccountType>("business");
  const [fullName, setFullName] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [email, setEmail] = useState("");
  const [slug, setSlug] = useState("");
  const [code, setCode] = useState("");

  const [slugState, setSlugState] = useState<{
    checking: boolean;
    available: boolean | null;
    reason: string | null;
  }>({ checking: false, available: null, reason: null });

  // Debounced availability check so we're not firing a request per keystroke.
  useEffect(() => {
    if (slug.length < 3) {
      setSlugState({ checking: false, available: null, reason: null });
      return;
    }
    setSlugState((s) => ({ ...s, checking: true }));
    const timer = setTimeout(async () => {
      try {
        const result = await checkSlugAvailability(slug);
        setSlugState({
          checking: false,
          available: result.available,
          reason: result.reason,
        });
      } catch {
        setSlugState({ checking: false, available: null, reason: null });
      }
    }, 450);
    return () => clearTimeout(timer);
  }, [slug]);

  async function handleSubmitDetails(event: React.FormEvent) {
    event.preventDefault();

    if (!fullName.trim() || !email.trim() || !slug.trim()) {
      toast.error("Please fill in all the required fields.");
      return;
    }
    if (accountType === "business" && !companyName.trim()) {
      toast.error("Company name is required for business accounts.");
      return;
    }
    if (slugState.available === false) {
      toast.error(slugState.reason || "Pick a different workspace name.");
      return;
    }

    setBusy(true);
    try {
      await submitSignup({
        fullName: fullName.trim(),
        email,
        accountType,
        companyName: accountType === "business" ? companyName.trim() : undefined,
        workspaceSlug: slug,
      });
      toast.success("Verification code sent", { description: `Check ${email}.` });
      setStep("code");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not create your account.");
    } finally {
      setBusy(false);
    }
  }

  async function handleVerify(event: React.FormEvent) {
    event.preventDefault();
    if (code.trim().length !== 6) {
      toast.error("Enter the 6-digit code from your email.");
      return;
    }
    setBusy(true);
    try {
      await verifySignup(email, code);
      setStep("done");
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
            Start dialing in minutes.
          </h2>
          <p className="mt-3 text-sm text-sidebar-foreground/70">
            Outbound campaigns, inbound routing, recordings and US SMS — for solo operators and
            full call floors alike.
          </p>
        </div>
        <p className="text-xs text-sidebar-foreground/55">
          No password to remember — we sign you in with a one-time code.
        </p>
      </div>

      <div className="flex items-center justify-center px-5 py-12">
        {step === "details" && (
          <form className="w-full max-w-sm" onSubmit={handleSubmitDetails}>
            <div className="mb-8 flex items-center gap-3 lg:hidden">
              <span className="flex size-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                <Radio className="size-4.5" />
              </span>
              <span className="font-bold tracking-tight">Kchel Dialer</span>
            </div>

            <h1 className="text-2xl font-bold tracking-tight">Create your account</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Set up your workspace — takes about a minute.
            </p>

            <div className="mt-7 flex flex-col gap-4">
              <div className="flex flex-col gap-2">
                <Label>Account type</Label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setAccountType("business")}
                    className={`rounded-md border px-3 py-2 text-sm font-medium transition ${
                      accountType === "business"
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-input text-muted-foreground hover:border-primary/40"
                    }`}
                  >
                    Business
                  </button>
                  <button
                    type="button"
                    onClick={() => setAccountType("individual")}
                    className={`rounded-md border px-3 py-2 text-sm font-medium transition ${
                      accountType === "individual"
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-input text-muted-foreground hover:border-primary/40"
                    }`}
                  >
                    Individual
                  </button>
                </div>
              </div>

              <div className="flex flex-col gap-2">
                <Label htmlFor="fullName">Your name</Label>
                <Input
                  id="fullName"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  autoComplete="name"
                />
              </div>

              {accountType === "business" && (
                <div className="flex flex-col gap-2">
                  <Label htmlFor="companyName">Company name</Label>
                  <Input
                    id="companyName"
                    value={companyName}
                    onChange={(e) => setCompanyName(e.target.value)}
                    autoComplete="organization"
                  />
                </div>
              )}

              <div className="flex flex-col gap-2">
                <Label htmlFor="signupEmail">Email</Label>
                <Input
                  id="signupEmail"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value.toLowerCase())}
                  autoComplete="email"
                />
              </div>

              <div className="flex flex-col gap-2">
                <Label htmlFor="slug">Workspace name</Label>
                <div className="flex items-center rounded-md border border-input bg-background pr-3 focus-within:ring-1 focus-within:ring-ring">
                  <Input
                    id="slug"
                    value={slug}
                    placeholder="your-team"
                    onChange={(e) =>
                      setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))
                    }
                    className="border-0 shadow-none focus-visible:ring-0"
                  />
                  <span className="shrink-0 font-mono text-xs text-muted-foreground">
                    .kchel.app
                  </span>
                </div>
                {slug.length >= 3 && (
                  <p
                    className={`flex items-center gap-1.5 text-xs ${
                      slugState.available === true
                        ? "text-success"
                        : slugState.available === false
                          ? "text-destructive"
                          : "text-muted-foreground"
                    }`}
                  >
                    {slugState.checking ? (
                      <>
                        <Loader2 className="size-3 animate-spin" /> Checking availability…
                      </>
                    ) : slugState.available === true ? (
                      <>
                        <Check className="size-3" /> {slug}.kchel.app is available
                      </>
                    ) : slugState.available === false ? (
                      <>
                        <X className="size-3" /> {slugState.reason}
                      </>
                    ) : null}
                  </p>
                )}
              </div>

              <Button type="submit" className="w-full" disabled={busy}>
                {busy ? <Loader2 className="size-4 animate-spin" /> : null}
                Create account
              </Button>
            </div>

            <p className="mt-6 text-center text-sm text-muted-foreground">
              Already have an account?{" "}
              <Link to="/login" className="font-semibold text-primary hover:underline">
                Sign in
              </Link>
            </p>
          </form>
        )}

        {step === "code" && (
          <form className="w-full max-w-sm" onSubmit={handleVerify}>
            <h1 className="text-2xl font-bold tracking-tight">Verify your email</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              We sent a 6-digit code to <span className="font-medium">{email}</span>.
            </p>

            <div className="mt-7 flex flex-col gap-4">
              <div className="flex flex-col gap-2">
                <Label htmlFor="signupCode">Verification code</Label>
                <Input
                  id="signupCode"
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
                Verify email
              </Button>

              <button
                type="button"
                className="text-center text-sm text-muted-foreground hover:underline"
                onClick={() => {
                  setStep("details");
                  setCode("");
                }}
              >
                Go back and edit details
              </button>
            </div>
          </form>
        )}

        {step === "done" && (
          <div className="w-full max-w-sm text-center">
            <span className="mx-auto flex size-12 items-center justify-center rounded-full bg-success/15 text-success">
              <CircleCheck className="size-6" />
            </span>
            <h1 className="mt-5 text-2xl font-bold tracking-tight">Email verified</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Your workspace{" "}
              <span className="font-mono font-medium text-foreground">{slug}.kchel.app</span> has
              been created and is awaiting approval. We'll email you as soon as it's live.
            </p>
            <Button className="mt-7 w-full" onClick={() => navigate({ to: "/login" })}>
              Back to sign in
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
