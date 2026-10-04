"use client";

import { useCallback, useEffect, useState } from "react";
import { Clock, Edit3, Pill, Plus, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { Modal } from "@/components/ui/modal";
import { EmptyState, ErrorState } from "@/components/ui/page";
import { useToast } from "@/components/ui/toast";
import { AddMedicineDialog } from "@/components/forms/add-medicine-dialog";
import { useAuth } from "@/context/auth-context";
import { notifyMedicinesChanged } from "@/hooks/use-medicine-marking";
import { frequencyLabel, hhmm, mealRelationLabel } from "@/lib/medicine-format";
import { deleteMedicine, getMedicines, type MedicineItem } from "@/services/patient-service";

type ManageMedicinesDialogProps = {
  isOpen: boolean;
  onClose: () => void;
  patientId: string;
  onSuccess?: () => void;
};

export function ManageMedicinesDialog({ isOpen, onClose, patientId, onSuccess }: ManageMedicinesDialogProps) {
  const { canWrite } = useAuth();
  const confirm = useConfirm();
  const toast = useToast();

  const [medicines, setMedicines] = useState<MedicineItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [medicineToEdit, setMedicineToEdit] = useState<MedicineItem | null>(null);
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const load = useCallback(() => {
    return getMedicines(patientId)
      .then((list) => {
        setMedicines(list);
        setLoadError(false);
      })
      .catch(() => setLoadError(true))
      .finally(() => setLoading(false));
  }, [patientId]);

  useEffect(() => {
    if (!isOpen) return;
    // Resolves asynchronously; the first paint of an open dialog shows the loading state.
    void load();
  }, [isOpen, load]);

  async function handleDelete(medicine: MedicineItem) {
    const sure = await confirm({
      title: `"${medicine.medicine_name}" हटाएँ?`,
      message:
        "यह दवाई सूची से हट जाएगी और इसका पुराना खुराक-रिकॉर्ड भी जा सकता है। अगर डॉक्टर ने सिर्फ़ दवाई बंद की है, तो 'बदलें' में जाकर 'सक्रिय' का टिक हटाएँ — तब रिकॉर्ड बना रहता है।",
      confirmLabel: "हाँ, हटाएँ",
      cancelLabel: "रहने दें",
      tone: "danger",
    });
    if (!sure) return;

    setDeletingId(medicine.id);
    try {
      await deleteMedicine(medicine.id);
      notifyMedicinesChanged(patientId);
      toast.success("दवाई हटा दी गई", medicine.medicine_name);
      await load();
      onSuccess?.();
    } catch {
      toast.error("दवाई हट नहीं पाई", "दोबारा कोशिश करें।");
    } finally {
      setDeletingId(null);
    }
  }

  async function afterSave(message: string) {
    toast.success(message);
    await load();
    onSuccess?.();
  }

  const activeCount = medicines.filter((m) => m.active).length;

  return (
    <>
      <Modal
        isOpen={isOpen}
        onClose={onClose}
        title="Manage Medicines"
        hindiTitle="दवाइयाँ बदलें"
        description="दवाई का नाम, खुराक या समय बदलें, या नई दवाई जोड़ें।"
        size="lg"
        footer={
          <div className="flex justify-end">
            <Button variant="secondary" onClick={onClose}>
              <span lang="hi">पूरा हुआ</span>
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          <div className="flex flex-col gap-3 rounded-card border border-meds-line bg-meds-soft p-3.5 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-2.5">
              <Pill aria-hidden className="h-5 w-5 shrink-0 text-meds" />
              <p lang="hi" className="text-sm font-semibold text-ink">
                कुल दवाइयाँ: {medicines.length} · सक्रिय: {activeCount}
              </p>
            </div>
            {canWrite ? (
              <Button variant="primary" onClick={() => setIsAddOpen(true)}>
                <Plus aria-hidden className="h-4 w-4" />
                <span lang="hi">नई दवाई जोड़ें</span>
              </Button>
            ) : null}
          </div>

          {loading ? (
            <div className="space-y-2.5" aria-busy="true" aria-label="दवाइयाँ लोड हो रही हैं">
              <div className="skeleton h-16 w-full" />
              <div className="skeleton h-16 w-full" />
            </div>
          ) : loadError ? (
            <ErrorState
              title="दवाइयाँ लोड नहीं हो पाईं"
              englishTitle="Could not load medicines"
              onRetry={() => {
                setLoading(true);
                void load();
              }}
            />
          ) : medicines.length === 0 ? (
            <EmptyState
              icon={Pill}
              title="No medicines yet"
              hindiTitle="अभी कोई दवाई दर्ज नहीं है।"
              description="ऊपर 'नई दवाई जोड़ें' दबाकर पहली दवाई जोड़ें।"
            />
          ) : (
            <ul className="space-y-2.5">
              {medicines.map((medicine) => {
                const meal = mealRelationLabel(medicine.meal_relation);
                const freq = frequencyLabel(medicine.frequency);
                return (
                  <li
                    key={medicine.id}
                    className="flex flex-col gap-3 rounded-card border border-line bg-surface p-3.5 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="min-w-0 space-y-1">
                      <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-base font-semibold text-ink">
                        {medicine.medicine_name}
                        <span className="rounded-field bg-meds-soft px-2 py-0.5 text-xs font-semibold text-meds">
                          {medicine.dose}
                        </span>
                        {!medicine.active ? (
                          <Badge variant="neutral">
                            <span lang="hi">बंद</span>
                          </Badge>
                        ) : null}
                      </p>
                      <p className="flex flex-wrap items-center gap-x-1.5 text-xs text-ink-muted">
                        <Clock aria-hidden className="h-3.5 w-3.5 shrink-0" />
                        <span className="tabular">{hhmm(medicine.scheduled_time)}</span>
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
                    </div>

                    {canWrite ? (
                      <div className="flex shrink-0 items-center gap-2">
                        <Button variant="secondary" onClick={() => setMedicineToEdit(medicine)} className="flex-1 sm:flex-none">
                          <Edit3 aria-hidden className="h-4 w-4" />
                          <span lang="hi">बदलें</span>
                        </Button>
                        <Button
                          variant="danger"
                          onClick={() => void handleDelete(medicine)}
                          loading={deletingId === medicine.id}
                          aria-label={`${medicine.medicine_name} हटाएँ`}
                          className="flex-1 sm:flex-none"
                        >
                          <Trash2 aria-hidden className="h-4 w-4" />
                          <span lang="hi">हटाएँ</span>
                        </Button>
                      </div>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </Modal>

      <AddMedicineDialog
        isOpen={medicineToEdit !== null}
        onClose={() => setMedicineToEdit(null)}
        patientId={patientId}
        medicineToEdit={medicineToEdit}
        onSuccess={() => void afterSave("दवाई अपडेट हो गई")}
      />

      <AddMedicineDialog
        isOpen={isAddOpen}
        onClose={() => setIsAddOpen(false)}
        patientId={patientId}
        onSuccess={() => void afterSave("दवाई जुड़ गई")}
      />
    </>
  );
}
