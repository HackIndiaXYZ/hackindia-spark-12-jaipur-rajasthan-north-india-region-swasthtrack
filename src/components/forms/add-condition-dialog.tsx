"use client";

import { useState, type FormEvent } from "react";
import { Activity } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, NumberInput, TextInput } from "@/components/ui/form-field";
import { Modal } from "@/components/ui/modal";
import { useAuth } from "@/context/auth-context";
import { todayIST } from "@/lib/health-rules";
import { addMedicalCondition } from "@/services/patient-service";

type AddConditionDialogProps = {
  isOpen: boolean;
  onClose: () => void;
  patientId: string;
  /** Called after a successful save; the caller shows the confirmation. */
  onSuccess?: () => void;
};

const FORM_ID = "condition-form";

const QUICK_SUGGESTIONS = [
  "Hypertension",
  "Fatty Liver",
  "Type 2 Diabetes",
  "Previous Stroke",
  "High Cholesterol",
  "Thyroid",
];

function ConditionDialogBody({ isOpen, onClose, patientId, onSuccess }: AddConditionDialogProps) {
  const { canWrite } = useAuth();

  const [conditionName, setConditionName] = useState("");
  // Left blank: the year of diagnosis is the doctor's, not "this year".
  const [diagnosedYear, setDiagnosedYear] = useState("");
  const [notes, setNotes] = useState("");
  const [errors, setErrors] = useState<Partial<Record<"name" | "year", string>>>({});
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (saving || !canWrite) return;
    setFormError("");

    const next: typeof errors = {};
    if (!conditionName.trim()) next.name = "बीमारी / स्थिति का नाम लिखें (Enter the condition)";
    const currentYear = Number(todayIST().slice(0, 4));
    const yearNum = diagnosedYear.trim() === "" ? null : parseInt(diagnosedYear, 10);
    if (yearNum !== null && (!Number.isFinite(yearNum) || yearNum < 1920 || yearNum > currentYear)) {
      next.year = `वर्ष 1920 से ${currentYear} के बीच लिखें, या खाली छोड़ें`;
    }
    setErrors(next);
    if (Object.keys(next).length > 0) {
      // Move focus to the first field that needs fixing (after the error state has rendered).
      requestAnimationFrame(() => document.querySelector<HTMLElement>(`#${FORM_ID} [aria-invalid="true"]`)?.focus());
      return;
    }

    setSaving(true);
    try {
      await addMedicalCondition({
        patient_id: patientId,
        condition_name: conditionName.trim(),
        diagnosed_year: yearNum,
        notes: notes.trim() || null,
      });
      onSuccess?.();
      onClose();
    } catch {
      setFormError("स्थिति सेव नहीं हो पाई। इंटरनेट जाँचकर दोबारा कोशिश करें। (Could not save the condition.)");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Add Medical Condition"
      hindiTitle="स्वास्थ्य स्थिति जोड़ें"
      description="डॉक्टर ने जो बीमारी या स्थिति बताई हो, वही दर्ज करें।"
      footer={
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            <span lang="hi">रद्द करें</span>
          </Button>
          <Button variant="primary" type="submit" form={FORM_ID} loading={saving} disabled={!canWrite}>
            <Activity aria-hidden className="h-4 w-4" />
            <span lang="hi">जोड़ें</span>
          </Button>
        </div>
      }
    >
      <form id={FORM_ID} onSubmit={handleSubmit} noValidate className="space-y-4">
        {!canWrite ? (
          <p role="status" lang="hi" className="rounded-card border border-info-line bg-info-soft p-3 text-sm text-info">
            आपके पास केवल देखने का एक्सेस है, इसलिए स्थिति जोड़ी नहीं जा सकती।
          </p>
        ) : null}
        <div aria-live="polite">
          {formError ? (
            <p className="rounded-card border border-critical-line bg-critical-soft p-3 text-sm font-medium text-critical">
              {formError}
            </p>
          ) : null}
        </div>

        <Field label="स्थिति का नाम (Condition)" required error={errors.name}>
          <TextInput
            type="text"
            autoComplete="off"
            maxLength={100}
            placeholder="जैसे Hypertension"
            value={conditionName}
            onChange={(e) => setConditionName(e.target.value)}
          />
        </Field>

        <div role="group" aria-label="सुझाव (Suggestions)" className="flex flex-wrap gap-2">
          {QUICK_SUGGESTIONS.map((item) => (
            <button
              type="button"
              key={item}
              onClick={() => setConditionName(item)}
              className="pressable min-h-control cursor-pointer rounded-field border border-brand-line bg-brand-soft px-3 text-xs font-semibold text-brand-ink hover:bg-brand-softer"
            >
              + {item}
            </button>
          ))}
        </div>

        <Field label="निदान का वर्ष (Year diagnosed) — ऐच्छिक" error={errors.year}>
          <NumberInput placeholder="जैसे 2018" value={diagnosedYear} maxLength={4} onChange={(e) => setDiagnosedYear(e.target.value)} />
        </Field>

        <Field label="टिप्पणी (Notes) — ऐच्छिक" hint="डॉक्टर की कोई बात, जैसे इलाज या सलाह">
          <TextInput type="text" maxLength={300} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Field>
      </form>
    </Modal>
  );
}

export function AddConditionDialog(props: AddConditionDialogProps) {
  return props.isOpen ? <ConditionDialogBody {...props} /> : null;
}
