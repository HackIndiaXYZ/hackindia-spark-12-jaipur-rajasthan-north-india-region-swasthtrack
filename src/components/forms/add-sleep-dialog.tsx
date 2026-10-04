"use client";

import { useState, type FormEvent } from "react";
import { Moon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { Field, NumberInput, TextInput } from "@/components/ui/form-field";
import { Modal } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import { useAuth } from "@/context/auth-context";
import { todayIST } from "@/lib/health-rules";
import { cn } from "@/lib/utils";
import { logSleep } from "@/services/patient-service";

type AddSleepDialogProps = {
  isOpen: boolean;
  onClose: () => void;
  patientId: string;
  onSuccess?: () => void;
};

const FORM_ID = "sleep-form";

// Shortcuts that type a number for you; nothing is selected until it is tapped.
const SLEEP_PRESETS = ["5", "6", "6.5", "7", "7.5", "8", "9"];

const SLEEP_QUALITIES = [
  { label: "गहरी व अच्छी नींद", value: "गहरी व अच्छी नींद (Good Sleep)" },
  { label: "सामान्य नींद", value: "सामान्य नींद (Normal Sleep)" },
  { label: "कम नींद / बेचैनी", value: "कम नींद / बेचैनी (Restless / Low Sleep)" },
];

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Hours between a bedtime and the next wake time ("22:30" -> "06:00" = 7.5), crossing midnight when needed. */
function hoursBetween(bed: string, wake: string): number | null {
  if (!TIME_RE.test(bed) || !TIME_RE.test(wake)) return null;
  const [bh, bm] = bed.split(":").map(Number);
  const [wh, wm] = wake.split(":").map(Number);
  let minutes = wh * 60 + wm - (bh * 60 + bm);
  if (minutes <= 0) minutes += 24 * 60;
  return Math.round((minutes / 60) * 10) / 10;
}

function SleepDialogBody({ isOpen, onClose, patientId, onSuccess }: AddSleepDialogProps) {
  const { canWrite } = useAuth();
  const toast = useToast();
  const confirm = useConfirm();

  const [date, setDate] = useState(todayIST);
  const [sleepHours, setSleepHours] = useState("");
  const [quality, setQuality] = useState<string | null>(null);
  const [bedtime, setBedtime] = useState("");
  const [wakeTime, setWakeTime] = useState("");
  const [notes, setNotes] = useState("");
  const [errors, setErrors] = useState<Partial<Record<"hours" | "date", string>>>({});
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);

  const fromTimes = hoursBetween(bedtime, wakeTime);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (saving || !canWrite) return;
    setFormError("");

    const next: typeof errors = {};
    const hours = /^\d+(\.\d+)?$/.test(sleepHours.trim()) ? parseFloat(sleepHours) : NaN;
    if (Number.isNaN(hours)) next.hours = "नींद के घंटे लिखें (Enter hours slept)";
    else if (hours <= 0 || hours > 24) next.hours = "घंटे 0 से 24 के बीच होने चाहिए";
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) next.date = "तारीख़ चुनें (Choose a date)";
    else if (date > todayIST()) next.date = "आने वाली तारीख़ दर्ज नहीं हो सकती (Date is in the future)";
    setErrors(next);
    if (Object.keys(next).length > 0) return;

    if (hours < 2 || hours > 14) {
      const ok = await confirm({
        title: "नींद के घंटे असामान्य लगते हैं — क्या यह सही है?",
        message: `${hours} घंटे आम नींद से काफ़ी अलग है। एक बार फिर देख लें।`,
        confirmLabel: "हाँ, सही है",
        cancelLabel: "दोबारा जाँचता हूँ",
      });
      if (!ok) return;
    }

    setSaving(true);
    try {
      const combinedNotes = [quality, notes.trim()].filter(Boolean).join(" · ");
      await logSleep({
        patient_id: patientId,
        date,
        sleep_hours: hours,
        bedtime: bedtime || null,
        wake_time: wakeTime || null,
        notes: combinedNotes || null,
      });
      toast.success(`नींद ${hours} घंटे दर्ज हो गई`, "Sleep saved");
      onSuccess?.();
      onClose();
    } catch (err) {
      setFormError(
        err instanceof Error && err.message ? err.message : "नींद सेव नहीं हो पाई। इंटरनेट जाँचकर दोबारा कोशिश करें।",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Record Sleep"
      hindiTitle="नींद दर्ज करें"
      description="कितने घंटे सोए, वही लिखें। नीचे के बटन सिर्फ़ अंक भरने में मदद करते हैं।"
      footer={
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            <span lang="hi">रद्द करें</span>
          </Button>
          <Button variant="primary" type="submit" form={FORM_ID} loading={saving} disabled={!canWrite}>
            <Moon aria-hidden className="h-4 w-4" />
            <span lang="hi">नींद सेव करें</span>
          </Button>
        </div>
      }
    >
      <form id={FORM_ID} onSubmit={handleSubmit} noValidate className="space-y-5">
        {!canWrite ? (
          <p role="status" lang="hi" className="rounded-card border border-info-line bg-info-soft p-3 text-sm text-info">
            आपके पास केवल देखने का एक्सेस है, इसलिए नींद दर्ज नहीं हो सकती।
          </p>
        ) : null}
        <div aria-live="polite">
          {formError ? (
            <p className="rounded-card border border-critical-line bg-critical-soft p-3 text-sm font-medium text-critical">
              {formError}
            </p>
          ) : null}
        </div>

        <Field label="कुल नींद के घंटे (Hours slept)" required error={errors.hours}>
          <NumberInput
            allowDecimal
            placeholder="जैसे 7.5"
            value={sleepHours}
            maxLength={5}
            onChange={(e) => setSleepHours(e.target.value)}
            className="text-center text-3xl font-semibold"
          />
        </Field>

        <div role="group" aria-label="घंटे जल्दी भरें (Quick hours)" className="flex flex-wrap gap-2">
          {SLEEP_PRESETS.map((hours) => (
            <button
              key={hours}
              type="button"
              onClick={() => setSleepHours(hours)}
              aria-pressed={sleepHours === hours}
              className={cn(
                "pressable min-h-control min-w-16 cursor-pointer rounded-field border px-3 text-sm font-semibold",
                sleepHours === hours
                  ? "border-sleep bg-sleep-soft text-sleep"
                  : "border-line bg-surface text-ink-muted hover:border-sleep-line",
              )}
            >
              <span className="tabular">{hours}</span> <span lang="hi">घंटे</span>
            </button>
          ))}
        </div>

        <Field label="रात की तारीख़ (Date)" required error={errors.date}>
          <TextInput type="date" value={date} max={todayIST()} onChange={(e) => setDate(e.target.value)} />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="सोने का समय (Bedtime) — ऐच्छिक">
            <TextInput type="time" value={bedtime} onChange={(e) => setBedtime(e.target.value)} />
          </Field>
          <Field label="जागने का समय (Wake time) — ऐच्छिक">
            <TextInput type="time" value={wakeTime} onChange={(e) => setWakeTime(e.target.value)} />
          </Field>
        </div>

        {fromTimes !== null && sleepHours.trim() === "" ? (
          <p lang="hi" className="flex flex-wrap items-center gap-2 text-sm text-ink-muted">
            सोने–जागने के समय से लगभग {fromTimes} घंटे बनते हैं।
            <Button size="sm" variant="secondary" onClick={() => setSleepHours(String(fromTimes))}>
              <span lang="hi">यह भरें</span>
            </Button>
          </p>
        ) : null}

        <div role="group" aria-labelledby="sleep-quality-label" className="space-y-2">
          <p id="sleep-quality-label" className="text-sm font-medium text-ink">
            नींद कैसी रही? (Quality) — ऐच्छिक
          </p>
          <div className="flex flex-wrap gap-2">
            {SLEEP_QUALITIES.map((q) => (
              <button
                key={q.value}
                type="button"
                onClick={() => setQuality((cur) => (cur === q.value ? null : q.value))}
                aria-pressed={quality === q.value}
                className={cn(
                  "pressable min-h-control cursor-pointer rounded-field border px-3 text-sm font-semibold",
                  quality === q.value
                    ? "border-brand bg-brand-soft text-brand-ink"
                    : "border-line bg-surface text-ink-muted hover:border-brand-line",
                )}
              >
                <span lang="hi">{q.label}</span>
              </button>
            ))}
          </div>
        </div>

        <Field label="टिप्पणी (Notes) — ऐच्छिक">
          <TextInput
            placeholder="जैसे रात को एक बार नींद खुली"
            value={notes}
            maxLength={200}
            onChange={(e) => setNotes(e.target.value)}
          />
        </Field>
      </form>
    </Modal>
  );
}

export function AddSleepDialog(props: AddSleepDialogProps) {
  return props.isOpen ? <SleepDialogBody {...props} /> : null;
}
