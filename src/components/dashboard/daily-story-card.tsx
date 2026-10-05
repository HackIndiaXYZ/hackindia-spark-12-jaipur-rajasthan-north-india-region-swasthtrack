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

  // The evening reading is due at 20:00 (DUE_AT_MIN.eveningBP), which is the evening part of the
  // day — not the night. It only moves to "night" if it was actually taken after 21:00.
  const eveningBPPhase: PhaseKey =
    todayEveningBP && dayPartIST(todayEveningBP.measured_at) === "night" ? "night" : "evening";

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
    if (phase.key === eveningBPPhase) {
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
    <Card aria-label="Day story — आज का दिन">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="flex flex-wrap items-baseline gap-x-2 text-base font-semibold leading-tight text-ink">
            <span lang="hi">आज का दिन</span>
            <span className="text-xs font-medium text-ink-muted">Day story</span>
          </h2>
          <p lang="hi" className="mt-0.5 text-xs text-ink-muted">
            सुबह से रात तक: क्या दर्ज हुआ और क्या बाकी है
          </p>
        </div>
        <span
          aria-hidden
          className="grid h-9 w-9 shrink-0 place-items-center rounded-control bg-brand-soft text-brand-ink ring-1 ring-inset ring-brand-line"
        >
          <Clock className="h-4 w-4" />
        </span>
      </div>

      <div className="@container mt-3.5">
        <ul className="grid grid-cols-1 gap-2.5 @xl:grid-cols-2">
          {phases.map((phase) => {
            const Icon = phase.icon;
            return (
              <li
                key={phase.key}
                className={cn(
                  "tile flex items-start gap-3 rounded-card p-3",
                  phase.state === "complete" && "border-positive-line bg-positive-soft",
                )}
              >
                <span className={cn("grid h-9 w-9 shrink-0 place-items-center rounded-control border", phase.chip)}>
                  <Icon aria-hidden className="h-4 w-4" />
                </span>

                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="min-w-0 truncate text-sm font-semibold leading-tight text-ink">
                      <span lang="hi">{phase.label}</span>
                      <span className="ml-1.5 text-2xs font-normal text-ink-muted">{phase.english}</span>
                    </h3>

                    {phase.state === "complete" ? (
                      <span className="flex shrink-0 items-center gap-1 rounded-full border border-positive-line bg-surface px-2 py-0.5 text-xs font-semibold text-positive">
                        <CheckCircle2 aria-hidden className="h-3.5 w-3.5" />
                        <span lang="hi">पूरा</span>
                      </span>
                    ) : phase.state === "pending" ? (
                      <Badge variant={phase.past ? "attention" : "info"} className="shrink-0">
                        <span lang="hi">{phase.past ? "कुछ बाकी" : "प्रगति पर"}</span>
                      </Badge>
                    ) : phase.state === "upcoming" ? (
                      <Badge variant="neutral" className="shrink-0">
                        <span lang="hi">आगे</span>
                      </Badge>
                    ) : (
                      <Badge variant="neutral" className="shrink-0">
                        <span lang="hi">कुछ तय नहीं</span>
                      </Badge>
                    )}
                  </div>

                  <p lang="hi" className="mt-1 text-xs font-medium leading-snug text-ink-muted">
                    {phase.facts.length > 0
                      ? phase.facts.join(" · ")
                      : phase.state === "upcoming"
                        ? "अभी समय नहीं हुआ"
                        : "इस समय कोई रिकॉर्ड या दवाई तय नहीं"}
                  </p>
                </div>
              </li>
            );
          })}
        </ul>
      </div>

      {calorieLine ? (
        <p lang="hi" className="mt-3 text-xs font-medium text-ink-muted">
          {calorieLine}
        </p>
      ) : null}
    </Card>
  );
}
