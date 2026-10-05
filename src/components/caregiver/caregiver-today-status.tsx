"use client";

import { ArrowRight, HeartPulse, Pill, Sparkles, Utensils } from "lucide-react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card, CardTitle, metricChipClasses } from "@/components/ui/card";
import { ErrorState, Section } from "@/components/ui/page";
import { BPChip } from "@/components/health/bp-chip";
import { fmtTime } from "@/components/health/format";
import { loadErrorMessage, useAsyncData } from "@/components/health/use-async-data";
import { useMedicineMarking } from "@/hooks/use-medicine-marking";
import { DOSE_STATE_LABEL } from "@/lib/medicine-format";
import { todayIST } from "@/lib/health-rules";
import { getDashboardOverview, type BPLogEntry } from "@/services/patient-service";
import { getBPThresholds } from "@/services/settings-service";
import { detectHealthAnomaliesAndTrends } from "@/services/anomaly-detection-service";
import { getHealthChanges } from "@/services/what-changed-service";

function BPRow({ label, log, thresholds }: { label: string; log: BPLogEntry | null; thresholds: Awaited<ReturnType<typeof getBPThresholds>> }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span lang="hi" className="text-ink-muted">{label}</span>
      {log ? (
        <span className="flex flex-wrap items-center justify-end gap-1.5">
          <span className="tabular font-semibold text-ink">
            {log.systolic}/{log.diastolic} mmHg
          </span>
          <BPChip systolic={log.systolic} diastolic={log.diastolic} thresholds={thresholds} />
        </span>
      ) : (
        <span lang="hi" className="text-ink-muted">आज दर्ज नहीं</span>
      )}
    </div>
  );
}

/**
 * Patient banner and today's status cards. Medicine state comes from the shared
 * marking hook (the same one the dashboard uses), so "taken" means the same
 * thing on every screen; nothing is derived here.
 */
export function CaregiverTodayStatus({ patientId }: { patientId: string }) {
  const { data, error, loading, reload } = useAsyncData(
    async () => {
      const [overview, thresholds] = await Promise.all([getDashboardOverview(patientId), getBPThresholds(patientId)]);
      return { overview, thresholds };
    },
    [patientId],
  );
  const { doses, summary, loading: dosesLoading } = useMedicineMarking(patientId, todayIST());

  if (error) {
    return (
      <ErrorState
        title="आज की स्थिति लोड नहीं हो पाई"
        englishTitle="Today's status could not be loaded"
        description={loadErrorMessage(error)}
        onRetry={reload}
      />
    );
  }
  if (loading || !data) {
    return (
      <div aria-busy="true" aria-label="लोड हो रहा है" className="space-y-3">
        <div className="skeleton h-6 w-40" />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div className="skeleton h-32 rounded-card" />
          <div className="skeleton h-32 rounded-card" />
          <div className="skeleton h-32 rounded-card" />
        </div>
      </div>
    );
  }

  const { overview, thresholds } = data;
  const { patient } = overview;

  return (
    <Section title="Today at a glance" hindiTitle="आज की दवाइयाँ, BP और भोजन">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Card className="space-y-3">
          <div className="flex items-center justify-between gap-2 border-b border-gold-line pb-2.5">
            <span className="flex items-center gap-2 text-sm font-semibold text-ink">
              <span className={`grid h-7 w-7 place-items-center rounded-field ${metricChipClasses.meds}`}>
                <Pill aria-hidden className="h-4 w-4" />
              </span>
              <span lang="hi">दवाइयाँ</span> <span className="font-normal text-ink-muted">Medicines</span>
            </span>
            {summary.total > 0 ? (
              <Badge variant={summary.done === summary.total ? "positive" : "neutral"}>
                <span lang="hi">{summary.done}/{summary.total} ली गईं</span>
              </Badge>
            ) : null}
          </div>
          {dosesLoading ? (
            <div aria-busy="true" className="skeleton h-16 rounded-field" />
          ) : doses.length === 0 ? (
            <p lang="hi" className="text-sm text-ink-muted">
              कोई चालू दवाई नहीं है।
            </p>
          ) : (
            <ul className="space-y-2 text-sm">
              {doses.map((d) => (
                <li key={d.medicine.id} className="flex items-center justify-between gap-2">
                  <span className="min-w-0 text-ink">
                    {d.medicine.medicine_name} <span className="text-xs text-ink-muted">({d.medicine.dose}, {fmtTime(d.scheduledAt)})</span>
                  </span>
                  <span
                    lang="hi"
                    className={
                      d.state === "taken" || d.state === "late"
                        ? "shrink-0 text-xs font-semibold text-positive"
                        : d.state === "missed"
                          ? "shrink-0 text-xs font-semibold text-critical"
                          : "shrink-0 text-xs font-semibold text-ink-muted"
                    }
                  >
                    {DOSE_STATE_LABEL[d.state].hi}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card className="space-y-3">
          <div className="flex items-center justify-between gap-2 border-b border-gold-line pb-2.5">
            <span className="flex items-center gap-2 text-sm font-semibold text-ink">
              <span className={`grid h-7 w-7 place-items-center rounded-field ${metricChipClasses.bp}`}>
                <HeartPulse aria-hidden className="h-4 w-4" />
              </span>
              <span lang="hi">रक्तचाप</span> <span className="font-normal text-ink-muted">Blood pressure</span>
            </span>
            <Badge variant="neutral">
              <span lang="hi">आज</span>
            </Badge>
          </div>
          <div className="space-y-2.5 text-sm">
            <BPRow label="सुबह" log={overview.todayMorningBP} thresholds={thresholds} />
            <BPRow label="शाम" log={overview.todayEveningBP} thresholds={thresholds} />
          </div>
        </Card>

        <Card className="space-y-3">
          <div className="flex items-center justify-between gap-2 border-b border-gold-line pb-2.5">
            <span className="flex items-center gap-2 text-sm font-semibold text-ink">
              <span className={`grid h-7 w-7 place-items-center rounded-field ${metricChipClasses.food}`}>
                <Utensils aria-hidden className="h-4 w-4" />
              </span>
              <span lang="hi">भोजन और कैलोरी</span>
            </span>
            <Badge variant="neutral">
              <span lang="hi">लक्ष्य</span> {patient.daily_calorie_target} kcal
            </Badge>
          </div>
          {overview.todayFoodCount > 0 && overview.todayFoodCalories !== null ? (
            <p className="text-sm text-ink-muted">
              <span className="tabular text-xl font-semibold text-ink">{Math.round(overview.todayFoodCalories)} kcal</span>{" "}
              <span lang="hi">आज दर्ज ({overview.todayFoodCount} चीज़ें)</span>
            </p>
          ) : (
            <p lang="hi" className="text-sm text-ink-muted">
              आज अभी कोई भोजन दर्ज नहीं हुआ।
            </p>
          )}
          <Link href="/food" className="inline-flex min-h-8 items-center gap-1 text-sm font-semibold text-brand-ink underline underline-offset-2 pointer-coarse:min-h-control">
            <span lang="hi">भोजन पेज खोलें</span>
            <ArrowRight aria-hidden className="h-3.5 w-3.5" />
          </Link>
        </Card>
      </div>
    </Section>
  );
}

/** "What changed" for the patient. Honest about missing reference data. */
export function CaregiverWhatChanged({ patientId, patientName }: { patientId: string; patientName: string }) {
  const { data, error, loading, reload } = useAsyncData(() => getHealthChanges(patientId, "7d"), [patientId]);

  return (
    <Card className="space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-control border border-gold-line bg-surface text-gold-ink">
            <Sparkles aria-hidden className="h-4 w-4" />
          </span>
          <CardTitle className="text-sm sm:text-base">
            <span lang="hi">{patientName} में क्या बदला?</span>
            <span className="ml-2 text-xs font-normal text-ink-muted">What changed · 7 <span lang="hi">दिन</span></span>
          </CardTitle>
        </div>
        <Link href="/insights/changes" className="inline-flex min-h-8 items-center gap-1 text-sm font-semibold text-brand-ink underline underline-offset-2 pointer-coarse:min-h-control">
          <span lang="hi">विस्तृत विश्लेषण देखें</span>
          <ArrowRight aria-hidden className="h-3.5 w-3.5" />
        </Link>
      </div>

      {error ? (
        <ErrorState
          title="बदलाव लोड नहीं हो पाए"
          englishTitle="Could not load the changes"
          description={loadErrorMessage(error)}
          onRetry={reload}
        />
      ) : loading || !data ? (
        <div aria-busy="true" className="skeleton h-16 rounded-card" />
      ) : data.dataSufficiency.isSufficient ? (
        <p lang="hi" className="tile rounded-card p-3.5 text-sm leading-relaxed text-ink">
          {data.caregiverSummaryHi}
        </p>
      ) : (
        <p lang="hi" className="rounded-card border border-dashed border-line-strong bg-surface-sunken/70 p-3.5 text-sm text-ink-muted">
          {data.dataSufficiency.reasonHi ?? "तुलना के लिए अभी पर्याप्त डेटा नहीं है। कुछ दिन नियमित रिकॉर्ड करें।"}
        </p>
      )}
    </Card>
  );
}

/** Weekly pattern bullets from the anomaly engine; hidden when there are none. */
export function CaregiverPatterns({ patientId }: { patientId: string }) {
  const { data } = useAsyncData(() => detectHealthAnomaliesAndTrends(patientId), [patientId]);
  const bullets = data?.healthPatternBullets ?? [];
  if (bullets.length === 0) return null;

  return (
    <Card className="space-y-3">
      <div className="flex items-center gap-2.5">
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-control bg-brand-soft text-brand-ink">
          <Sparkles aria-hidden className="h-4 w-4" />
        </span>
        <CardTitle className="text-sm sm:text-base">
          <span lang="hi">हफ़्ते का पैटर्न</span>
          <span className="ml-2 text-xs font-normal text-ink-muted">Weekly pattern</span>
        </CardTitle>
      </div>
      <ul className="space-y-2 text-sm text-ink">
        {bullets.map((b) => (
          <li key={b.hi} lang="hi" className="flex items-start gap-2.5">
            <span aria-hidden className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-brand" />
            <span>{b.hi}</span>
          </li>
        ))}
      </ul>
    </Card>
  );
}
