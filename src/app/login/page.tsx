"use client";

import {
  useEffect,
  useId,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
  type RefObject,
} from "react";
import { LogoMark } from "@/components/brand/logo-mark";
import { Wordmark } from "@/components/brand/wordmark";
import Link from "next/link";
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  Eye,
  EyeOff,
  FileText,
  HeartPulse,
  KeyRound,
  Loader2,
  Mail,
  MailCheck,
  Pill,
  ShieldCheck,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { TextInput } from "@/components/ui/form-field";
import { Segmented, segmentedPanelId, segmentedTabId } from "@/components/ui/segmented";
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
// If the session is set but the app has not moved on after this long, let the user retry.
const OPENING_TIMEOUT_MS = 15000;

const TAB_OPTIONS = [
  { value: "signin" as const, label: "Sign in", hindiLabel: "लॉगिन" },
  { value: "signup" as const, label: "Create account", hindiLabel: "नया खाता" },
];

const FEATURES = [
  {
    icon: HeartPulse,
    hi: "रक्तचाप, वज़न और भोजन",
    en: "Daily BP, weight and meal records in one place",
  },
  {
    icon: Pill,
    hi: "दवाइयों का सही समय पर रिमाइंडर",
    en: "Gentle reminders so no dose is missed",
  },
  {
    icon: Users,
    hi: "परिवार के साथ सुरक्षित साझा",
    en: "Share safely with the caregivers you invite",
  },
  {
    icon: FileText,
    hi: "डॉक्टर के लिए तैयार रिपोर्ट",
    en: "Summaries that are ready for the doctor visit",
  },
];

/** A field label with the same Hindi-first / English-second rhythm everywhere. */
function LabeledField({
  id,
  hi,
  en,
  hint,
  children,
  action,
}: {
  id: string;
  hi: string;
  en: string;
  hint?: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div>
      <div className="flex items-center justify-between gap-3">
        <label htmlFor={id} className="text-sm font-medium text-ink">
          <span lang="hi">{hi}</span> <span className="font-normal text-ink-muted">({en})</span>
        </label>
        {action}
      </div>
      <div className="mt-1.5">{children}</div>
      {hint ? (
        <p id={`${id}-hint`} className="mt-1.5 text-xs text-ink-muted">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

function PasswordInput({
  id,
  name,
  value,
  onChange,
  autoComplete,
  describedBy,
  invalid,
}: {
  id: string;
  name: string;
  value: string;
  onChange: (value: string) => void;
  autoComplete: "current-password" | "new-password";
  describedBy?: string;
  invalid?: boolean;
}) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="relative">
      <TextInput
        id={id}
        name={name}
        type={visible ? "text" : "password"}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoComplete={autoComplete}
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
        aria-describedby={describedBy}
        aria-invalid={invalid || undefined}
        className="pr-12"
        required
      />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        aria-label={visible ? "पासवर्ड छुपाएं (Hide password)" : "पासवर्ड दिखाएं (Show password)"}
        aria-pressed={visible}
        className="absolute inset-y-0 right-0 flex w-11 cursor-pointer items-center justify-center rounded-r-field text-ink-muted hover:text-ink"
      >
        {visible ? <EyeOff className="h-4.5 w-4.5" aria-hidden /> : <Eye className="h-4.5 w-4.5" aria-hidden />}
      </button>
    </div>
  );
}

/**
 * Six digit boxes over ONE real `<input>`. Keeping a single native input means
 * SMS / email autofill (`one-time-code`), paste, the numeric keypad and screen
 * readers all behave exactly as they do for a plain field; the boxes are only
 * a picture of what has been typed.
 */
function OtpField({
  id,
  value,
  onChange,
  inputRef,
  describedBy,
  invalid,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  inputRef: RefObject<HTMLInputElement | null>;
  describedBy?: string;
  invalid?: boolean;
}) {
  const [focused, setFocused] = useState(false);
  const activeIndex = Math.min(value.length, OTP_LENGTH - 1);

  return (
    <div className="relative">
      <div aria-hidden className="grid grid-cols-6 gap-2 sm:gap-2.5">
        {Array.from({ length: OTP_LENGTH }, (_, i) => {
          const char = value[i];
          const active = focused && i === activeIndex;
          return (
            <div
              key={i}
              className={cn(
                "tabular relative grid h-14 place-items-center rounded-field border bg-surface font-mono text-2xl font-semibold text-ink shadow-inset-field transition-colors sm:h-16",
                active
                  ? "border-brand outline-2 outline-brand"
                  : invalid
                    ? "border-critical"
                    : char
                      ? "border-gold-line bg-gold-soft"
                      : "border-line",
              )}
            >
              {char ?? (active ? <span className="st-caret h-6 w-0.5 rounded-full bg-brand" /> : null)}
            </div>
          );
        })}
      </div>
      <input
        ref={inputRef}
        id={id}
        name="otp"
        type="text"
        inputMode="numeric"
        autoComplete="one-time-code"
        enterKeyHint="done"
        pattern={`[0-9]{${OTP_LENGTH}}`}
        value={value}
        onChange={(e) => onChange(e.target.value.replace(/\D/g, "").slice(0, OTP_LENGTH))}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        aria-describedby={describedBy}
        aria-invalid={invalid || undefined}
        aria-label={`${OTP_LENGTH} अंकों का कोड (${OTP_LENGTH}-digit code)`}
        // Invisible but fully interactive: it fills the boxes so taps, long-press paste and autofill land on it.
        className="absolute inset-0 h-full w-full cursor-text rounded-field text-transparent opacity-0 caret-transparent"
        required
      />
    </div>
  );
}

function Alert({ tone, children }: { tone: "error" | "notice"; children: ReactNode }) {
  const error = tone === "error";
  return (
    <div
      role={error ? "alert" : "status"}
      className={cn(
        "mb-4 flex items-start gap-2.5 rounded-card border p-3 text-sm font-medium",
        error
          ? "border-critical-line bg-critical-soft text-critical"
          : "border-positive-line bg-positive-soft text-positive",
      )}
    >
      {error ? (
        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
      ) : (
        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
      )}
      <span className="min-w-0">{children}</span>
    </div>
  );
}

function BackButton({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex min-h-control cursor-pointer items-center justify-center gap-1.5 rounded-control px-2 text-sm font-semibold text-ink-muted hover:text-ink"
    >
      <ArrowLeft className="h-4 w-4" aria-hidden />
      {children}
    </button>
  );
}

/** Submit label: Hindi first, English as the quieter second half. */
function Cta({ hi, en }: { hi: string; en: string }) {
  return (
    <>
      <span lang="hi">{hi}</span>
      <span className="font-medium opacity-80">· {en}</span>
    </>
  );
}

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
  const [stuck, setStuck] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  /** Id of the control the current error is about (gets aria-invalid + focus). */
  const [invalidId, setInvalidId] = useState<string | null>(null);
  /** Bumps on every error so the same message shown twice still re-focuses its field. */
  const [errorTick, setErrorTick] = useState(0);
  const [attempts, setAttempts] = useState(0);
  const [cooldown, setCooldown] = useState(0);

  const busyRef = useRef(false);
  const codeInputRef = useRef<HTMLInputElement>(null);
  const alertRef = useRef<HTMLDivElement>(null);

  const emailId = `${uid}-email`;
  const nameId = `${uid}-name`;
  const passwordId = `${uid}-password`;
  const confirmId = `${uid}-confirm`;
  const codeId = `${uid}-code`;
  const newPasswordId = `${uid}-new-password`;
  const confirmNewId = `${uid}-confirm-new-password`;
  const tabsId = `${uid}-mode`;

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  useEffect(() => {
    if (step === "verify") codeInputRef.current?.focus();
  }, [step]);

  // Signed in, but the app has not carried on to the dashboard: do not spin forever.
  useEffect(() => {
    if (!done) return;
    const timer = setTimeout(() => setStuck(true), OPENING_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [done]);

  // Keep a fresh error in view and move focus to the field it is about.
  useEffect(() => {
    if (!errorTick) return;
    alertRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    if (invalidId) document.getElementById(invalidId)?.focus({ preventScroll: true });
    // Only a new error should steal focus, not a later change of `invalidId`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [errorTick]);

  function resetTransient() {
    setError("");
    setNotice("");
    setInvalidId(null);
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
    setInvalidId(null);
    setNotice(message);
    setCooldown(RESEND_COOLDOWN_SECONDS);
  }

  /** Show an error, flag the field it is about (if any) and move focus there. */
  function showError(message: string, fieldId: string | null = null) {
    setNotice("");
    setInvalidId(fieldId);
    setError(message);
    setErrorTick((t) => t + 1);
  }

  /** A client-side validation problem: show it and stop. */
  function reject(message: string, fieldId: string) {
    showError(message, fieldId);
  }

  /** One request at a time: a double tap must not send two emails or two sign-ins. */
  async function run(action: () => Promise<void>) {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    setInvalidId(null);
    try {
      await action();
    } catch (err) {
      let fieldId: string | null = null;
      let message =
        err instanceof Error && err.message
          ? err.message
          : "कुछ गड़बड़ हो गई। कृपया फिर कोशिश करें। (Something went wrong. Please try again.)";
      if (err instanceof AuthServiceError) {
        if (err.code === "invalid_input") fieldId = emailId;
        else if (err.code === "weak_password" || err.code === "same_password") {
          fieldId = mode === "signup" ? passwordId : newPasswordId;
          if (step === "verify" && verifyKind === "reset") {
            // The emailed code was already used up to get this far.
            setCode("");
            message += " कोड एक बार ही चलता है, इसलिए नया कोड मंगाकर फिर कोशिश करें। (The code works only once: request a new one.)";
          }
        } else if (err.code === "invalid_code") {
          fieldId = codeId;
          setCode(""); // let them type the next attempt straight away
        }
      }
      showError(message, fieldId);
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  function handleFormSubmit(e: FormEvent) {
    e.preventDefault();

    if (!email.trim()) {
      reject("कृपया अपना ईमेल दर्ज करें। (Enter your email address.)", emailId);
      return;
    }

    if (mode === "signin") {
      if (!password) {
        reject("कृपया अपना पासवर्ड दर्ज करें। (Enter your password.)", passwordId);
        return;
      }
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
              message =
                "आपका ईमेल अभी सत्यापित नहीं है। कोड पहले भेजा जा चुका है, अपना ईमेल देखें या कुछ देर बाद नया कोड मंगाएं।";
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
        reject(
          `पासवर्ड कम से कम ${MIN_PASSWORD_LENGTH} अक्षरों का रखें। (At least ${MIN_PASSWORD_LENGTH} characters.)`,
          passwordId,
        );
        return;
      }
      if (password !== confirmPassword) {
        reject("दोनों पासवर्ड एक जैसे नहीं हैं। (The two passwords do not match.)", confirmId);
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

    if (code.length !== OTP_LENGTH) {
      reject(`कृपया ${OTP_LENGTH} अंकों का पूरा कोड दर्ज करें। (Enter the full ${OTP_LENGTH}-digit code.)`, codeId);
      return;
    }

    if (verifyKind === "reset") {
      if (newPassword.length < MIN_PASSWORD_LENGTH) {
        reject(
          `नया पासवर्ड कम से कम ${MIN_PASSWORD_LENGTH} अक्षरों का रखें। (At least ${MIN_PASSWORD_LENGTH} characters.)`,
          newPasswordId,
        );
        return;
      }
      if (newPassword !== confirmNewPassword) {
        reject("दोनों पासवर्ड एक जैसे नहीं हैं। (The two passwords do not match.)", confirmNewId);
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
      codeInputRef.current?.focus();
    });
  }

  const verifyTitle =
    verifyKind === "reset" ? "पासवर्ड रीसेट" : verifyKind === "login" ? "ईमेल कोड से लॉगिन" : "ईमेल सत्यापित करें";
  const verifyTitleEn =
    verifyKind === "reset" ? "Reset password" : verifyKind === "login" ? "Sign in with email code" : "Verify your email";

  const showTabs = step === "form" && (mode === "signin" || mode === "signup");
  const isInvalid = (id: string) => invalidId === id;

  return (
    <div className="flex min-h-dvh items-center justify-center px-4 py-8 sm:py-12">
      <div className="grid w-full max-w-md gap-7 lg:max-w-5xl lg:grid-cols-[minmax(0,1fr)_minmax(0,28rem)] lg:items-center lg:gap-16">
        {/* ---------- Brand ---------- */}
        <div className="text-center lg:text-left">
          <LogoMark sizes="(min-width: 1024px) 144px, 112px" priority className="mx-auto h-28 w-28 lg:mx-0 lg:h-36 lg:w-36" />
          <h1 className="mt-3">
            <Wordmark className="mx-auto block h-16 w-auto lg:mx-0 lg:h-20" />
          </h1>
          <p lang="hi" className="mt-1.5 text-base font-semibold text-ink-muted lg:text-lg">
            अपनों की सेहत, एक सुरक्षित जगह
          </p>
          <p className="mt-0.5 text-sm text-ink-muted">Your family&apos;s health, in one safe place</p>

          <ul className="mt-9 hidden space-y-4 lg:block">
            {FEATURES.map(({ icon: Icon, hi, en }) => (
              <li key={hi} className="flex items-start gap-3.5">
                <span
                  aria-hidden
                  className="grid h-10 w-10 shrink-0 place-items-center rounded-control border border-gold-line text-gold-ink shadow-gold-button grad-gold-button"
                >
                  <Icon className="h-5 w-5" />
                </span>
                <span className="min-w-0">
                  <span lang="hi" className="block text-sm font-semibold text-ink">
                    {hi}
                  </span>
                  <span className="block text-sm text-ink-muted">{en}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>

        {/* ---------- Form card ---------- */}
        <div>
          <Card className="rounded-panel p-5 sm:p-7">
            {showTabs ? (
              <Segmented
                options={TAB_OPTIONS}
                value={mode === "signup" ? "signup" : "signin"}
                onChange={(next) => switchMode(next)}
                ariaLabel="Sign in or create account — लॉगिन या नया खाता"
                mode="tabs"
                idPrefix={tabsId}
                fill
                stacked
                className="-mx-1 mb-4"
              />
            ) : null}

            {/* Always mounted so screen readers announce changes. */}
            <div ref={alertRef} aria-live="polite" className="empty:hidden">
              {error ? <Alert tone="error">{error}</Alert> : null}
              {notice ? <Alert tone="notice">{notice}</Alert> : null}
            </div>

            {done ? (
              <div role="status" className="flex flex-col items-center gap-3 py-8 text-center">
                {stuck ? (
                  <>
                    <AlertCircle className="h-7 w-7 text-attention" aria-hidden />
                    <p className="text-sm font-semibold text-ink">
                      <span lang="hi">इसमें सामान्य से ज़्यादा समय लग रहा है।</span>{" "}
                      <span className="font-normal text-ink-muted">(This is taking longer than usual.)</span>
                    </p>
                    <Button
                      variant="primary"
                      onClick={() => {
                        setDone(false);
                        setStuck(false);
                      }}
                    >
                      <Cta hi="फिर कोशिश करें" en="Try again" />
                    </Button>
                  </>
                ) : (
                  <>
                    <Loader2 className="st-spinner h-7 w-7 text-brand-ink" aria-hidden />
                    <p className="text-sm font-semibold text-ink">
                      <span lang="hi">आपका खाता खोला जा रहा है...</span>{" "}
                      <span className="font-normal text-ink-muted">(Opening your account)</span>
                    </p>
                  </>
                )}
              </div>
            ) : step === "form" ? (
              <form
                onSubmit={handleFormSubmit}
                noValidate
                className="space-y-4"
                {...(showTabs
                  ? {
                      role: "tabpanel",
                      id: segmentedPanelId(tabsId, mode),
                      "aria-labelledby": segmentedTabId(tabsId, mode),
                    }
                  : {})}
              >
                {mode === "reset" ? (
                  <div className="flex items-start gap-3">
                    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-control bg-surface text-gold-ink shadow-e1 ring-1 ring-gold-line">
                      <KeyRound className="h-5 w-5" aria-hidden />
                    </span>
                    <div>
                      <h2 className="text-lg font-semibold text-ink">
                        <span lang="hi">पासवर्ड भूल गए?</span>{" "}
                        <span className="text-sm font-medium text-ink-muted">(Forgot password)</span>
                      </h2>
                      <p className="mt-1 text-sm text-ink-muted">
                        <span lang="hi">अपना ईमेल दर्ज करें, हम {OTP_LENGTH} अंकों का कोड भेजेंगे।</span> (Enter your email and we
                        will send a {OTP_LENGTH}-digit code.)
                      </p>
                    </div>
                  </div>
                ) : null}
                {mode === "code" ? (
                  <div className="flex items-start gap-3">
                    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-control bg-surface text-gold-ink shadow-e1 ring-1 ring-gold-line">
                      <Mail className="h-5 w-5" aria-hidden />
                    </span>
                    <div>
                      <h2 className="text-lg font-semibold text-ink">
                        <span lang="hi">ईमेल कोड से लॉगिन</span>{" "}
                        <span className="text-sm font-medium text-ink-muted">(Sign in with email code)</span>
                      </h2>
                      <p className="mt-1 text-sm text-ink-muted">
                        <span lang="hi">पासवर्ड की ज़रूरत नहीं। ईमेल पर आया कोड दर्ज करें।</span> (No password needed: enter the
                        code we email you.)
                      </p>
                    </div>
                  </div>
                ) : null}

                {mode === "signup" ? (
                  <LabeledField id={nameId} hi="आपका नाम" en="Your name, optional">
                    <TextInput
                      id={nameId}
                      name="name"
                      type="text"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      autoComplete="name"
                      placeholder="जैसे: रिया शर्मा"
                    />
                  </LabeledField>
                ) : null}

                <LabeledField id={emailId} hi="ईमेल" en="Email">
                  <div className="relative">
                    <TextInput
                      id={emailId}
                      name="email"
                      type="email"
                      inputMode="email"
                      autoComplete={mode === "signin" ? "username" : "email"}
                      autoCapitalize="none"
                      autoCorrect="off"
                      spellCheck={false}
                      enterKeyHint={mode === "code" || mode === "reset" ? "send" : "next"}
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="you@example.com"
                      aria-invalid={isInvalid(emailId) || undefined}
                      className="pr-11"
                      required
                    />
                    <Mail
                      className="pointer-events-none absolute right-3.5 top-1/2 h-4.5 w-4.5 -translate-y-1/2 text-ink-muted"
                      aria-hidden
                    />
                  </div>
                </LabeledField>

                {mode === "signin" || mode === "signup" ? (
                  <LabeledField
                    id={passwordId}
                    hi="पासवर्ड"
                    en="Password"
                    hint={
                      mode === "signup"
                        ? `कम से कम ${MIN_PASSWORD_LENGTH} अक्षर (At least ${MIN_PASSWORD_LENGTH} characters)`
                        : undefined
                    }
                    action={
                      mode === "signin" ? (
                        <button
                          type="button"
                          onClick={() => switchMode("reset")}
                          className="hit-target cursor-pointer rounded-control text-xs font-semibold text-brand-ink hover:underline"
                        >
                          <span lang="hi">पासवर्ड भूल गए?</span>
                        </button>
                      ) : undefined
                    }
                  >
                    <PasswordInput
                      id={passwordId}
                      name="password"
                      value={password}
                      onChange={setPassword}
                      autoComplete={mode === "signin" ? "current-password" : "new-password"}
                      describedBy={mode === "signup" ? `${passwordId}-hint` : undefined}
                      invalid={isInvalid(passwordId)}
                    />
                  </LabeledField>
                ) : null}

                {mode === "signup" ? (
                  <LabeledField id={confirmId} hi="पासवर्ड दोबारा" en="Confirm password">
                    <PasswordInput
                      id={confirmId}
                      name="confirm-password"
                      value={confirmPassword}
                      onChange={setConfirmPassword}
                      autoComplete="new-password"
                      invalid={isInvalid(confirmId)}
                    />
                  </LabeledField>
                ) : null}

                <Button type="submit" variant="primary" size="lg" block loading={busy} className="mt-1">
                  {mode === "signin" ? (
                    busy ? (
                      <span lang="hi">लॉगिन हो रहा है...</span>
                    ) : (
                      <Cta hi="लॉगिन करें" en="Sign in" />
                    )
                  ) : mode === "signup" ? (
                    busy ? (
                      <span lang="hi">खाता बन रहा है...</span>
                    ) : (
                      <Cta hi="खाता बनाएं" en="Create account" />
                    )
                  ) : busy ? (
                    <span lang="hi">कोड भेजा जा रहा है...</span>
                  ) : (
                    <Cta hi="कोड भेजें" en="Send code" />
                  )}
                </Button>

                {mode === "signin" ? (
                  <>
                    <div aria-hidden className="flex items-center gap-3 text-xs text-ink-muted">
                      <span className="h-px flex-1 bg-line-strong/70" />
                      <span>या · or</span>
                      <span className="h-px flex-1 bg-line-strong/70" />
                    </div>
                    <Button type="button" variant="secondary" block onClick={() => switchMode("code")}>
                      <Mail className="h-4 w-4" aria-hidden />
                      <span lang="hi">बिना पासवर्ड, ईमेल कोड से लॉगिन</span>
                    </Button>
                  </>
                ) : null}

                {mode === "reset" || mode === "code" ? (
                  <div className="flex justify-center">
                    <BackButton onClick={() => switchMode("signin")}>
                      <span lang="hi">वापस लॉगिन पर</span> (Back to sign in)
                    </BackButton>
                  </div>
                ) : null}
              </form>
            ) : (
              <form onSubmit={handleVerifySubmit} noValidate className="space-y-4">
                <div className="flex items-start gap-3">
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-control bg-surface text-brand-ink shadow-e1 ring-1 ring-gold-line">
                    <MailCheck className="h-5 w-5" aria-hidden />
                  </span>
                  <div>
                    <h2 className="text-lg font-semibold leading-snug text-ink">
                      <span lang="hi">{verifyTitle}</span>{" "}
                      <span className="text-sm font-medium text-ink-muted">({verifyTitleEn})</span>
                    </h2>
                    <p className="mt-1 text-sm text-ink-muted">
                      <span lang="hi">ईमेल में आया {OTP_LENGTH} अंकों का कोड नीचे डालें। स्पैम फ़ोल्डर भी देखें।</span>
                    </p>
                  </div>
                </div>

                <div>
                  <label htmlFor={codeId} className="mb-2 block text-sm font-medium text-ink">
                    <span lang="hi">{OTP_LENGTH} अंकों का कोड</span>{" "}
                    <span className="font-normal text-ink-muted">({OTP_LENGTH}-digit code)</span>
                  </label>
                  <OtpField
                    id={codeId}
                    value={code}
                    onChange={(v) => {
                      setCode(v);
                      if (invalidId === codeId) setInvalidId(null);
                    }}
                    inputRef={codeInputRef}
                    describedBy={attempts > 0 ? `${codeId}-attempts` : undefined}
                    invalid={isInvalid(codeId)}
                  />
                  {attempts > 0 ? (
                    <p id={`${codeId}-attempts`} className="mt-2 text-xs text-ink-muted">
                      <span lang="hi">
                        {attempts >= ATTEMPTS_BEFORE_NUDGE
                          ? `${attempts} बार गलत कोड दर्ज हुआ। नया कोड मंगाना बेहतर रहेगा।`
                          : `गलत कोड (${attempts}). फिर से जांचकर डालें।`}
                      </span>
                    </p>
                  ) : null}
                </div>

                {verifyKind === "reset" ? (
                  <>
                    <LabeledField
                      id={newPasswordId}
                      hi="नया पासवर्ड"
                      en="New password"
                      hint={`कम से कम ${MIN_PASSWORD_LENGTH} अक्षर (At least ${MIN_PASSWORD_LENGTH} characters)`}
                    >
                      <PasswordInput
                        id={newPasswordId}
                        name="new-password"
                        value={newPassword}
                        onChange={setNewPassword}
                        autoComplete="new-password"
                        describedBy={`${newPasswordId}-hint`}
                        invalid={isInvalid(newPasswordId)}
                      />
                    </LabeledField>
                    <LabeledField id={confirmNewId} hi="नया पासवर्ड दोबारा" en="Confirm new password">
                      <PasswordInput
                        id={confirmNewId}
                        name="confirm-new-password"
                        value={confirmNewPassword}
                        onChange={setConfirmNewPassword}
                        autoComplete="new-password"
                        invalid={isInvalid(confirmNewId)}
                      />
                    </LabeledField>
                  </>
                ) : null}

                <Button
                  type="submit"
                  variant="primary"
                  size="lg"
                  block
                  loading={busy}
                  disabled={code.length !== OTP_LENGTH}
                  className="mt-1"
                >
                  {busy ? (
                    <span lang="hi">जांच हो रही है...</span>
                  ) : (
                    <>
                      <ShieldCheck className="h-4.5 w-4.5" aria-hidden />
                      {verifyKind === "reset" ? (
                        <Cta hi="पासवर्ड बदलें" en="Change password" />
                      ) : (
                        <Cta hi="सत्यापित करें" en="Verify" />
                      )}
                    </>
                  )}
                </Button>

                <div className="flex flex-col items-stretch gap-1 sm:flex-row sm:items-center sm:justify-between">
                  <BackButton
                    onClick={() => {
                      setStep("form");
                      resetTransient();
                    }}
                  >
                    <span lang="hi">वापस</span> (Back)
                  </BackButton>
                  <button
                    type="button"
                    onClick={handleResend}
                    disabled={cooldown > 0 || busy}
                    className="min-h-control cursor-pointer rounded-control px-2 text-sm font-semibold text-brand-ink hover:underline disabled:cursor-not-allowed disabled:text-ink-muted disabled:no-underline"
                  >
                    {cooldown > 0 ? (
                      <span lang="hi">नया कोड {cooldown} सेकंड बाद</span>
                    ) : (
                      <>
                        <span lang="hi">कोड दोबारा भेजें</span> (Resend code)
                      </>
                    )}
                  </button>
                </div>
              </form>
            )}

            <p className="mt-5 text-center text-xs leading-relaxed text-ink-muted">
              <span lang="hi">आगे बढ़ने पर आप </span>
              <Link href="/terms" className="font-semibold text-brand-ink underline-offset-2 hover:underline">
                <span lang="hi">शर्तों</span>
              </Link>
              <span lang="hi"> और </span>
              <Link href="/privacy" className="font-semibold text-brand-ink underline-offset-2 hover:underline">
                <span lang="hi">गोपनीयता नीति</span>
              </Link>
              <span lang="hi"> से सहमत हैं। SwasthTrack डॉक्टर की सलाह का विकल्प नहीं है।</span>
            </p>
          </Card>

          <nav aria-label="About SwasthTrack" className="mt-3 flex flex-wrap items-center justify-center gap-x-1 text-xs">
            {[
              { href: "/about", label: "About" },
              { href: "/contact", label: "Contact" },
              { href: "/medical-disclaimer", label: "Medical disclaimer" },
            ].map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="inline-flex min-h-control items-center rounded-control px-2.5 font-medium text-ink-muted hover:text-ink hover:underline"
              >
                {link.label}
              </Link>
            ))}
          </nav>
        </div>
      </div>
    </div>
  );
}
