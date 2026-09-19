"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Eye,
  EyeOff,
  KeyRound,
  Lock,
  Phone,
  ShieldCheck,
  UserPlus,
} from "lucide-react";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/context/auth-context";

export default function LoginPage() {
  const router = useRouter();
  const { login, register, sendOtp, verifyOtp, loginDemo } = useAuth();

  const [activeTab, setActiveTab] = useState<"login" | "signup" | "forgot">("login");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [otpCode, setOtpCode] = useState("");
  const [newPassword, setNewPassword] = useState("");

  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  function handleTabSwitch(tab: "login" | "signup" | "forgot") {
    setActiveTab(tab);
    setError("");
    setSuccessMsg("");
    setOtpSent(false);
    setOtpCode("");
  }

  // Handle Login
  async function handleLoginSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setSuccessMsg("");

    try {
      setLoading(true);
      const res = await login(phone, password);
      if (res.isNewUser) {
        router.replace("/onboarding");
      } else {
        router.replace("/");
      }
    } catch (err: unknown) {
      setError((err as Error).message || "लॉगिन विफल रहा। कृपया सही विवरण दर्ज करें।");
    } finally {
      setLoading(false);
    }
  }

  // Handle Explicit Demo Login
  async function handleDemoLogin() {
    setError("");
    setSuccessMsg("");

    try {
      setLoading(true);
      await loginDemo();
      router.replace("/");
    } catch (err: unknown) {
      setError((err as Error).message || "डेमो मोड लॉगिन विफल रहा।");
    } finally {
      setLoading(false);
    }
  }

  // Handle Sign Up
  async function handleSignupSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setSuccessMsg("");

    if (password !== confirmPassword) {
      setError("दोनों पासवर्ड मेल नहीं खाते। कृपया दोबारा जांचें।");
      return;
    }

    try {
      setLoading(true);
      const res = await register(phone, password);
      if (res.isNewUser) {
        router.replace("/onboarding");
      } else {
        router.replace("/");
      }
    } catch (err: unknown) {
      setError((err as Error).message || "खाता बनाने में त्रुटि हुई।");
    } finally {
      setLoading(false);
    }
  }

  // Request OTP
  async function handleRequestOtp(e: FormEvent) {
    e.preventDefault();
    setError("");
    setSuccessMsg("");

    try {
      setLoading(true);
      const res = await sendOtp(phone);
      setOtpSent(true);
      setSuccessMsg(res.message);
    } catch (err: unknown) {
      setError((err as Error).message || "OTP भेजने में विफल।");
    } finally {
      setLoading(false);
    }
  }

  // Handle Verify OTP & Reset Password
  async function handleVerifyOtpSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setSuccessMsg("");

    try {
      setLoading(true);
      const res = await verifyOtp(phone, otpCode, newPassword);
      setSuccessMsg(res.message);
      setPassword(newPassword);
      setTimeout(() => {
        setActiveTab("login");
      }, 2000);
    } catch (err: unknown) {
      setError((err as Error).message || "पासवर्ड रीसेट विफल रहा।");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex flex-col justify-center items-center bg-canvas px-4 py-8">
      <div className="gold-edge w-full max-w-md rounded-panel p-6 sm:p-8">
        {/* LOGO & TITLE */}
        <div className="text-center mb-6">
          <div className="mx-auto mb-3 flex h-16 w-16 items-center justify-center rounded-card overflow-hidden shadow-e2 border border-line bg-surface">
            <Image
              src="/logo.jpg"
              alt="SwasthTrack Logo"
              width={64}
              height={64}
              className="h-full w-full object-cover"
            />
          </div>
          <h1 className="text-xl sm:text-2xl font-bold text-ink tracking-tight">
            SwasthTrack
          </h1>
          <p className="text-xs sm:text-sm font-medium text-ink-subtle mt-1">
            अपनी सेहत का रिकॉर्ड सुरक्षित रखें
          </p>
        </div>

        {/* TABS (LOGIN / SIGNUP) */}
        {activeTab !== "forgot" && (
          <div className="mb-5 flex rounded-card bg-surface-sunken p-1">
            <button
              type="button"
              onClick={() => handleTabSwitch("login")}
              className={`w-1/2 rounded-control py-2 text-xs font-semibold transition-all ${
                activeTab === "login"
                  ? "bg-surface text-ink shadow-e1"
                  : "text-ink-subtle hover:text-ink"
              }`}
            >
              लॉगिन करें (Login)
            </button>
            <button
              type="button"
              onClick={() => handleTabSwitch("signup")}
              className={`w-1/2 rounded-control py-2 text-xs font-semibold transition-all ${
                activeTab === "signup"
                  ? "bg-surface text-ink shadow-e1"
                  : "text-ink-subtle hover:text-ink"
              }`}
            >
              नया खाता बनाएं (Sign Up)
            </button>
          </div>
        )}

        {/* ERROR / SUCCESS ALERTS */}
        {error && (
          <div className="mb-4 rounded-card border border-critical-line bg-critical-soft p-3 text-xs font-semibold text-critical animate-in fade-in">
            {error}
          </div>
        )}

        {successMsg && (
          <div className="mb-4 rounded-card border border-positive-line bg-positive-soft p-3 text-xs font-semibold text-positive flex items-center gap-1.5 animate-in fade-in">
            <CheckCircle2 className="h-4 w-4 shrink-0 text-positive" />
            {successMsg}
          </div>
        )}

        {/* 1. LOGIN FORM */}
        {activeTab === "login" && (
          <form onSubmit={handleLoginSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-ink-muted mb-1.5">
                मोबाइल नंबर (Mobile Number)
              </label>
              <div className="relative flex items-center">
                <span className="absolute left-3.5 text-xs font-semibold text-ink-subtle">
                  +91
                </span>
                <input
                  type="tel"
                  inputMode="numeric"
                  autoFocus
                  placeholder="98765 43210"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="w-full rounded-field border border-line-strong pl-12 pr-4 py-3 text-sm font-semibold text-ink tracking-wider placeholder:text-ink-subtle focus:border-brand focus:ring-2 focus:ring-brand/20 transition-all"
                  required
                />
                <Phone className="absolute right-3.5 h-4 w-4 text-ink-subtle" />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-xs font-semibold text-ink-muted">
                  पासवर्ड (Password)
                </label>
                <button
                  type="button"
                  onClick={() => handleTabSwitch("forgot")}
                  className="text-xs font-semibold text-brand hover:text-brand-ink"
                >
                  पासवर्ड भूल गए?
                </button>
              </div>
              <div className="relative flex items-center">
                <input
                  type={showPassword ? "text" : "password"}
                  placeholder="पासवर्ड दर्ज करें"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full rounded-field border border-line-strong px-4 py-3 text-sm font-semibold text-ink tracking-wider placeholder:text-ink-subtle focus:border-brand focus:ring-2 focus:ring-brand/20 transition-all"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="hit-target absolute right-3.5 text-ink-subtle hover:text-ink-muted"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <Button
              variant="primary"
              type="submit"
              disabled={loading}
              className="w-full h-12 text-sm font-semibold rounded-control"
            >
              {loading ? (
                "लॉगिन हो रहा है..."
              ) : (
                <span className="flex items-center justify-center gap-2">
                  <Lock className="h-4 w-4" />
                  लॉगिन करें (Sign In)
                  <ArrowRight className="h-4 w-4" />
                </span>
              )}
            </Button>
          </form>
        )}

        {/* 2. SIGN UP FORM */}
        {activeTab === "signup" && (
          <form onSubmit={handleSignupSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-ink-muted mb-1.5">
                मोबाइल नंबर (Mobile Number)
              </label>
              <div className="relative flex items-center">
                <span className="absolute left-3.5 text-xs font-semibold text-ink-subtle">
                  +91
                </span>
                <input
                  type="tel"
                  inputMode="numeric"
                  autoFocus
                  placeholder="98765 43210"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="w-full rounded-field border border-line-strong pl-12 pr-4 py-3 text-sm font-semibold text-ink tracking-wider placeholder:text-ink-subtle focus:border-brand focus:ring-2 focus:ring-brand/20 transition-all"
                  required
                />
                <Phone className="absolute right-3.5 h-4 w-4 text-ink-subtle" />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-ink-muted mb-1.5">
                पासवर्ड बनाएं (Create Password)
              </label>
              <div className="relative flex items-center">
                <input
                  type={showPassword ? "text" : "password"}
                  placeholder="कम से कम 4 अक्षर या अंक"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full rounded-field border border-line-strong px-4 py-3 text-sm font-semibold text-ink tracking-wider placeholder:text-ink-subtle focus:border-brand focus:ring-2 focus:ring-brand/20 transition-all"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="hit-target absolute right-3.5 text-ink-subtle hover:text-ink-muted"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-ink-muted mb-1.5">
                पासवर्ड दोबारा दर्ज करें (Confirm Password)
              </label>
              <div className="relative flex items-center">
                <input
                  type={showPassword ? "text" : "password"}
                  placeholder="वही पासवर्ड दोबारा लिखें"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full rounded-field border border-line-strong px-4 py-3 text-sm font-semibold text-ink tracking-wider placeholder:text-ink-subtle focus:border-brand focus:ring-2 focus:ring-brand/20 transition-all"
                  required
                />
              </div>
            </div>

            <Button
              variant="primary"
              type="submit"
              disabled={loading}
              className="w-full h-12 text-sm font-semibold rounded-control"
            >
              {loading ? (
                "खाता बनाया जा रहा है..."
              ) : (
                <span className="flex items-center justify-center gap-2">
                  <UserPlus className="h-4 w-4" />
                  खाता बनाएं एवं सेटअप शुरू करें
                  <ArrowRight className="h-4 w-4" />
                </span>
              )}
            </Button>
          </form>
        )}

        {/* DEMO MODE CTA BUTTON */}
        {activeTab !== "forgot" && (
          <div className="mt-4 pt-3 border-t border-line">
            <button
              type="button"
              onClick={handleDemoLogin}
              disabled={loading}
              className="w-full py-2.5 px-4 rounded-control bg-gold-soft hover:brightness-95 border border-gold-line text-gold-ink font-semibold text-xs sm:text-sm flex items-center justify-center gap-2 transition-all cursor-pointer shadow-2xs active:scale-98"
            >
              <span>⚡ बिना लॉगिन ऐप देखें (Try Demo Mode)</span>
            </button>
          </div>
        )}

        {/* 3. FORGOT PASSWORD FORM (6-Digit OTP) */}
        {activeTab === "forgot" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between mb-1">
              <button
                type="button"
                onClick={() => handleTabSwitch("login")}
                className="text-xs font-semibold text-ink-subtle hover:text-ink flex items-center gap-1 cursor-pointer"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                वापस लॉगिन पर जाएं
              </button>
            </div>

            <div className="rounded-card border border-info-line bg-info-soft p-3 text-xs text-info font-medium space-y-1">
              <p className="font-semibold flex items-center gap-1.5">
                <KeyRound className="h-3.5 w-3.5 text-info" />
                6-Digit OTP पासवर्ड रीसेट:
              </p>
              <p>
                रजिस्टर्ड मोबाइल नंबर पर 6-अंकों का OTP प्राप्त कर नया पासवर्ड बनाएं।
              </p>
            </div>

            {!otpSent ? (
              <form onSubmit={handleRequestOtp} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-ink-muted mb-1.5">
                    रजिस्टर्ड मोबाइल नंबर (Mobile Number)
                  </label>
                  <div className="relative flex items-center">
                    <span className="absolute left-3.5 text-xs font-semibold text-ink-subtle">
                      +91
                    </span>
                    <input
                      type="tel"
                      inputMode="numeric"
                      autoFocus
                      placeholder="98765 43210"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      className="w-full rounded-field border border-line-strong pl-12 pr-4 py-3 text-sm font-semibold text-ink tracking-wider placeholder:text-ink-subtle focus:border-brand focus:ring-2 focus:ring-brand/20 transition-all"
                      required
                    />
                  </div>
                </div>

                <Button
                  variant="primary"
                  type="submit"
                  disabled={loading || phone.length < 10}
                  className="w-full h-12 text-sm font-semibold rounded-control"
                >
                  {loading ? (
                    "OTP भेजा जा रहा है..."
                  ) : (
                    <span className="flex items-center justify-center gap-2">
                      <Phone className="h-4 w-4" />
                      OTP कोड भेजें (Send OTP)
                    </span>
                  )}
                </Button>
              </form>
            ) : (
              <form onSubmit={handleVerifyOtpSubmit} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-ink-muted mb-1.5">
                    6-अंकों का OTP कोड (Enter 6-Digit OTP) *
                  </label>
                  <input
                    type="text"
                    inputMode="numeric"
                    maxLength={6}
                    autoFocus
                    placeholder="e.g. 123456"
                    value={otpCode}
                    onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, ""))}
                    className="w-full rounded-field border border-line-strong px-4 py-3 text-center text-lg font-bold tracking-widest text-ink focus:border-brand focus:ring-2 focus:ring-brand/20"
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-ink-muted mb-1.5">
                    नया पासवर्ड बनाएं (New Password) *
                  </label>
                  <input
                    type="password"
                    placeholder="नया पासवर्ड दर्ज करें"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className="w-full rounded-field border border-line-strong px-4 py-3 text-sm font-semibold text-ink tracking-wider focus:border-brand focus:ring-2 focus:ring-brand/20"
                    required
                  />
                </div>

                <Button
                  variant="primary"
                  type="submit"
                  disabled={loading || otpCode.length !== 6 || !newPassword}
                  className="w-full h-12 text-sm font-semibold rounded-control"
                >
                  {loading ? (
                    "रीसेट हो रहा है..."
                  ) : (
                    <span className="flex items-center justify-center gap-2">
                      <KeyRound className="h-4 w-4" />
                      पासवर्ड रीसेट करें (Reset Password)
                    </span>
                  )}
                </Button>
              </form>
            )}
          </div>
        )}

        {/*
          This badge previously read "सुरक्षित एन्क्रिप्टेड स्वास्थ्य सेवा"
          (secure encrypted health service). Sign-in credentials are currently
          held in browser storage and are not encrypted, so the claim was not
          accurate. It now states what is actually true.
        */}
        <div className="mt-8 flex items-center justify-center gap-2 border-t border-line pt-5 text-xs text-ink-subtle">
          <ShieldCheck aria-hidden className="h-4 w-4 shrink-0 text-brand" />
          <span lang="hi">आपका स्वास्थ्य डेटा केवल आपके परिवार के लिए</span>
        </div>
      </div>
    </div>
  );
}
