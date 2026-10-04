"use client";

import { HeartPulse, Pill, Sparkles, UserCheck, Utensils } from "lucide-react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card, CardTitle } from "@/components/ui/card";
import { ErrorState } from "@/components/ui/page";
import { BPChip } from "@/components/health/bp-chip";
import { fmtTime } from "@/components/health/format";
import { loadErrorMessage, useAsyncData } from "@/components/health/use-async-data";
import { useMedicineMarking } from "@/hooks/use-medicine-marking";
import { DOSE_STATE_LABEL } from "@/lib/medicine-format";
import { todayIST } from "@/lib/health-rules";
import type { MemberRole } from "@/lib/supabase/database.types";
import { getDashboardOverview, type BPLogEntry } from "@/services/patient-service";
import { getBPThresholds } from "@/services/settings-service";
import { detectHealthAnomaliesAndTrends } from "@/services/anomaly-detection-service";
import { getHealthChanges } from "@/services/what-changed-service";

const ROLE_LABEL: Record<MemberRole, string> = {
  owner: "मालिक (Owner)",
  editor: "संपादक (Editor)",
  viewer: "सिर्फ़ देखने वाले (Viewer)",
};

function BPRow({ label, log, thresholds }: { label: string; log: BPLogEntry | null; thresholds: Awaited<ReturnType<typeof getBPThresholds>> }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-ink-muted">{label}</span>
      {log ? (
        <span className="flex flex-wrap items-center justify-end gap-1.5">
          <span className="tabular font-semibold text-ink">
            {log.systolic}/{log.diastolic} mmHg
          </span>
          <BPChip systolic={log.systolic} diastolic={log.diastolic} thresholds={thresholds} />
        </span>
      ) : (
        <span className="text-ink-subtle">आज दर्ज नहीं</span>
      )}
    </div>
  );
}

/**
 * Patient banner and today's status cards. Medicine state comes from the shared
 * marking hook (the same one the dashboard uses), so "taken" means the same
 * thing on every screen; nothing is derived here.
 */
export function CaregiverTodayStatus({
  patientId,
  patientName,
  memberRole,
}: {
  patientId: string;
  patientName: string;
  memberRole: MemberRole | null;
}) {
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
      <div aria-busy="true" aria-label="लोड हो रहा है" className="space-y-4">
        <div className="skeleton h-24 rounded-card" />
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
    <div className="space-y-4">
      <Card tone="raised">
        <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
          <div className="flex min-w-0 items-center gap-3">
            <span className="grid h-12 w-12 shrink-0 place-items-center rounded-control bg-brand-soft text-brand-ink">
              <UserCheck aria-hidden className="h-6 w-6" />
            </span>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="truncate text-base font-semibold text-ink sm:text-lg">{patientName}</h2>
                {memberRole ? <Badge variant={memberRole === "viewer" ? "neutral" : "brand"}>{ROLE_LABEL[memberRole]}</Badge> : null}
              </div>
              <p className="mt-0.5 text-xs text-ink-muted">
                {patient.age ? `${patient.age} साल` : "उम्र दर्ज नहीं"}
                {patient.gender ? ` · ${patient.gender}` : ""}
                {patient.target_weight_kg ? ` · लक्ष्य वजन ${patient.target_weight_kg} kg` : ""}
              </p>
            </div>
          </div>
        </div>
      </Card>

      <div className="grid gap-4 text-xs sm:grid-cols-2 lg:grid-cols-3">
        <Card className="space-y-2">
          <div className="flex items-center justify-between gap-2 border-b border-line pb-2">
            <span className="flex items-center gap-1.5 text-sm font-semibold text-ink">
              <Pill aria-hidden className="h-4 w-4 text-meds" />
              दवाइयाँ (Medicines)
            </span>
            {summary.total > 0 ? (
              <Badge variant={summary.done === summary.total ? "positive" : "neutral"}>
                {summary.done}/{summary.total} ली गईं
              </Badge>
            ) : null}
          </div>
          {dosesLoading ? (
            <div aria-busy="true" className="skeleton h-16 rounded-field" />
          ) : doses.length === 0 ? (
            <p lang="hi" className="text-ink-subtle">
              कोई चालू दवाई नहीं है।
            </p>
          ) : (
            <ul className="space-y-1.5">
              {doses.map((d) => (
                <li key={d.medicine.id} className="flex items-center justify-between gap-2">
                  <span className="min-w-0 text-ink-muted">
                    {d.medicine.medicine_name} <span className="text-ink-subtle">({d.medicine.dose}, {fmtTime(d.scheduledAt)})</span>
                  </span>
                  <span
                    lang="hi"
                    className={
                      d.state === "taken" || d.state === "late"
                        ? "shrink-0 font-semibold text-positive"
                        : d.state === "missed"
                          ? "shrink-0 font-semibold text-critical"
                          : "shrink-0 font-semibold text-ink-subtle"
                    }
                  >
                    {DOSE_STATE_LABEL[d.state].hi}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card className="space-y-2">
          <div className="flex items-center justify-between gap-2 border-b border-line pb-2">
            <span className="flex items-center gap-1.5 text-sm font-semibold text-ink">
              <HeartPulse aria-hidden className="h-4 w-4 text-bp" />
              रक्तचाप (Blood pressure)
            </span>
            <Badge variant="neutral">आज</Badge>
          </div>
          <div className="space-y-2">
            <BPRow label="सुबह" log={overview.todayMorningBP} thresholds={thresholds} />
            <BPRow label="शाम" log={overview.todayEveningBP} thresholds={thresholds} />
          </div>
        </Card>

        <Card className="space-y-2">
          <div className="flex items-center justify-between gap-2 border-b border-line pb-2">
            <span className="flex items-center gap-1.5 text-sm font-semibold text-ink">
              <Utensils aria-hidden className="h-4 w-4 text-food" />
              भोजन और कैलोरी
            </span>
            <Badge variant="neutral">लक्ष्य {patient.daily_calorie_target} kcal</Badge>
          </div>
          {overview.todayFoodCount > 0 && overview.todayFoodCalories !== null ? (
            <p className="text-ink-muted">
              <span className="tabular text-base font-semibold text-ink">{Math.round(overview.todayFoodCalories)} kcal</span>{" "}
              <span lang="hi">आज दर्ज ({overview.todayFoodCount} चीज़ें)</span>
            </p>
          ) : (
            <p lang="hi" className="text-ink-subtle">
              आज अभी कोई भोजन दर्ज नहीं हुआ।
            </p>
          )}
          <Link href="/food" className="inline-block font-semibold text-brand-ink underline underline-offset-2">
            भोजन पेज खोलें
          </Link>
        </Card>
      </div>
    </div>
  );
}

/** "What changed" for the patient. Honest about missing reference data. */
export function CaregiverWhatChanged({ patientId, patientName }: { patientId: string; patientName: string }) {
  const { data, error, loading, reload } = useAsyncData(() => getHealthChanges(patientId, "7d"), [patientId]);

  return (
    <Card>
      <div className="mb-2.5 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <span className="grid h-7 w-7 place-items-center rounded-control border border-gold-line bg-gold-soft text-gold-ink">
            <Sparkles aria-hidden className="h-4 w-4" />
          </span>
          <CardTitle className="text-sm sm:text-base">
            {patientName} में क्या बदला?
            <span className="ml-2 text-xs font-normal text-ink-subtle">What changed · 7 दिन</span>
          </CardTitle>
        </div>
        <Link href="/insights/changes" className="text-xs font-semibold text-brand-ink underline underline-offset-2">
          विस्तृत विश्लेषण देखें
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
        <p lang="hi" className="rounded-card border border-line bg-surface-sunken p-3 text-sm leading-relaxed text-ink-muted">
          {data.caregiverSummaryHi}
        </p>
      ) : (
        <p lang="hi" className="rounded-card border border-dashed border-line-strong bg-surface-sunken p-3 text-sm text-ink-muted">
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
    <Card>
      <div className="mb-3 flex items-center gap-2">
        <Sparkles aria-hidden className="h-4 w-4 text-brand" />
        <CardTitle className="text-sm">
          हफ़्ते का पैटर्न
          <span className="ml-2 text-xs font-normal text-ink-subtle">Weekly pattern</span>
        </CardTitle>
      </div>
      <ul className="space-y-2 text-xs text-ink-muted">
        {bullets.map((b) => (
          <li key={b.hi} lang="hi" className="flex items-start gap-2">
            <span aria-hidden className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-brand" />
            <span>{b.hi}</span>
          </li>
        ))}
      </ul>
    </Card>
  );
}
