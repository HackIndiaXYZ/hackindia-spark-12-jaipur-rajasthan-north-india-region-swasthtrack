"use client";

import { useState } from "react";
import { CheckCheck, ChevronDown, Clock, Pill, Plus, Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState, ErrorState } from "@/components/ui/page";
import { ProgressBar } from "@/components/ui/progress-bar";
import { RecordHeader } from "@/components/dashboard/record-header";
import { DoseActions, DoseRecordedAt, DoseStatusChip } from "@/components/medicines/dose-actions";
import { useMedicineMarking } from "@/hooks/use-medicine-marking";
import { mealRelationLabel } from "@/lib/medicine-format";
import { todayIST } from "@/lib/health-rules";
import { cn } from "@/lib/utils";

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
  // A dose that is already taken has nothing urgent left to do: its correction
  // buttons (mark missed / undo) sit behind a "बदलें" toggle instead of stacking
  // two more buttons under every row.
  const [editing, setEditing] = useState<ReadonlySet<string>>(() => new Set());
  const toggleEditing = (id: string) =>
    setEditing((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <Card aria-label="Medicines — दवाइयाँ">
      <RecordHeader
        icon={Pill}
        tone="meds"
        title="Medicines"
        hindiTitle="दवाइयाँ"
        subtitle={
          loading
            ? "लोड हो रहा है…"
            : summary.total > 0
              ? `आज ${summary.total} में से ${summary.done} खुराक ली गई`
              : "कोई सक्रिय दवाई नहीं है"
        }
      />

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
        <div className="space-y-3.5">
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
              const id = dose.medicine.id;
              const done = canWrite && (dose.state === "taken" || dose.state === "late");
              const open = !done || editing.has(id);
              return (
                <li key={id} className="tile rounded-card p-3.5">
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
                    </div>
                    <DoseStatusChip state={dose.state} />
                  </div>

                  <div className="mt-1 flex items-center justify-between gap-2">
                    <DoseRecordedAt dose={dose} />
                    {done ? (
                      <Button
                        variant="ghost"
                        onClick={() => toggleEditing(id)}
                        aria-expanded={open}
                        aria-controls={`dose-actions-${id}`}
                        className="-mr-2 ml-auto"
                      >
                        <span lang="hi">बदलें</span>
                        <ChevronDown aria-hidden className={cn("h-4 w-4 transition-transform", open && "rotate-180")} />
                      </Button>
                    ) : null}
                  </div>

                  <div id={`dose-actions-${id}`} hidden={!open}>
                    <DoseActions
                      dose={dose}
                      canWrite={canWrite}
                      onTaken={() => void marking.markTaken(id)}
                      onMissed={() => void marking.markMissed(id)}
                      onUndo={() => void marking.undo(id)}
                      className="mt-2.5"
                    />
                  </div>
                </li>
              );
            })}
          </ul>

          <div className="flex flex-wrap items-center justify-end gap-2 border-t border-gold-line pt-3">
            <Button variant="secondary" onClick={onManage} className="flex-1 sm:flex-none">
              <Settings aria-hidden className="h-4 w-4" />
              <span lang="hi">दवाइयाँ बदलें</span>
            </Button>
            <Button variant="secondary" onClick={onOpenTracker} className="flex-1 sm:flex-none">
              <Plus aria-hidden className="h-4 w-4" />
              <span lang="hi">ट्रैकर खोलें</span>
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}
