"use client";

import { useEffect, useState } from "react";
import { Edit3, Plus, Trash2, Pill, Clock } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import {
  getMedicines,
  deleteMedicine,
  type MedicineItem,
} from "@/services/patient-service";
import { AddMedicineDialog } from "@/components/forms/add-medicine-dialog";

type ManageMedicinesDialogProps = {
  isOpen: boolean;
  onClose: () => void;
  patientId: string;
  onSuccess?: () => void;
};

export function ManageMedicinesDialog({
  isOpen,
  onClose,
  patientId,
  onSuccess,
}: ManageMedicinesDialogProps) {
  const [medicines, setMedicines] = useState<MedicineItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [medicineToEdit, setMedicineToEdit] = useState<MedicineItem | null>(null);
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState("");

  async function loadData() {
    setLoading(true);
    try {
      const list = await getMedicines(patientId);
      setMedicines(list);
    } catch {
      console.error("Failed to load medicines");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    let active = true;
    if (isOpen) {
      getMedicines(patientId)
        .then((list) => {
          if (active) {
            setMedicines(list);
            setLoading(false);
          }
        })
        .catch(() => {
          if (active) {
            console.error("Failed to load medicines");
            setLoading(false);
          }
        });
    }
    return () => {
      active = false;
    };
  }, [isOpen, patientId]);

  async function handleDelete(id: string) {
    setErrorMsg("");
    setDeletingId(id);
    try {
      await deleteMedicine(id);
      await loadData();
      onSuccess?.();
    } catch {
      setErrorMsg("दवाई हटाने में विफल। कृपया पुनः प्रयास करें।");
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <>
      <Modal
        isOpen={isOpen}
        onClose={onClose}
        title="दवाइियाँ सम्पादित करें (Manage Medicines)"
        hindiTitle="Medicine Management"
        description="अपनी सभी दवाओं का नाम, खुराक, समय बदलें या नई दवा जोड़ें।"
        maxWidth="lg"
      >
        <div className="space-y-4 max-w-full">
          {errorMsg ? (
            <div className="rounded-card border border-critical-line bg-critical-soft p-3 text-xs font-semibold text-critical">
              {errorMsg}
            </div>
          ) : null}
          {/* TOP ACTION BAR */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 rounded-card border-2 border-brand-line bg-brand-soft/70">
            <div className="flex items-center gap-2.5">
              <Pill className="h-5 w-5 text-brand-ink shrink-0" />
              <div>
                <p className="text-xs sm:text-sm font-bold text-brand-ink">
                  कुल पंजीकृत दवाइियाँ: {medicines.length}
                </p>
                <p className="text-xs font-semibold text-brand-ink">
                  सक्रिय: {medicines.filter((m) => m.active).length}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setIsAddOpen(true)}
              className="shine-sweep grad-spring w-full sm:w-auto px-4 py-2 rounded-control active:scale-97 text-gold-ink font-bold text-xs sm:text-sm flex items-center justify-center gap-1.5 shadow-e2 hover:brightness-105 hover:shadow-glow-gold transition-all cursor-pointer shrink-0"
            >
              <Plus className="h-4 w-4" />
              <span>+ नई दवा जोड़ें</span>
            </button>
          </div>

          {/* MEDICINES LIST FOR EDITING */}
          <div className="space-y-2.5 max-h-[55vh] overflow-y-auto pr-1">
            {loading ? (
              <div className="p-8 text-center text-sm font-semibold text-ink-subtle">
                दवाइयाँ लोड हो रही हैं...
              </div>
            ) : medicines.length === 0 ? (
              <div className="p-6 text-center text-sm font-semibold text-ink-subtle bg-surface-sunken rounded-card border border-line">
                कोई दवाई दर्ज नहीं है। ऊपर क्लिक करके पहली दवा जोड़ें।
              </div>
            ) : (
              medicines.map((medicine) => (
                <div
                  key={medicine.id}
                  className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 rounded-card border-2 border-line bg-surface hover:border-line-strong shadow-2xs transition-all"
                >
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-bold text-ink text-sm sm:text-base">
                        {medicine.medicine_name}
                      </p>
                      <span className="text-xs font-bold text-brand-ink bg-brand-soft px-2 py-0.5 rounded-field">
                        {medicine.dose}
                      </span>
                      {!medicine.active && (
                        <span className="text-2xs font-bold text-ink-subtle bg-surface-sunken px-2 py-0.5 rounded-field">
                          निष्क्रिय (Inactive)
                        </span>
                      )}
                    </div>
                    <p className="text-xs font-semibold text-ink-muted flex items-center gap-1.5">
                      <Clock className="h-3.5 w-3.5 text-brand shrink-0" />
                      <span>⏰ {medicine.scheduled_time.slice(0, 5)}</span>
                      <span>·</span>
                      <span>{medicine.meal_relation ? medicine.meal_relation.replace("_", " ") : "भोजन के बाद"}</span>
                      <span>·</span>
                      <span className="text-ink-subtle">{medicine.frequency}</span>
                    </p>
                  </div>

                  {/* EDIT & DELETE BUTTONS */}
                  <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
                    <button
                      type="button"
                      onClick={() => setMedicineToEdit(medicine)}
                      className="min-h-9 px-3 text-xs font-bold text-ink-muted bg-surface-sunken hover:bg-line hover:text-ink border border-line-strong rounded-control flex items-center gap-1.5 transition-all cursor-pointer active:scale-97"
                    >
                      <Edit3 className="h-3.5 w-3.5 text-ink-muted" />
                      <span>बदलें (Edit)</span>
                    </button>
                    <button
                      type="button"
                      disabled={deletingId === medicine.id}
                      onClick={() => handleDelete(medicine.id)}
                      className="min-h-9 px-3 text-xs font-bold text-critical bg-critical-soft hover:bg-critical-line/40 border border-critical-line rounded-control flex items-center gap-1.5 transition-all cursor-pointer active:scale-97 disabled:opacity-50"
                    >
                      <Trash2 className="h-3.5 w-3.5 text-critical" />
                      <span>हटाएं</span>
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </Modal>

      {/* EDIT MODAL */}
      {medicineToEdit && (
        <AddMedicineDialog
          isOpen={!!medicineToEdit}
          onClose={() => setMedicineToEdit(null)}
          patientId={patientId}
          medicineToEdit={medicineToEdit}
          onSuccess={async () => {
            setMedicineToEdit(null);
            await loadData();
            onSuccess?.();
          }}
        />
      )}

      {/* ADD NEW MODAL */}
      {isAddOpen && (
        <AddMedicineDialog
          isOpen={isAddOpen}
          onClose={() => setIsAddOpen(false)}
          patientId={patientId}
          onSuccess={async () => {
            setIsAddOpen(false);
            await loadData();
            onSuccess?.();
          }}
        />
      )}
    </>
  );
}
