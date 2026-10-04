"use client";

import { useMemo } from "react";
import {
  Activity,
  ChevronRight,
  Heart,
  HeartPulse,
  Moon,
  Pill,
  RefreshCw,
  Scale,
  Utensils,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { WellnessRing } from "@/components/ui/wellness-ring";
import { Sparkline } from "@/components/ui/sparkline";
import { Button } from "@/components/ui/button";
import { Pressable, Reveal, Stagger } from "@/components/motion/primitives";
import { metricChipClasses, type MetricTone } from "@/components/ui/card";
import { bpTextClass } from "@/components/dashboard/bp-status";
import {
  DEFAULT_BP_THRESHOLDS,
  IST_TZ,
  classifyBP,
  isPlausibleBP,
  type BPThresholds,
} from "@/lib/health-rules";
import { cn } from "@/lib/utils";
import type { DashboardOverview } from "@/services/patient-service";
import type { DailyWellnessScoreResult } from "@/services/wellness-score-service";
import { getDailyPapaMessage, getGreetingParts } from "@/services/daily-papa-message-service";

/** Where the score is in its life: still calculating, calculated, or it failed. */
export type WellnessView =
  | { status: "loading" }
  | { status: "error" }
  | { status: "ready"; result: DailyWellnessScoreResult };

type HeroHealthCardProps = {
  data: DashboardOverview;
  wellness: WellnessView;
  onRetryWellness?: () => void;
  bpThresholds?: BPThresholds;
  onOpenBP?: () => void;
  onOpenWeight?: () => void;
  onOpenFood?: () => void;
  onOpenActivity?: () => void;
  onOpenMedicine?: () => void;
  onOpenSleep?: () => void;
};

const dateLabelFmt = new Intl.DateTimeFormat("hi-IN", {
  timeZone: IST_TZ,
  weekday: "long",
  day: "numeric",
  month: "long",
});

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
  valueClassName,
  helperClassName,
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
  valueClassName?: string;
  helperClassName?: string;
  icon: LucideIcon;
  tone: MetricTone;
  index?: number;
  /** Trailing readings for the sparkline. Omitted when there are fewer than 2. */
  series?: number[];
  onClick?: () => void;
}) {
  const has = value !== null;
  const tileClass = cn(
    "group surface-lift relative block h-full w-full overflow-hidden rounded-card p-3.5 text-left",
    "transition-shadow duration-200",
  );

  const inner = (
    <>
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
          <span className="block truncate text-xs font-medium text-ink-muted">{label}</span>
          <span lang="hi" className="block truncate text-2xs text-ink-subtle">
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
            <span
              className={cn("tabular text-2xl font-semibold leading-none tracking-tight text-ink", valueClassName)}
            >
              {value}
            </span>
            {unit ? <span className="text-xs font-medium text-ink-subtle">{unit}</span> : null}
          </>
        ) : (
          <span className="text-2xl font-semibold leading-none tracking-tight text-ink-subtle">—</span>
        )}
      </span>

      {/* The recent series gets its own full-width row: beside the value it
          squeezed "81.9 kg" onto two lines at 2-column mobile width. */}
      {series && series.length > 1 ? (
        <span className="relative mt-2 block">
          <Sparkline values={series} tone={tone} height={24} />
        </span>
      ) : null}

      <span lang="hi" className={cn("relative mt-1.5 block truncate text-2xs text-ink-subtle", helperClassName)}>
        {helper}
      </span>
    </>
  );

  const summary = `${label} — ${has ? `${value}${unit ? ` ${unit}` : ""}` : "अभी दर्ज नहीं"}. ${helper}`;

  return (
    <Reveal index={index}>
      {onClick ? (
        <Pressable onClick={onClick} ariaLabel={`${summary}. दर्ज करें।`} className={tileClass}>
          {inner}
        </Pressable>
      ) : (
        // Read-only members see the number but get no button that opens a form they cannot submit.
        <div role="group" aria-label={summary} className={tileClass}>
          {inner}
        </div>
      )}
    </Reveal>
  );
}

/** Same footprint as the ring, for when there is no honest number to put in it. */
function ScorePlaceholder({ title, detail, onRetry }: { title: string; detail?: string; onRetry?: () => void }) {
  return (
    <div
      role="status"
      className="flex h-[196px] w-[196px] max-w-full flex-col items-center justify-center rounded-full border-2 border-dashed border-line-strong bg-surface-sunken px-6 text-center"
    >
      <p lang="hi" className="text-sm font-semibold text-ink">
        {title}
      </p>
      {detail ? (
        <p lang="hi" className="mt-1 text-2xs leading-snug text-ink-muted">
          {detail}
        </p>
      ) : null}
      {onRetry ? (
        <Button size="sm" variant="secondary" onClick={onRetry} className="mt-2">
          <RefreshCw aria-hidden className="h-3.5 w-3.5" />
          <span lang="hi">फिर कोशिश करें</span>
        </Button>
      ) : null}
    </div>
  );
}

function ScoreArea({ wellness, onRetry }: { wellness: WellnessView; onRetry?: () => void }) {
  if (wellness.status === "loading") {
    return <WellnessRing score={null} size={196} loading />;
  }
  if (wellness.status === "error") {
    return <ScorePlaceholder title="स्कोर अभी नहीं बन पाया" detail="इंटरनेट जाँचकर दोबारा कोशिश करें।" onRetry={onRetry} />;
  }
  const { result } = wellness;
  if (!result.isSufficient) {
    return (
      <ScorePlaceholder
        title="अभी डेटा नहीं है"
        detail={result.insufficientReasonHi ?? "कुछ रिकॉर्ड दर्ज करते ही आज का स्कोर दिखेगा।"}
      />
    );
  }
  return <WellnessRing score={result.totalScore} size={196} label={result.category} hindiLabel={result.categoryHi} />;
}

/**
 * The one card that answers "आज सेहत कैसी रही?" (§17).
 *
 * Every value here is a recorded reading or an honest "—": no placeholder
 * score, no placeholder sleep, no fallback medicine count.
 */
export function HeroHealthCard({
  data,
  wellness,
  onRetryWellness,
  bpThresholds = DEFAULT_BP_THRESHOLDS,
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

  const now = new Date();
  const greeting = getGreetingParts(now).hindi;

  // The family's curated daily message: stable for the IST day, never repeats within 14 days.
  const dailyMessage = useMemo(() => getDailyPapaMessage(patient.id).message, [patient.id]);

  // The later of today's two readings, or nothing at all.
  const bpReading =
    todayMorningBP && todayEveningBP
      ? new Date(todayEveningBP.measured_at) >= new Date(todayMorningBP.measured_at)
        ? todayEveningBP
        : todayMorningBP
      : todayEveningBP || todayMorningBP;
  const bpValue = bpReading ? `${bpReading.systolic}/${bpReading.diastolic}` : null;
  const bpClass =
    bpReading && isPlausibleBP(bpReading.systolic, bpReading.diastolic)
      ? classifyBP(bpReading.systolic, bpReading.diastolic, bpThresholds)
      : null;

  // Today's logged weight, falling back to the profile's last known weight,
  // clearly labelled as such rather than presented as a fresh reading.
  const weightValue = todayWeight ? todayWeight.weight_kg : patient.current_weight_kg;

  const firstName = patient.name.trim().split(/\s+/)[0] || patient.name;

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
                {greeting}
              </span>
              <span lang="hi">{dateLabelFmt.format(now)}</span>
            </p>

            <h1 lang="hi" className="mt-2.5 text-2xl font-semibold leading-tight tracking-tight text-ink sm:text-3xl">
              {firstName} का <span className="grad-text">स्वास्थ्य साथी</span>
            </h1>

            <blockquote lang="hi" className="mt-2.5 border-l-2 border-gold-line pl-3 text-left">
              <p className="text-sm font-medium leading-relaxed text-ink">&ldquo;{dailyMessage.text}&rdquo;</p>
              {dailyMessage.subtext ? (
                <footer className="mt-1 hidden text-xs text-ink-muted sm:block">{dailyMessage.subtext}</footer>
              ) : null}
            </blockquote>
          </Reveal>

          <div className="order-1 flex flex-col items-center sm:order-2">
            <ScoreArea wellness={wellness} onRetry={onRetryWellness} />
            <p lang="hi" className="mt-1 text-xs font-medium text-ink-subtle">
              आज का दैनिक स्कोर
            </p>
          </div>
        </div>

        {/* ---- six-vital snapshot (§25) ---- */}
        <div className="mt-6 border-t border-line pt-5">
          <div className="mb-3 flex items-baseline justify-between gap-3">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
              आज की स्थिति · Today&apos;s snapshot
            </h2>
            <span lang="hi" className="inline-flex items-center gap-0.5 text-2xs text-ink-muted">
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
              valueClassName={bpClass ? bpTextClass(bpClass) : undefined}
              helper={
                bpReading
                  ? `${bpReading.reading_type === "Morning" ? "सुबह" : "शाम"}${bpClass ? ` · ${bpClass.labelHi}` : ""}`
                  : "अभी दर्ज नहीं"
              }
              helperClassName={bpClass ? bpTextClass(bpClass) : undefined}
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
              helper={todayWeight ? "आज दर्ज" : patient.current_weight_kg ? "पिछला रिकॉर्ड" : "अभी दर्ज नहीं"}
              icon={Scale}
              tone="weight"
              series={trends.weight}
              onClick={onOpenWeight}
            />
            <VitalTile
              index={2}
              label="Steps"
              hindiLabel="कदम"
              value={todayActivity ? todayActivity.steps.toLocaleString("en-IN") : null}
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
                todayFoodCalories && todayFoodCalories > 0 ? Math.round(todayFoodCalories).toLocaleString("en-IN") : null
              }
              unit="kcal"
              helper={patient.daily_calorie_target ? `लक्ष्य ${patient.daily_calorie_target} kcal` : "अभी दर्ज नहीं"}
              icon={Utensils}
              tone="food"
              series={trends.calories}
              onClick={onOpenFood}
            />
            <VitalTile
              index={4}
              label="Medicines"
              hindiLabel="दवाइयाँ"
              value={todayMedicineTotalCount > 0 ? `${todayMedicineTakenCount}/${todayMedicineTotalCount}` : null}
              helper={todayMedicineTotalCount > 0 ? "आज ली गईं" : "कोई दवा शेड्यूल नहीं"}
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
