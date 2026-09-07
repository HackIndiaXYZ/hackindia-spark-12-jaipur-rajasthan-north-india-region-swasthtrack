"use client";

import { useMemo } from "react";
import {
  Activity,
  ChevronRight,
  Heart,
  HeartPulse,
  Moon,
  Pill,
  Scale,
  Utensils,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { WellnessRing } from "@/components/ui/wellness-ring";
import { Sparkline } from "@/components/ui/sparkline";
import { Pressable, Reveal, Stagger } from "@/components/motion/primitives";
import { metricChipClasses, type MetricTone } from "@/components/ui/card";
import { cn } from "@/lib/utils";
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

const glowByTone: Record<MetricTone, string> = {
  brand: "group-hover:shadow-glow-brand",
  bp: "group-hover:shadow-glow-bp",
  weight: "group-hover:shadow-glow-weight",
  food: "group-hover:shadow-glow-food",
  meds: "group-hover:shadow-glow-meds",
  activity: "group-hover:shadow-glow-activity",
  sleep: "group-hover:shadow-glow-sleep",
  neutral: "",
};

/**
 * A vital tile. The icon chip carries the metric's hue and picks up a coloured
 * glow on press, which is the only place saturated colour appears at rest.
 */
function VitalTile({
  label,
  hindiLabel,
  value,
  unit,
  helper,
  icon: Icon,
  tone,
  index = 0,
  series,
  onClick,
}: {
  label: string;
  hindiLabel: string;
  /**
   * Rendered verbatim. Recorded vitals are never counted up — a stalled tween
   * would leave a real reading showing a wrong number.
   */
  value: string | null;
  unit?: string;
  helper: string;
  icon: LucideIcon;
  tone: MetricTone;
  index?: number;
  /** Trailing readings for the sparkline. Omitted when there are fewer than 2. */
  series?: number[];
  onClick?: () => void;
}) {
  const has = value !== null;

  return (
    <Reveal index={index}>
      <Pressable
        onClick={onClick}
        ariaLabel={`${label} — ${has ? value : "अभी दर्ज नहीं"}. दर्ज करें।`}
        className={cn(
          "group surface-lift relative h-full w-full overflow-hidden rounded-card p-3.5",
          "transition-shadow duration-200",
        )}
      >
        <span
          aria-hidden
          className={cn(
            "pointer-events-none absolute -right-8 -top-8 h-20 w-20 rounded-full opacity-0",
            "blur-2xl transition-opacity duration-300 group-hover:opacity-100",
            metricChipClasses[tone],
          )}
        />

        <span className="relative flex items-start justify-between gap-2">
          <span className="min-w-0">
            <span className="block truncate text-xs font-medium text-ink-muted">
              {label}
            </span>
            <span
              lang="hi"
              className="block truncate text-2xs text-ink-subtle"
            >
              {hindiLabel}
            </span>
          </span>
          <span
            className={cn(
              "grid h-9 w-9 shrink-0 place-items-center rounded-control shadow-e1",
              "transition-shadow duration-200",
              metricChipClasses[tone],
              glowByTone[tone],
            )}
          >
            <Icon aria-hidden className="h-4.5 w-4.5" />
          </span>
        </span>

        <span className="relative mt-2.5 flex items-baseline gap-1">
          {has ? (
            <>
              <span className="tabular text-2xl font-semibold leading-none tracking-tight text-ink">
                {value}
              </span>
              {unit ? (
                <span className="text-xs font-medium text-ink-subtle">{unit}</span>
              ) : null}
            </>
          ) : (
            <span className="text-2xl font-semibold leading-none tracking-tight text-ink-subtle">
              —
            </span>
          )}
        </span>

        {/* The recent series gets its own full-width row: beside the value it
            squeezed "81.9 kg" onto two lines at 2-column mobile width. */}
        {series && series.length > 1 ? (
          <span className="relative mt-2 block">
            <Sparkline values={series} tone={tone} height={24} />
          </span>
        ) : null}

        <span className="relative mt-1.5 block truncate text-2xs text-ink-subtle">
          {helper}
        </span>
      </Pressable>
    </Reveal>
  );
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
    trends,
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

  const firstName = patient.name.split(" ")[0] || patient.name;

  return (
    <section className="surface-lift relative overflow-hidden rounded-panel">
      {/* Ambient wash behind the ring — the hero's one decorative element. */}
      <span
        aria-hidden
        className="pointer-events-none absolute -right-16 -top-24 h-72 w-72 rounded-full bg-spring-2/10 blur-3xl"
      />
      <span
        aria-hidden
        className="pointer-events-none absolute -left-20 top-10 h-56 w-56 rounded-full bg-spring-1/10 blur-3xl"
      />

      <div className="relative p-5 sm:p-6">
        {/* ---- greeting + ring ---- */}
        <div className="flex flex-col items-center gap-5 sm:flex-row sm:items-center sm:gap-7">
          <Reveal className="order-2 min-w-0 flex-1 text-center sm:order-1 sm:text-left">
            <p className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-xs text-ink-muted sm:justify-start">
              <span
                lang="hi"
                className="inline-flex items-center gap-1.5 rounded-full border border-brand-line bg-brand-soft px-2.5 py-0.5 font-semibold text-brand-ink"
              >
                <Heart aria-hidden className="h-3.5 w-3.5 fill-current text-bp" />
                {greeting.hindi}
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
              className="mt-2.5 text-2xl font-semibold leading-tight tracking-tight text-ink sm:text-3xl"
            >
              {isPapa ? (
                <>
                  पापा, आपका{" "}
                  <span className="grad-text">स्वास्थ्य साथी</span>
                </>
              ) : (
                <>
                  {firstName}, आपका{" "}
                  <span className="grad-text">स्वास्थ्य साथी</span>
                </>
              )}
            </h1>

            {dailyMessage ? (
              <blockquote
                lang="hi"
                className="mt-3 border-l-2 border-brand-line pl-3 text-left"
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
            ) : (
              <p lang="hi" className="mt-2 text-sm text-ink-muted">
                आज का दिन सुखद व स्वस्थ रहे।
              </p>
            )}
          </Reveal>

          <div className="order-1 flex flex-col items-center sm:order-2">
            <WellnessRing
              score={wellnessScore}
              size={196}
              label={scoreInfo ? scoreInfo.category : undefined}
              hindiLabel={scoreInfo ? scoreInfo.categoryHi : undefined}
            />
            <p lang="hi" className="mt-1 text-xs font-medium text-ink-subtle">
              आज का दैनिक स्कोर
            </p>
          </div>
        </div>

        {/* ---- six-vital snapshot (§25) ---- */}
        <div className="mt-6 border-t border-line pt-5">
          <div className="mb-3 flex items-baseline justify-between gap-3">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-ink-subtle">
              आज की स्थिति · Today&apos;s snapshot
            </h2>
            <span
              lang="hi"
              className="inline-flex items-center gap-0.5 text-2xs text-ink-subtle"
            >
              टैप करके दर्ज करें
              <ChevronRight aria-hidden className="h-3 w-3" />
            </span>
          </div>

          <Stagger className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-6">
            <VitalTile
              index={0}
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
              series={trends.systolic}
              onClick={onOpenBP}
            />
            <VitalTile
              index={1}
              label="Weight"
              hindiLabel="वजन"
              value={weightValue !== null ? String(weightValue) : null}
              unit="kg"
              helper={
                todayWeight
                  ? "आज दर्ज (Logged today)"
                  : patient.current_weight_kg
                    ? "पिछला रिकॉर्ड (Last known)"
                    : "अभी दर्ज नहीं"
              }
              icon={Scale}
              tone="weight"
              series={trends.weight}
              onClick={onOpenWeight}
            />
            <VitalTile
              index={2}
              label="Steps"
              hindiLabel="कदम"
              value={
                todayActivity ? todayActivity.steps.toLocaleString("en-IN") : null
              }
              helper={todayActivity ? "आज दर्ज" : "अभी दर्ज नहीं"}
              icon={Activity}
              tone="activity"
              series={trends.steps}
              onClick={onOpenActivity}
            />
            <VitalTile
              index={3}
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
                  : "अभी दर्ज नहीं"
              }
              icon={Utensils}
              tone="food"
              series={trends.calories}
              onClick={onOpenFood}
            />
            <VitalTile
              index={4}
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
            <VitalTile
              index={5}
              label="Sleep"
              hindiLabel="नींद"
              value={todaySleep ? formatSleep(Number(todaySleep.sleep_hours)) : null}
              helper={todaySleep ? "आज दर्ज" : "अभी दर्ज नहीं"}
              icon={Moon}
              tone="sleep"
              onClick={onOpenSleep}
            />
          </Stagger>
        </div>
      </div>
    </section>
  );
}
