"use client";

import { useState } from "react";
import { Activity, AlertCircle, CheckCircle2, HeartPulse, Moon, Pill, Scale, Utensils, type LucideIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardDescription, CardHeader, CardTitle, metricChipClasses, type MetricTone } from "@/components/ui/card";
import { EmptyState, ErrorState } from "@/components/ui/page";
import { Segmented, type SegmentedOption } from "@/components/ui/segmented";
import { TextInput } from "@/components/ui/form-field";
import { fmtDateStrFull, fmtDateStrWeekday } from "@/components/health/format";
import { loadErrorMessage, useAsyncData } from "@/components/health/use-async-data";
import { ReportDisclaimer, ReportHero, ReportSkeleton } from "@/components/reports/report-parts";
import { addDaysIST, todayIST } from "@/lib/health-rules";
import { cn } from "@/lib/utils";
import { calculateDailyWellnessScore, getScoreCategory } from "@/services/wellness-score-service";
import { getFoodLogsByDate } from "@/services/patient-service";

type DailyReportViewProps = {
  patientId: string;
};

type DayChoice = "today" | "yesterday" | "other";

const COMPONENTS: Array<{
  key: "medicine" | "food" | "activity" | "sleep" | "bp" | "weight";
  title: string;
  hindi: string;
  icon: LucideIcon;
  tone: MetricTone;
}> = [
  { key: "medicine", title: "Medicines", hindi: "दवाइयाँ", icon: Pill, tone: "meds" },
  { key: "food", title: "Food", hindi: "भोजन", icon: Utensils, tone: "food" },
  { key: "activity", title: "Steps", hindi: "कदम", icon: Activity, tone: "activity" },
  { key: "sleep", title: "Sleep", hindi: "नींद", icon: Moon, tone: "sleep" },
  { key: "bp", title: "Blood pressure", hindi: "रक्तचाप", icon: HeartPulse, tone: "bp" },
  { key: "weight", title: "Weight", hindi: "वजन", icon: Scale, tone: "weight" },
];

const ALERT_TONE = { URGENT: "critical", IMPORTANT: "attention", ATTENTION: "attention" } as const;

export function DailyReportView({ patientId }: DailyReportViewProps) {
  const [selectedDate, setSelectedDate] = useState(todayIST);
  const today = todayIST();
  const yesterday = addDaysIST(today, -1);
  const choice: DayChoice = selectedDate === today ? "today" : selectedDate === yesterday ? "yesterday" : "other";

  const options: SegmentedOption<DayChoice>[] = [
    { value: "today", label: "Today", hindiLabel: "आज" },
    { value: "yesterday", label: "Yesterday", hindiLabel: "कल" },
    ...(choice === "other" ? [{ value: "other" as const, label: fmtDateStrWeekday(selectedDate) }] : []),
  ];

  const { data, error, loading, reload } = useAsyncData(
    async () => {
      const [score, foods] = await Promise.all([
        calculateDailyWellnessScore(patientId, selectedDate),
        getFoodLogsByDate(patientId, selectedDate),
      ]);
      return { score, foods };
    },
    [patientId, selectedDate],
  );

  const score = data?.score ?? null;
  const category = score && score.isSufficient ? getScoreCategory(score.totalScore) : null;

  return (
    <div className="space-y-5">
      <ReportHero
        title="Daily summary"
        hindiTitle="दैनिक सारांश"
        period={fmtDateStrFull(selectedDate)}
        scoreLabel="Tracking score"
        score={score && score.isSufficient ? score.totalScore : null}
        controls={
          <div className="flex flex-wrap items-center gap-2">
            <Segmented
              options={options}
              value={choice}
              onChange={(v) => {
                if (v === "today") setSelectedDate(today);
                else if (v === "yesterday") setSelectedDate(yesterday);
              }}
              ariaLabel="Day — दिन चुनें"
              size="sm"
            />
            <label className="flex items-center gap-2 text-xs text-ink-muted">
              <span>दूसरी तारीख़</span>
              <TextInput
                type="date"
                value={selectedDate}
                max={today}
                onChange={(e) => {
                  if (e.target.value) setSelectedDate(e.target.value);
                }}
                className="min-h-control w-auto"
                aria-label="Pick a date — तारीख़ चुनें"
              />
            </label>
          </div>
        }
      />

      {error ? (
        <ErrorState
          title="दैनिक रिपोर्ट लोड नहीं हो पाई"
          englishTitle="The daily report could not be loaded"
          description={loadErrorMessage(error)}
          onRetry={reload}
        />
      ) : loading || !data || !score ? (
        <ReportSkeleton blocks={2} />
      ) : (
        <>
          {!score.isSufficient ? (
            <EmptyState
              icon={AlertCircle}
              title="इस दिन का कोई रिकॉर्ड नहीं"
              hindiTitle="Nothing logged for this day"
              description={score.insufficientReasonHi ?? "इस दिन कुछ दर्ज नहीं हुआ, इसलिए स्कोर नहीं बन सकता।"}
            />
          ) : (
            <Card tone="premium">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <h3 className="text-base font-semibold text-ink">Tracking score · ट्रैकिंग स्कोर</h3>
                  <p lang="hi" className="mt-1 text-xs text-ink-subtle">
                    यह स्कोर बताता है कि आज कितना रिकॉर्ड नियमित दर्ज हुआ। यह स्वास्थ्य का निदान नहीं है।
                  </p>
                </div>
                {category ? <Badge variant={category.badgeTone}>{score.categoryHi}</Badge> : null}
              </div>

              {score.alerts.length > 0 ? (
                <ul className="mt-4 space-y-2">
                  {score.alerts.map((a) => (
                    <li
                      key={a.messageHi}
                      lang="hi"
                      className={cn(
                        "rounded-control border px-3 py-2 text-xs",
                        ALERT_TONE[a.severity] === "critical"
                          ? "border-critical-line bg-critical-soft text-ink-muted"
                          : "border-attention-line bg-attention-soft text-ink-muted",
                      )}
                    >
                      {a.messageHi}
                    </li>
                  ))}
                </ul>
              ) : null}

              <div className="mt-4 grid gap-3 border-t border-line pt-4 text-xs md:grid-cols-2">
                {score.reasons.positive.length > 0 ? (
                  <div className="space-y-1.5 rounded-control border border-positive-line bg-positive-soft p-3">
                    <p className="flex items-center gap-1.5 font-semibold text-positive">
                      <CheckCircle2 aria-hidden className="h-3.5 w-3.5" />
                      जो अच्छा रहा
                    </p>
                    <ul lang="hi" className="space-y-1 text-ink-muted">
                      {score.reasons.positive.map((p) => (
                        <li key={p}>• {p}</li>
                      ))}
                    </ul>
                  </div>
                ) : null}
                {score.reasons.deductions.length > 0 ? (
                  <div className="space-y-1.5 rounded-control border border-attention-line bg-attention-soft p-3">
                    <p className="flex items-center gap-1.5 font-semibold text-attention">
                      <AlertCircle aria-hidden className="h-3.5 w-3.5" />
                      जो छूटा या ध्यान माँगता है
                    </p>
                    <ul lang="hi" className="space-y-1 text-ink-muted">
                      {score.reasons.deductions.map((d) => (
                        <li key={d}>• {d}</li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </div>
            </Card>
          )}

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {COMPONENTS.map(({ key, title, hindi, icon: Icon, tone }) => {
              const c = score.components[key];
              return (
                <div key={key} className="rounded-card border border-line bg-surface p-4 shadow-e1">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex min-w-0 items-center gap-2">
                      <span className={cn("grid h-8 w-8 shrink-0 place-items-center rounded-field", metricChipClasses[tone])}>
                        <Icon aria-hidden className="h-4 w-4" />
                      </span>
                      <h4 className="truncate text-sm font-semibold text-ink">
                        {title}
                        <span lang="hi" className="ml-1.5 text-xs font-normal text-ink-subtle">
                          {hindi}
                        </span>
                      </h4>
                    </div>
                    <span className="tabular shrink-0 text-xs font-semibold text-ink-muted">
                      {c.isScored ? `${c.score}/${c.maxScore}` : "—"}
                    </span>
                  </div>
                  <p lang="hi" className="mt-2 text-xs text-ink-muted">
                    {c.isScored ? c.detailsHi : (c.detailsHi || "आज इसकी बारी अभी नहीं आई, इसलिए गिना नहीं गया।")}
                  </p>
                  {key === "food" && score.nutritionContext ? (
                    <p className="tabular mt-1 text-xs text-ink-subtle">
                      {score.nutritionContext.caloriesConsumed} / {score.nutritionContext.calorieTarget} kcal
                    </p>
                  ) : null}
                </div>
              );
            })}
          </div>

          {data.foods.length > 0 ? (
            <Card>
              <CardHeader>
                <div>
                  <CardTitle className="text-sm">Meals logged · दर्ज भोजन</CardTitle>
                  <CardDescription>कुल {data.foods.length} चीज़ें दर्ज</CardDescription>
                </div>
              </CardHeader>
              <ul className="divide-y divide-line">
                {data.foods.map((food) => (
                  <li key={food.id} className="flex items-center justify-between gap-3 py-2.5 text-xs">
                    <div className="min-w-0">
                      <span className="font-semibold text-ink">{food.food_name}</span>
                      <span className="ml-2 text-ink-subtle">
                        ({food.quantity} {food.unit}) · {food.meal_type}
                      </span>
                    </div>
                    <div className="tabular shrink-0 font-semibold text-ink">
                      {food.calories} kcal
                      {food.protein_g > 0 ? <span className="ml-2 font-normal text-ink-subtle">{food.protein_g}g protein</span> : null}
                    </div>
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}

          <ReportDisclaimer>यह रिपोर्ट सिर्फ़ रिकॉर्ड की निरंतरता दिखाती है। यह डॉक्टर की सलाह या निदान का विकल्प नहीं है।</ReportDisclaimer>
        </>
      )}
    </div>
  );
}
