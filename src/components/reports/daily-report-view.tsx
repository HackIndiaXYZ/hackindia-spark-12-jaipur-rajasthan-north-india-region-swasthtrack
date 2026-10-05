"use client";

import { useState } from "react";
import { Activity, AlertCircle, CheckCircle2, HeartPulse, Moon, Pill, Scale, ShieldAlert, Utensils, type LucideIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, metricChipClasses, type MetricTone } from "@/components/ui/card";
import { EmptyState, ErrorState } from "@/components/ui/page";
import { fmtDateStrFull, fmtDateStrWeekday, fmtTime } from "@/components/health/format";
import { loadErrorMessage, useAsyncData } from "@/components/health/use-async-data";
import { ChartCard, Meter, PeriodNav, ReportDisclaimer, ReportHero, ReportSkeleton } from "@/components/reports/report-parts";
import { addDaysIST, todayIST } from "@/lib/health-rules";
import { getScoreCategory } from "@/lib/analytics/wellness-calc";
import { cn } from "@/lib/utils";
import { calculateDailyWellnessScore } from "@/services/wellness-score-service";
import { getFoodLogsByDate, type FoodLogEntry } from "@/services/patient-service";

type DailyReportViewProps = {
  patientId: string;
};

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
const nf = new Intl.NumberFormat("en-IN");

/** Meals grouped in the order they were eaten, with a subtotal per meal. */
function groupMeals(foods: FoodLogEntry[]) {
  const groups = new Map<string, { meal: string; items: FoodLogEntry[]; kcal: number }>();
  for (const f of [...foods].sort((a, b) => a.consumed_at.localeCompare(b.consumed_at))) {
    const g = groups.get(f.meal_type) ?? { meal: f.meal_type, items: [], kcal: 0 };
    g.items.push(f);
    g.kcal += Number(f.calories || 0);
    groups.set(f.meal_type, g);
  }
  return [...groups.values()];
}

export function DailyReportView({ patientId }: DailyReportViewProps) {
  const today = todayIST();
  const [selectedDate, setSelectedDate] = useState(today);

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
  const meals = data ? groupMeals(data.foods) : [];
  const totalKcal = meals.reduce((s, m) => s + m.kcal, 0);

  const relative = selectedDate === today ? "आज" : selectedDate === addDaysIST(today, -1) ? "कल" : null;

  return (
    <div className="space-y-5">
      <ReportHero
        title="Daily summary"
        hindiTitle="दैनिक सारांश"
        period={fmtDateStrFull(selectedDate)}
        scoreLabel="Tracking score"
        score={score && score.isSufficient ? score.totalScore : null}
        nav={
          <PeriodNav
            label={`${relative ? `${relative} · ` : ""}${fmtDateStrWeekday(selectedDate)}`}
            prevLabel="पिछला दिन (Previous day)"
            nextLabel="अगला दिन (Next day)"
            onPrev={() => setSelectedDate((d) => addDaysIST(d, -1))}
            onNext={() => setSelectedDate((d) => (d < today ? addDaysIST(d, 1) : d))}
            canNext={selectedDate < today}
            latestLabel="आज · Today"
            atLatest={selectedDate === today}
            onLatest={() => setSelectedDate(today)}
            datePicker={{ label: "तारीख़", value: selectedDate, max: today, onChange: setSelectedDate }}
          />
        }
        note={<span className="tabular">{fmtDateStrFull(selectedDate)}</span>}
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
            <Card>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <h3 className="text-base font-semibold text-ink">Why this score · यह स्कोर क्यों</h3>
                  <p lang="hi" className="mt-1 text-xs text-ink-muted">
                    यह स्कोर बताता है कि कितना रिकॉर्ड नियमित दर्ज हुआ। यह स्वास्थ्य का निदान नहीं है।
                  </p>
                </div>
                {category ? (
                  <Badge variant={category.badgeTone} className="self-start">
                    <span lang="hi">{score.categoryHi}</span>
                  </Badge>
                ) : null}
              </div>

              {score.alerts.length > 0 ? (
                <ul className="mt-4 space-y-2">
                  {score.alerts.map((a) => (
                    <li
                      key={a.messageHi}
                      lang="hi"
                      className={cn(
                        "flex items-start gap-2 rounded-control border px-3 py-2 text-xs text-ink",
                        ALERT_TONE[a.severity] === "critical"
                          ? "border-critical-line bg-critical-soft"
                          : "border-attention-line bg-attention-soft",
                      )}
                    >
                      <ShieldAlert
                        aria-hidden
                        className={cn("mt-0.5 h-3.5 w-3.5 shrink-0", ALERT_TONE[a.severity] === "critical" ? "text-critical" : "text-attention")}
                      />
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

          <ChartCard title="Score breakdown" hindiTitle="स्कोर का ब्योरा" description="हर हिस्से में कितने अंक मिले, और क्यों">
            <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {COMPONENTS.map(({ key, title, hindi, icon: Icon, tone }) => {
                const c = score.components[key];
                const pct = c.isScored && c.maxScore > 0 ? Math.round((c.score / c.maxScore) * 100) : 0;
                return (
                  <li key={key} className="tile rounded-card p-3.5">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex min-w-0 items-center gap-2">
                        <span className={cn("grid h-8 w-8 shrink-0 place-items-center rounded-field", metricChipClasses[tone])}>
                          <Icon aria-hidden className="h-4 w-4" />
                        </span>
                        <h4 className="truncate text-sm font-semibold text-ink">
                          {title}
                          <span lang="hi" className="ml-1.5 text-xs font-normal text-ink-muted">
                            {hindi}
                          </span>
                        </h4>
                      </div>
                      <span className="tabular shrink-0 text-sm font-semibold text-ink">{c.isScored ? `${c.score}/${c.maxScore}` : "—"}</span>
                    </div>
                    <Meter value={pct} label={`${title} ${hindi}`} className="mt-2.5" />
                    <p lang="hi" className="mt-2 text-xs text-ink-muted">
                      {c.isScored ? c.detailsHi : c.detailsHi || "आज इसकी बारी अभी नहीं आई, इसलिए गिना नहीं गया।"}
                    </p>
                    {key === "food" && score.nutritionContext ? (
                      <p className="tabular mt-1 text-xs font-medium text-ink-muted">
                        {nf.format(score.nutritionContext.caloriesConsumed)} / {nf.format(score.nutritionContext.calorieTarget)} kcal
                      </p>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          </ChartCard>

          {meals.length > 0 ? (
            <ChartCard
              icon={Utensils}
              tone="food"
              title="Meals logged"
              hindiTitle="दर्ज भोजन"
              description={`${data.foods.length} चीज़ें · कुल ${nf.format(Math.round(totalKcal))} kcal`}
            >
              <div className="space-y-4">
                {meals.map((m) => (
                  <section key={m.meal} aria-label={m.meal}>
                    <div className="flex items-baseline justify-between gap-3 border-b border-line pb-1.5">
                      <h4 className="text-sm font-semibold text-ink">{m.meal}</h4>
                      <span className="tabular text-xs font-semibold text-ink-muted">{nf.format(Math.round(m.kcal))} kcal</span>
                    </div>
                    <ul className="divide-y divide-line">
                      {m.items.map((food) => (
                        <li key={food.id} className="flex items-center justify-between gap-3 py-2 text-xs">
                          <div className="min-w-0">
                            <p className="truncate font-medium text-ink">{food.food_name}</p>
                            <p className="tabular text-ink-muted">
                              {food.quantity} {food.unit} · {fmtTime(food.consumed_at)}
                            </p>
                          </div>
                          <div className="tabular shrink-0 text-right">
                            <p className="font-semibold text-ink">{food.calories} kcal</p>
                            {food.protein_g > 0 ? <p className="text-ink-muted">{food.protein_g}g protein</p> : null}
                          </div>
                        </li>
                      ))}
                    </ul>
                  </section>
                ))}
              </div>
            </ChartCard>
          ) : null}

          <ReportDisclaimer>यह रिपोर्ट सिर्फ़ रिकॉर्ड की निरंतरता दिखाती है। यह डॉक्टर की सलाह या निदान का विकल्प नहीं है।</ReportDisclaimer>
        </>
      )}
    </div>
  );
}
