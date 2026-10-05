"use client";

import { useState } from "react";
import { CheckCheck, Clock, Pill, Plus, RotateCcw, Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { EmptyState, ErrorState } from "@/components/ui/page";
import { DayStepper } from "@/components/food/day-stepper";
import { VitalTag } from "@/components/dashboard/vital-tag";
import { ManageMedicinesDialog } from "@/components/forms/manage-medicines-dialog";
import { DoseActions, DoseRecordedAt, DoseStatusChip } from "@/components/medicines/dose-actions";
import { useMedicineMarking } from "@/hooks/use-medicine-marking";
import { todayIST } from "@/lib/health-rules";
import { MEDICINE_PERIODS, frequencyLabel, mealRelationLabel, medicinePeriod } from "@/lib/medicine-format";

type MedicineScheduleProps = {
  patientId: string;
  /** The IST day being viewed. */
  date: string;
  onDateChange: (date: string) => void;
  onAddMedicine: () => void;
};

export function MedicineSchedule({ patientId, date, onDateChange, onAddMedicine }: MedicineScheduleProps) {
  const today = todayIST();
  const [isManageOpen, setIsManageOpen] = useState(false);

  const marking = useMedicineMarking(patientId, date);
  const { doses, summary, loading, error, canWrite } = marking;
  const isToday = date === today;
  const hasEntries = doses.some((d) => d.log !== null);
  const inactiveCount = marking.medicines.filter((m) => !m.active).length;

  return (
    <Card flush id="med-schedule" aria-label="दवाइयों का समय" className="scroll-mt-20">
      {/* HEADER */}
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-line p-4 sm:p-6">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <CardTitle className="text-xl">Medicine Schedule</CardTitle>
            <VitalTag tone="meds">
              <Pill aria-hidden className="h-3.5 w-3.5" />
              <span lang="hi">दवाइयों का समय</span>
            </VitalTag>
          </div>
          <CardDescription className="mt-1">
            <span lang="hi">दिन के समय के अनुसार दवाइयाँ देखें और खुराक दर्ज करें</span>
          </CardDescription>
        </div>
        <div className="flex w-full shrink-0 items-center gap-2 sm:w-auto">
          <Button variant="secondary" onClick={() => setIsManageOpen(true)} className="flex-1 sm:flex-none">
            <Settings aria-hidden className="h-4 w-4" />
            <span lang="hi">बदलें</span>
          </Button>
          {canWrite ? (
            <Button variant="primary" onClick={onAddMedicine} className="flex-1 sm:flex-none">
              <Plus aria-hidden className="h-4 w-4" />
              <span lang="hi">दवाई जोड़ें</span>
            </Button>
          ) : null}
        </div>
      </div>

      {/* DATE NAVIGATION */}
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2.5 border-b border-line bg-surface/40 px-4 py-3 sm:px-6">
        <DayStepper date={date} onChange={onDateChange} today={today} className="w-full sm:w-auto sm:min-w-96" />
        {summary.total > 0 ? (
          <p aria-live="polite" className="tabular rounded-control border border-line bg-surface/80 px-3 py-2 text-sm font-semibold text-ink">
            {summary.done}/{summary.total} <span lang="hi" className="font-normal text-ink-muted">ली गईं</span>
          </p>
        ) : null}
      </div>

      <div className="space-y-5 p-4 sm:p-6">
        {loading ? (
          <div className="space-y-3" aria-busy="true" aria-label="दवाइयाँ लोड हो रही हैं">
            <div className="skeleton h-32 w-full" />
            <div className="skeleton h-32 w-full" />
          </div>
        ) : error ? (
          <ErrorState
            title="दवाइयाँ लोड नहीं हो पाईं"
            englishTitle="Could not load the medicine schedule"
            description="इंटरनेट कनेक्शन जाँचें और दोबारा कोशिश करें।"
            onRetry={marking.reload}
          />
        ) : doses.length === 0 ? (
          <EmptyState
            icon={Pill}
            title={marking.notYetAdded > 0 ? "No medicines yet on this day" : "No active medicines"}
            hindiTitle={marking.notYetAdded > 0 ? "इस दिन तक कोई दवाई जोड़ी नहीं गई थी।" : "कोई सक्रिय दवाई नहीं है।"}
            description={inactiveCount > 0 ? "सभी दवाइयाँ बंद हैं। 'बदलें' में जाकर ज़रूरी दवाई फिर से चालू करें।" : undefined}
          />
        ) : (
          <>
            {!isToday ? (
              <p lang="hi" role="note" className="rounded-card border border-info-line bg-info-soft p-3 text-sm text-ink-muted">
                यह पिछले दिन की सूची है। यहाँ &lsquo;ली गई&rsquo; दर्ज करने पर असली समय का अंदाज़ा नहीं लगाया जाता — एंट्री &lsquo;बाद में दर्ज&rsquo; के रूप में सेव होती है।
              </p>
            ) : null}

            {canWrite && marking.markAllCandidates.length > 0 ? (
              <div className="tile flex flex-col gap-3 rounded-card p-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p lang="hi" className="flex items-center gap-1.5 text-sm font-semibold text-ink">
                    <CheckCheck aria-hidden className="h-4 w-4 shrink-0 text-brand-ink" />
                    एक साथ दर्ज करें
                  </p>
                  <p lang="hi" className="mt-0.5 text-xs text-ink-muted">
                    {isToday ? "अब तक के समय की" : "इस दिन की"} {marking.markAllCandidates.length} बाकी दवाइयाँ &lsquo;ली गई&rsquo; दर्ज होंगी। आगे के समय की दवाइयाँ नहीं बदलेंगी।
                  </p>
                </div>
                <Button variant="primary" onClick={() => void marking.markAllTaken()} className="w-full sm:w-auto">
                  <CheckCheck aria-hidden className="h-4 w-4" />
                  <span lang="hi">सभी ली गईं ({marking.markAllCandidates.length})</span>
                </Button>
              </div>
            ) : null}

            {MEDICINE_PERIODS.map((period) => {
              const periodDoses = doses.filter((d) => medicinePeriod(d.medicine.scheduled_time) === period.id);
              // A band with nothing scheduled is not shown: three "nothing here" boxes were noise.
              if (periodDoses.length === 0) return null;
              return (
                <section key={period.id} aria-label={`${period.hi} (${period.en})`}>
                  <h3 className="mb-2.5 flex items-center gap-2 text-sm font-semibold text-ink">
                    <span aria-hidden className="h-2.5 w-2.5 shrink-0 rounded-full bg-meds" />
                    <span lang="hi">{period.hi}</span>
                    <span className="text-xs font-normal text-ink-muted">{period.en}</span>
                    <span aria-hidden className="h-px flex-1 bg-line-strong/50" />
                    <span className="tabular text-xs font-medium text-ink-muted">
                      {periodDoses.length} <span lang="hi">दवाई</span>
                    </span>
                  </h3>

                  <ul className="grid gap-3 lg:grid-cols-2">
                    {periodDoses.map((dose) => {
                      const meal = mealRelationLabel(dose.medicine.meal_relation);
                      const freq = frequencyLabel(dose.medicine.frequency);
                      return (
                        <li key={dose.medicine.id} className="tile rounded-card p-3.5 sm:p-4">
                          <div className="flex items-start gap-3">
                            <div className="grid w-16 shrink-0 place-items-center rounded-control border border-meds-line bg-meds-soft py-2 text-meds">
                              <Clock aria-hidden className="h-3.5 w-3.5" />
                              <span className="tabular text-base font-semibold leading-tight">{dose.scheduledHHMM}</span>
                            </div>
                            <div className="min-w-0 flex-1 space-y-1">
                              <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-base font-semibold leading-snug text-ink">
                                {dose.medicine.medicine_name}
                                <span className="rounded-field bg-meds-soft px-2.5 py-0.5 text-xs font-semibold text-meds">
                                  {dose.medicine.dose}
                                </span>
                              </p>
                              {meal || freq ? (
                                <p className="flex flex-wrap items-center gap-x-1.5 text-sm text-ink-muted">
                                  {meal ? <span lang="hi">{meal}</span> : null}
                                  {meal && freq ? <span aria-hidden>·</span> : null}
                                  {freq ? <span lang="hi">{freq}</span> : null}
                                </p>
                              ) : null}
                              <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5 pt-0.5">
                                <DoseStatusChip state={dose.state} />
                                <DoseRecordedAt dose={dose} />
                              </div>
                            </div>
                          </div>
                          <DoseActions
                            dose={dose}
                            canWrite={canWrite}
                            large
                            onTaken={() => void marking.markTaken(dose.medicine.id)}
                            onMissed={() => void marking.markMissed(dose.medicine.id)}
                            onUndo={() => void marking.undo(dose.medicine.id)}
                            className="mt-3.5"
                          />
                        </li>
                      );
                    })}
                  </ul>
                </section>
              );
            })}

            {inactiveCount > 0 || marking.notYetAdded > 0 ? (
              <p lang="hi" className="text-xs text-ink-muted">
                {inactiveCount > 0 ? `${inactiveCount} बंद दवाई यहाँ नहीं दिखती — ‘बदलें’ में देखें।` : ""}
                {inactiveCount > 0 && marking.notYetAdded > 0 ? " " : ""}
                {marking.notYetAdded > 0 ? `${marking.notYetAdded} दवाई इस दिन के बाद जोड़ी गई थी, इसलिए यहाँ नहीं है।` : ""}
              </p>
            ) : null}

            {canWrite && hasEntries ? (
              <div className="flex justify-end border-t border-line pt-3">
                <Button variant="ghost" onClick={() => void marking.resetDay()}>
                  <RotateCcw aria-hidden className="h-4 w-4" />
                  <span lang="hi">इस दिन की सभी एंट्री हटाएँ</span>
                </Button>
              </div>
            ) : null}
          </>
        )}
      </div>

      {isManageOpen ? (
        <ManageMedicinesDialog isOpen={isManageOpen} onClose={() => setIsManageOpen(false)} patientId={patientId} />
      ) : null}
    </Card>
  );
}
