"use client";

import { useState } from "react";
import { Calendar, CheckCheck, ChevronLeft, ChevronRight, Clock, Pill, Plus, RotateCcw, Settings } from "lucide-react";
import { Button, IconButton } from "@/components/ui/button";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { EmptyState, ErrorState } from "@/components/ui/page";
import { VitalTag } from "@/components/dashboard/vital-tag";
import { ManageMedicinesDialog } from "@/components/forms/manage-medicines-dialog";
import { DoseActions, DoseRecordedAt, DoseStatusChip } from "@/components/medicines/dose-actions";
import { useMedicineMarking } from "@/hooks/use-medicine-marking";
import { IST_TZ, addDaysIST, todayIST } from "@/lib/health-rules";
import { MEDICINE_PERIODS, frequencyLabel, mealRelationLabel, medicinePeriod } from "@/lib/medicine-format";

type MedicineScheduleProps = {
  patientId: string;
  onAddMedicine: () => void;
};

const dateFmt = new Intl.DateTimeFormat("en-IN", {
  timeZone: IST_TZ,
  day: "numeric",
  month: "short",
  year: "numeric",
});

/** "आज", "कल", or a short India-time date. */
function formatDateLabel(dateIST: string, today: string): string {
  if (dateIST === today) return "आज (Today)";
  if (dateIST === addDaysIST(today, -1)) return "कल (Yesterday)";
  return dateFmt.format(new Date(`${dateIST}T12:00:00+05:30`));
}

export function MedicineSchedule({ patientId, onAddMedicine }: MedicineScheduleProps) {
  const today = todayIST();
  const [selectedDate, setSelectedDate] = useState(today);
  const [isManageOpen, setIsManageOpen] = useState(false);

  const marking = useMedicineMarking(patientId, selectedDate);
  const { doses, summary, loading, error, canWrite } = marking;
  const isToday = selectedDate === today;
  const hasEntries = doses.some((d) => d.log !== null);
  const inactiveCount = marking.medicines.filter((m) => !m.active).length;

  function goToDay(offset: number) {
    const next = addDaysIST(selectedDate, offset);
    // A future dose cannot have happened yet.
    if (next > todayIST()) return;
    setSelectedDate(next);
  }

  return (
    <Card flush>
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
      <div className="flex flex-wrap items-center justify-between gap-2.5 border-b border-line bg-surface-sunken px-4 py-2.5 sm:px-6">
        <div className="flex items-center gap-1.5">
          <IconButton onClick={() => goToDay(-1)} aria-label="पिछला दिन (Previous day)" variant="secondary">
            <ChevronLeft aria-hidden className="h-4 w-4" />
          </IconButton>
          <div
            aria-live="polite"
            className="flex min-h-control items-center gap-1.5 rounded-control border border-line bg-surface px-3 text-sm font-semibold text-ink"
          >
            <Calendar aria-hidden className="h-4 w-4 shrink-0 text-brand" />
            <span className="tabular whitespace-nowrap">{formatDateLabel(selectedDate, today)}</span>
          </div>
          <IconButton
            onClick={() => goToDay(1)}
            aria-label="अगला दिन (Next day)"
            variant="secondary"
            disabled={selectedDate >= today}
          >
            <ChevronRight aria-hidden className="h-4 w-4" />
          </IconButton>
        </div>

        <div className="flex items-center gap-2">
          {summary.total > 0 ? (
            <span className="tabular rounded-control border border-line bg-surface px-3 py-2 text-sm font-semibold text-ink">
              {summary.done}/{summary.total} <span lang="hi" className="font-normal text-ink-muted">ली गईं</span>
            </span>
          ) : null}
          {!isToday ? (
            <Button variant="ghost" onClick={() => setSelectedDate(today)}>
              <span lang="hi">आज पर जाएँ</span>
            </Button>
          ) : null}
        </div>
      </div>

      <div className="space-y-5 p-4 sm:p-6">
        {loading ? (
          <div className="space-y-3" aria-busy="true" aria-label="दवाइयाँ लोड हो रही हैं">
            <div className="skeleton h-24 w-full" />
            <div className="skeleton h-24 w-full" />
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
            title="No active medicines"
            hindiTitle="कोई सक्रिय दवाई नहीं है।"
            description={inactiveCount > 0 ? "सभी दवाइयाँ बंद हैं। 'बदलें' में जाकर ज़रूरी दवाई फिर से चालू करें।" : undefined}
          />
        ) : (
          <>
            {!isToday ? (
              <p lang="hi" className="rounded-card border border-info-line bg-info-soft p-3 text-sm text-info">
                यह पिछले दिन की सूची है। यहाँ &lsquo;ली गई&rsquo; दर्ज करने पर असली समय का अंदाज़ा नहीं लगाया जाता — एंट्री &lsquo;बाद में दर्ज&rsquo; के रूप में सेव होती है।
              </p>
            ) : null}

            {canWrite && marking.markAllCandidates.length > 0 ? (
              <div className="flex flex-col gap-3 rounded-card border border-brand-line bg-brand-softer p-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p lang="hi" className="flex items-center gap-1.5 text-sm font-semibold text-ink">
                    <CheckCheck aria-hidden className="h-4 w-4 shrink-0 text-brand" />
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
              return (
                <section key={period.id} className="rounded-card border border-line bg-surface-sunken p-4 sm:p-5">
                  <div className="mb-3 flex items-center justify-between gap-3 border-b border-line pb-3">
                    <h3 className="flex items-center gap-2 text-base font-semibold text-ink">
                      <span aria-hidden className="h-2.5 w-2.5 shrink-0 rounded-full bg-meds" />
                      <span lang="hi">{period.hi}</span>
                      <span className="text-xs font-normal text-ink-muted">{period.en}</span>
                    </h3>
                    <span className="tabular shrink-0 rounded-full border border-line bg-surface px-2.5 py-1 text-xs font-medium text-ink-muted">
                      {periodDoses.length} <span lang="hi">दवाई</span>
                    </span>
                  </div>

                  {periodDoses.length === 0 ? (
                    <p lang="hi" className="rounded-card border border-line bg-surface py-3 text-center text-sm text-ink-muted">
                      इस समय के लिए कोई दवाई निर्धारित नहीं है।
                    </p>
                  ) : (
                    <ul className="space-y-3">
                      {periodDoses.map((dose) => {
                        const meal = mealRelationLabel(dose.medicine.meal_relation);
                        const freq = frequencyLabel(dose.medicine.frequency);
                        return (
                          <li key={dose.medicine.id} className="rounded-card border border-line bg-surface p-4">
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0 space-y-1">
                                <p className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-base font-semibold text-ink">
                                  {dose.medicine.medicine_name}
                                  <span className="rounded-field bg-meds-soft px-2.5 py-0.5 text-xs font-semibold text-meds">
                                    {dose.medicine.dose}
                                  </span>
                                </p>
                                <p className="flex flex-wrap items-center gap-x-1.5 text-sm text-ink-muted">
                                  <Clock aria-hidden className="h-4 w-4 shrink-0 text-meds" />
                                  <span lang="hi">निर्धारित</span>
                                  <span className="tabular font-semibold text-ink">{dose.scheduledHHMM}</span>
                                  {meal ? (
                                    <>
                                      <span aria-hidden>·</span>
                                      <span lang="hi">{meal}</span>
                                    </>
                                  ) : null}
                                  {freq ? (
                                    <>
                                      <span aria-hidden>·</span>
                                      <span lang="hi">{freq}</span>
                                    </>
                                  ) : null}
                                </p>
                                <DoseRecordedAt dose={dose} />
                              </div>
                              <DoseStatusChip state={dose.state} />
                            </div>
                            <DoseActions
                              dose={dose}
                              canWrite={canWrite}
                              onTaken={() => void marking.markTaken(dose.medicine.id)}
                              onMissed={() => void marking.markMissed(dose.medicine.id)}
                              onUndo={() => void marking.undo(dose.medicine.id)}
                              className="mt-3.5"
                            />
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </section>
              );
            })}

            {inactiveCount > 0 ? (
              <p lang="hi" className="text-xs text-ink-muted">
                {inactiveCount} बंद दवाई यहाँ नहीं दिखती — &lsquo;बदलें&rsquo; में देखें।
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
