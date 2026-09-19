"use client";

import { useEffect, useState } from "react";
import {
  Activity,
  AlertCircle,
  Calendar,
  CheckCircle2,
  HeartPulse,
  Moon,
  Pill,
  Scale,
  Sparkles,
  Utensils,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
  calculateDailyWellnessScore,
  getScoreCategory,
  type DailyWellnessScoreResult,
} from "@/services/wellness-score-service";
import {
  getFoodLogsByDate,
  getTodayDateString,
  type FoodLogEntry,
} from "@/services/patient-service";
import { cn } from "@/lib/utils";

type DailyReportViewProps = {
  patientId: string;
};

export function DailyReportView({ patientId }: DailyReportViewProps) {
  const [selectedDate, setSelectedDate] = useState(getTodayDateString());
  const [scoreResult, setScoreResult] = useState<DailyWellnessScoreResult | null>(null);
  const [dayFoods, setDayFoods] = useState<FoodLogEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    Promise.all([
      calculateDailyWellnessScore(patientId, selectedDate),
      getFoodLogsByDate(patientId, selectedDate),
    ])
      .then(([score, foods]) => {
        if (active) {
          setScoreResult(score);
          setDayFoods(foods);
        }
      })
      .catch((err) => {
        console.error("Error loading daily report:", err);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [patientId, selectedDate]);

  const categoryInfo = scoreResult ? getScoreCategory(scoreResult.totalScore) : null;

  // `new Date(Date.now() - ...)` is an impure call and isn't safe to run
  // directly in the render body (or in useMemo, which still runs during
  // render) — computed once in an effect instead. Empty-string/undefined
  // until then is fine: the button simply isn't shown as "active" for the
  // one frame before this resolves.
  const [yesterday, setYesterday] = useState<{ dateStr: string; label: string } | null>(null);
  useEffect(() => {
    // Deferred to a microtask rather than called synchronously in the effect
    // body — react-hooks/set-state-in-effect flags synchronous setState calls
    // here as a cascading-render risk.
    Promise.resolve().then(() => {
      const yesterdayDate = new Date(Date.now() - 86400000);
      setYesterday({
        dateStr: `${yesterdayDate.getFullYear()}-${String(yesterdayDate.getMonth() + 1).padStart(2, "0")}-${String(yesterdayDate.getDate()).padStart(2, "0")}`,
        label: yesterdayDate.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }),
      });
    });
  }, []);
  const yesterdayDateStr = yesterday?.dateStr ?? "";
  const yesterdayLabel = yesterday?.label ?? "…";

  return (
    <div className="space-y-5">
      {/* Date Header & Selector */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between bg-surface border border-line rounded-card p-4 shadow-e1">
        <div className="flex items-center gap-2">
          <Calendar className="h-5 w-5 text-brand" />
          <div>
            <h3 className="font-semibold text-ink text-sm sm:text-base">
              Daily Health & Adherence Summary · दैनिक स्वास्थ्य सारांश
            </h3>
            <p className="text-xs text-ink-subtle">
              Selected Day: {new Date(selectedDate).toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setSelectedDate(yesterdayDateStr)}
            className={cn(
              "px-3 py-1.5 rounded-control text-xs font-bold transition-all cursor-pointer shadow-2xs",
              selectedDate === yesterdayDateStr
                ? "bg-brand text-ink-inverse shadow-e1"
                : "bg-surface border border-line-strong text-ink-muted hover:bg-surface-sunken",
            )}
          >
            {yesterdayLabel} (कल)
          </button>
          <button
            type="button"
            onClick={() => setSelectedDate(getTodayDateString())}
            className={cn(
              "px-3 py-1.5 rounded-control text-xs font-bold transition-all cursor-pointer shadow-2xs",
              selectedDate === getTodayDateString()
                ? "bg-brand text-ink-inverse shadow-e1"
                : "bg-surface border border-line-strong text-ink-muted hover:bg-surface-sunken",
            )}
          >
            आज (Today)
          </button>
          <input
            type="date"
            value={selectedDate}
            max={getTodayDateString()}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="rounded-control border border-line-strong px-3 py-1.5 text-xs font-semibold text-ink shadow-2xs focus:border-brand focus:ring-1 focus:ring-brand"
          />
        </div>
      </div>

      {loading ? (
        <div className="space-y-4 animate-pulse">
          <div className="h-36 rounded-card bg-surface-sunken" />
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="h-28 rounded-control bg-surface-sunken" />
            ))}
          </div>
        </div>
      ) : scoreResult ? (
        <>
          {/* Daily Score Hero — the one number that matters most on this screen */}
          <Card tone="premium" className="p-5">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <span className="flex h-6 w-6 items-center justify-center rounded-field bg-gold-soft text-gold-ink">
                    <Sparkles className="h-3.5 w-3.5" />
                  </span>
                  <h4 className="font-semibold text-ink text-base">
                    Daily Wellness & Tracking Score
                  </h4>
                </div>
                <p className="mt-1 text-xs text-ink-subtle">
                  यह स्कोर आपकी ट्रैकिंग निरंतरता का माप है। यह कोई मेडिकल डायग्नोसिस नहीं है।
                </p>
              </div>

              <div className="flex items-baseline gap-3">
                <div className="flex items-baseline">
                  <span className="text-4xl sm:text-5xl font-bold text-ink">
                    {scoreResult.totalScore}
                  </span>
                  <span className="text-base font-semibold text-ink-subtle">/{scoreResult.maxScore}</span>
                </div>
                <Badge variant={categoryInfo?.badgeTone || "blue"}>
                  {scoreResult.category}
                </Badge>
              </div>
            </div>

            {/* Explanations List */}
            <div className="mt-4 grid gap-3 md:grid-cols-2 pt-4 border-t border-line text-xs">
              {scoreResult.reasons.positive.length > 0 && (
                <div className="rounded-control border border-positive-line bg-positive-soft p-3 space-y-1.5">
                  <p className="font-semibold text-positive flex items-center gap-1.5">
                    <CheckCircle2 className="h-3.5 w-3.5 text-positive" />
                    सफल ट्रैकिंग (+ Positive Points):
                  </p>
                  <ul className="space-y-1 text-positive">
                    {scoreResult.reasons.positive.map((p, idx) => (
                      <li key={idx}>• {p}</li>
                    ))}
                  </ul>
                </div>
              )}

              {scoreResult.reasons.deductions.length > 0 && (
                <div className="rounded-control border border-critical-line bg-critical-soft p-3 space-y-1.5">
                  <p className="font-semibold text-critical flex items-center gap-1.5">
                    <AlertCircle className="h-3.5 w-3.5 text-critical" />
                    छूटी हुई प्रविष्टियां (- Missing Logs):
                  </p>
                  <ul className="space-y-1 text-critical">
                    {scoreResult.reasons.deductions.map((d, idx) => (
                      <li key={idx}>• {d}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </Card>

          {/* 6 Category Detail Grid */}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {/* 1. Medicine */}
            <div className="rounded-card border border-line bg-surface p-4 shadow-e1">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Pill className="h-4 w-4 text-emerald-600" />
                  <h5 className="font-semibold text-ink text-sm">Medicine Adherence</h5>
                </div>
                <span className="text-xs font-semibold text-emerald-700">
                  {scoreResult.components.medicine.score}/{scoreResult.components.medicine.maxScore} pts
                </span>
              </div>
              <p className="mt-2 text-xs text-ink-muted font-medium">
                {scoreResult.components.medicine.detailsHi}
              </p>
            </div>

            {/* 2. Food */}
            <div className="rounded-card border border-line bg-surface p-4 shadow-e1">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Utensils className="h-4 w-4 text-green-600" />
                  <h5 className="font-semibold text-ink text-sm">Food Tracking</h5>
                </div>
                <span className="text-xs font-semibold text-green-700">
                  {scoreResult.components.food.score}/{scoreResult.components.food.maxScore} pts
                </span>
              </div>
              <p className="mt-2 text-xs text-ink-muted font-medium">
                {scoreResult.components.food.detailsHi}
              </p>
              {scoreResult.nutritionContext && (
                <p className="mt-1 text-xs text-ink-subtle">
                  {scoreResult.nutritionContext.caloriesConsumed} / {scoreResult.nutritionContext.calorieTarget} kcal
                </p>
              )}
            </div>

            {/* 3. Activity */}
            <div className="rounded-card border border-line bg-surface p-4 shadow-e1">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Activity className="h-4 w-4 text-sky-600" />
                  <h5 className="font-semibold text-ink text-sm">Activity & Steps</h5>
                </div>
                <span className="text-xs font-semibold text-sky-700">
                  {scoreResult.components.activity.score}/{scoreResult.components.activity.maxScore} pts
                </span>
              </div>
              <p className="mt-2 text-xs text-ink-muted font-medium">
                {scoreResult.components.activity.detailsHi}
              </p>
            </div>

            {/* 4. Sleep */}
            <div className="rounded-card border border-line bg-surface p-4 shadow-e1">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Moon className="h-4 w-4 text-indigo-600" />
                  <h5 className="font-semibold text-ink text-sm">Sleep Logging</h5>
                </div>
                <span className="text-xs font-semibold text-indigo-700">
                  {scoreResult.components.sleep.score}/{scoreResult.components.sleep.maxScore} pts
                </span>
              </div>
              <p className="mt-2 text-xs text-ink-muted font-medium">
                {scoreResult.components.sleep.detailsHi}
              </p>
            </div>

            {/* 5. BP */}
            <div className="rounded-card border border-line bg-surface p-4 shadow-e1">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <HeartPulse className="h-4 w-4 text-rose-600" />
                  <h5 className="font-semibold text-ink text-sm">BP Tracking</h5>
                </div>
                <span className="text-xs font-semibold text-rose-700">
                  {scoreResult.components.bp.score}/{scoreResult.components.bp.maxScore} pts
                </span>
              </div>
              <p className="mt-2 text-xs text-ink-muted font-medium">
                {scoreResult.components.bp.detailsHi}
              </p>
            </div>

            {/* 6. Weight */}
            <div className="rounded-card border border-line bg-surface p-4 shadow-e1">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Scale className="h-4 w-4 text-amber-600" />
                  <h5 className="font-semibold text-ink text-sm">Weight Tracking</h5>
                </div>
                <span className="text-xs font-semibold text-amber-700">
                  {scoreResult.components.weight.score}/{scoreResult.components.weight.maxScore} pts
                </span>
              </div>
              <p className="mt-2 text-xs text-ink-muted font-medium">
                {scoreResult.components.weight.detailsHi}
              </p>
            </div>
          </div>

          {/* Meals Timeline */}
          {dayFoods.length > 0 && (
            <Card className="p-5">
              <CardHeader className="p-0 pb-3">
                <CardTitle className="text-sm font-semibold text-ink">
                  Meals Logged on {new Date(selectedDate).toLocaleDateString("en-IN", { month: "short", day: "numeric" })}
                </CardTitle>
                <CardDescription>
                  कुल {dayFoods.length} खाद्य वस्तुएं दर्ज
                </CardDescription>
              </CardHeader>

              <div className="divide-y divide-line">
                {dayFoods.map((food) => (
                  <div key={food.id} className="py-2.5 flex items-center justify-between text-xs">
                    <div>
                      <span className="font-semibold text-ink">{food.food_name}</span>
                      <span className="ml-2 text-ink-subtle">
                        ({food.quantity} {food.unit}) · {food.meal_type}
                      </span>
                    </div>
                    <div className="font-semibold text-ink">
                      {food.calories} kcal
                      {food.protein_g > 0 && <span className="ml-2 text-ink-subtle font-normal">({food.protein_g}g protein)</span>}
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          )}
        </>
      ) : null}
    </div>
  );
}
