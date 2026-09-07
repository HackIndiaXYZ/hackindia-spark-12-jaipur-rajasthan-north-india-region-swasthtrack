"use client";

import { useMemo } from "react";
import {
  Activity,
  Heart,
  HeartPulse,
  Moon,
  Pill,
  Scale,
  Utensils,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Stat, StatGrid } from "@/components/ui/stat";
import type { DashboardOverview } from "@/services/patient-service";
import { getScoreCategory } from "@/services/wellness-score-service";
import {
  getDailyPapaMessage,
  getGreetingParts,
} from "@/services/daily-papa-message-service";

type HeroHealthCardProps = {
  data: DashboardOverview;
  /** The real score from `calculateDailyWellnessScore`. `null` while loading. */
  wellnessScore: number | null;
  onOpenBP?: () => void;
  onOpenWeight?: () => void;
  onOpenFood?: () => void;
  onOpenActivity?: () => void;
  onOpenMedicine?: () => void;
  onOpenSleep?: () => void;
};

function formatSleep(hours: number): string {
  const h = Math.floor(hours);
  const m = Math.round((hours - h) * 60);
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

/**
 * The one card that answers "Papa aaj kaise rahe?" (§17).
 *
 * It merges what used to be two stacked hero cards — the daily message banner
 * and the snapshot card — which between them showed two contradictory
 * greetings, a hard-coded 82/100 score, a hard-coded "6h 30m" of sleep and a
 * "13/13" medicine fallback. Every value here is now real or absent.
 */
export function HeroHealthCard({
  data,
  wellnessScore,
  onOpenBP,
  onOpenWeight,
  onOpenFood,
  onOpenActivity,
  onOpenMedicine,
  onOpenSleep,
}: HeroHealthCardProps) {
  const {
    patient,
    todayMorningBP,
    todayEveningBP,
    todayActivity,
    todayFoodCalories,
    todayMedicineTotalCount,
    todayMedicineTakenCount,
    todayWeight,
    todaySleep,
  } = data;

  const greeting = getGreetingParts();

  const isPapa =
    patient.id === "6c4fcb90-5dc1-4ff5-89fe-3049f927f4ac" ||
    patient.name.toLowerCase().includes("raj kishore") ||
    patient.name.toLowerCase().includes("papa");

  const dailyMessage = useMemo(
    () => (isPapa ? getDailyPapaMessage(patient.id) : null),
    [isPapa, patient.id],
  );

  const scoreInfo = wellnessScore === null ? null : getScoreCategory(wellnessScore);

  // Latest reading of the day, or nothing at all — never a placeholder value.
  const bpReading = todayEveningBP || todayMorningBP;
  const bpValue = bpReading ? `${bpReading.systolic}/${bpReading.diastolic}` : null;

  // Today's logged weight, falling back to the profile's last known weight,
  // clearly labelled as such rather than presented as a fresh reading.
  const weightValue = todayWeight
    ? todayWeight.weight_kg
    : patient.current_weight_kg;
  const weightHelper = todayWeight
    ? "आज दर्ज (Logged today)"
    : patient.current_weight_kg
      ? "पिछला रिकॉर्ड (Last known)"
      : undefined;

  const firstName = patient.name.split(" ")[0] || patient.name;

  return (
    <Card
      tone="raised"
      className="border-brand-line bg-gradient-to-b from-brand-softer to-surface"
    >
      {/* Greeting + score */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs font-medium text-ink-muted">
            <span
              lang="hi"
              className="inline-flex items-center gap-1.5 rounded-full border border-brand-line bg-brand-soft px-2.5 py-0.5 font-semibold text-brand-ink"
            >
              <Heart aria-hidden className="h-3.5 w-3.5 fill-current text-bp" />
              {greeting.hindi}
              <span className="font-normal text-ink-subtle">
                ({greeting.english})
              </span>
            </span>
            <span lang="hi">
              {new Date().toLocaleDateString("hi-IN", {
                weekday: "long",
                day: "numeric",
                month: "long",
              })}
            </span>
          </p>

          <h1
            lang={isPapa ? "hi" : undefined}
            className="mt-2 text-xl font-semibold tracking-tight text-ink sm:text-2xl"
          >
            {isPapa ? "पापा, आपका स्वास्थ्य साथी" : `${firstName}, आपका स्वास्थ्य साथी`}
          </h1>
          <p lang="hi" className="mt-1 text-sm text-ink-muted">
            आज का दिन सुखद व स्वस्थ रहे। सभी जानकारियाँ यहाँ सुरक्षित हैं।
          </p>
        </div>

        {/* Daily score. Absent until the real score has been computed. */}
        <div className="flex shrink-0 items-center gap-3 rounded-panel border border-line bg-surface px-3 py-2.5 shadow-e1">
          <div
            className={
              "tabular grid h-12 w-12 shrink-0 place-items-center rounded-control " +
              (scoreInfo ? "bg-brand text-ink-inverse" : "bg-surface-sunken text-ink-subtle")
            }
          >
            {wellnessScore === null ? (
              <span className="h-5 w-8 skeleton" />
            ) : (
              <>
                <span className="text-lg font-semibold leading-none">
                  {wellnessScore}
                </span>
                <span className="text-2xs opacity-80">/100</span>
              </>
            )}
          </div>
          <div className="min-w-0">
            <p lang="hi" className="text-xs font-semibold text-ink">
              दैनिक स्कोर
            </p>
            <p lang="hi" className="text-2xs text-ink-muted">
              {scoreInfo ? scoreInfo.categoryHi : "गणना हो रही है…"}
            </p>
          </div>
        </div>
      </div>

      {/* Today's message for Papa */}
      {dailyMessage ? (
        <blockquote
          lang="hi"
          className="mt-4 rounded-card border border-line bg-surface px-3.5 py-3"
        >
          <p className="text-sm font-medium leading-relaxed text-ink">
            &ldquo;{dailyMessage.message.text}&rdquo;
          </p>
          {dailyMessage.message.subtext ? (
            <footer className="mt-1 text-xs text-ink-muted">
              {dailyMessage.message.subtext}
            </footer>
          ) : null}
        </blockquote>
      ) : null}

      {/* Six-vital snapshot (§25) */}
      <div className="mt-5">
        <div className="mb-2.5 flex items-baseline justify-between gap-3">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-ink-subtle">
            आज की स्थिति · Today&apos;s snapshot
          </h2>
          <span lang="hi" className="text-2xs text-ink-subtle">
            टैप करके दर्ज करें
          </span>
        </div>

        <StatGrid>
          <Stat
            label="BP"
            hindiLabel="रक्तचाप"
            value={bpValue}
            unit={bpValue ? "mmHg" : undefined}
            helper={
              bpReading
                ? `${bpReading.reading_type === "Morning" ? "सुबह" : "शाम"} · दर्ज`
                : "अभी दर्ज नहीं"
            }
            icon={HeartPulse}
            tone="bp"
            onClick={onOpenBP}
          />
          <Stat
            label="Weight"
            hindiLabel="वजन"
            value={weightValue}
            unit="kg"
            helper={weightHelper ?? "अभी दर्ज नहीं"}
            icon={Scale}
            tone="weight"
            onClick={onOpenWeight}
          />
          <Stat
            label="Steps"
            hindiLabel="कदम"
            value={todayActivity ? todayActivity.steps.toLocaleString("en-IN") : null}
            helper={todayActivity ? "आज दर्ज" : "अभी दर्ज नहीं"}
            icon={Activity}
            tone="activity"
            onClick={onOpenActivity}
          />
          <Stat
            label="Calories"
            hindiLabel="भोजन"
            value={
              todayFoodCalories && todayFoodCalories > 0
                ? Math.round(todayFoodCalories).toLocaleString("en-IN")
                : null
            }
            unit="kcal"
            helper={
              patient.daily_calorie_target
                ? `लक्ष्य ${patient.daily_calorie_target} kcal`
                : undefined
            }
            icon={Utensils}
            tone="food"
            onClick={onOpenFood}
          />
          <Stat
            label="Medicines"
            hindiLabel="दवाइयाँ"
            value={
              todayMedicineTotalCount > 0
                ? `${todayMedicineTakenCount}/${todayMedicineTotalCount}`
                : null
            }
            helper={
              todayMedicineTotalCount > 0
                ? "आज ली गईं"
                : "कोई दवा शेड्यूल नहीं"
            }
            icon={Pill}
            tone="meds"
            onClick={onOpenMedicine}
          />
          <Stat
            label="Sleep"
            hindiLabel="नींद"
            value={todaySleep ? formatSleep(Number(todaySleep.sleep_hours)) : null}
            helper={todaySleep ? "आज दर्ज" : "अभी दर्ज नहीं"}
            icon={Moon}
            tone="sleep"
            onClick={onOpenSleep}
          />
        </StatGrid>
      </div>
    </Card>
  );
}
