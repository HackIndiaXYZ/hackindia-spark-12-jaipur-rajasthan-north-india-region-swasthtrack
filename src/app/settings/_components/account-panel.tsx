"use client";

import { useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { ArrowRight, Eye, EyeOff, KeyRound, Lock, LogOut, ShieldCheck, User, UserRound } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button, buttonClasses } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { Field, TextInput } from "@/components/ui/form-field";
import { useToast } from "@/components/ui/toast";
import { useAuth } from "@/context/auth-context";
import { MIN_PASSWORD_LENGTH, updatePassword } from "@/services/auth-service";
import type { PatientProfile } from "@/services/patient-service";
import { FactTile, SettingsCard } from "./settings-ui";

export const ROLE_LABEL = {
  owner: { hi: "मालिक", en: "Owner" },
  editor: { hi: "एडिटर", en: "Editor" },
  viewer: { hi: "सिर्फ़ देखने वाला", en: "Viewer" },
} as const;

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  return (parts[0][0] + (parts[1]?.[0] ?? "")).toUpperCase();
}

export function AccountPanel({ patient, onJoin }: { patient: PatientProfile | null; onJoin: () => void }) {
  const { user, profile, memberRole, signOut } = useAuth();
  const toast = useToast();
  const confirm = useConfirm();

  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const busyRef = useRef(false);

  const email = user?.email ?? profile?.email ?? "—";
  const displayName = profile?.display_name || email.split("@")[0];

  async function handleChangePassword(e: FormEvent) {
    e.preventDefault();
    if (busyRef.current) return;
    setError("");
    if (newPassword.length < MIN_PASSWORD_LENGTH) {
      setError(`पासवर्ड कम से कम ${MIN_PASSWORD_LENGTH} अक्षरों का रखें। (At least ${MIN_PASSWORD_LENGTH} characters.)`);
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("दोनों पासवर्ड एक जैसे नहीं हैं। (The two passwords do not match.)");
      return;
    }
    busyRef.current = true;
    setBusy(true);
    try {
      await updatePassword(newPassword);
      setNewPassword("");
      setConfirmPassword("");
      setShowPassword(false);
      toast({ title: "पासवर्ड बदल गया", tone: "success" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "पासवर्ड नहीं बदला जा सका।");
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  async function handleSignOut() {
    const ok = await confirm({
      title: "लॉग आउट करें?",
      message: "इस फोन से आपका सेशन और सेव किया हुआ अस्थायी डेटा हट जाएगा।",
      confirmLabel: "लॉग आउट (Sign out)",
    });
    if (ok) await signOut();
  }

  const role = patient && memberRole ? ROLE_LABEL[memberRole] : null;
  const age = patient?.age ? `${patient.age} वर्ष` : null;

  return (
    <div className="grid items-start gap-4 lg:grid-cols-2">
      <SettingsCard icon={User} title="आपका खाता" description="आप जिस ईमेल से लॉगिन हैं और आपकी भूमिका">
        <div className="tile flex items-center gap-3.5 rounded-card p-3.5">
          <span aria-hidden className="grad-gold-button grid h-12 w-12 shrink-0 place-items-center rounded-full border border-gold-line text-base font-bold text-gold-ink shadow-gold-button">
            {initials(displayName)}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-ink">{displayName}</p>
            <p className="truncate text-sm text-ink-muted">{email}</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="positive">
            <ShieldCheck aria-hidden className="h-3 w-3" />
            <span lang="hi">लॉगिन है</span>
          </Badge>
          {role ? (
            <Badge variant="brand">
              <span lang="hi">{patient?.name} पर: {role.hi}</span> ({role.en})
            </Badge>
          ) : null}
          {profile?.role === "admin" ? <Badge variant="gold">Admin</Badge> : null}
        </div>
      </SettingsCard>

      <SettingsCard icon={KeyRound} title="पासवर्ड बदलें" description={`कम से कम ${MIN_PASSWORD_LENGTH} अक्षर। अपना पासवर्ड किसी को न बताएँ।`}>
        <form onSubmit={handleChangePassword} className="space-y-3" noValidate>
          <Field label="नया पासवर्ड (New password)">
            <div className="relative">
              <TextInput
                type={showPassword ? "text" : "password"}
                autoComplete="new-password"
                value={newPassword}
                onChange={(e) => {
                  setNewPassword(e.target.value);
                  setError("");
                }}
                className="pr-12"
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? "पासवर्ड छुपाएं" : "पासवर्ड दिखाएं"}
                aria-pressed={showPassword}
                className="absolute inset-y-0 right-0 flex w-12 cursor-pointer items-center justify-center rounded-r-field text-ink-muted hover:text-ink"
              >
                {showPassword ? <EyeOff aria-hidden className="h-4 w-4" /> : <Eye aria-hidden className="h-4 w-4" />}
              </button>
            </div>
          </Field>
          <Field label="पासवर्ड दोबारा (Confirm)">
            <TextInput
              type={showPassword ? "text" : "password"}
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(e) => {
                setConfirmPassword(e.target.value);
                setError("");
              }}
            />
          </Field>
          <div aria-live="polite" className="empty:hidden">
            {error ? (
              <p role="alert" className="text-sm font-semibold text-critical">
                {error}
              </p>
            ) : null}
          </div>
          <Button type="submit" variant="secondary" loading={busy} disabled={!newPassword}>
            {busy ? null : <Lock aria-hidden className="h-4 w-4" />}
            पासवर्ड बदलें
          </Button>
        </form>
      </SettingsCard>

      {patient ? (
      <SettingsCard
        icon={UserRound}
        tone="weight"
        title="मरीज़ का परिचय"
        description="जानकारी बदलने के लिए Profile पेज खोलें"
        action={<Badge variant="positive">Active</Badge>}
      >
        <div className="grid gap-2.5 sm:grid-cols-3 lg:grid-cols-1 xl:grid-cols-3">
          <FactTile label="नाम (Name)" value={patient.name} helper={[age, patient.gender].filter(Boolean).join(" · ") || "उम्र/लिंग दर्ज नहीं"} />
          <FactTile
            label="वजन (Weight)"
            value={patient.current_weight_kg != null ? `${patient.current_weight_kg} kg` : "दर्ज नहीं"}
            helper={patient.target_weight_kg != null ? `लक्ष्य: ${patient.target_weight_kg} kg` : "लक्ष्य दर्ज नहीं"}
          />
          <FactTile label="समय (Time zone)" value="भारतीय समय (IST)" helper="सभी दिन भारत के समय से गिने जाते हैं" />
        </div>
        <Link href="/profile" className={buttonClasses({ variant: "secondary", size: "sm" })}>
          Profile खोलें
          <ArrowRight aria-hidden className="h-4 w-4" />
        </Link>
      </SettingsCard>
      ) : null}

      <SettingsCard icon={LogOut} tone="neutral" title="सेशन और एक्सेस" description="किसी और मरीज़ से जुड़ें या इस फोन से लॉग आउट करें">
        <div className="flex flex-col gap-2.5 sm:flex-row lg:flex-col xl:flex-row">
          <Button type="button" variant="secondary" onClick={onJoin} className="sm:flex-1">
            <KeyRound aria-hidden className="h-4 w-4" />
            इनविटेशन कोड डालें (Join a patient)
          </Button>
          <Button type="button" variant="danger" onClick={() => void handleSignOut()} className="sm:flex-1">
            <LogOut aria-hidden className="h-4 w-4" />
            लॉग आउट (Sign out)
          </Button>
        </div>
      </SettingsCard>
    </div>
  );
}
