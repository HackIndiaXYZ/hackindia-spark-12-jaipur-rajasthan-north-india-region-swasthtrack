"use client";

import { useState } from "react";
import { CheckCheck, Clock, Pill, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { Modal } from "@/components/ui/modal";
import { EmptyState, ErrorState } from "@/components/ui/page";
import { DoseActions, DoseRecordedAt, DoseStatusChip } from "@/components/medicines/dose-actions";
import { AddMedicineDialog } from "@/components/forms/add-medicine-dialog";
import { useMedicineMarking } from "@/hooks/use-medicine-marking";
import { todayIST } from "@/lib/health-rules";
import { MEDICINE_PERIODS, mealRelationLabel, medicinePeriod } from "@/lib/medicine-format";

type QuickMarkMedicineDialogProps = {
  isOpen: boolean;
  onClose: () => void;
  patientId: string;
  onSuccess?: () => void;
};

/** Today's doses in one sheet. All marking logic lives in `useMedicineMarking`. */
function QuickMarkBody({ isOpen, onClose, patientId, onSuccess }: QuickMarkMedicineDialogProps) {
  const marking = useMedicineMarking(patientId, todayIST(), { onChange: onSuccess });
  const { doses, summary, loading, error, canWrite } = marking;
  const [isAddOpen, setIsAddOpen] = useState(false);
  const toast = useToast();

  return (
    <>
      <Modal
        isOpen={isOpen}
        onClose={onClose}
        title="Daily Medicine Tracker"
        hindiTitle="दवाइयाँ मार्क करें"
        description={
          summary.total > 0
            ? `आज ${summary.total} में से ${summary.done} खुराक ली गई`
            : "आज की दवाइयाँ ली गईं या छूटीं, यहाँ दर्ज करें।"
        }
        size="lg"
        footer={
          <div className="flex items-center justify-between gap-3">
            {canWrite ? (
              <Button variant="ghost" onClick={() => setIsAddOpen(true)}>
                <Plus aria-hidden className="h-4 w-4" />
                <span lang="hi">नई दवाई जोड़ें</span>
              </Button>
            ) : (
              <span />
            )}
            <Button variant="secondary" onClick={onClose}>
              <span lang="hi">पूरा हुआ</span>
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          {loading ? (
            <div className="space-y-2.5" aria-busy="true" aria-label="दवाइयाँ लोड हो रही हैं">
              <div className="skeleton h-20 w-full" />
              <div className="skeleton h-20 w-full" />
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
              description="पहले दवाई जोड़ें, फिर यहाँ रोज़ की खुराक दर्ज करें।"
              action={
                canWrite ? (
                  <Button variant="primary" onClick={() => setIsAddOpen(true)}>
                    <Plus aria-hidden className="h-4 w-4" />
                    <span lang="hi">दवाई जोड़ें</span>
                  </Button>
                ) : undefined
              }
            />
          ) : (
            <>
              {canWrite && marking.markAllCandidates.length > 0 ? (
                <Button variant="primary" block onClick={() => void marking.markAllTaken()}>
                  <CheckCheck aria-hidden className="h-4 w-4" />
                  <span lang="hi">अब तक की सभी दवाइयाँ ली गईं ({marking.markAllCandidates.length})</span>
                </Button>
              ) : null}

              {MEDICINE_PERIODS.map((period) => {
                const periodDoses = doses.filter((d) => medicinePeriod(d.medicine.scheduled_time) === period.id);
                if (periodDoses.length === 0) return null;
                return (
                  <section key={period.id} className="space-y-2.5" aria-label={`${period.hi} (${period.en})`}>
                    <h3 className="flex items-center gap-2 text-sm font-semibold text-ink">
                      <span aria-hidden className="h-2 w-2 rounded-full bg-meds" />
                      <span lang="hi">{period.hi}</span>
                      <span className="text-xs font-normal text-ink-muted">{period.en}</span>
                    </h3>
                    <ul className="space-y-2.5">
                      {periodDoses.map((dose) => {
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
                  </section>
                );
              })}
            </>
          )}
        </div>
      </Modal>

      <AddMedicineDialog
        isOpen={isAddOpen}
        onClose={() => setIsAddOpen(false)}
        patientId={patientId}
        onSuccess={() => {
          toast.success("दवाई जुड़ गई");
          onSuccess?.();
        }}
      />
    </>
  );
}

export function QuickMarkMedicineDialog(props: QuickMarkMedicineDialogProps) {
  // The hook only runs while the sheet is open, so a closed dialog costs nothing.
  return props.isOpen ? <QuickMarkBody {...props} /> : null;
}
