"use client";

import { useEffect, useState } from "react";
import { Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ErrorState } from "@/components/ui/page";
import { SkeletonCard } from "@/components/ui/skeleton-loaders";
import {
  getMonthlyReportData,
  type MonthlyReportSummary,
} from "@/services/reports-analytics-service";
import {
  getBloodPressureLogsByDateRange,
  getPatientProfile,
  type BPLogEntry,
  type PatientProfile,
} from "@/services/patient-service";
import {
  getHealthChanges,
  type HealthChangesResult,
} from "@/services/what-changed-service";

type Props = { patientId: string };

function Row({
  label,
  hindiLabel,
  value,
}: {
  label: string;
  hindiLabel: string;
  value: string;
}) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-line py-2 last:border-0">
      <span className="min-w-0 text-sm text-ink-muted">
        {label}
        <span lang="hi" className="ml-1.5 text-xs text-ink-subtle">
          {hindiLabel}
        </span>
      </span>
      <span className="tabular shrink-0 text-sm font-semibold text-ink">{value}</span>
    </div>
  );
}

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="break-inside-avoid">
      <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-ink-subtle">
        {title}
      </h3>
      {children}
    </section>
  );
}

/**
 * Doctor Visit summary (§33). Composes the existing monthly analytics, BP log
 * and "what changed" engines into one print-friendly page — it computes
 * nothing of its own, and it states no diagnosis.
 */
export function DoctorVisitReportView({ patientId }: Props) {
  const [monthly, setMonthly] = useState<MonthlyReportSummary | null>(null);
  const [profile, setProfile] = useState<PatientProfile | null>(null);
  const [bpLogs, setBpLogs] = useState<BPLogEntry[]>([]);
  const [changes, setChanges] = useState<HealthChangesResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;

    Promise.all([
      getMonthlyReportData(patientId),
      getPatientProfile(patientId),
      getHealthChanges(patientId, "30d").catch(() => null),
    ])
      .then(async ([m, p, c]) => {
        const bp = await getBloodPressureLogsByDateRange(
          patientId,
          m.startDate,
          m.endDate,
        ).catch(() => [] as BPLogEntry[]);

        if (!active) return;
        setMonthly(m);
        setProfile(p);
        setChanges(c);
        setBpLogs(bp);
        setFailed(false);
        setLoading(false);
      })
      .catch(() => {
        if (!active) return;
        setFailed(true);
        setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [patientId]);

  if (loading) return <SkeletonCard />;
  if (failed || !monthly || !profile) {
    return (
      <ErrorState
        title="डॉक्टर रिपोर्ट तैयार नहीं हो पाई"
        englishTitle="The doctor visit summary could not be prepared"
      />
    );
  }

  const systolics = bpLogs.map((b) => b.systolic).filter(Boolean);
  const diastolics = bpLogs.map((b) => b.diastolic).filter(Boolean);
  const avg = (xs: number[]) =>
    xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : null;

  const avgSys = avg(systolics);
  const avgDia = avg(diastolics);
  const dash = "—";

  const coverage = Math.round((monthly.daysTrackedCount / monthly.totalDays) * 100);

  return (
    <Card>
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-line pb-4">
        <div className="min-w-0">
          <h2 className="text-xl font-semibold tracking-tight text-ink">
            Doctor visit summary
          </h2>
          <p lang="hi" className="text-sm text-ink-muted">
            डॉक्टर को दिखाने योग्य सारांश
          </p>
          <p className="mt-2 text-sm text-ink-muted">
            <span className="font-medium text-ink">{profile.name}</span>
            {profile.age ? ` · ${profile.age} years` : ""}
            {profile.gender ? ` · ${profile.gender}` : ""}
          </p>
          <p className="tabular text-xs text-ink-subtle">
            Period: {monthly.startDate} to {monthly.endDate} ({monthly.monthLabel})
          </p>
        </div>
        <Button variant="secondary" onClick={() => window.print()} className="no-print">
          <Printer aria-hidden className="h-4 w-4" />
          Print
        </Button>
      </header>

      <div className="mt-4 grid gap-5 sm:grid-cols-2">
        <Block title="Blood pressure">
          <Row
            label="Average"
            hindiLabel="औसत"
            value={avgSys && avgDia ? `${avgSys}/${avgDia} mmHg` : dash}
          />
          <Row
            label="Readings recorded"
            hindiLabel="रीडिंग"
            value={`${bpLogs.length}`}
          />
          <Row
            label="Highest systolic"
            hindiLabel="अधिकतम"
            value={systolics.length ? `${Math.max(...systolics)} mmHg` : dash}
          />
        </Block>

        <Block title="Weight">
          <Row
            label="Start of period"
            hindiLabel="शुरुआत"
            value={monthly.startWeightKg ? `${monthly.startWeightKg} kg` : dash}
          />
          <Row
            label="End of period"
            hindiLabel="अंत"
            value={monthly.endWeightKg ? `${monthly.endWeightKg} kg` : dash}
          />
          <Row
            label="Change"
            hindiLabel="बदलाव"
            value={
              monthly.weightChangeKg === null
                ? dash
                : `${monthly.weightChangeKg > 0 ? "+" : ""}${monthly.weightChangeKg} kg`
            }
          />
        </Block>

        <Block title="Medicine adherence">
          <Row
            label="Doses recorded as taken"
            hindiLabel="दवा अनुपालन"
            value={`${monthly.medicineAdherencePercent}%`}
          />
          <Row
            label="Days with any record"
            hindiLabel="दर्ज दिन"
            value={`${monthly.daysTrackedCount} / ${monthly.totalDays}`}
          />
        </Block>

        <Block title="Activity & sleep">
          <Row
            label="Average steps / day"
            hindiLabel="औसत कदम"
            value={
              monthly.averageSteps === null
                ? dash
                : monthly.averageSteps.toLocaleString("en-IN")
            }
          />
          <Row
            label="Activity logging"
            hindiLabel="गतिविधि दर्ज"
            value={`${monthly.activityConsistencyPercent}%`}
          />
          <Row
            label="Sleep logging"
            hindiLabel="नींद दर्ज"
            value={`${monthly.sleepLoggingPercent}%`}
          />
        </Block>

        <Block title="Nutrition">
          <Row
            label="Average calories / day"
            hindiLabel="औसत कैलोरी"
            value={
              monthly.averageCalories === null
                ? dash
                : `${Math.round(monthly.averageCalories)} kcal`
            }
          />
          <Row
            label="Daily target"
            hindiLabel="लक्ष्य"
            value={
              profile.daily_calorie_target
                ? `${profile.daily_calorie_target} kcal`
                : dash
            }
          />
          <Row
            label="Meal logging"
            hindiLabel="भोजन दर्ज"
            value={`${monthly.foodLoggingPercent}%`}
          />
        </Block>

        <Block title="Notable changes">
          {changes && changes.rankedKeyChanges.length > 0 ? (
            <ul className="space-y-1.5 pt-1">
              {changes.rankedKeyChanges.slice(0, 4).map((change) => (
                <li key={change.metric} lang="hi" className="text-sm text-ink-muted">
                  • {change.explanationHi}
                </li>
              ))}
            </ul>
          ) : (
            <p className="pt-1 text-sm text-ink-subtle">
              No significant changes detected in this period.
            </p>
          )}
        </Block>
      </div>

      {/* Limitations. Required so a clinician can judge how much weight the
          numbers above deserve (§33). */}
      <section className="mt-5 rounded-card border border-attention-line bg-attention-soft p-4">
        <h3 className="text-sm font-semibold text-ink">
          Limitations of this summary
        </h3>
        <ul className="mt-1.5 space-y-1 text-sm text-ink-muted">
          <li>
            • All values are self-reported by the patient or a caregiver and are
            not clinically verified.
          </li>
          <li>
            • Records exist for {monthly.daysTrackedCount} of {monthly.totalDays}{" "}
            days in this period ({coverage}% coverage); averages omit untracked
            days.
          </li>
          <li>
            • Blood pressure is measured with a home device at variable times of
            day.
          </li>
          <li>
            • This document contains no diagnosis, interpretation, or treatment
            recommendation.
          </li>
        </ul>
      </section>
    </Card>
  );
}
