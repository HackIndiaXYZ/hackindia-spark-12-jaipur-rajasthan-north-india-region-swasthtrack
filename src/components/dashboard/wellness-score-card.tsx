"use client";

import { useEffect, useState } from "react";
import {
  Activity,
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  HeartPulse,
  Info,
  Pill,
  Scale,
  Sparkles,
  UserCheck,
  Utensils,
  Moon,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import {
  calculateDailyWellnessScore,
  getScoreCategory,
  type DailyWellnessScoreResult,
} from "@/services/wellness-score-service";
import { getTodayDateString } from "@/services/patient-service";

type WellnessScoreCardProps = {
  patientId: string;
  /**
   * Score computed by the parent. When supplied the card renders it directly
   * instead of recomputing — the dashboard needs the same score for its hero
   * card, and running the calculation twice meant two full passes over every
   * log for the day (§47, §57).
   */
  result?: DailyWellnessScoreResult | null;
  onRefresh?: () => void;
};

export function WellnessScoreCard({ patientId, result }: WellnessScoreCardProps) {
  const isControlled = result !== undefined;
  const [ownResult, setOwnResult] = useState<DailyWellnessScoreResult | null>(null);
  const [ownLoading, setOwnLoading] = useState(true);
  const [showExplanation, setShowExplanation] = useState(false);
  const [showCaregiverView, setShowCaregiverView] = useState(false);

  useEffect(() => {
    if (isControlled) return;

    let active = true;
    const todayStr = getTodayDateString();

    calculateDailyWellnessScore(patientId, todayStr)
      .then((res) => {
        if (active) setOwnResult(res);
      })
      .catch((err) => {
        console.error("Error calculating wellness score:", err);
      })
      .finally(() => {
        if (active) setOwnLoading(false);
      });

    return () => {
      active = false;
    };
  }, [patientId, isControlled]);

  const scoreResult = isControlled ? result : ownResult;
  const loading = isControlled ? result === null : ownLoading;

  if (loading) {
    return (
      <Card className="p-5 border-line animate-pulse bg-surface">
        <div className="flex items-center justify-between">
          <div className="h-4 w-40 rounded bg-surface-sunken" />
          <div className="h-6 w-20 rounded bg-surface-sunken" />
        </div>
        <div className="mt-4 flex items-baseline gap-2">
          <div className="h-10 w-24 rounded bg-surface-sunken" />
          <div className="h-4 w-32 rounded bg-surface-sunken" />
        </div>
        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="h-20 rounded-card bg-surface-sunken p-3" />
          ))}
        </div>
      </Card>
    );
  }

  if (!scoreResult) return null;

  const { totalScore, maxScore, category, categoryHi, components, reasons, missingDataItems, nutritionContext } = scoreResult;
  const categoryInfo = getScoreCategory(totalScore);

  const componentList = [
    {
      key: "medicine",
      name: "Medicine",
      nameHi: "दवाइयाँ",
      icon: Pill,
      score: components.medicine.score,
      max: components.medicine.maxScore,
      percent: components.medicine.percent,
      details: components.medicine.detailsHi,
      status: components.medicine.status,
      color: "emerald",
    },
    {
      key: "food",
      name: "Food",
      nameHi: "भोजन",
      icon: Utensils,
      score: components.food.score,
      max: components.food.maxScore,
      percent: components.food.percent,
      details: components.food.detailsHi,
      status: components.food.status,
      color: "green",
    },
    {
      key: "activity",
      name: "Activity",
      nameHi: "गतिविधि",
      icon: Activity,
      score: components.activity.score,
      max: components.activity.maxScore,
      percent: components.activity.percent,
      details: components.activity.detailsHi,
      status: components.activity.status,
      color: "sky",
    },
    {
      key: "sleep",
      name: "Sleep",
      nameHi: "नींद",
      icon: Moon,
      score: components.sleep.score,
      max: components.sleep.maxScore,
      percent: components.sleep.percent,
      details: components.sleep.detailsHi,
      status: components.sleep.status,
      color: "indigo",
    },
    {
      key: "bp",
      name: "BP Tracking",
      nameHi: "रक्तचाप",
      icon: HeartPulse,
      score: components.bp.score,
      max: components.bp.maxScore,
      percent: components.bp.percent,
      details: components.bp.detailsHi,
      status: components.bp.status,
      color: "rose",
    },
    {
      key: "weight",
      name: "Weight",
      nameHi: "वजन",
      icon: Scale,
      score: components.weight.score,
      max: components.weight.maxScore,
      percent: components.weight.percent,
      details: components.weight.detailsHi,
      status: components.weight.status,
      color: "amber",
    },
  ];

  return (
    <Card className="border-line bg-surface p-5 transition-all">
      {/* Top Banner */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <span className="flex h-6 w-6 items-center justify-center rounded-control bg-brand-soft text-brand-ink">
              <Sparkles className="h-3.5 w-3.5" />
            </span>
            <h3 className="font-semibold text-ink text-base sm:text-lg">
              Today&apos;s Wellness Score · दैनिक ट्रैकिंग स्कोर
            </h3>
          </div>
          <p className="mt-0.5 text-xs text-ink-subtle">
            यह आपके daily tracking और healthy habits की consistency का score है। यह medical assessment नहीं है।
          </p>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto">
          <button
            type="button"
            onClick={() => setShowCaregiverView(!showCaregiverView)}
            className={`flex items-center gap-1.5 rounded-control border px-2.5 py-1.5 text-xs font-semibold transition-colors ${
              showCaregiverView
                ? "border-brand bg-brand-soft text-brand-ink shadow-2xs"
                : "border-line bg-surface text-ink-muted hover:bg-surface-sunken"
            }`}
          >
            <UserCheck className="h-3.5 w-3.5" />
            {showCaregiverView ? "Standard View" : "Caregiver Summary"}
          </button>
        </div>
      </div>

      {/* Main Score Hero Display — the one gold moment in this card */}
      <div className="mt-4 flex flex-col gap-4 rounded-panel gold-edge p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-baseline gap-3">
          <div className="flex items-baseline">
            <span className="grad-text text-4xl sm:text-5xl font-bold tracking-tight">
              {totalScore}
            </span>
            <span className="text-sm sm:text-base font-semibold text-ink-subtle">
              /{maxScore}
            </span>
          </div>

          <div className="space-y-0.5">
            <div className="flex items-center gap-2">
              <Badge variant={categoryInfo.badgeTone}>
                {category}
              </Badge>
            </div>
            <p className="text-xs font-medium text-ink-muted">
              {categoryHi}
            </p>
          </div>
        </div>

        {/* Action button to expand reasons */}
        <button
          type="button"
          onClick={() => setShowExplanation(!showExplanation)}
          className="flex items-center justify-center gap-1.5 rounded-control border border-line bg-surface px-3 py-2 text-xs font-semibold text-ink-muted shadow-2xs hover:border-brand-line hover:bg-surface-sunken transition-all"
        >
          <Info className="h-3.5 w-3.5 text-brand" />
          <span>आज score क्यों मिला?</span>
          {showExplanation ? (
            <ChevronUp className="h-3.5 w-3.5 text-ink-subtle" />
          ) : (
            <ChevronDown className="h-3.5 w-3.5 text-ink-subtle" />
          )}
        </button>
      </div>

      {/* CAREGIVER QUICK SUMMARY CALLOUT */}
      {showCaregiverView && (
        <div className="mt-3 rounded-card border border-positive-line bg-positive-soft/70 p-4 animate-in fade-in">
          <div className="flex items-start gap-2">
            <UserCheck className="mt-0.5 h-4 w-4 shrink-0 text-positive" />
            <div className="space-y-1 text-xs">
              <p className="font-semibold text-positive">
                Caregiver Quick View · पारिवारिक सारांश
              </p>
              {missingDataItems.length > 0 ? (
                <div>
                  <p className="font-semibold text-positive">
                    आज {missingDataItems.length} बातें दर्ज होना शेष हैं:
                  </p>
                  <ul className="mt-1 list-disc list-inside space-y-0.5 text-ink-muted font-medium">
                    {missingDataItems.map((item, idx) => (
                      <li key={idx}>
                        <span className="text-ink">{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : (
                <p className="font-semibold text-positive flex items-center gap-1">
                  <CheckCircle2 className="h-3.5 w-3.5 text-positive" />
                  आज के सभी मुख्य ट्रैकिंग रिकॉर्ड सफलतापूर्वक पूर्ण हो चुके हैं!
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* EXPANDABLE SCORE EXPLANATION (+ / -) */}
      {showExplanation && (
        <div className="mt-3 space-y-2 rounded-card border border-line bg-surface p-4 text-xs animate-in fade-in">
          <p className="font-semibold text-ink text-xs uppercase tracking-wider mb-2">
            Score Breakdown Factors · मुख्य कारण
          </p>

          {reasons.positive.length > 0 && (
            <div className="space-y-1.5">
              {reasons.positive.map((pos, idx) => (
                <div key={idx} className="flex items-start gap-2 text-positive font-medium">
                  <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-positive-soft text-positive font-bold text-xs">
                    +
                  </span>
                  <span>{pos}</span>
                </div>
              ))}
            </div>
          )}

          {reasons.deductions.length > 0 && (
            <div className="mt-2 space-y-1.5 border-t border-line pt-2">
              {reasons.deductions.map((ded, idx) => (
                <div key={idx} className="flex items-start gap-2 text-critical font-medium">
                  <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-critical-soft text-critical font-bold text-xs">
                    -
                  </span>
                  <span>{ded}</span>
                </div>
              ))}
            </div>
          )}

          {nutritionContext?.calorieStatusMessage && (
            <div className="mt-2 rounded-card bg-surface-sunken p-2 text-xs text-ink-muted border border-line">
              <span className="font-semibold text-ink-muted">Calorie Note: </span>
              {nutritionContext.calorieStatusMessage}
            </div>
          )}
        </div>
      )}

      {/* 6 COMPONENT BREAKDOWN GRID */}
      <div className="mt-4 grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-6">
        {componentList.map((comp) => {
          const Icon = comp.icon;
          const isComplete = comp.status === "completed";
          const isPartial = comp.status === "partial";

          return (
            <div
              key={comp.key}
              className={`flex flex-col justify-between rounded-card border p-3 transition-all ${
                isComplete
                  ? "border-line bg-surface"
                  : isPartial
                  ? "border-attention-line/80 bg-attention-soft/30"
                  : "border-line bg-surface-sunken/60 text-ink-subtle"
              }`}
            >
              <div>
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-ink-muted">
                    {comp.nameHi}
                  </span>
                  <Icon
                    className={`h-3.5 w-3.5 ${
                      isComplete
                        ? "text-positive"
                        : isPartial
                        ? "text-attention"
                        : "text-ink-subtle"
                    }`}
                  />
                </div>

                <div className="mt-2 flex items-baseline justify-between">
                  <span className="text-lg font-extrabold text-ink">
                    {comp.score}
                    <span className="text-xs font-medium text-ink-subtle">/{comp.max}</span>
                  </span>
                  <span
                    className={`text-2xs font-semibold ${
                      isComplete
                        ? "text-positive"
                        : isPartial
                        ? "text-attention"
                        : "text-ink-subtle"
                    }`}
                  >
                    {comp.percent}%
                  </span>
                </div>

                {/* Progress bar line */}
                <div className="mt-1.5 h-1.5 w-full rounded-full bg-surface-sunken overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${
                      isComplete
                        ? "bg-positive"
                        : isPartial
                        ? "bg-attention"
                        : "bg-line-strong"
                    }`}
                    style={{ width: `${comp.percent}%` }}
                  />
                </div>
              </div>

              <p className="mt-2 text-2xs text-ink-subtle font-medium truncate" title={comp.details}>
                {comp.details}
              </p>
            </div>
          );
        })}
      </div>

      {/* Small medical disclaimer footnote */}
      <div className="mt-3.5 flex items-center gap-1.5 text-xs text-ink-subtle">
        <AlertCircle className="h-3 w-3 shrink-0" />
        <span>
          यह score केवल health tracking और habit consistency के लिए है। यह medical diagnosis या doctor की सलाह का विकल्प नहीं है।
        </span>
      </div>
    </Card>
  );
}
