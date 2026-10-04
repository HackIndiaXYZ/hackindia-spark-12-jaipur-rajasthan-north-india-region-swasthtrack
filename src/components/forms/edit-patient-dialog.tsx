"use client";

import { useRef, useState, type FormEvent } from "react";
import { AlertCircle, UserCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, NumberInput, Select, TextInput } from "@/components/ui/form-field";
import { Modal } from "@/components/ui/modal";
import { updatePatientProfile, type PatientProfile } from "@/services/patient-service";

type EditPatientDialogProps = {
  isOpen: boolean;
  onClose: () => void;
  patient: PatientProfile;
  onSuccess?: () => void;
};

type FieldErrors = Partial<Record<"name" | "age" | "height" | "weight" | "target" | "calories", string>>;

// Empty means "not recorded", never a made-up number.
const show = (value: number | null | undefined) => (value == null ? "" : String(value));

/** Blank -> null (clears the value). Filled -> must be a number inside [min, max]. */
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

function EditPatientForm({
  patient,
  onClose,
  onSuccess,
}: {
  patient: PatientProfile;
  onClose: () => void;
  onSuccess?: () => void;
}) {
  const [name, setName] = useState(patient.name);
  const [age, setAge] = useState(show(patient.age));
  const [gender, setGender] = useState(patient.gender ?? "");
  const [heightCm, setHeightCm] = useState(show(patient.height_cm));
  const [currentWeightKg, setCurrentWeightKg] = useState(show(patient.current_weight_kg));
  const [targetWeightKg, setTargetWeightKg] = useState(show(patient.target_weight_kg));
  const [calorieTarget, setCalorieTarget] = useState(show(patient.daily_calorie_target));
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [loading, setLoading] = useState(false);
  const busyRef = useRef(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (busyRef.current) return;
    setError("");

    const errors: FieldErrors = {};
    if (!name.trim()) errors.name = "मरीज़ का नाम लिखें। (Name is required.)";
    const ageR = parseOptional(age, 1, 120, "आयु 1 से 120 के बीच होनी चाहिए। (Age 1 to 120.)", true);
    const heightR = parseOptional(heightCm, 50, 260, "ऊंचाई 50 से 260 सेमी के बीच होनी चाहिए। (Height 50 to 260 cm.)");
    const weightR = parseOptional(currentWeightKg, 20, 350, "वजन 20 से 350 kg के बीच होना चाहिए। (Weight 20 to 350 kg.)");
    const targetR = parseOptional(targetWeightKg, 20, 350, "लक्ष्य वजन 20 से 350 kg के बीच होना चाहिए। (Target 20 to 350 kg.)");
    const calR = parseOptional(calorieTarget, 500, 6000, "कैलोरी लक्ष्य 500 से 6000 kcal के बीच होना चाहिए। (500 to 6000 kcal.)", true);
    if (calR.value == null && !calR.error) errors.calories = "दैनिक कैलोरी लक्ष्य ज़रूरी है। (Calorie target is required.)";
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
      await updatePatientProfile(
        {
          name: name.trim(),
          age: ageR.value,
          gender: gender || null,
          height_cm: heightR.value,
          current_weight_kg: weightR.value,
          target_weight_kg: targetR.value,
          // Required by the database: validated above, so never null here.
          daily_calorie_target: calR.value ?? patient.daily_calorie_target,
        },
        patient.id,
      );

      onClose();
      onSuccess?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "प्रोफाइल सेव नहीं हो सकी। (Could not save the profile.)");
    } finally {
      busyRef.current = false;
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4" noValidate>
      <div aria-live="polite" className="empty:hidden">
        {error ? (
          <div
            role="alert"
            className="flex items-start gap-2 rounded-card border border-critical-line bg-critical-soft p-3 text-sm font-medium text-critical"
          >
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            <span>{error}</span>
          </div>
        ) : null}
      </div>

      <Field label="Full name (पूरा नाम)" required error={fieldErrors.name}>
        <TextInput
          autoFocus
          type="text"
          placeholder="पूरा नाम"
          value={name}
          onChange={(e) => setName(e.target.value)}
          aria-invalid={Boolean(fieldErrors.name)}
          required
        />
      </Field>

      <div className="grid grid-cols-2 gap-4">
        <Field label="Age (आयु / वर्ष)" hint="वैकल्पिक" error={fieldErrors.age}>
          <NumberInput
            value={age}
            onChange={(e) => setAge(e.target.value)}
            placeholder="वर्ष"
            aria-invalid={Boolean(fieldErrors.age)}
          />
        </Field>

        <Field label="Gender (लिंग)" hint="वैकल्पिक">
          <Select value={gender} onChange={(e) => setGender(e.target.value)}>
            <option value="">चुनें</option>
            <option value="Male">Male (पुरुष)</option>
            <option value="Female">Female (महिला)</option>
            <option value="Other">Other (अन्य)</option>
          </Select>
        </Field>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Field label="Height (ऊंचाई cm)" hint="वैकल्पिक" error={fieldErrors.height}>
          <NumberInput
            allowDecimal
            value={heightCm}
            onChange={(e) => setHeightCm(e.target.value)}
            placeholder="सेमी"
            aria-invalid={Boolean(fieldErrors.height)}
          />
        </Field>

        <Field label="Current (वजन kg)" hint="वैकल्पिक" error={fieldErrors.weight}>
          <NumberInput
            allowDecimal
            value={currentWeightKg}
            onChange={(e) => setCurrentWeightKg(e.target.value)}
            placeholder="kg"
            aria-invalid={Boolean(fieldErrors.weight)}
          />
        </Field>

        <Field label="Target (लक्ष्य kg)" hint="वैकल्पिक" error={fieldErrors.target}>
          <NumberInput
            allowDecimal
            value={targetWeightKg}
            onChange={(e) => setTargetWeightKg(e.target.value)}
            placeholder="kg"
            aria-invalid={Boolean(fieldErrors.target)}
          />
        </Field>
      </div>

      <Field
        label="Daily calorie target (दैनिक कैलोरी लक्ष्य kcal)"
        hint="डॉक्टर या डायटीशियन की सलाह के अनुसार रखें"
        required
        error={fieldErrors.calories}
      >
        <NumberInput
          value={calorieTarget}
          onChange={(e) => setCalorieTarget(e.target.value)}
          placeholder="kcal"
          className="text-lg font-semibold"
          aria-invalid={Boolean(fieldErrors.calories)}
        />
      </Field>

      <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
        <Button variant="ghost" onClick={onClose} disabled={loading}>
          Cancel (रद्द करें)
        </Button>
        <Button variant="primary" type="submit" disabled={loading}>
          <UserCheck className="h-4 w-4" aria-hidden />
          {loading ? "Saving..." : "Save profile (सुरक्षित करें)"}
        </Button>
      </div>
    </form>
  );
}

export function EditPatientDialog({ isOpen, onClose, patient, onSuccess }: EditPatientDialogProps) {
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Edit personal information"
      hindiTitle="व्यक्तिगत जानकारी संपादित करें"
      description="Only the name and calorie target are required. Leave the rest empty if unknown."
      maxWidth="lg"
    >
      {isOpen ? (
        <EditPatientForm
          key={patient.id + (patient.updated_at || "")}
          patient={patient}
          onClose={onClose}
          onSuccess={onSuccess}
        />
      ) : null}
    </Modal>
  );
}
