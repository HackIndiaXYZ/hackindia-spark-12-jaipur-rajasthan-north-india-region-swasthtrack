"use client";

import { useState, type FormEvent } from "react";
import { Calculator, Footprints, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, NumberInput, TextInput } from "@/components/ui/form-field";
import { Modal } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import { useAuth } from "@/context/auth-context";
import { todayIST } from "@/lib/health-rules";
import { cn } from "@/lib/utils";
import { logActivity } from "@/services/patient-service";
import { buildActivityRecord, estimateActiveCaloriesBurned } from "@/services/activity-calculation-service";

type AddActivityDialogProps = {
  isOpen: boolean;
  onClose: () => void;
  patientId: string;
  /** Today's already-recorded totals (to correct them). Zero or missing means the form starts empty. */
  initialSteps?: number;
  initialDistanceKm?: number;
  /** The patient's real weight, so a calorie estimate does not fall back to a default one. */
  bodyWeightKg?: number | null;
  onSuccess?: () => void;
};

const FORM_ID = "activity-form";

// Walk lengths only fill the minutes box: how many steps that was is for the person to say.
const WALK_MINUTES = ["15", "30", "45", "60"];

const MAX_STEPS = 100_000;
const MAX_KM = 100;

type FieldErrors = Partial<Record<"steps" | "minutes" | "calories" | "distance" | "date", string>>;

const positive = (n: number | undefined): string => (n && n > 0 ? String(n) : "");

function ActivityDialogBody({
  isOpen,
  onClose,
  patientId,
  initialSteps,
  initialDistanceKm,
  bodyWeightKg,
  onSuccess,
}: AddActivityDialogProps) {
  const { canWrite } = useAuth();
  const toast = useToast();

  const [date, setDate] = useState(todayIST);
  const [steps, setSteps] = useState(positive(initialSteps));
  const [distanceKm, setDistanceKm] = useState(positive(initialDistanceKm));
  const [walkingMinutes, setWalkingMinutes] = useState("");
  const [caloriesBurned, setCaloriesBurned] = useState("");
  const [estimateNote, setEstimateNote] = useState<string | null>(null);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);

  const editingToday = positive(initialSteps) !== "" && date === todayIST();
  const weight = bodyWeightKg && bodyWeightKg > 20 ? bodyWeightKg : undefined;

  function handleDateChange(value: string) {
    setDate(value);
    // The pre-filled totals belong to today; do not carry them onto another day.
    if (value !== todayIST() && steps === positive(initialSteps)) {
      setSteps("");
      setDistanceKm("");
    }
  }

  function handleEstimate() {
    const stepsNum = parseInt(steps, 10);
    if (!Number.isFinite(stepsNum) || stepsNum <= 0) {
      setErrors({ steps: "कैलोरी का अनुमान लगाने के लिए पहले कदम लिखें" });
      return;
    }
    const minutes = walkingMinutes ? parseInt(walkingMinutes, 10) : null;
    const est = estimateActiveCaloriesBurned({ steps: stepsNum, durationMinutes: minutes, bodyWeightKg: weight });
    setCaloriesBurned(String(est.estimatedCalories));
    setEstimateNote(est.explanation);
    setErrors({});
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (saving || !canWrite) return;
    setFormError("");

    const next: FieldErrors = {};
    const stepsNum = /^\d+$/.test(steps.trim()) ? parseInt(steps, 10) : NaN;
    if (Number.isNaN(stepsNum) || stepsNum <= 0) next.steps = "कदम की संख्या लिखें (Enter the steps)";
    else if (stepsNum > MAX_STEPS) next.steps = `कदम ${MAX_STEPS.toLocaleString("en-IN")} से ज़्यादा नहीं हो सकते`;

    const distNum = distanceKm.trim() === "" ? null : parseFloat(distanceKm);
    if (distNum !== null && (!Number.isFinite(distNum) || distNum < 0 || distNum > MAX_KM)) {
      next.distance = `दूरी 0 से ${MAX_KM} km के बीच लिखें`;
    }

    const minNum = walkingMinutes.trim() === "" ? null : parseInt(walkingMinutes, 10);
    if (minNum !== null && (!Number.isFinite(minNum) || minNum < 0 || minNum > 1440)) {
      next.minutes = "समय 0 से 1440 मिनट के बीच लिखें";
    }

    const calNum = caloriesBurned.trim() === "" ? null : parseFloat(caloriesBurned);
    if (calNum !== null && (!Number.isFinite(calNum) || calNum < 0 || calNum > 5000)) {
      next.calories = "कैलोरी 0 से 5000 के बीच लिखें";
    }

    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) next.date = "तारीख़ चुनें (Choose a date)";
    else if (date > todayIST()) next.date = "आने वाली तारीख़ दर्ज नहीं हो सकती (Date is in the future)";

    setErrors(next);
    if (Object.keys(next).length > 0) return;

    // What was typed is stored as typed; calories left blank are estimated and flagged as such.
    const record = buildActivityRecord({
      steps: stepsNum,
      durationMinutes: minNum,
      distanceKm: distNum,
      caloriesBurned: calNum,
      bodyWeightKg: weight,
    });

    setSaving(true);
    try {
      await logActivity({
        patient_id: patientId,
        date,
        steps: record.steps,
        distance_km: record.distanceKm ?? 0,
        walking_minutes: record.durationMinutes ?? 0,
        estimated_calories_burned: record.activeCaloriesBurned ?? 0,
      });
      toast.success(`${stepsNum.toLocaleString("en-IN")} कदम दर्ज हो गए`, "Activity saved");
      onSuccess?.();
      onClose();
    } catch (err) {
      setFormError(
        err instanceof Error && err.message ? err.message : "कदम सेव नहीं हो पाए। इंटरनेट जाँचकर दोबारा कोशिश करें।",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Record Physical Activity"
      hindiTitle="कदम / टहलना दर्ज करें"
      description="जितने कदम चले, वही लिखें। एक दिन का एक ही रिकॉर्ड बनता है।"
      footer={
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            <span lang="hi">रद्द करें</span>
          </Button>
          <Button variant="primary" type="submit" form={FORM_ID} loading={saving} disabled={!canWrite}>
            <Footprints aria-hidden className="h-4 w-4" />
            <span lang="hi">कदम सेव करें</span>
          </Button>
        </div>
      }
    >
      <form id={FORM_ID} onSubmit={handleSubmit} noValidate className="space-y-5">
        {!canWrite ? (
          <p role="status" lang="hi" className="rounded-card border border-info-line bg-info-soft p-3 text-sm text-info">
            आपके पास केवल देखने का एक्सेस है, इसलिए कदम दर्ज नहीं हो सकते।
          </p>
        ) : null}
        <div aria-live="polite">
          {formError ? (
            <p className="rounded-card border border-critical-line bg-critical-soft p-3 text-sm font-medium text-critical">
              {formError}
            </p>
          ) : null}
        </div>

        <Field label="तारीख़ (Date)" required error={errors.date}>
          <TextInput type="date" value={date} max={todayIST()} onChange={(e) => handleDateChange(e.target.value)} />
        </Field>

        <Field
          label="कुल कदम (Steps)"
          required
          error={errors.steps}
          hint={editingToday ? "आज का दर्ज कुल दिख रहा है — नया कुल लिखकर बदलें" : "उस दिन के कुल कदम"}
        >
          <NumberInput
            placeholder="जैसे 4500"
            value={steps}
            maxLength={6}
            onChange={(e) => setSteps(e.target.value)}
            className="text-center text-3xl font-semibold"
          />
        </Field>

        <div className="space-y-2">
          <p id="walk-minutes-label" className="text-sm font-medium text-ink">
            टहलने का समय (मिनट) — ऐच्छिक
          </p>
          <div role="group" aria-labelledby="walk-minutes-label" className="flex flex-wrap gap-2">
            {WALK_MINUTES.map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setWalkingMinutes(m)}
                aria-pressed={walkingMinutes === m}
                className={cn(
                  "pressable min-h-control min-w-20 cursor-pointer rounded-field border px-3 text-sm font-semibold",
                  walkingMinutes === m
                    ? "border-activity bg-activity-soft text-activity"
                    : "border-line bg-surface text-ink-muted hover:border-activity-line",
                )}
              >
                <span className="tabular">{m}</span> <span lang="hi">मिनट</span>
              </button>
            ))}
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="सटीक मिनट (Minutes) — ऐच्छिक" error={errors.minutes}>
            <NumberInput
              placeholder="जैसे 40"
              value={walkingMinutes}
              maxLength={4}
              onChange={(e) => setWalkingMinutes(e.target.value)}
            />
          </Field>
          <Field label="दूरी (km) — ऐच्छिक" error={errors.distance}>
            <NumberInput
              allowDecimal
              placeholder="जैसे 3.5"
              value={distanceKm}
              maxLength={6}
              onChange={(e) => setDistanceKm(e.target.value)}
            />
          </Field>
        </div>

        <div className="space-y-2">
          <Field
            label="सक्रिय कैलोरी (kcal) — ऐच्छिक"
            error={errors.calories}
            hint="खाली छोड़ने पर अनुमान सेव होगा (अनुमानित, मापा हुआ नहीं)"
          >
            <NumberInput
              allowDecimal
              placeholder="जैसे 150"
              value={caloriesBurned}
              maxLength={6}
              onChange={(e) => {
                setCaloriesBurned(e.target.value);
                setEstimateNote(null);
              }}
            />
          </Field>
          <Button size="sm" variant="secondary" onClick={handleEstimate}>
            <Calculator aria-hidden className="h-4 w-4" />
            <span lang="hi">कैलोरी का अनुमान लगाएँ</span>
          </Button>
          {estimateNote ? (
            <p className="flex items-start gap-2 rounded-card border border-info-line bg-info-soft p-3 text-xs text-info">
              <Info aria-hidden className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{estimateNote}</span>
            </p>
          ) : null}
        </div>
      </form>
    </Modal>
  );
}

export function AddActivityDialog(props: AddActivityDialogProps) {
  return props.isOpen ? <ActivityDialogBody {...props} /> : null;
}
