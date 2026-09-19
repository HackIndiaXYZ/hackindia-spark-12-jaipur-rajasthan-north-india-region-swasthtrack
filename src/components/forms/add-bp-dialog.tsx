"use client";

import { useState, type FormEvent } from "react";
import { HeartPulse } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, TextInput } from "@/components/ui/form-field";
import { Modal } from "@/components/ui/modal";
import { logBloodPressure } from "@/services/patient-service";

type AddBPDialogProps = {
  isOpen: boolean;
  onClose: () => void;
  patientId: string;
  onSuccess?: () => void;
};

const BP_PRESETS = [
  { label: "120 / 80", hint: "सामान्य (Normal)", sys: "120", dia: "80" },
  { label: "130 / 85", hint: "हल्का बढ़ा (Mild High)", sys: "130", dia: "85" },
  { label: "140 / 90", hint: "उच्च (High BP)", sys: "140", dia: "90" },
  { label: "115 / 75", hint: "उत्तम (Optimal)", sys: "115", dia: "75" },
];

export function AddBPDialog({
  isOpen,
  onClose,
  patientId,
  onSuccess,
}: AddBPDialogProps) {
  const [systolic, setSystolic] = useState("120");
  const [diastolic, setDiastolic] = useState("80");
  const [pulse, setPulse] = useState("72");
  const [readingType, setReadingType] = useState<"Morning" | "Evening">("Morning");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  function adjustSystolic(delta: number) {
    const val = parseInt(systolic, 10) || 120;
    setSystolic(String(Math.max(60, Math.min(260, val + delta))));
  }

  function adjustDiastolic(delta: number) {
    const val = parseInt(diastolic, 10) || 80;
    setDiastolic(String(Math.max(40, Math.min(180, val + delta))));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");

    const sysNum = parseInt(systolic, 10);
    const diaNum = parseInt(diastolic, 10);
    const pulseNum = pulse ? parseInt(pulse, 10) : undefined;

    if (isNaN(sysNum) || sysNum < 50 || sysNum > 280) {
      setError("कृपया सही सिस्टोलिक BP दर्ज करें (ऊपर वाला मान 50 से 280 के बीच)");
      return;
    }

    if (isNaN(diaNum) || diaNum < 30 || diaNum > 180) {
      setError("कृपया सही डायस्टोलिक BP दर्ज करें (नीचे वाला मान 30 से 180 के बीच)");
      return;
    }

    if (sysNum <= diaNum) {
      setError("सिस्टोलिक BP (ऊपर वाला) डायस्टोलिक से अधिक होना चाहिए");
      return;
    }

    try {
      setLoading(true);
      await logBloodPressure({
        patient_id: patientId,
        systolic: sysNum,
        diastolic: diaNum,
        pulse: pulseNum ?? null,
        reading_type: readingType,
        measured_at: new Date().toISOString(),
        notes: notes.trim() || null,
      });

      onClose();
      onSuccess?.();
    } catch {
      setError("रक्तचाप सेव करने में समस्या आई। पुनः प्रयास करें।");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Record Blood Pressure"
      hindiTitle="रक्तचाप (BP) दर्ज करें"
      description="त्वरित 1-टैप में चुनें या खुद से सही मान टाइप करें।"
      maxWidth="md"
    >
      <form onSubmit={handleSubmit} className="space-y-5">
        {error ? (
          <div className="rounded-card border border-critical-line bg-critical-soft p-3.5 text-sm font-semibold text-critical">
            {error}
          </div>
        ) : null}

        {/* 1. TIME OF DAY (Morning vs Evening) */}
        <div className="space-y-2">
          <label className="block text-sm font-bold text-ink">
            ⭐ नापने का समय (Reading Time):
          </label>
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => setReadingType("Morning")}
              className={`p-3 rounded-card border-2 text-sm sm:text-base font-bold transition-all flex items-center justify-center gap-2 cursor-pointer ${
                readingType === "Morning"
                  ? "border-amber-500 bg-amber-50 text-amber-950 ring-2 ring-amber-400/30 shadow-xs"
                  : "border-line bg-surface text-ink-muted hover:bg-surface-sunken"
              }`}
            >
              <span>🌅 सुबह (Morning)</span>
            </button>
            <button
              type="button"
              onClick={() => setReadingType("Evening")}
              className={`p-3 rounded-card border-2 text-sm sm:text-base font-bold transition-all flex items-center justify-center gap-2 cursor-pointer ${
                readingType === "Evening"
                  ? "border-indigo-600 bg-indigo-50 text-indigo-950 ring-2 ring-indigo-500/30 shadow-xs"
                  : "border-line bg-surface text-ink-muted hover:bg-surface-sunken"
              }`}
            >
              <span>🌆 शाम (Evening)</span>
            </button>
          </div>
        </div>

        {/* 2. 1-TAP PRESETS */}
        <div className="space-y-2">
          <label className="block text-sm font-bold text-ink">
            ⭐ 1-टैप त्वरित मान (Quick Presets):
          </label>
          <div className="grid grid-cols-2 gap-2">
            {BP_PRESETS.map((p) => {
              const isSelected = systolic === p.sys && diastolic === p.dia;
              return (
                <button
                  type="button"
                  key={p.label}
                  onClick={() => {
                    setSystolic(p.sys);
                    setDiastolic(p.dia);
                  }}
                  className={`p-2.5 rounded-field border-2 text-left transition-all cursor-pointer ${
                    isSelected
                      ? "border-rose-600 bg-rose-50 text-rose-950 font-bold ring-2 ring-rose-500/30 shadow-2xs"
                      : "border-line bg-surface text-ink hover:bg-surface-sunken font-semibold"
                  }`}
                >
                  <p className="text-base font-bold leading-tight">{p.label}</p>
                  <p className="text-xs font-semibold text-ink-subtle">{p.hint}</p>
                </button>
              );
            })}
          </div>
        </div>

        {/* 3. STEPPERS & DIRECT MANUAL INPUTS FOR SYSTOLIC & DIASTOLIC */}
        <div className="space-y-3 pt-2 border-t border-line">
          <p className="text-xs font-bold uppercase tracking-wider text-ink-subtle">
            सटीक मान (टाइप करें या + / - बटन दबाएं):
          </p>

          <div className="grid grid-cols-2 gap-3">
            <div className="p-3.5 rounded-card border-2 border-line bg-surface-sunken/80 text-center">
              <p className="text-xs font-bold text-ink-muted uppercase">ऊपर वाला (Systolic)</p>
              <div className="my-2">
                <input
                  type="number"
                  value={systolic}
                  onChange={(e) => setSystolic(e.target.value)}
                  className="w-full text-center text-3xl font-bold text-rose-700 bg-surface border border-line-strong rounded-field py-1 focus:ring-2 focus:ring-rose-500 focus:outline-none"
                  placeholder="120"
                />
              </div>
              <div className="flex items-center justify-center gap-2 mt-2">
                <button
                  type="button"
                  onClick={() => adjustSystolic(-5)}
                  className="h-11 w-11 rounded-field bg-surface border-2 border-line-strong font-bold text-base text-ink hover:bg-surface-sunken flex items-center justify-center active:scale-95 shadow-2xs"
                >
                  -5
                </button>
                <button
                  type="button"
                  onClick={() => adjustSystolic(+5)}
                  className="h-11 w-11 rounded-field bg-surface border-2 border-line-strong font-bold text-base text-ink hover:bg-surface-sunken flex items-center justify-center active:scale-95 shadow-2xs"
                >
                  +5
                </button>
              </div>
            </div>

            <div className="p-3.5 rounded-card border-2 border-line bg-surface-sunken/80 text-center">
              <p className="text-xs font-bold text-ink-muted uppercase">नीचे वाला (Diastolic)</p>
              <div className="my-2">
                <input
                  type="number"
                  value={diastolic}
                  onChange={(e) => setDiastolic(e.target.value)}
                  className="w-full text-center text-3xl font-bold text-rose-700 bg-surface border border-line-strong rounded-field py-1 focus:ring-2 focus:ring-rose-500 focus:outline-none"
                  placeholder="80"
                />
              </div>
              <div className="flex items-center justify-center gap-2 mt-2">
                <button
                  type="button"
                  onClick={() => adjustDiastolic(-5)}
                  className="h-11 w-11 rounded-field bg-surface border-2 border-line-strong font-bold text-base text-ink hover:bg-surface-sunken flex items-center justify-center active:scale-95 shadow-2xs"
                >
                  -5
                </button>
                <button
                  type="button"
                  onClick={() => adjustDiastolic(+5)}
                  className="h-11 w-11 rounded-field bg-surface border-2 border-line-strong font-bold text-base text-ink hover:bg-surface-sunken flex items-center justify-center active:scale-95 shadow-2xs"
                >
                  +5
                </button>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 pt-1">
            <Field label="पल्स रेट (Pulse bpm - ऐच्छिक)">
              <TextInput
                type="number"
                placeholder="उदा. 72"
                value={pulse}
                onChange={(e) => setPulse(e.target.value)}
                className="text-base font-semibold"
              />
            </Field>

            <Field label="टिप्पणी (Notes - ऐच्छिक)">
              <TextInput
                placeholder="उदा. दवाई लेने के बाद"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="text-base font-medium"
              />
            </Field>
          </div>
        </div>

        {/* SUBMIT BUTTON */}
        <div className="pt-2">
          <Button
            variant="primary"
            type="submit"
            disabled={loading}
            className="w-full min-h-control-lg text-base font-bold"
          >
            <HeartPulse className="h-5 w-5 mr-2" />
            {loading ? "सेव हो रहा है..." : `🩺 BP ${systolic}/${diastolic} सेव करें (Save BP)`}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
