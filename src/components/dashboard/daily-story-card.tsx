"use client";

import { CheckCircle2, Clock, Moon, Sun, Sunrise, Sunset } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { classifyBP, dayPartIST, isPlausibleBP, istHour, type DayPart } from "@/lib/health-rules";
import { medicinePeriod, type MedicinePeriod } from "@/lib/medicine-format";
import { cn } from "@/lib/utils";
import { isAutoMissedLogId, type BPLogEntry, type DashboardOverview } from "@/services/patient-service";

type DailyStoryCardProps = {
  data: DashboardOverview;
};

type PhaseKey = MedicinePeriod;

const PHASES: Array<{ key: PhaseKey; label: string; english: string; icon: LucideIcon; chip: string }> = [
  { key: "morning", label: "सुबह", english: "Morning", icon: Sunrise, chip: "bg-gold-soft text-gold-ink border-gold-line" },
  { key: "afternoon", label: "दोपहर", english: "Afternoon", icon: Sun, chip: "bg-gold-soft text-gold-ink border-gold-line" },
  { key: "evening", label: "शाम", english: "Evening", icon: Sunset, chip: "bg-attention-soft text-attention border-attention-line" },
  { key: "night", label: "रात", english: "Night", icon: Moon, chip: "bg-sleep-soft text-sleep border-sleep-line" },
];

/** Chronological order of the day's parts, for "has this part started / ended". */
const PART_ORDER: Record<DayPart, number> = { morning: 0, afternoon: 1, evening: 2, night: 3 };

function bpFact(reading: BPLogEntry): string {
  const base = `BP ${reading.systolic}/${reading.diastolic}`;
  if (!isPlausibleBP(reading.systolic, reading.diastolic)) return base;
  return `${base} · ${classifyBP(reading.systolic, reading.diastolic).labelHi}`;
}

/**
 * Four-part summary of the day. A part is "पूरा" only when every dose scheduled
 * in it was taken and the BP reading that belongs to it was recorded. Parts with
 * nothing scheduled are not called complete, and parts that have not started yet
 * say so instead of showing an empty "in progress".
 */
export function DailyStoryCard({ data }: DailyStoryCardProps) {
  const { todayMorningBP, todayEveningBP, todayActivity, todayFoodCalories, todayMedicineLogs, medicines, patient } = data;

  const activeMeds = medicines.filter((m) => m.active);
  const takenIds = new Set(
    todayMedicineLogs
      .filter((l) => !isAutoMissedLogId(l.id) && (l.status === "taken" || l.status === "late"))
      .map((l) => l.medicine_id),
  );
  const dosesIn = (key: PhaseKey) => activeMeds.filter((m) => medicinePeriod(m.scheduled_time) === key);

  // Between midnight and 04:00 the new day has not begun: nothing has "started" yet.
  const nowDate = new Date();
  const currentPart = istHour(nowDate) < 4 ? -1 : PART_ORDER[dayPartIST(nowDate)];

  const phases = PHASES.map((phase) => {
    const meds = dosesIn(phase.key);
    const taken = meds.filter((m) => takenIds.has(m.id)).length;

    const facts: string[] = [];
    const checks: boolean[] = [];

    if (meds.length > 0) {
      facts.push(`${taken}/${meds.length} दवाइयाँ ली गईं`);
      checks.push(taken === meds.length);
    }
    if (phase.key === "morning") {
      if (todayMorningBP) facts.push(bpFact(todayMorningBP));
      checks.push(todayMorningBP !== null);
    }
    if (phase.key === "night") {
      if (todayEveningBP) facts.push(bpFact(todayEveningBP));
      checks.push(todayEveningBP !== null);
    }
    if (phase.key === "afternoon" && todayFoodCalories !== null) {
      facts.push(`भोजन दर्ज · ${Math.round(todayFoodCalories)} kcal`);
    }
    if (phase.key === "evening" && todayActivity && todayActivity.steps > 0) {
      facts.push(`${todayActivity.steps.toLocaleString("en-IN")} कदम`);
    }

    const started = PART_ORDER[phase.key] <= currentPart;
    const complete = checks.length > 0 && checks.every(Boolean);
    const state: "complete" | "pending" | "upcoming" | "none" =
      complete ? "complete" : !started ? "upcoming" : checks.length === 0 ? "none" : "pending";

    return { ...phase, facts, state, past: PART_ORDER[phase.key] < currentPart };
  });

  // "Balanced" is a claim about numbers: calories within 15% of the patient's own target.
  const target = patient.daily_calorie_target;
  const ratio = todayFoodCalories !== null && target > 0 ? todayFoodCalories / target : null;
  const calorieLine =
    ratio === null
      ? null
      : `अब तक कैलोरी: ${Math.round(todayFoodCalories ?? 0)} / ${target} kcal (${Math.round(ratio * 100)}%)${
          ratio >= 0.85 && ratio <= 1.15 ? " · लक्ष्य के आसपास" : ratio > 1.15 ? " · लक्ष्य से ज़्यादा" : ""
        }`;

  return (
    <Card>
      <div className="mb-4 flex items-center justify-between border-b border-line pb-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-base font-semibold text-ink sm:text-lg">
              <span lang="hi">आज का दिन</span> · Day story
            </h2>
            <Badge variant="neutral">
              <span lang="hi">दिनचर्या</span>
            </Badge>
          </div>
          <p lang="hi" className="text-xs text-ink-muted">
            सुबह से रात तक: क्या दर्ज हुआ और क्या बाकी है
          </p>
        </div>
        <span aria-hidden className="grid h-9 w-9 place-items-center rounded-control bg-brand-soft text-brand-ink">
          <Clock className="h-4 w-4" />
        </span>
      </div>

      <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {phases.map((phase) => {
          const Icon = phase.icon;
          return (
            <li
              key={phase.key}
              className={cn(
                "rounded-card border p-3.5",
                phase.state === "complete" ? "border-positive-line bg-positive-soft" : "border-line bg-surface-sunken",
              )}
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className={cn("grid h-8 w-8 place-items-center rounded-control border", phase.chip)}>
                    <Icon aria-hidden className="h-4 w-4" />
                  </span>
                  <div>
                    <h3 lang="hi" className="text-sm font-semibold leading-none text-ink">
                      {phase.label}
                    </h3>
                    <span className="text-2xs text-ink-muted">{phase.english}</span>
                  </div>
                </div>

                {phase.state === "complete" ? (
                  <span className="flex items-center gap-1 rounded-field bg-surface px-2 py-0.5 text-xs font-semibold text-positive">
                    <CheckCircle2 aria-hidden className="h-3.5 w-3.5" />
                    <span lang="hi">पूरा</span>
                  </span>
                ) : phase.state === "pending" ? (
                  <Badge variant={phase.past ? "attention" : "info"}>
                    <span lang="hi">{phase.past ? "कुछ बाकी" : "प्रगति पर"}</span>
                  </Badge>
                ) : phase.state === "upcoming" ? (
                  <Badge variant="neutral">
                    <span lang="hi">आगे</span>
                  </Badge>
                ) : (
                  <Badge variant="neutral">
                    <span lang="hi">कुछ तय नहीं</span>
                  </Badge>
                )}
              </div>

              <p lang="hi" className="mt-2 text-xs font-medium leading-snug text-ink-muted">
                {phase.facts.length > 0
                  ? phase.facts.join(" · ")
                  : phase.state === "upcoming"
                    ? "अभी समय नहीं हुआ"
                    : "इस समय कोई रिकॉर्ड या दवाई तय नहीं"}
              </p>
            </li>
          );
        })}
      </ul>

      {calorieLine ? (
        <p lang="hi" className="mt-3 text-xs font-medium text-ink-muted">
          {calorieLine}
        </p>
      ) : null}
    </Card>
  );
}
