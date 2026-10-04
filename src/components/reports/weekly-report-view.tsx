"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { Activity, Footprints, HeartPulse, Moon, Pill, Scale, Sparkles, Utensils } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ErrorState } from "@/components/ui/page";
import { loadErrorMessage, useAsyncData } from "@/components/health/use-async-data";
import {
  CoverageLine,
  InsightList,
  MetricCard,
  NotEnoughData,
  ReportDisclaimer,
  ReportHero,
  ReportSkeleton,
} from "@/components/reports/report-parts";
import { cn } from "@/lib/utils";
import { getWeeklyReportData, type DayScorePoint } from "@/services/reports-analytics-service";

const WeeklyScoreChart = dynamic(() => import("@/components/reports/weekly-score-chart").then((m) => m.WeeklyScoreChart), {
  ssr: false,
  loading: () => <div aria-hidden className="skeleton h-56 w-full rounded-card" />,
});

type WeeklyReportViewProps = {
  patientId: string;
};

const nf = new Intl.NumberFormat("en-IN");

const PARTS = [
  { key: "medicine", label: "Medicine" },
  { key: "food", label: "Food" },
  { key: "activity", label: "Steps" },
  { key: "sleep", label: "Sleep" },
  { key: "bp", label: "BP" },
  { key: "weight", label: "Weight" },
] as const;

export function WeeklyReportView({ patientId }: WeeklyReportViewProps) {
  const { data, error, loading, reload } = useAsyncData(() => getWeeklyReportData(patientId), [patientId]);
  // null = "the latest day", resolved below, so no effect is needed to preselect it.
  const [pickedDate, setPickedDate] = useState<string | null>(null);

  if (error) {
    return (
      <ErrorState
        title="साप्ताहिक रिपोर्ट लोड नहीं हो पाई"
        englishTitle="The weekly report could not be loaded"
        description={loadErrorMessage(error)}
        onRetry={reload}
      />
    );
  }
  if (loading || !data) return <ReportSkeleton blocks={3} />;

  const days: DayScorePoint[] = data.dailyScores;
  const selected = days.find((d) => d.date === pickedDate) ?? days[days.length - 1] ?? null;
  const bars = days.map((d) => ({
    date: d.date,
    dayLabel: d.dayLabel,
    score: d.hasLogs ? d.score : null,
    category: d.category,
  }));

  return (
    <div className="space-y-5">
      <ReportHero
        title="Weekly report"
        hindiTitle="साप्ताहिक रिपोर्ट"
        period={<span className="font-medium text-ink-muted">{data.weekRangeLabel}</span>}
        scoreLabel="Weekly average"
        score={data.daysTrackedCount > 0 ? data.averageScore : null}
        controls={<CoverageLine tracked={data.daysTrackedCount} total={data.totalDays} />}
      />

      {!data.hasSufficientData ? <NotEnoughData days={3} label="साप्ताहिक विश्लेषण" /> : null}

      <Card>
        <CardHeader>
          <div className="min-w-0">
            <CardTitle className="flex items-center gap-2 text-sm">
              <Sparkles aria-hidden className="h-4 w-4 text-brand" />
              Daily tracking score · दिन-प्रतिदिन स्कोर
            </CardTitle>
            <CardDescription>किसी दिन का ब्योरा देखने के लिए बार या नीचे दिए दिन पर टैप करें</CardDescription>
          </div>
          {selected ? (
            <Badge variant="neutral">
              {selected.dayLabel}: {selected.hasLogs ? `${selected.score}/100` : "कोई रिकॉर्ड नहीं"}
            </Badge>
          ) : null}
        </CardHeader>

        <WeeklyScoreChart days={bars} selectedDate={selected?.date ?? null} onSelect={setPickedDate} />

        {/* The keyboard / screen-reader way to pick a day, and the chart's text alternative. */}
        <ul className="mt-3 grid grid-cols-7 gap-1.5" aria-label="Days of the week — सप्ताह के दिन">
          {days.map((d) => {
            const active = selected?.date === d.date;
            return (
              <li key={d.date}>
                <button
                  type="button"
                  onClick={() => setPickedDate(d.date)}
                  aria-pressed={active}
                  className={cn(
                    "pressable flex min-h-control w-full cursor-pointer flex-col items-center justify-center rounded-field border px-0.5 text-center",
                    active ? "border-brand bg-brand-soft text-brand-ink" : "border-line bg-surface text-ink-muted",
                  )}
                >
                  <span className="text-2xs leading-tight">{d.dayLabel}</span>
                  <span className="tabular text-xs font-semibold">{d.hasLogs ? d.score : "—"}</span>
                </button>
              </li>
            );
          })}
        </ul>

        {selected?.scoreResult && selected.hasLogs ? (
          <div className="mt-4 rounded-control border border-line bg-surface-sunken p-3.5 text-xs">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <span className="font-semibold text-ink">{selected.dayLabel}</span>
              <span lang="hi" className="font-semibold text-ink-muted">
                {selected.score}/100 · {selected.categoryHi}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
              {PARTS.map(({ key, label }) => {
                const c = selected.scoreResult!.components[key];
                return (
                  <div key={key} className="rounded-field border border-line bg-surface p-2 text-center">
                    <span className="text-2xs text-ink-subtle">{label}</span>
                    <p className="tabular font-semibold text-ink">{c.isScored ? `${c.score}/${c.maxScore}` : "—"}</p>
                  </div>
                );
              })}
            </div>
          </div>
        ) : selected && !selected.hasLogs ? (
          <p lang="hi" className="mt-4 text-xs text-ink-subtle">
            {selected.dayLabel} को कुछ दर्ज नहीं हुआ।
          </p>
        ) : null}
      </Card>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <MetricCard
          icon={Pill}
          tone="meds"
          label="Medicine adherence"
          hindiLabel="खुराक अनुपालन (समय पर + देर से)"
          value={data.hasMedicineData ? `${data.medicineAdherencePercent}%` : null}
          helper={data.hasMedicineData ? undefined : "इस हफ़्ते कोई खुराक तय नहीं थी"}
        />
        <MetricCard
          icon={Utensils}
          tone="food"
          label="Avg calories"
          hindiLabel="रोज़ औसत कैलोरी"
          value={data.averageCalories ? `${Math.round(data.averageCalories)} kcal` : null}
          helper={data.averageCalories ? undefined : "भोजन दर्ज नहीं हुआ"}
        />
        <MetricCard
          icon={Footprints}
          tone="activity"
          label="Avg steps"
          hindiLabel="रोज़ औसत कदम"
          value={data.averageSteps ? nf.format(data.averageSteps) : null}
          helper={data.averageSteps ? undefined : "कदम दर्ज नहीं हुए"}
        />
        <MetricCard
          icon={Moon}
          tone="sleep"
          label="Avg sleep"
          hindiLabel="औसत नींद"
          value={data.averageSleepHours ? `${data.averageSleepHours} hrs` : null}
          helper={data.averageSleepHours ? undefined : "नींद दर्ज नहीं हुई"}
        />
        <MetricCard
          icon={HeartPulse}
          tone="bp"
          label="BP readings"
          hindiLabel="रक्तचाप के माप"
          value={data.bpReadingsCount}
        />
        <MetricCard
          icon={Scale}
          tone="weight"
          label="Weight change"
          hindiLabel="हफ़्ते में वजन का बदलाव"
          value={data.weightChangeKg !== null ? `${data.weightChangeKg > 0 ? "+" : ""}${data.weightChangeKg} kg` : null}
          helper={data.weightChangeKg === null ? "बदलाव निकालने के लिए 2 तौल चाहिए" : undefined}
        />
        <MetricCard
          icon={Sparkles}
          tone="brand"
          label="Best day"
          hindiLabel="सबसे अच्छा दिन"
          value={data.highestScore ? data.highestScore.score : null}
          helper={data.highestScore?.dayLabel}
        />
        <MetricCard
          icon={Activity}
          tone="neutral"
          label="Food logging"
          hindiLabel="भोजन दर्ज करने की नियमितता"
          value={`${data.foodLoggingConsistencyPercent}%`}
          helper="उन दिनों का हिस्सा जिनमें भोजन दर्ज हुआ"
        />
      </div>

      <InsightList
        title="This week's observations"
        hindiTitle="इस हफ़्ते की बातें"
        note="आपके इस हफ़्ते के रिकॉर्ड पर आधारित (निदान नहीं)"
        items={data.personalizedInsights}
      />

      <ReportDisclaimer>यह रिपोर्ट सिर्फ़ रिकॉर्ड की निरंतरता की समीक्षा है, इलाज का विकल्प नहीं।</ReportDisclaimer>
    </div>
  );
}
