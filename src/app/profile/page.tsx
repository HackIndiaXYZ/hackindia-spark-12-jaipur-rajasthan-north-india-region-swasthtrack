"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Calendar,
  Check,
  Edit2,
  Heart,
  Pill,
  Plus,
  Scale,
  ShieldCheck,
  Trash2,
  User,
  Utensils,
} from "lucide-react";
import { AddConditionDialog } from "@/components/forms/add-condition-dialog";
import { AddMedicineDialog } from "@/components/forms/add-medicine-dialog";
import { EditPatientDialog } from "@/components/forms/edit-patient-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { PageTitle } from "@/components/ui/page-title";
import {
  deleteMedicalCondition,
  deleteMedicine,
  getMedicalConditions,
  getMedicines,
  getPatientProfile,
  updateMedicine,
  type MedicalCondition,
  type MedicineItem,
  type PatientProfile,
} from "@/services/patient-service";

export default function ProfilePage() {
  const [patient, setPatient] = useState<PatientProfile | null>(null);
  const [conditions, setConditions] = useState<MedicalCondition[]>([]);
  const [medicines, setMedicines] = useState<MedicineItem[]>([]);
  const [loading, setLoading] = useState(true);

  // Dialog states
  const [isEditProfileOpen, setIsEditProfileOpen] = useState(false);
  const [isAddConditionOpen, setIsAddConditionOpen] = useState(false);
  const [isAddMedicineOpen, setIsAddMedicineOpen] = useState(false);
  const [medicineToEdit, setMedicineToEdit] = useState<MedicineItem | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  function showToast(msg: string) {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  }

  const loadData = useCallback(() => {
    getPatientProfile().then((profile) => {
      setPatient(profile);
      Promise.all([
        getMedicalConditions(profile.id),
        getMedicines(profile.id),
      ]).then(([conds, meds]) => {
        setConditions(conds);
        setMedicines(meds);
        setLoading(false);
      });
    });
  }, []);

  useEffect(() => {
    let active = true;
    getPatientProfile().then((profile) => {
      if (!active) return;
      setPatient(profile);
      Promise.all([
        getMedicalConditions(profile.id),
        getMedicines(profile.id),
      ]).then(([conds, meds]) => {
        if (!active) return;
        setConditions(conds);
        setMedicines(meds);
        setLoading(false);
      });
    });

    return () => {
      active = false;
    };
  }, []);

  async function handleDeleteCondition(id: string, name: string) {
    if (confirm(`Remove condition "${name}"? / क्या आप इसे हटाना चाहते हैं?`)) {
      await deleteMedicalCondition(id);
      showToast(`Removed "${name}"`);
      loadData();
    }
  }

  async function handleToggleMedicineActive(med: MedicineItem) {
    const nextActive = !med.active;
    await updateMedicine(med.id, { active: nextActive });
    showToast(nextActive ? `Activated ${med.medicine_name}` : `Deactivated ${med.medicine_name}`);
    loadData();
  }

  async function handleDeleteMedicine(id: string, name: string) {
    if (confirm(`Delete medicine "${name}"? / क्या आप यह दवाई हटाना चाहते हैं?`)) {
      await deleteMedicine(id);
      showToast(`Deleted ${name}`);
      loadData();
    }
  }

  if (loading && !patient) {
    return (
      <div className="space-y-6">
        <PageTitle
          description="Manage clinical background, prescribed medicines, and daily targets."
          eyebrow="Patient Profile"
          title="Profile & Medical Background"
        />
        <div className="flex h-64 items-center justify-center rounded-card border border-line bg-surface">
          <div className="text-center text-ink-muted">
            <div className="mx-auto mb-3 h-8 w-8 animate-spin rounded-full border-4 border-brand border-t-transparent" />
            <p className="text-sm font-medium">Loading patient profile / प्रोफाइल लोड हो रही है...</p>
          </div>
        </div>
      </div>
    );
  }

  if (!patient) return null;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <PageTitle
          description="Manage personal parameters, diagnosed conditions, and active prescriptions."
          eyebrow="Patient Profile (मरीज़ प्रोफाइल)"
          title="Patient Profile & Prescriptions"
        />
      </div>

      {toastMessage ? (
        <div className="flex items-center gap-2 rounded-card border border-positive-line bg-positive-soft px-4 py-3 text-sm font-semibold text-positive animate-in fade-in">
          <Check className="h-4 w-4 shrink-0 text-positive" />
          {toastMessage}
        </div>
      ) : null}

      {/* SECTION 1: PERSONAL INFORMATION */}
      <Card tone="premium">
        <CardHeader>
          <div>
            <div className="flex items-center gap-2">
              <CardTitle>Personal Information</CardTitle>
              <Badge variant="green">व्यक्तिगत जानकारी</Badge>
            </div>
            <CardDescription>
              Basic demographic and anthropometric parameters
            </CardDescription>
          </div>
          <Button
            variant="secondary"
            onClick={() => setIsEditProfileOpen(true)}
            className="shrink-0"
          >
            <Edit2 className="h-4 w-4" />
            Edit Info (संपादित करें)
          </Button>
        </CardHeader>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-card border border-line bg-surface-sunken p-4">
            <div className="flex items-center gap-2 text-xs font-semibold text-ink-subtle">
              <User className="h-4 w-4 text-emerald-600" />
              <span>Full Name & Gender</span>
            </div>
            <p className="mt-2 text-lg font-semibold text-ink">{patient.name}</p>
            <p className="text-sm font-medium text-ink-muted">
              {patient.age} years · {patient.gender || "Not specified"}
            </p>
          </div>

          <div className="rounded-card border border-line bg-surface-sunken p-4">
            <div className="flex items-center gap-2 text-xs font-semibold text-ink-subtle">
              <Scale className="h-4 w-4 text-amber-600" />
              <span>Weight & Height</span>
            </div>
            <p className="mt-2 text-lg font-semibold text-ink">
              {patient.current_weight_kg ? `${patient.current_weight_kg} kg` : "--"}
            </p>
            <p className="text-sm font-medium text-ink-muted">
              Height: {patient.height_cm ? `${patient.height_cm} cm` : "--"}
            </p>
          </div>

          <div className="rounded-card border border-line bg-surface-sunken p-4">
            <div className="flex items-center gap-2 text-xs font-semibold text-ink-subtle">
              <Heart className="h-4 w-4 text-rose-500" />
              <span>Target Weight</span>
            </div>
            <p className="mt-2 text-lg font-semibold text-ink">
              {patient.target_weight_kg ? `${patient.target_weight_kg} kg` : "--"}
            </p>
            <p className="text-sm font-medium text-ink-muted">
              {patient.current_weight_kg && patient.target_weight_kg
                ? `Difference: ${(patient.current_weight_kg - patient.target_weight_kg).toFixed(1)} kg`
                : "Goal weight"}
            </p>
          </div>

          <div className="rounded-card border border-line bg-surface-sunken p-4">
            <div className="flex items-center gap-2 text-xs font-semibold text-ink-subtle">
              <Utensils className="h-4 w-4 text-emerald-600" />
              <span>Calorie Target</span>
            </div>
            <p className="mt-2 text-lg font-semibold text-ink">
              {patient.daily_calorie_target} kcal/day
            </p>
            <p className="text-sm font-medium text-ink-muted">
              Prescribed daily ceiling
            </p>
          </div>
        </div>
      </Card>

      {/* SECTION 2: MEDICAL CONDITIONS */}
      <Card>
        <CardHeader>
          <div>
            <div className="flex items-center gap-2">
              <CardTitle>Medical Conditions</CardTitle>
              <Badge variant="blue">स्वास्थ्य संबंधी स्थितियाँ</Badge>
            </div>
            <CardDescription>
              Diagnosed chronic conditions, allergies, and cardiovascular history
            </CardDescription>
          </div>
          <Button
            variant="secondary"
            onClick={() => setIsAddConditionOpen(true)}
            className="shrink-0"
          >
            <Plus className="h-4 w-4" />
            Add Condition (स्थिति जोड़ें)
          </Button>
        </CardHeader>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {conditions.map((cond) => (
            <div
              key={cond.id}
              className="flex flex-col justify-between rounded-card border border-line bg-surface p-4 transition-colors hover:border-brand-line"
            >
              <div>
                <div className="flex items-start justify-between gap-2">
                  <h3 className="text-base font-semibold text-ink">
                    {cond.condition_name}
                  </h3>
                  <button
                    type="button"
                    onClick={() => handleDeleteCondition(cond.id, cond.condition_name)}
                    className="flex h-8 w-8 items-center justify-center rounded-control text-ink-subtle hover:bg-critical-soft hover:text-critical transition-colors"
                    title="Remove condition"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>

                {cond.diagnosed_year ? (
                  <div className="mt-2 flex items-center gap-1.5 text-xs font-semibold text-emerald-700">
                    <Calendar className="h-3.5 w-3.5" />
                    <span>Diagnosed in {cond.diagnosed_year}</span>
                  </div>
                ) : null}

                {cond.notes ? (
                  <p className="mt-2 text-xs leading-relaxed text-ink-muted">
                    {cond.notes}
                  </p>
                ) : null}
              </div>

              <div className="mt-4 pt-3 border-t border-line flex items-center gap-1 text-xs font-medium text-ink-subtle">
                <ShieldCheck className="h-3.5 w-3.5 text-ink-subtle" />
                <span>Monitored condition</span>
              </div>
            </div>
          ))}

          {conditions.length === 0 ? (
            <div className="col-span-full rounded-card border border-dashed border-line-strong bg-surface-sunken p-8 text-center text-sm text-ink-muted">
              No medical conditions added yet. Click &quot;Add Condition&quot; above to record one.
            </div>
          ) : null}
        </div>
      </Card>

      {/* SECTION 3: MEDICINES */}
      <Card>
        <CardHeader>
          <div>
            <div className="flex items-center gap-2">
              <CardTitle>Prescribed Medicines</CardTitle>
              <Badge variant="green">दवाइयों की सूची</Badge>
            </div>
            <CardDescription>
              Schedule, dosage, frequency, and before/after food instructions
            </CardDescription>
          </div>
          <Button
            variant="primary"
            onClick={() => {
              setMedicineToEdit(null);
              setIsAddMedicineOpen(true);
            }}
            className="shrink-0"
          >
            <Plus className="h-4 w-4" />
            Add Medicine (दवाई जोड़ें)
          </Button>
        </CardHeader>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {medicines.map((med) => (
            <div
              key={med.id}
              className={`flex flex-col justify-between rounded-card border p-4 transition-all ${
                med.active
                  ? "border-line bg-surface shadow-e1"
                  : "border-line bg-surface-sunken opacity-70"
              }`}
            >
              <div>
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className={`grid h-9 w-9 place-items-center rounded-control ${
                      med.active ? "bg-positive-soft text-positive" : "bg-surface-sunken text-ink-subtle"
                    }`}>
                      <Pill className="h-4 w-4" />
                    </span>
                    <div>
                      <h3 className="text-base font-semibold text-ink">
                        {med.medicine_name}
                      </h3>
                      <p className="text-xs font-semibold text-emerald-700">
                        {med.dose}
                      </p>
                    </div>
                  </div>

                  <Badge variant={med.active ? "green" : "neutral"}>
                    {med.active ? "Active" : "Inactive"}
                  </Badge>
                </div>

                <div className="mt-4 space-y-1.5 text-xs text-ink-muted">
                  <div className="flex items-center justify-between">
                    <span className="text-ink-subtle font-medium">Scheduled Time:</span>
                    <span className="font-semibold text-ink">{med.scheduled_time.slice(0, 5)}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-ink-subtle font-medium">Food Relation:</span>
                    <span className="font-semibold text-ink">{med.meal_relation || "Not specified"}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-ink-subtle font-medium">Frequency:</span>
                    <span className="font-semibold text-ink capitalize">{med.frequency}</span>
                  </div>
                </div>
              </div>

              <div className="mt-5 flex items-center justify-between gap-2 border-t border-line pt-3">
                <button
                  type="button"
                  onClick={() => handleToggleMedicineActive(med)}
                  className="text-xs font-semibold text-ink-muted hover:text-brand-ink transition-colors"
                >
                  {med.active ? "Deactivate (निष्क्रिय करें)" : "Activate (सक्रिय करें)"}
                </button>

                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => {
                      setMedicineToEdit(med);
                      setIsAddMedicineOpen(true);
                    }}
                    className="flex h-8 w-8 items-center justify-center rounded-control text-ink-muted hover:bg-surface-sunken hover:text-ink transition-colors"
                    title="Edit medicine"
                  >
                    <Edit2 className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDeleteMedicine(med.id, med.medicine_name)}
                    className="flex h-8 w-8 items-center justify-center rounded-control text-ink-subtle hover:bg-critical-soft hover:text-critical transition-colors"
                    title="Delete medicine"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            </div>
          ))}

          {medicines.length === 0 ? (
            <div className="col-span-full rounded-card border border-dashed border-line-strong bg-surface-sunken p-8 text-center text-sm text-ink-muted">
              No medicines recorded yet. Click &quot;Add Medicine&quot; above to add your prescription.
            </div>
          ) : null}
        </div>
      </Card>

      {/* DIALOGS */}
      <EditPatientDialog
        isOpen={isEditProfileOpen}
        onClose={() => setIsEditProfileOpen(false)}
        patient={patient}
        onSuccess={() => {
          showToast("Profile updated successfully!");
          loadData();
        }}
      />

      <AddConditionDialog
        isOpen={isAddConditionOpen}
        onClose={() => setIsAddConditionOpen(false)}
        patientId={patient.id}
        onSuccess={() => {
          showToast("Medical condition added!");
          loadData();
        }}
      />

      <AddMedicineDialog
        isOpen={isAddMedicineOpen}
        onClose={() => {
          setIsAddMedicineOpen(false);
          setMedicineToEdit(null);
        }}
        patientId={patient.id}
        medicineToEdit={medicineToEdit}
        onSuccess={() => {
          showToast(medicineToEdit ? "Medicine updated!" : "Medicine added!");
          loadData();
        }}
      />
    </div>
  );
}
