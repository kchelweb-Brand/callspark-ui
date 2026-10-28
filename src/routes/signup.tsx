import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Loader2, Check, X, CircleCheck, TriangleAlert } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  checkSlugAvailability,
  resendPhoneCode,
  submitSignup,
  verifySignup,
  type AccountType,
} from "@/lib/auth-api";
import { COUNTRIES, countryByCode } from "@/backend/countries";
import { LogoMark } from "@/components/brand/Logo";
import { AuthArt } from "@/components/auth/AuthArt";

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
  // A delivery failure needs to stay on screen — a toast disappears before
  // someone has finished reading why their code never arrived.
  const [submitError, setSubmitError] = useState<string | null>(null);

  const [accountType, setAccountType] = useState<AccountType>("business");
  const [fullName, setFullName] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [phone, setPhone] = useState("");
  const [country, setCountry] = useState("");
  const [city, setCity] = useState("");
  const [address, setAddress] = useState("");
  const [website, setWebsite] = useState("");
  const [phoneCode, setPhoneCode] = useState("");
  const [phoneCodeSent, setPhoneCodeSent] = useState(false);
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
    if (!country || !city.trim() || !phone.trim()) {
      toast.error("Choose your country and enter your city and phone number.");
      return;
    }

    setBusy(true);
    setSubmitError(null);
    try {
      const result = await submitSignup({
        fullName: fullName.trim(),
        email,
        accountType,
        companyName: accountType === "business" ? companyName.trim() : undefined,
        phone: phone.trim(),
        country,
        city: city.trim(),
        address: address.trim() || undefined,
        website: website.trim() || undefined,
        workspaceSlug: slug,
      });
      setPhoneCodeSent(result.phoneCodeSent);
      toast.success("Verification code sent", {
        description: result.phoneCodeSent ? `Check ${email} and your phone.` : `Check ${email}.`,
      });
      setStep("code");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Could not create your account.";
      setSubmitError(message);
      toast.error(message);
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
    if (phoneCodeSent && phoneCode.trim().length !== 6) {
      toast.error("Enter the 6-digit code we texted to your phone.");
      return;
    }
    setBusy(true);
    try {
      await verifySignup(email, code, phoneCodeSent ? phoneCode : undefined);
      setStep("done");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Invalid or expired code.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid min-h-screen w-full lg:grid-cols-2">
      <AuthArt
        headline="Start dialing"
        accent="in minutes."
        body="Outbound campaigns, inbound routing, recordings and US SMS — for solo operators and full call floors alike."
        points={["Set up your workspace in about a minute", "Bring your own SIP line, or let us manage it", "No password to remember"]}
        footnote="No password to remember — we sign you in with a one-time code."
      />

      <div className="ks-mesh flex items-center justify-center px-5 py-12">
        {step === "details" && (
          <form className="w-full max-w-sm" onSubmit={handleSubmitDetails}>
            <div className="mb-8 flex items-center gap-3 lg:hidden">
              <LogoMark className="size-9" />
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
                <Label htmlFor="signupCountry">Country</Label>
                <select
                  id="signupCountry"
                  value={country}
                  onChange={(e) => setCountry(e.target.value)}
                  autoComplete="country"
                  className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                >
                  <option value="">Choose your country…</option>
                  {COUNTRIES.map((c) => (
                    <option key={c.code} value={c.code}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="flex flex-col gap-2">
                  <Label htmlFor="signupCity">City</Label>
                  <Input id="signupCity" value={city} onChange={(e) => setCity(e.target.value)} autoComplete="address-level2" />
                </div>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="signupAddress">
                    Address <span className="text-muted-foreground">(optional)</span>
                  </Label>
                  <Input id="signupAddress" value={address} onChange={(e) => setAddress(e.target.value)} autoComplete="street-address" />
                </div>
              </div>

              <div className="flex flex-col gap-2">
                <Label htmlFor="signupWebsite">
                  Website <span className="text-muted-foreground">(optional)</span>
                </Label>
                <Input
                  id="signupWebsite"
                  placeholder="yourcompany.com"
                  value={website}
                  onChange={(e) => setWebsite(e.target.value)}
                  autoComplete="url"
                />
              </div>

              <div className="flex flex-col gap-2">
                <Label htmlFor="signupPhone">Mobile phone</Label>
                <div className="flex items-center rounded-md border border-input bg-background pl-3 focus-within:ring-1 focus-within:ring-ring">
                  <span className="shrink-0 font-mono text-sm text-muted-foreground">
                    {countryByCode(country) ? `+${countryByCode(country)?.dial}` : "+"}
                  </span>
                  <Input
                    id="signupPhone"
                    type="tel"
                    placeholder="803 406 4184"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    autoComplete="tel-national"
                    className="border-0 shadow-none focus-visible:ring-0"
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  We text a code to this number to confirm it&apos;s yours, and use it to set your
                  default country code so local numbers dial correctly from day one.
                </p>
              </div>

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

              {submitError && (
                <div
                  role="alert"
                  className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/8 p-3 text-sm text-destructive"
                >
                  <TriangleAlert className="mt-0.5 size-4 shrink-0" />
                  <span>{submitError}</span>
                </div>
              )}

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
            <h1 className="text-2xl font-bold tracking-tight">{phoneCodeSent ? "Verify your email and phone" : "Verify your email"}</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              We sent a 6-digit code to <span className="font-medium">{email}</span>
              {phoneCodeSent ? ", and another by text to your phone." : "."}
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

              {phoneCodeSent && (
                <div className="flex flex-col gap-2">
                  <Label htmlFor="signupPhoneCode">Code texted to your phone</Label>
                  <Input
                    id="signupPhoneCode"
                    inputMode="numeric"
                    maxLength={6}
                    placeholder="123456"
                    value={phoneCode}
                    onChange={(e) => setPhoneCode(e.target.value.replace(/\D/g, ""))}
                    className="font-mono tracking-[0.3em]"
                  />
                  <button
                    type="button"
                    className="self-start text-xs text-muted-foreground hover:underline"
                    onClick={() => {
                      void resendPhoneCode(email)
                        .then(() => toast.success("Sent a new text code"))
                        .catch((err) => toast.error(err instanceof Error ? err.message : "Couldn't resend the text."));
                    }}
                  >
                    Text me a new code
                  </button>
                </div>
              )}

              <Button type="submit" className="w-full" disabled={busy}>
                {busy ? <Loader2 className="size-4 animate-spin" /> : null}
                {phoneCodeSent ? "Verify and create workspace" : "Verify email"}
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
            <h1 className="mt-5 text-2xl font-bold tracking-tight">You're live</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Your workspace{" "}
              <span className="font-mono font-medium text-foreground">{slug}.kchel.app</span> is
              ready right now — no approval to wait on. Your 7-day trial started the moment you
              verified, so it's worth signing in and getting your first call routed today.
            </p>
            <Button className="mt-7 w-full" onClick={() => navigate({ to: "/login" })}>
              Sign in and get started
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
