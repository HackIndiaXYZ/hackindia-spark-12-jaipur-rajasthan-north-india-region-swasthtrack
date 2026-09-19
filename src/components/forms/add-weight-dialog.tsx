"use client";

import { useState, type FormEvent } from "react";
import { Scale } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, NumberInput, TextInput } from "@/components/ui/form-field";
import { Modal } from "@/components/ui/modal";
import { logWeight } from "@/services/patient-service";

type AddWeightDialogProps = {
  isOpen: boolean;
  onClose: () => void;
  patientId: string;
  currentWeight?: number | null;
  onSuccess?: () => void;
};

function WeightForm({
  patientId,
  currentWeight,
  onClose,
  onSuccess,
}: {
  patientId: string;
  currentWeight?: number | null;
  onClose: () => void;
  onSuccess?: () => void;
}) {
  const [weight, setWeight] = useState(currentWeight ? String(currentWeight) : "75.0");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  function adjustWeight(delta: number) {
    const val = parseFloat(weight) || (currentWeight || 75.0);
    const newVal = Math.round((val + delta) * 10) / 10;
    setWeight(String(Math.max(30, Math.min(250, newVal))));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");

    const weightNum = parseFloat(weight);
    if (isNaN(weightNum) || weightNum <= 20 || weightNum > 350) {
      setError("कृपया सही वजन दर्ज करें (20 से 350 kg के बीच)");
      return;
    }

    try {
      setLoading(true);
      await logWeight({
        patient_id: patientId,
        weight_kg: weightNum,
        measured_at: new Date().toISOString(),
        notes: notes.trim() || null,
      });

      onClose();
      onSuccess?.();
    } catch {
      setError("वजन सेव करने में समस्या आई। कृपया पुनः प्रयास करें।");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5" noValidate>
      {error ? (
        <div className="rounded-card border border-critical-line bg-critical-soft p-3.5 text-sm font-semibold text-critical">
          {error}
        </div>
      ) : null}

      {/* 1. BIG NUMBER STEPPER WITH DIRECT EDITABLE INPUT — the one hero number in this dialog */}
      <div className="gold-edge rounded-panel p-5 text-center">
        <p className="text-xs font-bold text-gold-ink uppercase tracking-wider">
          आज का वजन (Weight in kg)
        </p>

        <div className="my-3 flex items-center justify-center gap-2">
          <NumberInput
            allowDecimal
            value={weight}
            onChange={(e) => setWeight(e.target.value)}
            className="w-36 text-center text-4xl sm:text-5xl font-bold text-gold-ink bg-surface border-2 border-gold-line rounded-card py-1.5 focus:ring-2 focus:ring-gold-line focus:outline-none shadow-2xs"
          />
          <span className="text-2xl font-bold text-gold-ink">kg</span>
        </div>

        <div className="flex items-center justify-between gap-1.5 sm:gap-2 mt-4">
          <button
            type="button"
            onClick={() => adjustWeight(-0.5)}
            className="flex-1 min-w-0 min-h-11 rounded-field bg-surface border-2 border-gold-line font-bold text-xs sm:text-sm text-gold-ink hover:bg-gold-soft flex items-center justify-center active:scale-95 shadow-2xs"
          >
            -0.5 kg
          </button>
          <button
            type="button"
            onClick={() => adjustWeight(-0.1)}
            className="flex-1 min-w-0 min-h-11 rounded-field bg-surface border-2 border-line font-semibold text-xs text-ink-muted hover:bg-surface-sunken flex items-center justify-center active:scale-95"
          >
            -0.1
          </button>
          <button
            type="button"
            onClick={() => adjustWeight(+0.1)}
            className="flex-1 min-w-0 min-h-11 rounded-field bg-surface border-2 border-line font-semibold text-xs text-ink-muted hover:bg-surface-sunken flex items-center justify-center active:scale-95"
          >
            +0.1
          </button>
          <button
            type="button"
            onClick={() => adjustWeight(+0.5)}
            className="flex-1 min-w-0 min-h-11 rounded-field bg-surface border-2 border-gold-line font-bold text-xs sm:text-sm text-gold-ink hover:bg-gold-soft flex items-center justify-center active:scale-95 shadow-2xs"
          >
            +0.5 kg
          </button>
        </div>
      </div>

      {/* 2. OPTIONAL NOTES */}
      <Field label="टिप्पणी (Notes - ऐच्छिक)">
        <TextInput
          placeholder="उदा. सुबह भूखे पेट, बिना जूते"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          className="text-base font-medium"
        />
      </Field>

      {/* SUBMIT BUTTON */}
      <div className="pt-1">
        <Button
          variant="primary"
          type="submit"
          disabled={loading}
          className="w-full min-h-control-lg text-base font-bold"
        >
          <Scale className="h-5 w-5 mr-2" />
          {loading ? "सेव हो रहा है..." : `⚖️ ${weight} kg वजन सेव करें (Save Weight)`}
        </Button>
      </div>
    </form>
  );
}

export function AddWeightDialog({
  isOpen,
  onClose,
  patientId,
  currentWeight = 75,
  onSuccess,
}: AddWeightDialogProps) {
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Record Weight"
      hindiTitle="वजन दर्ज करें"
      description="वजन मशीन से मापें, सीधे टाइप करें या + / - से सेट करें।"
      maxWidth="md"
    >
      {isOpen ? (
        <WeightForm
          patientId={patientId}
          currentWeight={currentWeight}
          onClose={onClose}
          onSuccess={onSuccess}
        />
      ) : null}
    </Modal>
  );
}
