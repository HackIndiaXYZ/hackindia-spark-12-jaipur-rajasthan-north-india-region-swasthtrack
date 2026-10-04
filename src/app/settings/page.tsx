"use client";

import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import Link from "next/link";
import {
  AlertCircle,
  Bell,
  Download,
  Eye,
  EyeOff,
  Footprints,
  HeartPulse,
  KeyRound,
  Loader2,
  Lock,
  LogOut,
  Mail,
  Moon,
  RotateCcw,
  Save,
  ShieldCheck,
  Trash2,
  User,
  UserPlus,
  Users,
  Utensils,
} from "lucide-react";
import { AddCaregiverDialog } from "@/components/forms/add-caregiver-dialog";
import { JoinPatientDialog } from "@/components/forms/join-patient-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { Field, NumberInput, Select, TextInput } from "@/components/ui/form-field";
import { PageTitle } from "@/components/ui/page-title";
import { useToast } from "@/components/ui/toast";
import { useAuth } from "@/context/auth-context";
import { DEFAULT_BP_THRESHOLDS, type BPThresholds } from "@/lib/health-rules";
import { cn } from "@/lib/utils";
import {
  MIN_PASSWORD_LENGTH,
  getAuthorizedCaregivers,
  revokeCaregiverAccess,
  setCaregiverRole,
  updatePassword,
  type AuthorizedCaregiver,
} from "@/services/auth-service";
import { exportAllDataAsCsv, exportAllDataAsJson } from "@/services/export-data-service";
import { sendAppEmail, sendAppEmailQuietly } from "@/services/email-client";
import { getNotificationPermissionStatus, requestNotificationPermission } from "@/services/notification-service";
import { getPatientProfile, updatePatientProfile, type PatientProfile } from "@/services/patient-service";
import { resetQuickFoodPreferences } from "@/services/quick-food-service";
import {
  getPatientSettings,
  updatePatientSettings,
  type BPScheduleType,
  type PatientSettings,
} from "@/services/settings-service";

type BPFields = Record<keyof BPThresholds, string>;

const BP_FIELD_GROUPS: {
  title: string;
  hint: string;
  systolic: keyof BPThresholds;
  diastolic: keyof BPThresholds;
}[] = [
  {
    title: "लक्ष्य (Target)",
    hint: "डॉक्टर का तय किया लक्ष्य। इससे ऊपर की रीडिंग \"लक्ष्य से ऊपर\" गिनी जाती है।",
    systolic: "target_systolic",
    diastolic: "target_diastolic",
  },
  {
    title: "चेतावनी (Alert)",
    hint: "इस या इससे ऊपर की रीडिंग पर अलर्ट दिखता है।",
    systolic: "alert_systolic",
    diastolic: "alert_diastolic",
  },
  {
    title: "आपातकाल (Crisis)",
    hint: "इस रेंज की रीडिंग पर तुरंत डॉक्टर से संपर्क की सलाह दी जाती है।",
    systolic: "crisis_systolic",
    diastolic: "crisis_diastolic",
  },
  {
    title: "कम BP (Low)",
    hint: "इससे नीचे की रीडिंग \"कम BP\" मानी जाती है।",
    systolic: "low_systolic",
    diastolic: "low_diastolic",
  },
];

const BP_SCHEDULES: { id: BPScheduleType; label: string; labelHi: string }[] = [
  { id: "morning_evening", label: "Morning + Evening", labelHi: "सुबह और शाम (अनुशंसित)" },
  { id: "morning_only", label: "Morning only", labelHi: "केवल सुबह" },
  { id: "evening_only", label: "Evening only", labelHi: "केवल शाम" },
];

const ALERT_TOGGLES: { key: keyof PatientSettings["alerts_enabled"]; label: string }[] = [
  { key: "bp", label: "रक्तचाप अलर्ट (Blood pressure alerts)" },
  { key: "medicine", label: "दवाई रिमाइंडर (Medicine reminders)" },
  { key: "activity", label: "गतिविधि रिमाइंडर (Activity reminders)" },
  { key: "sleep", label: "नींद रिमाइंडर (Sleep reminders)" },
  { key: "missingData", label: "छूटे हुए डेटा की सूचना (Missing data alerts)" },
];

function bpToFields(t: BPThresholds): BPFields {
  return Object.fromEntries(Object.entries(t).map(([k, v]) => [k, String(v)])) as BPFields;
}

/** Parse + check the clinical ordering so a typo cannot quietly switch an alert off. */
function parseBPFields(fields: BPFields): { value?: BPThresholds; error?: string } {
  const n = {} as BPThresholds;
  for (const key of Object.keys(fields) as (keyof BPThresholds)[]) {
    const v = Number(fields[key]);
    if (!Number.isInteger(v) || v < 30 || v > 300) {
      return { error: "BP की सभी सीमाएं 30 से 300 के बीच पूरी संख्या में भरें। (All BP lines must be whole numbers from 30 to 300.)" };
    }
    n[key] = v;
  }
  const ordered = (low: number, target: number, alert: number, crisis: number) =>
    low < target && target < alert && alert < crisis;
  if (
    !ordered(n.low_systolic, n.target_systolic, n.alert_systolic, n.crisis_systolic) ||
    !ordered(n.low_diastolic, n.target_diastolic, n.alert_diastolic, n.crisis_diastolic)
  ) {
    return { error: "क्रम सही रखें: कम < लक्ष्य < चेतावनी < आपातकाल (दोनों ऊपर और नीचे के BP के लिए)। (Keep low < target < alert < crisis.)" };
  }
  if (
    n.target_systolic <= n.target_diastolic ||
    n.alert_systolic <= n.alert_diastolic ||
    n.crisis_systolic <= n.crisis_diastolic ||
    n.low_systolic <= n.low_diastolic
  ) {
    return { error: "हर स्तर पर ऊपर का BP नीचे के BP से बड़ा होना चाहिए। (Systolic must be above diastolic.)" };
  }
  return { value: n };
}

function Section({
  icon,
  title,
  description,
  children,
  action,
}: {
  icon: ReactNode;
  title: string;
  description?: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <Card className="p-5">
      <CardHeader className="p-0 pb-4">
        <div className="flex w-full items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              {icon}
              <CardTitle className="text-sm font-semibold text-ink">{title}</CardTitle>
            </div>
            {description ? <CardDescription className="mt-1 text-xs">{description}</CardDescription> : null}
          </div>
          {action}
        </div>
      </CardHeader>
      {children}
    </Card>
  );
}

function PresetChips({
  values,
  current,
  onPick,
  disabled,
  format,
}: {
  values: number[];
  current: string;
  onPick: (value: string) => void;
  disabled: boolean;
  format: (value: number) => string;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {values.map((preset) => (
        <button
          key={preset}
          type="button"
          disabled={disabled}
          onClick={() => onPick(String(preset))}
          aria-pressed={current === String(preset)}
          className={cn(
            "min-h-control-sm cursor-pointer rounded-control border px-2.5 text-xs font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-60",
            current === String(preset)
              ? "border-brand bg-brand-soft text-brand-ink"
              : "border-line bg-surface-sunken text-ink-muted hover:bg-line",
          )}
        >
          {format(preset)}
        </button>
      ))}
    </div>
  );
}

const ROLE_LABEL = {
  owner: "मालिक (Owner)",
  editor: "एडिटर (Editor)",
  viewer: "सिर्फ़ देखने वाला (Viewer)",
} as const;

export default function SettingsPage() {
  const { user, profile, activePatientId, memberRole, canWrite, signOut } = useAuth();
  const isOwner = memberRole === "owner";
  const toast = useToast();
  const confirm = useConfirm();

  const [patient, setPatient] = useState<PatientProfile | null>(null);
  const [settings, setSettings] = useState<PatientSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [sendingTestEmail, setSendingTestEmail] = useState(false);
  const [notifPermission, setNotifPermission] = useState<string>(() =>
    typeof window !== "undefined" ? getNotificationPermissionStatus() : "default",
  );

  // Editable form state (strings so an empty box stays empty).
  const [calorieTarget, setCalorieTarget] = useState("");
  const [stepGoal, setStepGoal] = useState("");
  const [sleepTarget, setSleepTarget] = useState("");
  const [bpSchedule, setBpSchedule] = useState<BPScheduleType>("morning_evening");
  const [alerts, setAlerts] = useState<PatientSettings["alerts_enabled"]>({
    bp: true,
    medicine: true,
    activity: true,
    sleep: true,
    missingData: true,
  });
  const [bpFields, setBpFields] = useState<BPFields>(() => bpToFields(DEFAULT_BP_THRESHOLDS));

  // Caregivers (owner only)
  const [caregivers, setCaregivers] = useState<AuthorizedCaregiver[]>([]);
  const [caregiversError, setCaregiversError] = useState("");
  const [isAddCaregiverOpen, setIsAddCaregiverOpen] = useState(false);
  const [isJoinOpen, setIsJoinOpen] = useState(false);

  // Password change
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [passwordBusy, setPasswordBusy] = useState(false);
  const [passwordError, setPasswordError] = useState("");
  const passwordBusyRef = useRef(false);

  useEffect(() => {
    if (!activePatientId) return;
    let active = true;

    Promise.all([getPatientProfile(activePatientId), getPatientSettings(activePatientId)])
      .then(([prof, setts]) => {
        if (!active) return;
        setPatient(prof);
        setSettings(setts);
        setCalorieTarget(String(setts.daily_calorie_target ?? prof.daily_calorie_target ?? ""));
        setStepGoal(String(setts.daily_step_goal ?? ""));
        setSleepTarget(String(setts.sleep_target_hours ?? ""));
        setBpSchedule(setts.bp_monitoring_schedule);
        setAlerts({ ...setts.alerts_enabled });
        setBpFields(bpToFields(setts.bp_targets));
        setLoading(false);
      })
      .catch((err) => {
        console.error("Error loading settings:", err);
        if (!active) return;
        setLoadError(err instanceof Error ? err.message : "सेटिंग्स लोड नहीं हो सकीं। (Could not load settings.)");
        setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [activePatientId]);

  // Roster is owner-only (the RPC refuses anyone else).
  async function loadCaregivers(patientId: string) {
    try {
      const rows = await getAuthorizedCaregivers(patientId);
      setCaregivers(rows.filter((r) => r.status === "active"));
      setCaregiversError("");
    } catch (err) {
      setCaregiversError(err instanceof Error ? err.message : "सूची लोड नहीं हो सकी। (Could not load the list.)");
    }
  }

  useEffect(() => {
    if (!activePatientId || !isOwner) return;
    let active = true;
    getAuthorizedCaregivers(activePatientId)
      .then((rows) => {
        if (!active) return;
        setCaregivers(rows.filter((r) => r.status === "active"));
        setCaregiversError("");
      })
      .catch((err) => {
        if (active) setCaregiversError(err instanceof Error ? err.message : "सूची लोड नहीं हो सकी।");
      });
    return () => {
      active = false;
    };
  }, [activePatientId, isOwner]);

  async function handleEnablePushNotifs() {
    const status = await requestNotificationPermission();
    setNotifPermission(status);
    if (status === "granted") {
      toast({ title: "ब्राउज़र नोटिफिकेशन चालू हो गए", tone: "success" });
    } else if (status === "denied") {
      setError("ब्राउज़र सेटिंग्स में नोटिफिकेशन ब्लॉक हैं। (Notifications are blocked in the browser settings.)");
    }
  }

  async function handleSendTestEmail() {
    if (sendingTestEmail) return;
    setSendingTestEmail(true);
    try {
      const { to } = await sendAppEmail({ type: "account.test" });
      toast({ title: "टेस्ट ईमेल भेज दिया गया", description: `${to} का इनबॉक्स (और स्पैम) देखें।`, tone: "success" });
    } catch (err) {
      toast({ title: "टेस्ट ईमेल नहीं जा सका", description: err instanceof Error ? err.message : undefined, tone: "error" });
    } finally {
      setSendingTestEmail(false);
    }
  }

  async function handleRevoke(member: AuthorizedCaregiver) {
    if (!patient) return;
    const label = member.display_name || member.email || "यह सदस्य";
    const ok = await confirm({
      title: "एक्सेस हटाएं?",
      message: `${label} अब ${patient.name} की स्वास्थ्य जानकारी नहीं देख पाएंगे। बाद में नया कोड देकर दोबारा जोड़ा जा सकता है।`,
      confirmLabel: "हटाएं (Remove)",
      tone: "danger",
    });
    if (!ok) return;
    try {
      await revokeCaregiverAccess(member.member_id);
      sendAppEmailQuietly({ type: "caregiver.access-changed", patientId: patient.id, memberId: member.member_id, change: "removed" });
      await loadCaregivers(patient.id);
      toast({ title: "एक्सेस हटा दिया गया", tone: "success" });
    } catch (err) {
      toast({ title: "एक्सेस नहीं हटाया जा सका", description: err instanceof Error ? err.message : undefined, tone: "error" });
    }
  }

  async function handleRoleChange(member: AuthorizedCaregiver, role: "editor" | "viewer") {
    if (!patient || member.role === role) return;
    try {
      await setCaregiverRole(member.member_id, role);
      sendAppEmailQuietly({ type: "caregiver.access-changed", patientId: patient.id, memberId: member.member_id, change: "role-changed" });
      await loadCaregivers(patient.id);
      toast({ title: "भूमिका बदल दी गई", tone: "success" });
    } catch (err) {
      toast({ title: "भूमिका नहीं बदली जा सकी", description: err instanceof Error ? err.message : undefined, tone: "error" });
    }
  }

  async function handleChangePassword(e: FormEvent) {
    e.preventDefault();
    if (passwordBusyRef.current) return;
    setPasswordError("");
    if (newPassword.length < MIN_PASSWORD_LENGTH) {
      setPasswordError(`पासवर्ड कम से कम ${MIN_PASSWORD_LENGTH} अक्षरों का रखें। (At least ${MIN_PASSWORD_LENGTH} characters.)`);
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError("दोनों पासवर्ड एक जैसे नहीं हैं। (The two passwords do not match.)");
      return;
    }
    passwordBusyRef.current = true;
    setPasswordBusy(true);
    try {
      await updatePassword(newPassword);
      setNewPassword("");
      setConfirmPassword("");
      toast({ title: "पासवर्ड बदल गया", tone: "success" });
    } catch (err) {
      setPasswordError(err instanceof Error ? err.message : "पासवर्ड नहीं बदला जा सका।");
    } finally {
      passwordBusyRef.current = false;
      setPasswordBusy(false);
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

  async function handleSaveSettings(e: FormEvent) {
    e.preventDefault();
    if (!patient || !canWrite) return;
    setError("");

    const calNum = Number(calorieTarget);
    if (!Number.isInteger(calNum) || calNum < 500 || calNum > 6000) {
      setError("कैलोरी लक्ष्य 500 से 6000 kcal के बीच रखें। (Calorie target 500 to 6000.)");
      return;
    }
    const stepNum = Number(stepGoal);
    if (!Number.isInteger(stepNum) || stepNum < 1000 || stepNum > 50000) {
      setError("कदम लक्ष्य 1,000 से 50,000 के बीच रखें। (Step goal 1,000 to 50,000.)");
      return;
    }
    const sleepNum = Number(sleepTarget);
    if (!Number.isFinite(sleepNum) || sleepNum < 4 || sleepNum > 14) {
      setError("नींद का लक्ष्य 4 से 14 घंटे के बीच रखें। (Sleep target 4 to 14 hours.)");
      return;
    }

    let bpTargets: BPThresholds | undefined;
    if (isOwner) {
      const parsed = parseBPFields(bpFields);
      if (parsed.error) {
        setError(parsed.error);
        return;
      }
      bpTargets = parsed.value;
    }

    try {
      setSaving(true);
      const updated = await updatePatientSettings(patient.id, {
        daily_calorie_target: calNum,
        daily_step_goal: stepNum,
        sleep_target_hours: sleepNum,
        bp_monitoring_schedule: bpSchedule,
        alerts_enabled: alerts,
        ...(bpTargets ? { bp_targets: bpTargets } : {}),
      });
      // The profile carries the same target; keep the two in step.
      if (patient.daily_calorie_target !== calNum) {
        setPatient(await updatePatientProfile({ daily_calorie_target: calNum }, patient.id));
      }
      setSettings(updated);
      setBpFields(bpToFields(updated.bp_targets));
      toast({ title: "सेटिंग्स सुरक्षित हो गईं", tone: "success" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "सेटिंग्स सुरक्षित नहीं हो सकीं। (Could not save settings.)");
    } finally {
      setSaving(false);
    }
  }

  if (!activePatientId) {
    return (
      <div className="space-y-6">
        <PageTitle title="Settings" eyebrow="सेटिंग्स" description="कोई मरीज़ चुना नहीं गया है।" />
      </div>
    );
  }

  if (loading || !patient || !settings) {
    return (
      <div className="space-y-6">
        <PageTitle
          description="Manage health goals, tracking schedule and notification preferences."
          eyebrow="Settings (सेटिंग्स)"
          title="Health Preferences & Settings"
        />
        {loadError ? (
          <div role="alert" className="flex items-center gap-2 rounded-card border border-critical-line bg-critical-soft px-4 py-3 text-sm font-semibold text-critical">
            <AlertCircle className="h-4 w-4 shrink-0" aria-hidden />
            {loadError}
          </div>
        ) : (
          <div className="h-96 animate-pulse rounded-panel bg-surface-sunken" />
        )}
      </div>
    );
  }

  const readOnly = !canWrite;
  const bpReadOnly = !isOwner;
  const otherMembers = caregivers.filter((c) => c.user_id !== user?.id);

  return (
    <div className="space-y-6">
      <PageTitle
        description="Manage your account, health goals, tracking schedule and who can see this patient."
        eyebrow="Settings & Preferences (सेटिंग्स और प्राथमिकताएं)"
        title="Settings Center"
      />

      {/* ACCOUNT: not part of the patient form, so it has its own forms */}
      <Section
        icon={<User className="h-4 w-4 text-brand" aria-hidden />}
        title="आपका खाता (Your account)"
        description="आप जिस ईमेल से लॉगिन हैं और आपकी भूमिका"
        action={profile?.role === "admin" ? <Badge variant="gold">Admin</Badge> : undefined}
      >
        <div className="space-y-4 text-xs">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-card border border-line bg-surface-sunken p-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-ink">{user?.email ?? profile?.email ?? "—"}</p>
              <p className="text-ink-muted">
                {profile?.display_name ? `${profile.display_name} · ` : ""}
                {patient.name} पर आपकी भूमिका: {memberRole ? ROLE_LABEL[memberRole] : "—"}
              </p>
            </div>
            <Badge variant="green">लॉगिन है</Badge>
          </div>

          <form onSubmit={handleChangePassword} className="space-y-3 rounded-card border border-line p-3">
            <p className="flex items-center gap-1.5 text-sm font-semibold text-ink">
              <KeyRound className="h-4 w-4 text-brand" aria-hidden />
              पासवर्ड बदलें (Change password)
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="नया पासवर्ड (New password)" hint={`कम से कम ${MIN_PASSWORD_LENGTH} अक्षर`}>
                <div className="relative">
                  <TextInput
                    type={showPassword ? "text" : "password"}
                    autoComplete="new-password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className="pr-11"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    aria-label={showPassword ? "पासवर्ड छुपाएं" : "पासवर्ड दिखाएं"}
                    aria-pressed={showPassword}
                    className="absolute inset-y-0 right-0 flex w-11 cursor-pointer items-center justify-center text-ink-subtle hover:text-ink"
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" aria-hidden /> : <Eye className="h-4 w-4" aria-hidden />}
                  </button>
                </div>
              </Field>
              <Field label="पासवर्ड दोबारा (Confirm)">
                <TextInput
                  type={showPassword ? "text" : "password"}
                  autoComplete="new-password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                />
              </Field>
            </div>
            <div aria-live="polite" className="empty:hidden">
              {passwordError ? (
                <p role="alert" className="text-xs font-semibold text-critical">
                  {passwordError}
                </p>
              ) : null}
            </div>
            <Button type="submit" variant="secondary" disabled={passwordBusy || !newPassword}>
              {passwordBusy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Lock className="h-4 w-4" aria-hidden />}
              पासवर्ड बदलें
            </Button>
          </form>

          <div className="flex flex-wrap items-center justify-between gap-2">
            <Button type="button" variant="secondary" onClick={() => setIsJoinOpen(true)}>
              <KeyRound className="h-4 w-4" aria-hidden />
              इनविटेशन कोड डालें (Join a patient)
            </Button>
            <Button type="button" variant="danger" onClick={() => void handleSignOut()}>
              <LogOut className="h-4 w-4" aria-hidden />
              लॉग आउट (Sign out)
            </Button>
          </div>
        </div>
      </Section>

      <form onSubmit={handleSaveSettings} className="space-y-6">
        {readOnly ? (
          <div role="status" className="flex items-start gap-2 rounded-card border border-info-line bg-info-soft px-4 py-3 text-sm font-medium text-info">
            <Lock className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            आपके पास इस मरीज़ को सिर्फ़ देखने का एक्सेस है, इसलिए सेटिंग्स बदली नहीं जा सकतीं। (View-only access: settings are read-only.)
          </div>
        ) : null}

        <div aria-live="polite" className="empty:hidden">
          {error ? (
            <div role="alert" className="flex items-center gap-2 rounded-card border border-critical-line bg-critical-soft px-4 py-3 text-sm font-semibold text-critical">
              <AlertCircle className="h-4 w-4 shrink-0" aria-hidden />
              {error}
            </div>
          ) : null}
        </div>

        {/* PATIENT SUMMARY */}
        <Section
          icon={<User className="h-4 w-4 text-brand" aria-hidden />}
          title="मरीज़ का परिचय (Patient summary)"
          description="जानकारी बदलने के लिए Profile पेज खोलें"
          action={<Badge variant="green">Active</Badge>}
        >
          <div className="grid gap-3 text-xs sm:grid-cols-3">
            <div className="rounded-card border border-line bg-surface-sunken p-3">
              <span className="text-2xs font-semibold uppercase tracking-wider text-ink-subtle">नाम (Name)</span>
              <p className="mt-0.5 text-sm font-semibold text-ink">{patient.name}</p>
              <p className="text-ink-muted">
                {[patient.age ? `${patient.age} वर्ष` : null, patient.gender].filter(Boolean).join(" · ") || "उम्र/लिंग दर्ज नहीं"}
              </p>
            </div>
            <div className="rounded-card border border-line bg-surface-sunken p-3">
              <span className="text-2xs font-semibold uppercase tracking-wider text-ink-subtle">वजन (Weight)</span>
              <p className="mt-0.5 text-sm font-semibold text-ink">
                {patient.current_weight_kg != null ? `${patient.current_weight_kg} kg` : "दर्ज नहीं"}
              </p>
              <p className="text-ink-muted">
                {patient.target_weight_kg != null ? `लक्ष्य: ${patient.target_weight_kg} kg` : "लक्ष्य दर्ज नहीं"}
              </p>
            </div>
            <div className="rounded-card border border-line bg-surface-sunken p-3">
              <span className="text-2xs font-semibold uppercase tracking-wider text-ink-subtle">समय (Time zone)</span>
              <p className="mt-0.5 text-sm font-semibold text-ink">भारतीय समय (IST)</p>
              <p className="text-ink-muted">सभी दिन भारत के समय से गिने जाते हैं</p>
            </div>
          </div>
        </Section>

        {/* NUTRITION */}
        <Section
          icon={<Utensils className="h-4 w-4 text-food" aria-hidden />}
          title="दैनिक कैलोरी लक्ष्य (Calorie target)"
          description="भोजन के स्कोर और रिपोर्ट इसी लक्ष्य से तुलना करते हैं"
        >
          <div className="space-y-3">
            <div className="flex items-start gap-2 rounded-card border border-attention-line bg-attention-soft p-3 text-xs text-attention">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
              <p className="leading-relaxed">
                यह लक्ष्य डॉक्टर या डायटीशियन की सलाह के अनुसार रखें। बदलने से पहले उनसे पूछ लें। (Change only on medical advice.)
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Calorie target (kcal / दिन)" required>
                <NumberInput
                  value={calorieTarget}
                  onChange={(e) => setCalorieTarget(e.target.value)}
                  disabled={readOnly}
                  placeholder="kcal"
                />
              </Field>
              <div className="flex items-end">
                <PresetChips
                  values={[1400, 1600, 1800, 2000]}
                  current={calorieTarget}
                  onPick={setCalorieTarget}
                  disabled={readOnly}
                  format={(v) => `${v} kcal`}
                />
              </div>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line pt-3">
              <div>
                <p className="text-xs font-semibold text-ink">सीखे गए त्वरित भोजन (Learned quick foods)</p>
                <p className="text-xs text-ink-muted">भोजन का इतिहास डिलीट किए बिना सिर्फ़ रैंकिंग रीसेट होती है। (This phone only.)</p>
              </div>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => {
                  resetQuickFoodPreferences(patient.id);
                  toast({ title: "त्वरित भोजन की रैंकिंग रीसेट हो गई", tone: "success" });
                }}
              >
                <RotateCcw className="h-3.5 w-3.5" aria-hidden />
                Reset quick foods
              </Button>
            </div>
          </div>
        </Section>

        {/* ACTIVITY */}
        <Section
          icon={<Footprints className="h-4 w-4 text-activity" aria-hidden />}
          title="कदम लक्ष्य (Daily step goal)"
          description="गतिविधि स्कोर और याद दिलाने के लिए। पुराने रिकॉर्ड नहीं बदलते।"
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Daily step goal (कदम / दिन)" required>
              <NumberInput value={stepGoal} onChange={(e) => setStepGoal(e.target.value)} disabled={readOnly} placeholder="कदम" />
            </Field>
            <div className="flex items-end">
              <PresetChips
                values={[4000, 5000, 6000, 8000, 10000]}
                current={stepGoal}
                onPick={setStepGoal}
                disabled={readOnly}
                format={(v) => v.toLocaleString("en-IN")}
              />
            </div>
          </div>
        </Section>

        {/* SLEEP */}
        <Section
          icon={<Moon className="h-4 w-4 text-sleep" aria-hidden />}
          title="नींद का लक्ष्य (Sleep target)"
          description="रोज़ाना के वेलनेस स्कोर में इस्तेमाल होता है"
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Target hours / night (घंटे)" required>
              <NumberInput
                allowDecimal
                value={sleepTarget}
                onChange={(e) => setSleepTarget(e.target.value)}
                disabled={readOnly}
                placeholder="घंटे"
              />
            </Field>
            <div className="flex items-end">
              <PresetChips
                values={[6, 6.5, 7, 7.5, 8]}
                current={sleepTarget}
                onPick={setSleepTarget}
                disabled={readOnly}
                format={(v) => `${v} hrs`}
              />
            </div>
          </div>
        </Section>

        {/* BP SCHEDULE + THRESHOLDS */}
        <Section
          icon={<HeartPulse className="h-4 w-4 text-bp" aria-hidden />}
          title="BP निगरानी (Blood pressure monitoring)"
          description="कितनी बार BP नापना है, और कौन सी रीडिंग “ज़्यादा” मानी जाए"
        >
          <fieldset className="space-y-4" disabled={readOnly}>
            <legend className="sr-only">BP monitoring schedule</legend>
            <div className="grid gap-2 text-xs sm:grid-cols-3">
              {BP_SCHEDULES.map((opt) => (
                <label
                  key={opt.id}
                  className={cn(
                    "flex min-h-control cursor-pointer items-center gap-2.5 rounded-card border p-3 transition-colors",
                    bpSchedule === opt.id
                      ? "border-bp bg-bp-soft font-semibold text-ink"
                      : "border-line bg-surface text-ink-muted hover:bg-surface-sunken",
                    readOnly && "cursor-not-allowed opacity-70",
                  )}
                >
                  <input
                    type="radio"
                    name="bpSchedule"
                    checked={bpSchedule === opt.id}
                    onChange={() => setBpSchedule(opt.id)}
                    className="h-4 w-4 accent-bp"
                  />
                  <span>
                    <span className="block">{opt.label}</span>
                    <span lang="hi" className="text-2xs font-normal text-ink-subtle">
                      {opt.labelHi}
                    </span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>

          <div className="mt-5 border-t border-line pt-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <h3 className="text-sm font-semibold text-ink">BP की सीमाएं (BP thresholds, mmHg)</h3>
                <p className="mt-0.5 text-xs text-ink-muted">
                  डॉक्टर की सलाह से ही बदलें। ऐप में BP के सभी अलर्ट इन्हीं सीमाओं से बनते हैं।
                </p>
              </div>
              {bpReadOnly ? (
                <Badge variant="neutral">
                  <Lock className="h-3 w-3" aria-hidden />
                  सिर्फ़ मालिक बदल सकता है
                </Badge>
              ) : (
                <Button type="button" variant="ghost" size="sm" onClick={() => setBpFields(bpToFields(DEFAULT_BP_THRESHOLDS))}>
                  <RotateCcw className="h-3.5 w-3.5" aria-hidden />
                  मानक सीमाएं
                </Button>
              )}
            </div>

            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              {BP_FIELD_GROUPS.map((group) => (
                <div key={group.title} className="rounded-card border border-line bg-surface-sunken p-3">
                  <p className="text-xs font-semibold text-ink">{group.title}</p>
                  <p className="mb-2 text-2xs text-ink-subtle">{group.hint}</p>
                  <div className="grid grid-cols-2 gap-2">
                    <Field label="ऊपर का (Systolic)">
                      <NumberInput
                        value={bpFields[group.systolic]}
                        onChange={(e) => setBpFields((f) => ({ ...f, [group.systolic]: e.target.value }))}
                        disabled={bpReadOnly || readOnly}
                      />
                    </Field>
                    <Field label="नीचे का (Diastolic)">
                      <NumberInput
                        value={bpFields[group.diastolic]}
                        onChange={(e) => setBpFields((f) => ({ ...f, [group.diastolic]: e.target.value }))}
                        disabled={bpReadOnly || readOnly}
                      />
                    </Field>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </Section>

        {/* ALERTS */}
        <Section
          icon={<Bell className="h-4 w-4 text-attention" aria-hidden />}
          title="सूचनाएं और रिमाइंडर (Alerts & reminders)"
          description="डैशबोर्ड पर कौन से नियम-आधारित अलर्ट दिखें"
        >
          <fieldset disabled={readOnly} className="space-y-2.5 text-xs">
            <legend className="sr-only">Alert preferences</legend>
            {ALERT_TOGGLES.map((toggle) => (
              <label
                key={toggle.key}
                className="flex min-h-control cursor-pointer items-center justify-between gap-3 rounded-card border border-line bg-surface-sunken p-3"
              >
                <span className="font-semibold text-ink">{toggle.label}</span>
                <input
                  type="checkbox"
                  checked={alerts[toggle.key]}
                  onChange={(e) => setAlerts((a) => ({ ...a, [toggle.key]: e.target.checked }))}
                  className="h-5 w-5 shrink-0 accent-brand"
                />
              </label>
            ))}
          </fieldset>
          <div className="pt-3">
            {notifPermission === "unsupported" ? (
              <p className="text-xs text-ink-muted">यह ब्राउज़र नोटिफिकेशन को सपोर्ट नहीं करता।</p>
            ) : (
              <Button
                type="button"
                variant={notifPermission === "granted" ? "quiet" : "secondary"}
                block
                onClick={handleEnablePushNotifs}
                disabled={notifPermission === "granted"}
              >
                <Bell className="h-4 w-4" aria-hidden />
                {notifPermission === "granted"
                  ? "ब्राउज़र नोटिफिकेशन चालू हैं"
                  : "ब्राउज़र नोटिफिकेशन चालू करें (Enable notifications)"}
              </Button>
            )}
          </div>
          <div className="space-y-1.5 pt-3">
            <Button type="button" variant="secondary" block onClick={handleSendTestEmail} disabled={sendingTestEmail || !user?.email}>
              {sendingTestEmail ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              ) : (
                <Mail className="h-4 w-4" aria-hidden />
              )}
              ईमेल टेस्ट करें (Send test email)
            </Button>
            <p className="text-xs text-ink-muted">
              {user?.email
                ? `${user.email} पर एक टेस्ट ईमेल जाएगा, ताकि पता चले कि अलर्ट और रिपोर्ट पहुँचेंगे।`
                : "टेस्ट ईमेल के लिए खाते में ईमेल पता चाहिए।"}
            </p>
          </div>
        </Section>

        {/* SAVE */}
        {!readOnly ? (
          <div className="frost sticky bottom-20 z-20 flex justify-end gap-3 rounded-panel border border-line p-4 shadow-e2 lg:bottom-4">
            <Button type="submit" variant="primary" size="lg" disabled={saving} className="w-full sm:w-auto">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Save className="h-4 w-4" aria-hidden />}
              {saving ? "सेव हो रहा है..." : "सभी सेटिंग्स सुरक्षित करें"}
            </Button>
          </div>
        ) : null}
      </form>

      {/* CAREGIVERS */}
      <Section
        icon={<Users className="h-4 w-4 text-brand" aria-hidden />}
        title="केयरगिवर और परिवार (Caregiver access)"
        description={`${patient.name} की जानकारी कौन देख या भर सकता है`}
        action={
          isOwner ? (
            <Button type="button" variant="secondary" size="sm" onClick={() => setIsAddCaregiverOpen(true)}>
              <UserPlus className="h-3.5 w-3.5" aria-hidden />
              जोड़ें (Add)
            </Button>
          ) : undefined
        }
      >
        {isOwner ? (
          <div className="space-y-2 text-xs">
            {caregiversError ? (
              <p role="alert" className="font-semibold text-critical">
                {caregiversError}
              </p>
            ) : null}
            {otherMembers.length > 0 ? (
              otherMembers.map((member) => (
                <div
                  key={member.member_id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-card border border-line bg-surface p-3 shadow-e1"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-ink">{member.display_name || member.email || "—"}</p>
                    <p className="truncate text-ink-muted">
                      {member.email ? `${member.email} · ` : ""}
                      जुड़े: {new Date(member.added_at).toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata" })}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <label className="sr-only" htmlFor={`role-${member.member_id}`}>
                      Role
                    </label>
                    <Select
                      id={`role-${member.member_id}`}
                      value={member.role === "editor" ? "editor" : "viewer"}
                      onChange={(e) => void handleRoleChange(member, e.target.value as "editor" | "viewer")}
                      className="min-h-control-sm w-auto text-xs"
                    >
                      <option value="viewer">Viewer (देखना)</option>
                      <option value="editor">Editor (भरना)</option>
                    </Select>
                    <Button type="button" variant="danger" size="sm" onClick={() => void handleRevoke(member)}>
                      <Trash2 className="h-3.5 w-3.5" aria-hidden />
                      हटाएं
                    </Button>
                  </div>
                </div>
              ))
            ) : !caregiversError ? (
              <div className="rounded-card border border-line bg-surface-sunken p-3 text-ink-muted">
                अभी कोई और सदस्य नहीं जुड़ा है। परिवार के किसी सदस्य को जोड़ने के लिए &quot;जोड़ें&quot; दबाएं।
              </div>
            ) : null}
          </div>
        ) : (
          <div className="flex items-start gap-2 rounded-card border border-line bg-surface-sunken p-3 text-xs text-ink-muted">
            <Lock className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            केयरगिवर जोड़ना या हटाना सिर्फ़ मरीज़ का मालिक (Owner) कर सकता है।
          </div>
        )}
      </Section>

      {/* EXPORT */}
      <Section
        icon={<Download className="h-4 w-4 text-weight" aria-hidden />}
        title="डेटा बैकअप (Data export)"
        description="BP, वजन, भोजन, दवाई और नींद के सभी रिकॉर्ड डाउनलोड करें"
      >
        <div className="flex flex-col gap-3 sm:flex-row">
          <Button type="button" variant="secondary" block onClick={() => void exportAllDataAsCsv(patient.id)}>
            <Download className="h-4 w-4" aria-hidden />
            CSV डाउनलोड करें
          </Button>
          <Button type="button" variant="secondary" block onClick={() => void exportAllDataAsJson(patient.id)}>
            <Download className="h-4 w-4" aria-hidden />
            JSON डाउनलोड करें
          </Button>
        </div>
      </Section>

      <div className="space-y-3 rounded-card border border-line bg-surface-sunken p-5 text-xs text-ink-muted">
        <div className="flex items-center gap-1.5 font-semibold text-ink">
          <ShieldCheck className="h-4 w-4 text-brand" aria-hidden />
          SwasthTrack Health Companion
        </div>
        <p className="leading-relaxed">
          आपके रिकॉर्ड सुरक्षित डेटाबेस में रहते हैं और सिर्फ़ उन्हीं को दिखते हैं जिन्हें आपने एक्सेस दिया है। सभी विश्लेषण नियम-आधारित हैं और ट्रैकिंग में मदद के लिए हैं, डॉक्टर की सलाह के विकल्प नहीं।
        </p>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-line pt-3 font-semibold text-brand-ink">
          <Link href="/about" className="hover:underline">
            About
          </Link>
          <Link href="/contact" className="hover:underline">
            Contact &amp; Support
          </Link>
          <Link href="/privacy" className="hover:underline">
            Privacy Policy
          </Link>
          <Link href="/terms" className="hover:underline">
            Terms of Use
          </Link>
          <Link href="/medical-disclaimer" className="hover:underline">
            Medical Disclaimer
          </Link>
        </div>
      </div>

      {isOwner ? (
        <AddCaregiverDialog
          isOpen={isAddCaregiverOpen}
          onClose={() => setIsAddCaregiverOpen(false)}
          patientId={patient.id}
          onSuccess={() => void loadCaregivers(patient.id)}
        />
      ) : null}

      <JoinPatientDialog isOpen={isJoinOpen} onClose={() => setIsJoinOpen(false)} />
    </div>
  );
}
