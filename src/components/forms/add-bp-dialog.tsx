"use client";

import { useEffect, useState, type FormEvent } from "react";
import { AlertTriangle, HeartPulse } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { ChoiceGroup, Field, NumberInput, TextInput } from "@/components/ui/form-field";
import { Modal } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import { BPStatusChip } from "@/components/dashboard/bp-status";
import { MeasuredAtFields, hourOfTime, nowIST, resolveMeasuredAt } from "@/components/forms/measured-at-fields";
import { useAuth } from "@/context/auth-context";
import { DEFAULT_BP_THRESHOLDS, classifyBP, isPlausibleBP, type BPThresholds } from "@/lib/health-rules";
import { getBPThresholds } from "@/services/settings-service";
import { logBloodPressure } from "@/services/patient-service";

type AddBPDialogProps = {
  isOpen: boolean;
  onClose: () => void;
  patientId: string;
  onSuccess?: () => void;
};

type ReadingType = "Morning" | "Evening";

const FORM_ID = "bp-form";

/** The reading-type buttons are a suggestion from the clock; the person always has the last word. */
function suggestReadingType(time: string): ReadingType {
  const hour = hourOfTime(time);
  return hour !== null && hour >= 15 ? "Evening" : "Morning";
}

type FieldErrors = Partial<Record<"systolic" | "diastolic" | "pulse" | "measuredAt", string>>;

function toInt(value: string): number {
  return /^\d+$/.test(value.trim()) ? parseInt(value, 10) : NaN;
}

function BPDialogBody({ isOpen, onClose, patientId, onSuccess }: AddBPDialogProps) {
  const { canWrite } = useAuth();
  const toast = useToast();
  const confirm = useConfirm();

  // Nothing is pre-filled: a blood pressure is whatever the cuff showed.
  const [systolic, setSystolic] = useState("");
  const [diastolic, setDiastolic] = useState("");
  const [pulse, setPulse] = useState("");
  const [notes, setNotes] = useState("");
  const [when, setWhen] = useState(nowIST);
  const [pickedType, setPickedType] = useState<ReadingType | null>(null);
  const [thresholds, setThresholds] = useState<BPThresholds>(DEFAULT_BP_THRESHOLDS);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);
  const [safetyNote, setSafetyNote] = useState<{ category: "crisis" | "low"; text: string } | null>(null);

  useEffect(() => {
    let active = true;
    getBPThresholds(patientId)
      .then((t) => {
        if (active) setThresholds(t);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [patientId]);

  const readingType = pickedType ?? suggestReadingType(when.time);

  const sysNum = toInt(systolic);
  const diaNum = toInt(diastolic);
  const preview = isPlausibleBP(sysNum, diaNum) ? classifyBP(sysNum, diaNum, thresholds) : null;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (saving || !canWrite) return;
    setFormError("");

    const next: FieldErrors = {};
    const pulseNum = pulse.trim() === "" ? null : toInt(pulse);

    if (Number.isNaN(sysNum)) next.systolic = "ऊपर वाला अंक लिखें (Enter the top number)";
    else if (sysNum < 50 || sysNum > 280) next.systolic = "ऊपर वाला अंक 50 से 280 के बीच होना चाहिए";
    if (Number.isNaN(diaNum)) next.diastolic = "नीचे वाला अंक लिखें (Enter the bottom number)";
    else if (diaNum < 30 || diaNum > 180) next.diastolic = "नीचे वाला अंक 30 से 180 के बीच होना चाहिए";
    if (!next.systolic && !next.diastolic && sysNum <= diaNum) {
      next.systolic = "ऊपर वाला अंक नीचे वाले से बड़ा होना चाहिए";
    }
    if (pulseNum !== null && (Number.isNaN(pulseNum) || pulseNum < 25 || pulseNum > 250)) {
      next.pulse = "नब्ज़ 25 से 250 के बीच लिखें, या खाली छोड़ें";
    }
    const at = resolveMeasuredAt(when.date, when.time);
    if (at.instant === null) next.measuredAt = at.error;

    setErrors(next);
    if (Object.keys(next).length > 0 || at.instant === null) return;
    if (!isPlausibleBP(sysNum, diaNum, pulseNum)) {
      setErrors({ systolic: "यह रीडिंग संभव नहीं लगती — अंक दोबारा जाँचें" });
      return;
    }

    const category = classifyBP(sysNum, diaNum, thresholds).category;

    // Plausible but striking: make sure it is a typo-free reading, not a slip of a finger.
    if (category === "crisis") {
      const ok = await confirm({
        title: "यह बहुत ज़्यादा है — क्या यह सही रीडिंग है?",
        message: `${sysNum}/${diaNum} बहुत ऊँचे दायरे में आता है। क्या मशीन पर यही रीडिंग थी? गलत हो तो वापस जाकर ठीक करें।`,
        confirmLabel: "हाँ, यही रीडिंग है",
        cancelLabel: "दोबारा जाँचता हूँ",
      });
      if (!ok) return;
    } else if (sysNum < 70 || diaNum < 40 || sysNum > 250 || diaNum > 150 || sysNum - diaNum < 15 || sysNum - diaNum > 120) {
      const ok = await confirm({
        title: "यह रीडिंग असामान्य लगती है — क्या यह सही है?",
        message: `${sysNum}/${diaNum} आम रीडिंग से काफ़ी अलग है। अंक एक बार फिर देख लें।`,
        confirmLabel: "हाँ, सही है",
        cancelLabel: "दोबारा जाँचता हूँ",
      });
      if (!ok) return;
    } else if (pulseNum !== null && (pulseNum < 35 || pulseNum > 180)) {
      const ok = await confirm({
        title: "नब्ज़ असामान्य लगती है — क्या यह सही है?",
        message: `नब्ज़ ${pulseNum} bpm काफ़ी अलग है। एक बार फिर देख लें।`,
        confirmLabel: "हाँ, सही है",
        cancelLabel: "दोबारा जाँचता हूँ",
      });
      if (!ok) return;
    }

    setSaving(true);
    try {
      await logBloodPressure({
        patient_id: patientId,
        systolic: sysNum,
        diastolic: diaNum,
        pulse: pulseNum,
        reading_type: readingType,
        measured_at: at.instant.toISOString(),
        notes: notes.trim() || null,
      });
      onSuccess?.();

      if (category === "crisis" || category === "low") {
        // Keep the sheet open so the safety note is read, not swiped past with a toast.
        setSafetyNote({
          category,
          text:
            category === "crisis"
              ? "यह रीडिंग बहुत ऊँचे दायरे में है। 5 मिनट आराम से बैठकर दोबारा नापें। अगर रीडिंग अब भी इतनी ही है, या सीने में दर्द, साँस फूलना, कमज़ोरी, बोलने में दिक्कत, तेज़ सिरदर्द या धुंधला दिखे — तुरंत इमरजेंसी (112) बुलाएँ और डॉक्टर से संपर्क करें।"
              : "यह रीडिंग कम है। चक्कर, कमज़ोरी या बेहोशी जैसा लगे तो लेट जाएँ और डॉक्टर से बात करें। अपनी दवा खुद से बंद या कम न करें।",
        });
      } else {
        toast.success(`BP ${sysNum}/${diaNum} दर्ज हो गया`, "Blood pressure saved");
        onClose();
      }
    } catch (err) {
      setFormError(
        err instanceof Error && err.message
          ? err.message
          : "रक्तचाप सेव नहीं हो पाया। इंटरनेट जाँचकर दोबारा कोशिश करें।",
      );
    } finally {
      setSaving(false);
    }
  }

  const crisisNote = safetyNote?.category === "crisis";

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={safetyNote ? "BP saved" : "Record Blood Pressure"}
      hindiTitle={safetyNote ? "रीडिंग दर्ज हो गई" : "रक्तचाप (BP) दर्ज करें"}
      description={safetyNote ? undefined : "BP मशीन पर जो अंक दिखे, वही लिखें।"}
      footer={
        safetyNote ? (
          <div className="flex justify-end">
            <Button variant="primary" onClick={onClose}>
              <span lang="hi">ठीक है</span>
            </Button>
          </div>
        ) : (
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button variant="secondary" onClick={onClose} disabled={saving}>
              <span lang="hi">रद्द करें</span>
            </Button>
            <Button variant="primary" type="submit" form={FORM_ID} loading={saving} disabled={!canWrite}>
              <HeartPulse aria-hidden className="h-4 w-4" />
              <span lang="hi">BP सेव करें</span>
            </Button>
          </div>
        )
      }
    >
      {safetyNote ? (
        <div
          role="status"
          className={`rounded-card border p-4 ${crisisNote ? "border-critical-line bg-critical-soft" : "border-attention-line bg-attention-soft"}`}
        >
          <p lang="hi" className={`flex items-center gap-2 text-sm font-semibold ${crisisNote ? "text-critical" : "text-attention"}`}>
            <AlertTriangle aria-hidden className="h-4 w-4 shrink-0" />
            {sysNum}/{diaNum} दर्ज हुआ
          </p>
          <p lang="hi" className="mt-2 text-sm text-ink">
            {safetyNote.text}
          </p>
          <p className="mt-2 text-xs text-ink-muted">
            This is a screening notice from the number entered, not a diagnosis. Please confirm with a doctor.
          </p>
        </div>
      ) : (
        <form id={FORM_ID} onSubmit={handleSubmit} noValidate className="space-y-5">
          {!canWrite ? (
            <p role="status" lang="hi" className="rounded-card border border-info-line bg-info-soft p-3 text-sm text-info">
              आपके पास केवल देखने का एक्सेस है, इसलिए रीडिंग दर्ज नहीं हो सकती।
            </p>
          ) : null}
          <div aria-live="polite">
            {formError ? (
              <p className="rounded-card border border-critical-line bg-critical-soft p-3 text-sm font-medium text-critical">
                {formError}
              </p>
            ) : null}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="ऊपर वाला (Systolic)" required error={errors.systolic} hint="mmHg">
              <NumberInput
                placeholder="ऊपर वाला अंक"
                value={systolic}
                maxLength={3}
                onChange={(e) => setSystolic(e.target.value)}
                className="text-center text-2xl font-semibold"
              />
            </Field>
            <Field label="नीचे वाला (Diastolic)" required error={errors.diastolic} hint="mmHg">
              <NumberInput
                placeholder="नीचे वाला अंक"
                value={diastolic}
                maxLength={3}
                onChange={(e) => setDiastolic(e.target.value)}
                className="text-center text-2xl font-semibold"
              />
            </Field>
          </div>

          <div aria-live="polite" className="min-h-6">
            {preview ? <BPStatusChip systolic={sysNum} diastolic={diaNum} thresholds={thresholds} /> : null}
          </div>

          <ChoiceGroup<ReadingType>
            label="नापने का समय (Reading time)"
            value={readingType}
            onChange={setPickedType}
            options={[
              { value: "Morning", label: "सुबह", hindiLabel: "Morning" },
              { value: "Evening", label: "शाम", hindiLabel: "Evening" },
            ]}
            hint={pickedType ? undefined : "समय के हिसाब से सुझाया गया है — चाहें तो बदल दें।"}
          />

          <MeasuredAtFields
            date={when.date}
            time={when.time}
            onDateChange={(date) => setWhen((w) => ({ ...w, date }))}
            onTimeChange={(time) => setWhen((w) => ({ ...w, time }))}
            error={errors.measuredAt}
          />

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="नब्ज़ (Pulse, bpm) — ऐच्छिक" error={errors.pulse}>
              <NumberInput placeholder="जैसे 72" value={pulse} maxLength={3} onChange={(e) => setPulse(e.target.value)} />
            </Field>
            <Field label="टिप्पणी (Notes) — ऐच्छिक">
              <TextInput
                placeholder="जैसे दवाई लेने के बाद"
                value={notes}
                maxLength={200}
                onChange={(e) => setNotes(e.target.value)}
              />
            </Field>
          </div>
        </form>
      )}
    </Modal>
  );
}

export function AddBPDialog(props: AddBPDialogProps) {
  // Mounted only while open, so every opening starts blank and "now" is the moment it was opened.
  return props.isOpen ? <BPDialogBody {...props} /> : null;
}
