"use client";

import { useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  Eye,
  EyeOff,
  Loader2,
  Mail,
  MailCheck,
  ShieldCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { TextInput } from "@/components/ui/form-field";
import { cn } from "@/lib/utils";
import {
  AuthServiceError,
  MIN_PASSWORD_LENGTH,
  OTP_LENGTH,
  resendSignupOtp,
  resetPasswordWithCode,
  sendLoginCode,
  sendPasswordResetCode,
  signInWithPassword,
  signUpWithEmail,
  verifyLoginCode,
  verifySignupOtp,
} from "@/services/auth-service";

type Mode = "signin" | "signup" | "code" | "reset";
type Step = "form" | "verify";
/** What the emailed code is for. */
type VerifyKind = "signup" | "login" | "reset";

const RESEND_COOLDOWN_SECONDS = 60;
// After this many wrong codes, nudge the user to ask for a fresh one.
const ATTEMPTS_BEFORE_NUDGE = 3;

function LabeledField({
  id,
  label,
  hint,
  children,
  action,
}: {
  id: string;
  label: string;
  hint?: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <label htmlFor={id} className="text-sm font-medium text-ink">
          {label}
        </label>
        {action}
      </div>
      <div className="mt-1.5">{children}</div>
      {hint ? (
        <p id={`${id}-hint`} className="mt-1 text-xs text-ink-subtle">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

function PasswordInput({
  id,
  value,
  onChange,
  autoComplete,
  placeholder,
  describedBy,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  autoComplete: "current-password" | "new-password";
  placeholder?: string;
  describedBy?: string;
}) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="relative">
      <TextInput
        id={id}
        type={visible ? "text" : "password"}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoComplete={autoComplete}
        placeholder={placeholder}
        aria-describedby={describedBy}
        className="pr-12"
        required
      />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        aria-label={visible ? "पासवर्ड छुपाएं (Hide password)" : "पासवर्ड दिखाएं (Show password)"}
        aria-pressed={visible}
        className="absolute inset-y-0 right-0 flex w-11 cursor-pointer items-center justify-center rounded-r-field text-ink-subtle hover:text-ink focus-visible:outline-2 focus-visible:outline-brand"
      >
        {visible ? <EyeOff className="h-4 w-4" aria-hidden /> : <Eye className="h-4 w-4" aria-hidden />}
      </button>
    </div>
  );
}

const MODE_TABS: { mode: "signin" | "signup"; label: string }[] = [
  { mode: "signin", label: "लॉगिन (Sign in)" },
  { mode: "signup", label: "नया खाता (Create account)" },
];

export default function LoginPage() {
  const uid = useId();
  const [mode, setMode] = useState<Mode>("signin");
  const [step, setStep] = useState<Step>("form");
  const [verifyKind, setVerifyKind] = useState<VerifyKind>("signup");

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [code, setCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmNewPassword, setConfirmNewPassword] = useState("");

  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [attempts, setAttempts] = useState(0);
  const [cooldown, setCooldown] = useState(0);

  const busyRef = useRef(false);
  const codeInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  useEffect(() => {
    if (step === "verify") codeInputRef.current?.focus();
  }, [step]);

  function resetTransient() {
    setError("");
    setNotice("");
    setAttempts(0);
    setCode("");
    setNewPassword("");
    setConfirmNewPassword("");
  }

  function switchMode(next: Mode) {
    setMode(next);
    setStep("form");
    resetTransient();
    setPassword("");
    setConfirmPassword("");
  }

  function goToVerify(kind: VerifyKind, message: string) {
    setVerifyKind(kind);
    setStep("verify");
    setCode("");
    setAttempts(0);
    setError("");
    setNotice(message);
    setCooldown(RESEND_COOLDOWN_SECONDS);
  }

  /** One request at a time: a double tap must not send two emails or two sign-ins. */
  async function run(action: () => Promise<void>) {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await action();
    } catch (err) {
      setError(
        err instanceof Error && err.message
          ? err.message
          : "कुछ गड़बड़ हो गई। कृपया फिर कोशिश करें। (Something went wrong. Please try again.)",
      );
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  function handleFormSubmit(e: FormEvent) {
    e.preventDefault();

    if (mode === "signin") {
      void run(async () => {
        try {
          await signInWithPassword(email, password);
          setDone(true);
        } catch (err) {
          if (err instanceof AuthServiceError && err.code === "email_not_confirmed") {
            // Account exists but the address was never verified: send a fresh code and go to that step.
            let message = "आपका ईमेल अभी सत्यापित नहीं है। हमने नया कोड भेजा है, उसे दर्ज करें।";
            try {
              await resendSignupOtp(email);
              setCooldown(RESEND_COOLDOWN_SECONDS);
            } catch {
              message = "आपका ईमेल अभी सत्यापित नहीं है। कोड पहले भेजा जा चुका है, अपना ईमेल देखें या कुछ देर बाद नया कोड मंगाएं।";
            }
            goToVerify("signup", message);
            return;
          }
          throw err;
        }
      });
      return;
    }

    if (mode === "signup") {
      if (password.length < MIN_PASSWORD_LENGTH) {
        setError(`पासवर्ड कम से कम ${MIN_PASSWORD_LENGTH} अक्षरों का रखें। (At least ${MIN_PASSWORD_LENGTH} characters.)`);
        return;
      }
      if (password !== confirmPassword) {
        setError("दोनों पासवर्ड एक जैसे नहीं हैं। (The two passwords do not match.)");
        return;
      }
      void run(async () => {
        const res = await signUpWithEmail(email, password, name);
        if (res.status === "signed_in") setDone(true);
        else goToVerify("signup", `हमने ${email.trim()} पर ${OTP_LENGTH} अंकों का कोड भेजा है।`);
      });
      return;
    }

    if (mode === "code") {
      void run(async () => {
        await sendLoginCode(email);
        goToVerify("login", `अगर ${email.trim()} पर खाता है, तो ${OTP_LENGTH} अंकों का कोड भेज दिया गया है।`);
      });
      return;
    }

    // reset
    void run(async () => {
      await sendPasswordResetCode(email);
      goToVerify("reset", `अगर ${email.trim()} पर खाता है, तो ${OTP_LENGTH} अंकों का कोड भेज दिया गया है।`);
    });
  }

  function handleVerifySubmit(e: FormEvent) {
    e.preventDefault();

    if (verifyKind === "reset") {
      if (newPassword.length < MIN_PASSWORD_LENGTH) {
        setError(`नया पासवर्ड कम से कम ${MIN_PASSWORD_LENGTH} अक्षरों का रखें। (At least ${MIN_PASSWORD_LENGTH} characters.)`);
        return;
      }
      if (newPassword !== confirmNewPassword) {
        setError("दोनों पासवर्ड एक जैसे नहीं हैं। (The two passwords do not match.)");
        return;
      }
    }

    void run(async () => {
      try {
        if (verifyKind === "signup") await verifySignupOtp(email, code);
        else if (verifyKind === "login") await verifyLoginCode(email, code);
        else await resetPasswordWithCode(email, code, newPassword);
        setDone(true);
      } catch (err) {
        if (err instanceof AuthServiceError && err.code === "invalid_code") setAttempts((n) => n + 1);
        throw err;
      }
    });
  }

  function handleResend() {
    if (cooldown > 0) return;
    void run(async () => {
      if (verifyKind === "signup") await resendSignupOtp(email);
      else if (verifyKind === "login") await sendLoginCode(email);
      else await sendPasswordResetCode(email);
      setCode("");
      setAttempts(0);
      setCooldown(RESEND_COOLDOWN_SECONDS);
      setNotice("नया कोड भेज दिया गया है। (A new code was sent.)");
    });
  }

  const verifyTitle =
    verifyKind === "reset" ? "पासवर्ड रीसेट" : verifyKind === "login" ? "ईमेल कोड से लॉगिन" : "ईमेल सत्यापित करें";
  const verifyTitleEn =
    verifyKind === "reset" ? "Reset password" : verifyKind === "login" ? "Sign in with email code" : "Verify your email";

  const emailId = `${uid}-email`;
  const nameId = `${uid}-name`;
  const passwordId = `${uid}-password`;
  const confirmId = `${uid}-confirm`;
  const codeId = `${uid}-code`;
  const newPasswordId = `${uid}-new-password`;
  const confirmNewId = `${uid}-confirm-new-password`;

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-canvas px-4 py-8">
      <div className="gold-edge w-full max-w-md rounded-panel bg-surface p-6 sm:p-8">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 flex h-16 w-16 items-center justify-center overflow-hidden rounded-card border border-line bg-surface shadow-e2">
            <Image src="/logo.jpg" alt="SwasthTrack" width={64} height={64} className="h-full w-full object-cover" priority />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-ink">SwasthTrack</h1>
          <p lang="hi" className="mt-1 text-sm font-medium text-ink-muted">
            अपनों की सेहत, एक सुरक्षित जगह
          </p>
        </div>

        {step === "form" && (mode === "signin" || mode === "signup") ? (
          <div role="tablist" aria-label="Sign in or create account" className="mb-5 flex rounded-card bg-surface-sunken p-1">
            {MODE_TABS.map((tab) => (
              <button
                key={tab.mode}
                type="button"
                role="tab"
                aria-selected={mode === tab.mode}
                onClick={() => switchMode(tab.mode)}
                className={cn(
                  "min-h-control flex-1 cursor-pointer rounded-control px-2 text-xs font-semibold transition-colors",
                  mode === tab.mode ? "bg-surface text-ink shadow-e1" : "text-ink-subtle hover:text-ink",
                )}
              >
                {tab.label}
              </button>
            ))}
          </div>
        ) : null}

        {/* Always mounted so screen readers announce changes. */}
        <div aria-live="polite" className="empty:hidden">
          {error ? (
            <div
              role="alert"
              className="mb-4 flex items-start gap-2 rounded-card border border-critical-line bg-critical-soft p-3 text-sm font-medium text-critical"
            >
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
              <span>{error}</span>
            </div>
          ) : null}
          {notice ? (
            <div className="mb-4 flex items-start gap-2 rounded-card border border-positive-line bg-positive-soft p-3 text-sm font-medium text-positive">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
              <span>{notice}</span>
            </div>
          ) : null}
        </div>

        {done ? (
          <div role="status" className="flex flex-col items-center gap-3 py-8 text-center">
            <Loader2 className="h-6 w-6 animate-spin text-brand" aria-hidden />
            <p className="text-sm font-semibold text-ink-muted">आपका खाता खोला जा रहा है... (Opening your account)</p>
          </div>
        ) : step === "form" ? (
          <form onSubmit={handleFormSubmit} className="space-y-4">
            {mode === "reset" ? (
              <div>
                <h2 className="text-lg font-semibold text-ink">पासवर्ड भूल गए? (Forgot password)</h2>
                <p className="mt-1 text-sm text-ink-muted">
                  अपना ईमेल दर्ज करें, हम {OTP_LENGTH} अंकों का कोड भेजेंगे। (Enter your email and we will send a {OTP_LENGTH}-digit code.)
                </p>
              </div>
            ) : null}
            {mode === "code" ? (
              <div>
                <h2 className="text-lg font-semibold text-ink">ईमेल कोड से लॉगिन (Sign in with email code)</h2>
                <p className="mt-1 text-sm text-ink-muted">
                  पासवर्ड की ज़रूरत नहीं। ईमेल पर आया कोड दर्ज करें। (No password needed: enter the code we email you.)
                </p>
              </div>
            ) : null}

            {mode === "signup" ? (
              <LabeledField id={nameId} label="आपका नाम (Your name, optional)">
                <TextInput
                  id={nameId}
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  autoComplete="name"
                  placeholder="जैसे: रिया शर्मा"
                />
              </LabeledField>
            ) : null}

            <LabeledField id={emailId} label="ईमेल (Email)">
              <div className="relative">
                <TextInput
                  id={emailId}
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  autoCapitalize="none"
                  spellCheck={false}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  className="pr-10"
                  required
                />
                <Mail className="pointer-events-none absolute right-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-subtle" aria-hidden />
              </div>
            </LabeledField>

            {mode === "signin" || mode === "signup" ? (
              <LabeledField
                id={passwordId}
                label="पासवर्ड (Password)"
                hint={mode === "signup" ? `कम से कम ${MIN_PASSWORD_LENGTH} अक्षर (At least ${MIN_PASSWORD_LENGTH} characters)` : undefined}
                action={
                  mode === "signin" ? (
                    <button
                      type="button"
                      onClick={() => switchMode("reset")}
                      className="cursor-pointer text-xs font-semibold text-brand-ink hover:underline"
                    >
                      पासवर्ड भूल गए?
                    </button>
                  ) : undefined
                }
              >
                <PasswordInput
                  id={passwordId}
                  value={password}
                  onChange={setPassword}
                  autoComplete={mode === "signin" ? "current-password" : "new-password"}
                  describedBy={mode === "signup" ? `${passwordId}-hint` : undefined}
                />
              </LabeledField>
            ) : null}

            {mode === "signup" ? (
              <LabeledField id={confirmId} label="पासवर्ड दोबारा (Confirm password)">
                <PasswordInput id={confirmId} value={confirmPassword} onChange={setConfirmPassword} autoComplete="new-password" />
              </LabeledField>
            ) : null}

            <Button type="submit" variant="primary" size="lg" block disabled={busy}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
              {mode === "signin"
                ? busy
                  ? "लॉगिन हो रहा है..."
                  : "लॉगिन करें"
                : mode === "signup"
                  ? busy
                    ? "खाता बन रहा है..."
                    : "खाता बनाएं और कोड पाएं"
                  : busy
                    ? "कोड भेजा जा रहा है..."
                    : "कोड भेजें (Send code)"}
            </Button>

            {mode === "signin" ? (
              <button
                type="button"
                onClick={() => switchMode("code")}
                className="block min-h-control w-full cursor-pointer text-center text-sm font-semibold text-brand-ink hover:underline"
              >
                बिना पासवर्ड, ईमेल कोड से लॉगिन करें
              </button>
            ) : null}

            {mode === "reset" || mode === "code" ? (
              <button
                type="button"
                onClick={() => switchMode("signin")}
                className="flex min-h-control w-full cursor-pointer items-center justify-center gap-1.5 text-sm font-semibold text-ink-muted hover:text-ink"
              >
                <ArrowLeft className="h-4 w-4" aria-hidden />
                वापस लॉगिन पर (Back to sign in)
              </button>
            ) : null}
          </form>
        ) : (
          <form onSubmit={handleVerifySubmit} className="space-y-4">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-card bg-brand-soft text-brand-ink">
                <MailCheck className="h-5 w-5" aria-hidden />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-ink">
                  {verifyTitle} <span className="text-sm font-medium text-ink-muted">({verifyTitleEn})</span>
                </h2>
                <p className="mt-1 text-sm text-ink-muted">
                  ईमेल में आया {OTP_LENGTH} अंकों का कोड नीचे डालें। स्पैम फ़ोल्डर भी देखें।
                </p>
              </div>
            </div>

            <LabeledField id={codeId} label={`${OTP_LENGTH} अंकों का कोड (${OTP_LENGTH}-digit code)`}>
              <TextInput
                ref={codeInputRef}
                id={codeId}
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern={`[0-9]{${OTP_LENGTH}}`}
                maxLength={OTP_LENGTH}
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, OTP_LENGTH))}
                placeholder="------"
                aria-describedby={attempts >= ATTEMPTS_BEFORE_NUDGE ? `${codeId}-attempts` : undefined}
                className="text-center font-mono text-2xl font-bold tracking-[0.5em]"
                required
              />
            </LabeledField>

            {attempts > 0 ? (
              <p id={`${codeId}-attempts`} className="text-xs text-ink-muted">
                {attempts >= ATTEMPTS_BEFORE_NUDGE
                  ? `${attempts} बार गलत कोड दर्ज हुआ। नया कोड मंगाना बेहतर रहेगा।`
                  : `गलत कोड (${attempts}). फिर से जांचकर डालें।`}
              </p>
            ) : null}

            {verifyKind === "reset" ? (
              <>
                <LabeledField id={newPasswordId} label="नया पासवर्ड (New password)" hint={`कम से कम ${MIN_PASSWORD_LENGTH} अक्षर`}>
                  <PasswordInput
                    id={newPasswordId}
                    value={newPassword}
                    onChange={setNewPassword}
                    autoComplete="new-password"
                    describedBy={`${newPasswordId}-hint`}
                  />
                </LabeledField>
                <LabeledField id={confirmNewId} label="नया पासवर्ड दोबारा (Confirm new password)">
                  <PasswordInput
                    id={confirmNewId}
                    value={confirmNewPassword}
                    onChange={setConfirmNewPassword}
                    autoComplete="new-password"
                  />
                </LabeledField>
              </>
            ) : null}

            <Button type="submit" variant="primary" size="lg" block disabled={busy || code.length !== OTP_LENGTH}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <ShieldCheck className="h-4 w-4" aria-hidden />}
              {busy ? "जांच हो रही है..." : verifyKind === "reset" ? "पासवर्ड बदलें" : "सत्यापित करें (Verify)"}
            </Button>

            <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
              <button
                type="button"
                onClick={() => {
                  setStep("form");
                  resetTransient();
                }}
                className="flex min-h-control cursor-pointer items-center gap-1.5 text-sm font-semibold text-ink-muted hover:text-ink"
              >
                <ArrowLeft className="h-4 w-4" aria-hidden />
                वापस (Back)
              </button>
              <button
                type="button"
                onClick={handleResend}
                disabled={cooldown > 0 || busy}
                className="min-h-control cursor-pointer text-sm font-semibold text-brand-ink hover:underline disabled:cursor-not-allowed disabled:text-ink-subtle disabled:no-underline"
              >
                {cooldown > 0 ? `नया कोड ${cooldown} सेकंड बाद` : "कोड दोबारा भेजें (Resend code)"}
              </button>
            </div>
          </form>
        )}

        <p className="mt-6 text-center text-xs text-ink-subtle">
          आगे बढ़ने पर आप{" "}
          <Link href="/terms" className="font-semibold text-brand-ink underline-offset-2 hover:underline">
            शर्तों
          </Link>{" "}
          और{" "}
          <Link href="/privacy" className="font-semibold text-brand-ink underline-offset-2 hover:underline">
            गोपनीयता नीति
          </Link>{" "}
          से सहमत हैं। SwasthTrack डॉक्टर की सलाह का विकल्प नहीं है।
        </p>
      </div>
    </div>
  );
}
