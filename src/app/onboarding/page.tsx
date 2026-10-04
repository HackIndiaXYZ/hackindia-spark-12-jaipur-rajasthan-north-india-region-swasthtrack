"use client";

import { useRef, useState, type FormEvent } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import {
  Activity,
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  KeyRound,
  LogOut,
  Scale,
  Sparkles,
  User,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field, NumberInput, Select, TextInput } from "@/components/ui/form-field";
import { JoinPatientDialog } from "@/components/forms/join-patient-dialog";
import { useAuth } from "@/context/auth-context";
import { createPatientForCurrentUser } from "@/services/auth-service";
import { sendAppEmailQuietly } from "@/services/email-client";
import { addMedicalCondition } from "@/services/patient-service";

const CONDITION_PRESETS = [
  { name: "Hypertension", hi: "उच्च रक्तचाप" },
  { name: "Type 2 Diabetes", hi: "मधुमेह" },
  { name: "Fatty Liver", hi: "फैटी लिवर" },
  { name: "Thyroid", hi: "थायराइड" },
  { name: "High Cholesterol", hi: "कोलेस्ट्रॉल" },
  { name: "Previous Stroke", hi: "स्ट्रोक रिकवरी" },
];

type FieldErrors = Partial<Record<"name" | "age" | "height" | "weight" | "target" | "calories", string>>;

/** Blank means "not provided". A filled value must be a number inside [min, max]. */
function parseOptional(
  raw: string,
  min: number,
  max: number,
  message: string,
  integer = false,
): { value: number | null; error?: string } {
  const text = raw.trim();
  if (!text) return { value: null };
  const n = Number(text);
  if (!Number.isFinite(n) || n < min || n > max || (integer && !Number.isInteger(n))) {
    return { value: null, error: message };
  }
  return { value: n };
}

export default function OnboardingPage() {
  const router = useRouter();
  const { authorizedPatients, refreshSession, setActivePatientId, signOut } = useAuth();
  const hasPatients = authorizedPatients.length > 0;

  const [name, setName] = useState("");
  const [age, setAge] = useState("");
  const [gender, setGender] = useState("");
  const [heightCm, setHeightCm] = useState("");
  const [currentWeight, setCurrentWeight] = useState("");
  const [targetWeight, setTargetWeight] = useState("");
  const [calorieTarget, setCalorieTarget] = useState("");
  const [selectedConditions, setSelectedConditions] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [isJoinOpen, setIsJoinOpen] = useState(false);
  const [createdWithGaps, setCreatedWithGaps] = useState(false);
  const busyRef = useRef(false);

  function toggleCondition(condition: string) {
    setSelectedConditions((prev) =>
      prev.includes(condition) ? prev.filter((c) => c !== condition) : [...prev, condition],
    );
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (busyRef.current) return;
    setError("");

    const errors: FieldErrors = {};
    if (!name.trim()) errors.name = "कृपया मरीज़ का नाम लिखें। (Patient name is required.)";
    const ageR = parseOptional(age, 1, 120, "उम्र 1 से 120 के बीच होनी चाहिए। (Age 1 to 120.)", true);
    const heightR = parseOptional(heightCm, 50, 260, "ऊंचाई 50 से 260 सेमी के बीच होनी चाहिए। (Height 50 to 260 cm.)");
    const weightR = parseOptional(currentWeight, 20, 350, "वजन 20 से 350 kg के बीच होना चाहिए। (Weight 20 to 350 kg.)");
    const targetR = parseOptional(targetWeight, 20, 350, "लक्ष्य वजन 20 से 350 kg के बीच होना चाहिए। (Target 20 to 350 kg.)");
    const calR = parseOptional(
      calorieTarget,
      500,
      6000,
      "कैलोरी लक्ष्य 500 से 6000 kcal के बीच होना चाहिए। (500 to 6000 kcal.)",
      true,
    );
    if (ageR.error) errors.age = ageR.error;
    if (heightR.error) errors.height = heightR.error;
    if (weightR.error) errors.weight = weightR.error;
    if (targetR.error) errors.target = targetR.error;
    if (calR.error) errors.calories = calR.error;

    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) {
      setError("कृपया लाल निशान वाली जानकारी ठीक करें। (Please fix the highlighted fields.)");
      return;
    }

    busyRef.current = true;
    setLoading(true);
    try {
      const patient = await createPatientForCurrentUser({
        name,
        age: ageR.value,
        gender: gender || null,
        height_cm: heightR.value,
        current_weight_kg: weightR.value,
        target_weight_kg: targetR.value,
        daily_calorie_target: calR.value,
      });

      // The patient exists now. Conditions are extras: a failure here must not hide that.
      const results = await Promise.allSettled(
        selectedConditions.map((condition) =>
          addMedicalCondition({ patient_id: patient.id, condition_name: condition }),
        ),
      );
      const gaps = results.some((r) => r.status === "rejected");

      await refreshSession();
      setActivePatientId(patient.id);
      // Courtesy mail for the very first profile only; never blocks or fails onboarding.
      if (!hasPatients) sendAppEmailQuietly({ type: "account.welcome", patientId: patient.id });

      if (gaps) {
        setCreatedWithGaps(true);
      } else {
        router.replace("/");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "प्रोफाइल सुरक्षित करने में त्रुटि हुई। (Could not save the profile.)");
    } finally {
      busyRef.current = false;
      setLoading(false);
    }
  }

  function handleJoined() {
    router.replace("/");
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-canvas px-4 py-10">
      <div className="gold-edge w-full max-w-xl rounded-panel bg-surface p-6 sm:p-8">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 flex h-16 w-16 items-center justify-center overflow-hidden rounded-card border border-line bg-surface shadow-e2">
            <Image src="/logo.jpg" alt="SwasthTrack" width={64} height={64} className="h-full w-full object-cover" />
          </div>
          <span className="rounded-full border border-brand-line bg-brand-soft px-3 py-1 text-xs font-semibold uppercase tracking-wider text-brand-ink">
            {hasPatients ? "Add a patient · एक और मरीज़ जोड़ें" : "Get started · शुरुआत करें"}
          </span>
          <h1 className="mt-2 text-xl font-bold text-ink sm:text-2xl">किसकी सेहत ट्रैक करनी है?</h1>
          <p className="mt-1 text-sm text-ink-muted">
            सिर्फ़ नाम ज़रूरी है। बाकी जानकारी बाद में कभी भी जोड़ सकते हैं। (Only the name is required; add the rest later.)
          </p>
        </div>

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
        </div>

        {createdWithGaps ? (
          <div className="space-y-4 text-center">
            <div className="rounded-card border border-attention-line bg-attention-soft p-4 text-sm text-attention">
              मरीज़ की प्रोफाइल बन गई है, पर कुछ स्वास्थ्य स्थितियाँ सेव नहीं हो सकीं। उन्हें Profile पेज पर जोड़ लें। (Profile created; some conditions were not saved: add them on the Profile page.)
            </div>
            <Button variant="primary" size="lg" block onClick={() => router.replace("/")}>
              आगे बढ़ें (Continue)
              <ArrowRight className="h-4 w-4" aria-hidden />
            </Button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4" noValidate>
            <Card className="space-y-3 p-4">
              <h2 className="flex items-center gap-1.5 text-sm font-semibold text-ink">
                <User className="h-4 w-4 text-brand" aria-hidden />
                व्यक्तिगत जानकारी (Personal info)
              </h2>

              <Field label="मरीज़ का नाम (Patient name)" required error={fieldErrors.name}>
                <TextInput
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="पूरा नाम"
                  autoComplete="off"
                  aria-invalid={Boolean(fieldErrors.name)}
                  required
                />
              </Field>

              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                <Field label="उम्र (Age)" hint="वैकल्पिक" error={fieldErrors.age}>
                  <NumberInput
                    value={age}
                    onChange={(e) => setAge(e.target.value)}
                    placeholder="वर्ष"
                    aria-invalid={Boolean(fieldErrors.age)}
                  />
                </Field>
                <Field label="लिंग (Gender)" hint="वैकल्पिक">
                  <Select value={gender} onChange={(e) => setGender(e.target.value)}>
                    <option value="">चुनें</option>
                    <option value="Male">पुरुष (Male)</option>
                    <option value="Female">महिला (Female)</option>
                    <option value="Other">अन्य (Other)</option>
                  </Select>
                </Field>
                <Field
                  label="ऊंचाई (Height cm)"
                  hint="वैकल्पिक"
                  error={fieldErrors.height}
                  className="col-span-2 sm:col-span-1"
                >
                  <NumberInput
                    allowDecimal
                    value={heightCm}
                    onChange={(e) => setHeightCm(e.target.value)}
                    placeholder="सेमी"
                    aria-invalid={Boolean(fieldErrors.height)}
                  />
                </Field>
              </div>
            </Card>

            <Card className="space-y-3 p-4">
              <h2 className="flex items-center gap-1.5 text-sm font-semibold text-ink">
                <Scale className="h-4 w-4 text-brand" aria-hidden />
                वजन और पोषण लक्ष्य (Weight and calorie goals)
              </h2>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                <Field label="वर्तमान वजन (kg)" hint="वैकल्पिक" error={fieldErrors.weight}>
                  <NumberInput
                    allowDecimal
                    value={currentWeight}
                    onChange={(e) => setCurrentWeight(e.target.value)}
                    placeholder="kg"
                    aria-invalid={Boolean(fieldErrors.weight)}
                  />
                </Field>
                <Field label="लक्ष्य वजन (kg)" hint="वैकल्पिक" error={fieldErrors.target}>
                  <NumberInput
                    allowDecimal
                    value={targetWeight}
                    onChange={(e) => setTargetWeight(e.target.value)}
                    placeholder="kg"
                    aria-invalid={Boolean(fieldErrors.target)}
                  />
                </Field>
                <Field
                  label="दैनिक कैलोरी (kcal)"
                  hint="खाली छोड़ने पर 1600 रहेगा; डॉक्टर के अनुसार बदलें"
                  error={fieldErrors.calories}
                  className="col-span-2 sm:col-span-1"
                >
                  <NumberInput
                    value={calorieTarget}
                    onChange={(e) => setCalorieTarget(e.target.value)}
                    placeholder="kcal"
                    aria-invalid={Boolean(fieldErrors.calories)}
                  />
                </Field>
              </div>
            </Card>

            <Card className="space-y-2.5 p-4">
              <h2 className="flex items-center gap-1.5 text-sm font-semibold text-ink">
                <Activity className="h-4 w-4 text-brand" aria-hidden />
                स्वास्थ्य स्थितियां (Medical conditions)
              </h2>
              <p className="text-xs text-ink-muted">लागू होने वाली स्थितियां चुनें (यदि कोई हो):</p>
              <div className="grid grid-cols-1 gap-2 pt-1 sm:grid-cols-2">
                {CONDITION_PRESETS.map((condition) => {
                  const selected = selectedConditions.includes(condition.name);
                  return (
                    <button
                      key={condition.name}
                      type="button"
                      role="checkbox"
                      aria-checked={selected}
                      onClick={() => toggleCondition(condition.name)}
                      className={`flex min-h-control cursor-pointer items-center gap-2 rounded-card border p-2.5 text-left text-sm font-medium transition-colors ${
                        selected
                          ? "border-brand bg-brand-soft font-semibold text-brand-ink"
                          : "border-line bg-surface text-ink-muted hover:bg-surface-sunken"
                      }`}
                    >
                      <span
                        className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border ${
                          selected ? "border-brand bg-brand text-ink-inverse" : "border-line-strong bg-surface"
                        }`}
                      >
                        {selected ? <CheckCircle2 className="h-3.5 w-3.5" aria-hidden /> : null}
                      </span>
                      <span>
                        {condition.name} <span lang="hi">({condition.hi})</span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </Card>

            <Button type="submit" variant="primary" size="lg" block disabled={loading}>
              <Sparkles className="h-4 w-4" aria-hidden />
              {loading ? "प्रोफाइल बन रही है..." : "सेटअप पूरा करें"}
              {!loading ? <ArrowRight className="h-4 w-4" aria-hidden /> : null}
            </Button>
          </form>
        )}

        {!createdWithGaps ? (
          <div className="mt-6 space-y-1 border-t border-line pt-4">
            <p className="text-center text-xs text-ink-subtle">परिवार के किसी सदस्य ने पहले से मरीज़ बनाया है?</p>
            <Button variant="secondary" block onClick={() => setIsJoinOpen(true)}>
              <KeyRound className="h-4 w-4" aria-hidden />
              मेरे पास इनविटेशन कोड है (I have an invite code)
            </Button>
            {hasPatients ? (
              <Button variant="ghost" block onClick={() => router.replace("/")}>
                रद्द करें, वापस जाएं (Cancel)
              </Button>
            ) : (
              <Button variant="ghost" block onClick={() => void signOut()}>
                <LogOut className="h-4 w-4" aria-hidden />
                लॉग आउट (Sign out)
              </Button>
            )}
          </div>
        ) : null}
      </div>

      <JoinPatientDialog isOpen={isJoinOpen} onClose={() => setIsJoinOpen(false)} onSuccess={handleJoined} />
    </div>
  );
}
