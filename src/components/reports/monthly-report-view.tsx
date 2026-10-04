"use client";

import { Activity, Footprints, HeartPulse, Moon, Pill, Scale, Utensils, type LucideIcon } from "lucide-react";
import { Card, CardDescription, CardHeader, CardTitle, metricChipClasses, type MetricTone } from "@/components/ui/card";
import { ErrorState } from "@/components/ui/page";
import { ProgressBar } from "@/components/ui/progress-bar";
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
import { getMonthlyReportData } from "@/services/reports-analytics-service";

type MonthlyReportViewProps = {
  patientId: string;
};

const nf = new Intl.NumberFormat("en-IN");

export function MonthlyReportView({ patientId }: MonthlyReportViewProps) {
  const { data, error, loading, reload } = useAsyncData(() => getMonthlyReportData(patientId), [patientId]);

  if (error) {
    return (
      <ErrorState
        title="मासिक रिपोर्ट लोड नहीं हो पाई"
        englishTitle="The monthly report could not be loaded"
        description={loadErrorMessage(error)}
        onRetry={reload}
      />
    );
  }
  if (loading || !data) return <ReportSkeleton blocks={3} />;

  const items: Array<{ label: string; hindi: string; value: number | null; icon: LucideIcon; tone: MetricTone }> = [
    {
      label: "Medicine adherence",
      hindi: "दवाइयाँ (समय पर + देर से)",
      value: data.hasMedicineData ? data.medicineAdherencePercent : null,
      icon: Pill,
      tone: "meds",
    },
    { label: "Food logged", hindi: "भोजन दर्ज", value: data.foodLoggingPercent, icon: Utensils, tone: "food" },
    { label: "Steps logged", hindi: "कदम दर्ज", value: data.activityConsistencyPercent, icon: Footprints, tone: "activity" },
    { label: "Sleep logged", hindi: "नींद दर्ज", value: data.sleepLoggingPercent, icon: Moon, tone: "sleep" },
    { label: "BP logged", hindi: "रक्तचाप दर्ज", value: data.bpLoggingPercent, icon: HeartPulse, tone: "bp" },
    { label: "Weight logged", hindi: "वजन दर्ज", value: data.weightLoggingPercent, icon: Scale, tone: "weight" },
  ];

  return (
    <div className="space-y-5">
      <ReportHero
        title="Monthly report"
        hindiTitle="मासिक रिपोर्ट (पिछले 30 दिन)"
        period={<span className="font-medium text-ink-muted">{data.monthLabel}</span>}
        scoreLabel="30-day average"
        score={data.daysTrackedCount > 0 ? data.averageScore : null}
        controls={<CoverageLine tracked={data.daysTrackedCount} total={data.totalDays} />}
      />

      {!data.hasSufficientData ? <NotEnoughData days={7} label="मासिक विश्लेषण" /> : null}

      <Card>
        <CardHeader>
          <div className="min-w-0">
            <CardTitle className="flex items-center gap-2 text-sm">
              <Activity aria-hidden className="h-4 w-4 text-brand" />
              30-day habit breakdown · 30 दिन की नियमितता
            </CardTitle>
            <CardDescription>
              हर चीज़ कितने प्रतिशत दिनों में दर्ज हुई (दवाइयों में: जितनी खुराक तय थीं, उनमें से कितनी ली गईं)
            </CardDescription>
          </div>
        </CardHeader>

        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((item) => {
            const Icon = item.icon;
            return (
              <li key={item.label} className="space-y-2 rounded-card border border-line bg-surface-sunken p-3.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="flex min-w-0 items-center gap-2 text-xs font-medium text-ink-muted">
                    <span className={cn("grid h-7 w-7 shrink-0 place-items-center rounded-field", metricChipClasses[item.tone])}>
                      <Icon aria-hidden className="h-3.5 w-3.5" />
                    </span>
                    <span className="min-w-0">
                      {item.label}
                      <span lang="hi" className="block text-2xs text-ink-subtle">
                        {item.hindi}
                      </span>
                    </span>
                  </span>
                  <span className="tabular text-sm font-semibold text-ink">{item.value === null ? "—" : `${item.value}%`}</span>
                </div>
                {item.value === null ? (
                  <p lang="hi" className="text-2xs text-ink-subtle">
                    इस दौरान कोई खुराक तय नहीं थी
                  </p>
                ) : (
                  <ProgressBar value={item.value} max={100} label={`${item.label} — ${item.hindi}`} />
                )}
              </li>
            );
          })}
        </ul>
      </Card>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <MetricCard label="Active days" hindiLabel="जिन दिनों कुछ दर्ज हुआ" value={`${data.daysTrackedCount}/${data.totalDays}`} />
        <MetricCard label="BP readings" hindiLabel="रक्तचाप के माप" tone="bp" icon={HeartPulse} value={data.totalBpReadings} />
        <MetricCard
          label="Avg steps"
          hindiLabel="रोज़ औसत कदम"
          tone="activity"
          icon={Footprints}
          value={data.averageSteps ? nf.format(data.averageSteps) : null}
        />
        <MetricCard
          label="Weight change"
          hindiLabel="महीने का बदलाव"
          tone="weight"
          icon={Scale}
          value={data.weightChangeKg !== null ? `${data.weightChangeKg > 0 ? "+" : ""}${data.weightChangeKg} kg` : null}
          helper={data.weightChangeKg === null ? "बदलाव निकालने के लिए 2 तौल चाहिए" : undefined}
        />
      </div>

      <InsightList title="Monthly observations" hindiTitle="महीने की बातें" items={data.personalizedInsights} />

      <ReportDisclaimer>यह विश्लेषण सिर्फ़ रिकॉर्ड की नियमितता की समीक्षा है। यह चिकित्सीय सलाह नहीं है।</ReportDisclaimer>
    </div>
  );
}
