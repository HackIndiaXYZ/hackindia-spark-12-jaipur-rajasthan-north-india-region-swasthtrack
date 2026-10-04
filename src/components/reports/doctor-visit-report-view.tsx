"use client";

import type { ReactNode } from "react";
import { Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ErrorState } from "@/components/ui/page";
import { fmtDateStrYear, fmtDay, fmtTime } from "@/components/health/format";
import { loadErrorMessage, useAsyncData } from "@/components/health/use-async-data";
import { ReportSkeleton } from "@/components/reports/report-parts";
import { classifyBP, istRangeBounds, mean, todayIST } from "@/lib/health-rules";
import { getBloodPressureLogsInRange, getPatientProfile } from "@/services/patient-service";
import { getMonthlyReportData } from "@/services/reports-analytics-service";
import { getPatientSettingsOrDefault } from "@/services/settings-service";
import { getHealthChanges } from "@/services/what-changed-service";

type Props = { patientId: string };

const DASH = "—";

function Row({ label, hindiLabel, value }: { label: string; hindiLabel: string; value: string }) {
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

function Block({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="break-inside-avoid">
      <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-ink-subtle">{title}</h3>
      {children}
    </section>
  );
}

/**
 * Doctor visit summary. Composes the monthly analytics, the BP log and the
 * "what changed" engine into one printable page. It computes nothing clinical
 * of its own and states no diagnosis. Printed on A4 the navigation, buttons and
 * footer are hidden (see the print rules in globals.css).
 */
export function DoctorVisitReportView({ patientId }: Props) {
  const { data, error, loading, reload } = useAsyncData(async () => {
    // The monthly report covers the last 30 IST days; asking for the same window
    // here lets every request start at once instead of waiting for it.
    const win = istRangeBounds(30);
    const [monthly, profile, settings, bpLogs, changes] = await Promise.all([
      getMonthlyReportData(patientId),
      getPatientProfile(patientId),
      getPatientSettingsOrDefault(patientId),
      getBloodPressureLogsInRange(patientId, win.startDate, win.endDate),
      getHealthChanges(patientId, "30d").catch(() => null),
    ]);
    return { monthly, profile, settings, bpLogs, changes };
  }, [patientId]);

  if (error) {
    return (
      <ErrorState
        title="डॉक्टर रिपोर्ट तैयार नहीं हो पाई"
        englishTitle="The doctor visit summary could not be prepared"
        description={loadErrorMessage(error)}
        onRetry={reload}
      />
    );
  }
  if (loading || !data) return <ReportSkeleton blocks={2} />;

  const { monthly, profile, settings, bpLogs, changes } = data;
  const t = settings.bp_targets;

  const sys = bpLogs.map((b) => b.systolic);
  const dia = bpLogs.map((b) => b.diastolic);
  const avgSys = mean(sys);
  const avgDia = mean(dia);
  const classes = bpLogs.map((b) => ({ log: b, c: classifyBP(b.systolic, b.diastolic, t) }));
  const aboveTarget = classes.filter((x) => x.c.aboveTarget).length;
  // Readings a clinician would want to look at: at or above the alert line, crisis range, or clearly low.
  const flagged = classes.filter((x) => x.c.exceedsAlert || x.c.category === "crisis" || x.c.category === "low");

  const coverage = monthly.totalDays > 0 ? Math.round((monthly.daysTrackedCount / monthly.totalDays) * 100) : 0;
  const generated = fmtDateStrYear(todayIST());

  return (
    <Card className="print:rounded-none print:border-0 print:p-0">
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-line pb-4">
        <div className="min-w-0">
          <p className="text-2xs font-semibold uppercase tracking-wider text-ink-subtle">SwasthTrack · health record summary</p>
          <h2 className="mt-0.5 text-xl font-semibold tracking-tight text-ink">Doctor visit summary</h2>
          <p lang="hi" className="text-sm text-ink-muted">
            डॉक्टर को दिखाने के लिए सारांश
          </p>
          <p className="mt-2 text-sm text-ink-muted">
            <span className="font-medium text-ink">{profile.name}</span>
            {profile.age ? ` · ${profile.age} years` : ""}
          </p>
          <p className="tabular text-xs text-ink-subtle">
            Period: {fmtDateStrYear(monthly.startDate)} to {fmtDateStrYear(monthly.endDate)} · Prepared {generated}
          </p>
        </div>
        <Button variant="secondary" onClick={() => window.print()} className="no-print print:hidden">
          <Printer aria-hidden className="h-4 w-4" />
          Print / Save PDF
        </Button>
      </header>

      <p className="mt-3 rounded-control border border-line bg-surface-sunken px-3 py-2 text-xs text-ink-muted">
        <span lang="hi">
          डेटा कवरेज: {monthly.totalDays} दिनों में से {monthly.daysTrackedCount} दिन कुछ दर्ज हुआ ({coverage}%)।
        </span>{" "}
        <span className="text-ink-subtle">
          Records exist for {monthly.daysTrackedCount} of {monthly.totalDays} days.
        </span>
      </p>

      <div className="mt-4 grid gap-5 sm:grid-cols-2">
        <Block title="Blood pressure">
          <Row
            label="Average"
            hindiLabel="औसत"
            value={avgSys !== null && avgDia !== null ? `${Math.round(avgSys)}/${Math.round(avgDia)} mmHg` : DASH}
          />
          <Row label="Readings recorded" hindiLabel="रीडिंग" value={`${bpLogs.length}`} />
          <Row
            label="Highest reading"
            hindiLabel="सबसे ऊँची"
            value={
              bpLogs.length
                ? (() => {
                    const top = bpLogs.reduce((a, b) => (b.systolic > a.systolic ? b : a));
                    return `${top.systolic}/${top.diastolic} mmHg`;
                  })()
                : DASH
            }
          />
          <Row
            label={`At/above target (${t.target_systolic}/${t.target_diastolic})`}
            hindiLabel="लक्ष्य से ऊपर"
            value={bpLogs.length ? `${aboveTarget} of ${bpLogs.length}` : DASH}
          />
        </Block>

        <Block title="Weight">
          <Row label="Start of period" hindiLabel="शुरुआत" value={monthly.startWeightKg ? `${monthly.startWeightKg} kg` : DASH} />
          <Row label="End of period" hindiLabel="अंत" value={monthly.endWeightKg ? `${monthly.endWeightKg} kg` : DASH} />
          <Row
            label="Change"
            hindiLabel="बदलाव"
            value={monthly.weightChangeKg === null ? DASH : `${monthly.weightChangeKg > 0 ? "+" : ""}${monthly.weightChangeKg} kg`}
          />
        </Block>

        <Block title="Medicine adherence">
          <Row
            label="Doses taken (on time or late)"
            hindiLabel="ली गई खुराकें"
            value={monthly.hasMedicineData ? `${monthly.medicineAdherencePercent}%` : DASH}
          />
          {!monthly.hasMedicineData ? (
            <p className="pt-1 text-xs text-ink-subtle">No medicine doses were scheduled in this period.</p>
          ) : null}
        </Block>

        <Block title="Activity & sleep">
          <Row
            label="Average steps / day"
            hindiLabel="औसत कदम"
            value={monthly.averageSteps === null ? DASH : monthly.averageSteps.toLocaleString("en-IN")}
          />
          <Row label="Days steps logged" hindiLabel="कदम दर्ज" value={`${monthly.activityConsistencyPercent}%`} />
          <Row label="Days sleep logged" hindiLabel="नींद दर्ज" value={`${monthly.sleepLoggingPercent}%`} />
        </Block>

        <Block title="Nutrition">
          <Row
            label="Average calories / day"
            hindiLabel="औसत कैलोरी"
            value={monthly.averageCalories === null ? DASH : `${Math.round(monthly.averageCalories)} kcal`}
          />
          <Row label="Daily target" hindiLabel="लक्ष्य" value={settings.daily_calorie_target ? `${settings.daily_calorie_target} kcal` : DASH} />
          <Row label="Days meals logged" hindiLabel="भोजन दर्ज" value={`${monthly.foodLoggingPercent}%`} />
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
            <p className="pt-1 text-sm text-ink-subtle">No significant changes detected in this period.</p>
          )}
        </Block>
      </div>

      <section className="mt-5 break-inside-avoid">
        <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-ink-subtle">
          Flagged BP readings (at/above alert {t.alert_systolic}/{t.alert_diastolic}, crisis range, or low)
        </h3>
        {flagged.length === 0 ? (
          <p className="text-sm text-ink-subtle">
            {bpLogs.length === 0 ? "No BP readings recorded in this period." : "No readings were flagged in this period."}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-line text-xs font-semibold text-ink-subtle">
                  <th scope="col" className="pb-2 pr-3">
                    Date &amp; time
                  </th>
                  <th scope="col" className="pb-2 pr-3">
                    Reading
                  </th>
                  <th scope="col" className="pb-2">
                    Classification
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {flagged.slice(-15).map(({ log, c }) => (
                  <tr key={log.id}>
                    <td className="tabular py-1.5 pr-3 text-ink-muted">
                      {fmtDay(log.measured_at)}, {fmtTime(log.measured_at)}
                    </td>
                    <td className="tabular py-1.5 pr-3 font-semibold text-ink">
                      {log.systolic}/{log.diastolic}
                      {log.pulse ? <span className="ml-1 text-xs font-normal text-ink-subtle">· pulse {log.pulse}</span> : null}
                    </td>
                    <td className="py-1.5 text-ink-muted">{c.labelEn}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {flagged.length > 15 ? (
              <p className="mt-1 text-xs text-ink-subtle">Showing the latest 15 of {flagged.length} flagged readings.</p>
            ) : null}
          </div>
        )}
      </section>

      {/* Limitations: lets a clinician judge how much weight the numbers deserve. */}
      <section className="mt-5 break-inside-avoid rounded-card border border-attention-line bg-attention-soft p-4">
        <h3 className="text-sm font-semibold text-ink">Limitations of this summary</h3>
        <ul className="mt-1.5 space-y-1 text-sm text-ink-muted">
          <li>• All values are self-reported by the patient or a caregiver and are not clinically verified.</li>
          <li>
            • Records exist for {monthly.daysTrackedCount} of {monthly.totalDays} days in this period ({coverage}% coverage);
            averages omit untracked days.
          </li>
          <li>• Blood pressure is measured with a home device at variable times of day.</li>
          <li>• This document contains no diagnosis, interpretation, or treatment recommendation.</li>
        </ul>
      </section>
    </Card>
  );
}
