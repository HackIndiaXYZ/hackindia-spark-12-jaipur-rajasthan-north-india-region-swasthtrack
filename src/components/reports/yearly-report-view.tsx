"use client";

import { useState } from "react";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, Select } from "@/components/ui/form-field";
import { ErrorState } from "@/components/ui/page";
import { loadErrorMessage, useAsyncData } from "@/components/health/use-async-data";
import { NotEnoughData, ReportDisclaimer, ReportHero, ReportSkeleton, InsightList } from "@/components/reports/report-parts";
import { todayIST } from "@/lib/health-rules";
import { getYearlyReportData, type YearlyMonthSummary } from "@/services/reports-analytics-service";

type YearlyReportViewProps = {
  patientId: string;
};

function cellsOf(m: YearlyMonthSummary) {
  const tracked = m.daysTracked > 0;
  return {
    score: tracked ? `${m.averageScore}/100` : "—",
    days: tracked ? `${m.daysTracked}` : "—",
    bp: m.bpReadingsCount > 0 ? `${m.bpReadingsCount}` : "—",
    weight: m.averageWeightKg ? `${m.averageWeightKg} kg` : "—",
    meds: tracked && m.hasMedicineData ? `${m.medicineAdherencePercent}%` : "—",
  };
}

export function YearlyReportView({ patientId }: YearlyReportViewProps) {
  const thisYear = Number(todayIST().slice(0, 4));
  const [year, setYear] = useState(thisYear);
  const { data, error, loading, reload } = useAsyncData(() => getYearlyReportData(patientId, year), [patientId, year]);

  const yearPicker = (
    <Field label="साल (Year)" className="max-w-40">
      <Select value={String(year)} onChange={(e) => setYear(Number(e.target.value))}>
        {[thisYear, thisYear - 1, thisYear - 2].map((y) => (
          <option key={y} value={y}>
            {y}
          </option>
        ))}
      </Select>
    </Field>
  );

  if (error) {
    return (
      <div className="space-y-4">
        {yearPicker}
        <ErrorState
          title="वार्षिक रिपोर्ट लोड नहीं हो पाई"
          englishTitle="The yearly report could not be loaded"
          description={loadErrorMessage(error)}
          onRetry={reload}
        />
      </div>
    );
  }
  if (loading || !data) {
    return (
      <div className="space-y-4">
        {yearPicker}
        <ReportSkeleton blocks={2} />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <ReportHero
        title={`Yearly report ${data.year}`}
        hindiTitle="वार्षिक रिपोर्ट"
        period={
          <span>
            जिन दिनों कुछ दर्ज हुआ: <span className="font-semibold text-ink-muted">{data.totalDaysTracked}</span>
          </span>
        }
        scoreLabel="Yearly average"
        score={data.totalDaysTracked > 0 ? data.averageScore : null}
        controls={yearPicker}
      />

      {!data.hasSufficientData ? <NotEnoughData days={1} label="वार्षिक तालिका" /> : null}

      <Card>
        <CardHeader>
          <div className="min-w-0">
            <CardTitle className="text-sm">Month by month · महीने के हिसाब से</CardTitle>
            <CardDescription>हर महीने दर्ज हुए मुख्य आँकड़े। “—” का मतलब उस महीने कुछ दर्ज नहीं हुआ।</CardDescription>
          </div>
        </CardHeader>

        {/* Phone: one card per month. Tablet and up: a real table with headers. */}
        <ul className="space-y-2 sm:hidden">
          {data.months.map((m) => {
            const c = cellsOf(m);
            return (
              <li key={m.monthNumber} className="rounded-card border border-line bg-surface-sunken p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-semibold text-ink">{m.monthName}</span>
                  <span className="tabular text-sm font-semibold text-ink">{c.score}</span>
                </div>
                <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
                  <dt className="text-ink-subtle">दर्ज दिन</dt>
                  <dd className="tabular text-right font-medium text-ink-muted">{c.days}</dd>
                  <dt className="text-ink-subtle">BP के माप</dt>
                  <dd className="tabular text-right font-medium text-ink-muted">{c.bp}</dd>
                  <dt className="text-ink-subtle">औसत वजन</dt>
                  <dd className="tabular text-right font-medium text-ink-muted">{c.weight}</dd>
                  <dt className="text-ink-subtle">दवा अनुपालन</dt>
                  <dd className="tabular text-right font-medium text-ink-muted">{c.meds}</dd>
                </dl>
              </li>
            );
          })}
        </ul>

        <div className="hidden overflow-x-auto sm:block">
          <table className="w-full text-left text-sm">
            <caption className="sr-only">Month by month tracking overview for {data.year}</caption>
            <thead>
              <tr className="border-b border-line text-xs font-semibold text-ink-subtle">
                <th scope="col" className="pb-3 pr-4">
                  माह (Month)
                </th>
                <th scope="col" className="px-4 pb-3 text-center">
                  Avg score
                </th>
                <th scope="col" className="px-4 pb-3 text-center">
                  Active days
                </th>
                <th scope="col" className="px-4 pb-3 text-center">
                  BP readings
                </th>
                <th scope="col" className="px-4 pb-3 text-center">
                  Avg weight
                </th>
                <th scope="col" className="pb-3 pl-4 text-center">
                  Medicine %
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {data.months.map((m) => {
                const c = cellsOf(m);
                return (
                  <tr key={m.monthNumber}>
                    <th scope="row" className="py-3 pr-4 font-semibold text-ink-muted">
                      {m.monthName}
                    </th>
                    <td className="tabular px-4 py-3 text-center font-semibold text-ink">{c.score}</td>
                    <td className="tabular px-4 py-3 text-center text-ink-muted">{c.days}</td>
                    <td className="tabular px-4 py-3 text-center text-ink-muted">{c.bp}</td>
                    <td className="tabular px-4 py-3 text-center text-ink-muted">{c.weight}</td>
                    <td className="tabular py-3 pl-4 text-center text-ink-muted">{c.meds}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      <InsightList title="Year observations" hindiTitle="साल की बातें" items={data.personalizedInsights} />

      <ReportDisclaimer>
        यह सालाना तालिका डॉक्टर के साथ समीक्षा में काम आ सकती है, पर यह सिर्फ़ दर्ज रिकॉर्ड का सार है; कोई निदान नहीं।
      </ReportDisclaimer>
    </div>
  );
}
