"use client";

import { CheckCheck, Clock, Pill, Plus, Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState, ErrorState } from "@/components/ui/page";
import { ProgressBar } from "@/components/ui/progress-bar";
import { VitalTag } from "@/components/dashboard/vital-tag";
import { DoseActions, DoseRecordedAt, DoseStatusChip } from "@/components/medicines/dose-actions";
import { useMedicineMarking } from "@/hooks/use-medicine-marking";
import { mealRelationLabel } from "@/lib/medicine-format";
import { todayIST } from "@/lib/health-rules";

type MedicineTodayCardProps = {
  patientId: string;
  /** Opens the full quick-mark sheet. */
  onOpenTracker: () => void;
  /** Opens the add / edit / delete list. */
  onManage: () => void;
  /** Called after a dose is written, so the page can refresh its own numbers. */
  onChange?: () => void;
};

export function MedicineTodayCard({ patientId, onOpenTracker, onManage, onChange }: MedicineTodayCardProps) {
  const today = todayIST();
  const marking = useMedicineMarking(patientId, today, { onChange });
  const { doses, summary, loading, error, canWrite } = marking;

  return (
    <Card>
      <CardHeader>
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <CardTitle>Medicines</CardTitle>
            <VitalTag tone="meds">
              <Pill aria-hidden className="h-3.5 w-3.5" />
              <span lang="hi">दवाइयाँ</span>
            </VitalTag>
          </div>
          <CardDescription>
            {loading
              ? "लोड हो रहा है…"
              : summary.total > 0
                ? `आज ${summary.total} में से ${summary.done} खुराक ली गई`
                : "कोई सक्रिय दवाई नहीं है"}
          </CardDescription>
        </div>
        <div className="flex w-full items-center gap-2 sm:w-auto">
          <Button variant="secondary" onClick={onManage} className="flex-1 sm:flex-none">
            <Settings aria-hidden className="h-4 w-4" />
            <span lang="hi">दवाइयाँ बदलें</span>
          </Button>
          <Button variant="secondary" onClick={onOpenTracker} className="flex-1 sm:flex-none">
            <Plus aria-hidden className="h-4 w-4" />
            <span lang="hi">ट्रैकर खोलें</span>
          </Button>
        </div>
      </CardHeader>

      {loading ? (
        <div className="space-y-2.5" aria-busy="true" aria-label="दवाइयाँ लोड हो रही हैं">
          <div className="skeleton h-4 w-full" />
          <div className="skeleton h-24 w-full" />
          <div className="skeleton h-24 w-full" />
        </div>
      ) : error ? (
        <ErrorState
          title="दवाइयाँ लोड नहीं हो पाईं"
          englishTitle="Could not load today's medicines"
          description="इंटरनेट कनेक्शन जाँचें और दोबारा कोशिश करें।"
          onRetry={marking.reload}
        />
      ) : doses.length === 0 ? (
        <EmptyState
          icon={Pill}
          title="No active medicines"
          hindiTitle="अभी कोई सक्रिय दवाई दर्ज नहीं है।"
          description="डॉक्टर की लिखी दवाइयाँ जोड़ें, फिर यहाँ रोज़ की खुराक दर्ज करें।"
          action={
            canWrite ? (
              <Button variant="primary" onClick={onManage}>
                <Plus aria-hidden className="h-4 w-4" />
                <span lang="hi">दवाई जोड़ें</span>
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="space-y-4">
          <ProgressBar label="आज की ली गई खुराकें" max={summary.total} value={summary.done} />

          {canWrite && marking.markAllCandidates.length > 0 ? (
            <Button variant="primary" block onClick={() => void marking.markAllTaken()}>
              <CheckCheck aria-hidden className="h-4 w-4" />
              <span lang="hi">अब तक की सभी दवाइयाँ ली गईं ({marking.markAllCandidates.length})</span>
            </Button>
          ) : null}

          <ul className="space-y-2.5">
            {doses.map((dose) => {
              const meal = mealRelationLabel(dose.medicine.meal_relation);
              return (
                <li key={dose.medicine.id} className="rounded-card border border-line bg-surface p-3.5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-base font-semibold text-ink">
                        {dose.medicine.medicine_name}
                        <span className="rounded-field bg-meds-soft px-2 py-0.5 text-xs font-semibold text-meds">
                          {dose.medicine.dose}
                        </span>
                      </p>
                      <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-xs text-ink-muted">
                        <Clock aria-hidden className="h-3.5 w-3.5 shrink-0" />
                        <span className="tabular">{dose.scheduledHHMM}</span>
                        {meal ? (
                          <>
                            <span aria-hidden>·</span>
                            <span lang="hi">{meal}</span>
                          </>
                        ) : null}
                      </p>
                      <DoseRecordedAt dose={dose} className="mt-1" />
                    </div>
                    <DoseStatusChip state={dose.state} />
                  </div>
                  <DoseActions
                    dose={dose}
                    canWrite={canWrite}
                    onTaken={() => void marking.markTaken(dose.medicine.id)}
                    onMissed={() => void marking.markMissed(dose.medicine.id)}
                    onUndo={() => void marking.undo(dose.medicine.id)}
                    className="mt-3"
                  />
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </Card>
  );
}
