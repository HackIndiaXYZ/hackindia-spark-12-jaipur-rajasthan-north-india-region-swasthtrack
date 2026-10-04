"use client";

import { useState, type FormEvent } from "react";
import { Scale } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { Field, NumberInput, TextInput } from "@/components/ui/form-field";
import { Modal } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import { MeasuredAtFields, nowIST, resolveMeasuredAt } from "@/components/forms/measured-at-fields";
import { useAuth } from "@/context/auth-context";
import { logWeight } from "@/services/patient-service";

type AddWeightDialogProps = {
  isOpen: boolean;
  onClose: () => void;
  patientId: string;
  /** The last recorded weight. Shown as a reference only, never pre-filled. */
  currentWeight?: number | null;
  onSuccess?: () => void;
};

const FORM_ID = "weight-form";
const MIN_KG = 20;
const MAX_KG = 300;
/** A jump this large since the last weigh-in is more often a typo than a real change. */
const BIG_CHANGE_KG = 5;

function WeightDialogBody({ isOpen, onClose, patientId, currentWeight, onSuccess }: AddWeightDialogProps) {
  const { canWrite } = useAuth();
  const toast = useToast();
  const confirm = useConfirm();

  const [weight, setWeight] = useState("");
  const [notes, setNotes] = useState("");
  const [when, setWhen] = useState(nowIST);
  const [errors, setErrors] = useState<Partial<Record<"weight" | "measuredAt", string>>>({});
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (saving || !canWrite) return;
    setFormError("");

    const next: typeof errors = {};
    const kg = /^\d+(\.\d+)?$/.test(weight.trim()) ? parseFloat(weight) : NaN;
    if (Number.isNaN(kg)) next.weight = "वजन kg में लिखें (Enter the weight in kg)";
    else if (kg < MIN_KG || kg > MAX_KG) next.weight = `वजन ${MIN_KG} से ${MAX_KG} kg के बीच होना चाहिए`;
    const at = resolveMeasuredAt(when.date, when.time);
    if (at.instant === null) next.measuredAt = at.error;
    setErrors(next);
    if (Object.keys(next).length > 0 || at.instant === null) return;

    if (currentWeight && Math.abs(kg - currentWeight) >= BIG_CHANGE_KG) {
      const ok = await confirm({
        title: "पिछले वजन से काफ़ी फ़र्क़ है — क्या यह सही है?",
        message: `पिछला दर्ज वजन ${currentWeight} kg था, अब ${kg} kg लिख रहे हैं। एक बार फिर देख लें।`,
        confirmLabel: "हाँ, सही है",
        cancelLabel: "दोबारा जाँचता हूँ",
      });
      if (!ok) return;
    }

    setSaving(true);
    try {
      await logWeight({
        patient_id: patientId,
        weight_kg: kg,
        measured_at: at.instant.toISOString(),
        notes: notes.trim() || null,
      });
      toast.success(`वजन ${kg} kg दर्ज हो गया`, "Weight saved");
      onSuccess?.();
      onClose();
    } catch (err) {
      setFormError(
        err instanceof Error && err.message ? err.message : "वजन सेव नहीं हो पाया। इंटरनेट जाँचकर दोबारा कोशिश करें।",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Record Weight"
      hindiTitle="वजन दर्ज करें"
      description="मशीन पर जो वजन दिखे, वही लिखें।"
      footer={
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            <span lang="hi">रद्द करें</span>
          </Button>
          <Button variant="primary" type="submit" form={FORM_ID} loading={saving} disabled={!canWrite}>
            <Scale aria-hidden className="h-4 w-4" />
            <span lang="hi">वजन सेव करें</span>
          </Button>
        </div>
      }
    >
      <form id={FORM_ID} onSubmit={handleSubmit} noValidate className="space-y-5">
        {!canWrite ? (
          <p role="status" lang="hi" className="rounded-card border border-info-line bg-info-soft p-3 text-sm text-info">
            आपके पास केवल देखने का एक्सेस है, इसलिए वजन दर्ज नहीं हो सकता।
          </p>
        ) : null}
        <div aria-live="polite">
          {formError ? (
            <p className="rounded-card border border-critical-line bg-critical-soft p-3 text-sm font-medium text-critical">
              {formError}
            </p>
          ) : null}
        </div>

        <Field
          label="वजन (Weight, kg)"
          required
          error={errors.weight}
          hint={currentWeight ? `पिछला दर्ज वजन: ${currentWeight} kg` : "अभी तक कोई वजन दर्ज नहीं है"}
        >
          <NumberInput
            allowDecimal
            placeholder="जैसे 78.5"
            value={weight}
            maxLength={6}
            onChange={(e) => setWeight(e.target.value)}
            className="text-center text-3xl font-semibold"
          />
        </Field>

        <MeasuredAtFields
          date={when.date}
          time={when.time}
          onDateChange={(date) => setWhen((w) => ({ ...w, date }))}
          onTimeChange={(time) => setWhen((w) => ({ ...w, time }))}
          error={errors.measuredAt}
        />

        <Field label="टिप्पणी (Notes) — ऐच्छिक">
          <TextInput
            placeholder="जैसे सुबह खाली पेट, बिना जूते"
            value={notes}
            maxLength={200}
            onChange={(e) => setNotes(e.target.value)}
          />
        </Field>
      </form>
    </Modal>
  );
}

export function AddWeightDialog(props: AddWeightDialogProps) {
  return props.isOpen ? <WeightDialogBody {...props} /> : null;
}
