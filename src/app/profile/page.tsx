"use client";

import { useState } from "react";
import type { LucideIcon } from "lucide-react";
import { Calendar, Edit2, Heart, Lock, Pill, Plus, Ruler, Scale, ShieldCheck, Trash2, Utensils } from "lucide-react";
import { AddConditionDialog } from "@/components/forms/add-condition-dialog";
import { AddMedicineDialog } from "@/components/forms/add-medicine-dialog";
import { EditPatientDialog } from "@/components/forms/edit-patient-dialog";
import { NoPatientState } from "@/components/health/no-patient-state";
import { isNoPatientError, loadErrorMessage, useAsyncData } from "@/components/health/use-async-data";
import { Badge } from "@/components/ui/badge";
import { Button, IconButton } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle, metricChipClasses } from "@/components/ui/card";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { EmptyState, ErrorState, PageBody, PageHeader } from "@/components/ui/page";
import { useToast } from "@/components/ui/toast";
import { useAuth } from "@/context/auth-context";
import { frequencyLabel, mealRelationLabel } from "@/lib/medicine-format";
import { cn } from "@/lib/utils";
import {
  deleteMedicalCondition,
  deleteMedicine,
  getMedicalConditions,
  getMedicines,
  getPatientProfile,
  updateMedicine,
  type MedicineItem,
} from "@/services/patient-service";

function InfoTile({
  icon: Icon,
  tone,
  label,
  value,
  helper,
}: {
  icon: LucideIcon;
  tone: keyof typeof metricChipClasses;
  label: string;
  value: string;
  helper: string;
}) {
  return (
    <div className="tile rounded-card p-3.5 sm:p-4">
      <div className="flex items-center gap-2 text-xs font-semibold text-ink-muted">
        <span className={cn("grid h-7 w-7 shrink-0 place-items-center rounded-field", metricChipClasses[tone])}>
          <Icon aria-hidden className="h-4 w-4" />
        </span>
        <span className="min-w-0 truncate">{label}</span>
      </div>
      <p className="tabular mt-2 text-lg font-semibold leading-tight text-ink sm:text-xl">{value}</p>
      <p lang="hi" className="mt-0.5 text-xs text-ink-muted sm:text-sm">
        {helper}
      </p>
    </div>
  );
}

/** "08:00:00" -> "8:00 am". A schedule is a clock time in India, so no timezone maths. */
function clock12(scheduled: string): string {
  const [h, m] = scheduled.split(":").map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return scheduled.slice(0, 5);
  return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${h >= 12 ? "pm" : "am"}`;
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  return (parts[0][0] + (parts[1]?.[0] ?? "")).toUpperCase();
}

const ROLE_BADGE = { owner: "मालिक · Owner", editor: "एडिटर · Editor", viewer: "सिर्फ़ देखने वाला · Viewer" } as const;

export default function ProfilePage() {
  const { activePatientId, canWrite, memberRole, loading: authLoading } = useAuth();
  const toast = useToast();
  const confirm = useConfirm();

  const { data, error, loading, reload } = useAsyncData(
    async () => {
      const pid = activePatientId!;
      const [patient, conditions, medicines] = await Promise.all([
        getPatientProfile(pid),
        getMedicalConditions(pid),
        getMedicines(pid),
      ]);
      return { patient, conditions, medicines };
    },
    [activePatientId],
    activePatientId !== null,
  );

  const [isEditProfileOpen, setIsEditProfileOpen] = useState(false);
  const [isAddConditionOpen, setIsAddConditionOpen] = useState(false);
  const [isAddMedicineOpen, setIsAddMedicineOpen] = useState(false);
  const [medicineToEdit, setMedicineToEdit] = useState<MedicineItem | null>(null);

  const header = (
    <PageHeader
      eyebrow="Patient profile"
      title="Profile & medical background"
      hindiTitle="मरीज़ की प्रोफ़ाइल, बीमारियाँ और दवाइयाँ"
      description="व्यक्तिगत जानकारी, पुरानी बीमारियाँ और चल रही दवाइयाँ एक जगह।"
    />
  );

  if (!authLoading && activePatientId === null) {
    return (
      <PageBody>
        {header}
        <NoPatientState what="प्रोफ़ाइल" />
      </PageBody>
    );
  }

  if (error) {
    return (
      <PageBody>
        {header}
        {isNoPatientError(error) ? (
          <NoPatientState what="प्रोफ़ाइल" />
        ) : (
          <ErrorState
            title="प्रोफ़ाइल लोड नहीं हो पाई"
            englishTitle="The profile could not be loaded"
            description={loadErrorMessage(error)}
            onRetry={reload}
          />
        )}
      </PageBody>
    );
  }

  if (authLoading || loading || !data || !activePatientId) {
    return (
      <PageBody>
        {header}
        <div aria-busy="true" aria-label="लोड हो रहा है" className="space-y-5">
          <div className="skeleton h-44 rounded-card" />
          <div className="skeleton h-40 rounded-card" />
          <div className="skeleton h-52 rounded-card" />
        </div>
      </PageBody>
    );
  }

  const { patient, conditions, medicines } = data;

  async function handleDeleteCondition(id: string, name: string) {
    const ok = await confirm({
      title: `"${name}" हटाएँ?`,
      message: "यह स्थिति प्रोफ़ाइल से हट जाएगी।",
      tone: "danger",
    });
    if (!ok) return;
    try {
      await deleteMedicalCondition(id);
      toast.success(`"${name}" हटा दिया गया`, "Condition removed.");
      reload();
    } catch (err) {
      toast.error("हटाया नहीं जा सका", err instanceof Error ? err.message : undefined);
    }
  }

  async function handleToggleMedicineActive(med: MedicineItem) {
    const nextActive = !med.active;
    try {
      await updateMedicine(med.id, { active: nextActive });
      toast.success(
        nextActive ? `${med.medicine_name} फिर से चालू` : `${med.medicine_name} बंद किया गया`,
        nextActive ? "Medicine activated." : "Medicine deactivated. Its reminders and due doses stop.",
      );
      reload();
    } catch (err) {
      toast.error("बदलाव नहीं हो पाया", err instanceof Error ? err.message : undefined);
    }
  }

  async function handleDeleteMedicine(id: string, name: string) {
    const ok = await confirm({
      title: `"${name}" दवाई हटाएँ?`,
      message: "यह दवाई सूची से हट जाएगी। अगर इसे बस रोकना है तो हटाने की जगह “निष्क्रिय करें” चुनें।",
      tone: "danger",
    });
    if (!ok) return;
    try {
      await deleteMedicine(id);
      toast.success(`${name} हटा दी गई`, "Medicine deleted.");
      reload();
    } catch (err) {
      toast.error("हटाया नहीं जा सका", err instanceof Error ? err.message : undefined);
    }
  }

  const weightGap =
    patient.current_weight_kg && patient.target_weight_kg
      ? Number((patient.current_weight_kg - patient.target_weight_kg).toFixed(1))
      : null;

  // Running medicines first, then by the clock, so the list reads like the day.
  const sortedMedicines = [...medicines].sort(
    (x, y) => Number(y.active) - Number(x.active) || x.scheduled_time.localeCompare(y.scheduled_time),
  );

  const openAddMedicine = () => {
    setMedicineToEdit(null);
    setIsAddMedicineOpen(true);
  };

  return (
    <PageBody>
      {header}

      {!canWrite ? (
        <p lang="hi" className="flex items-start gap-2.5 rounded-card border border-info-line bg-info-soft px-4 py-3 text-sm text-ink">
          <Lock aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-info" />
          आपके पास सिर्फ़ देखने की अनुमति है, इसलिए यहाँ बदलाव बंद हैं।
        </p>
      ) : null}

      <Card tone="premium" className="space-y-5">
        <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
          <div className="flex min-w-0 items-center gap-3.5 sm:gap-4">
            <span
              aria-hidden
              className="grad-gold-button grid h-14 w-14 shrink-0 place-items-center rounded-full border border-gold-line text-xl font-bold text-gold-ink shadow-gold-button sm:h-16 sm:w-16 sm:text-2xl"
            >
              {initials(patient.name)}
            </span>
            <div className="min-w-0">
              <h2 className="truncate text-xl font-semibold leading-tight text-ink sm:text-2xl">{patient.name}</h2>
              <p lang="hi" className="mt-0.5 text-sm text-ink-muted">
                {patient.age ? `${patient.age} साल` : "उम्र दर्ज नहीं"}
                {patient.gender ? ` · ${patient.gender}` : ""}
              </p>
              <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                {memberRole ? (
                  <Badge variant="brand">
                    <span lang="hi">{ROLE_BADGE[memberRole]}</span>
                  </Badge>
                ) : null}
                {conditions.slice(0, 3).map((c) => (
                  <Badge key={c.id} variant="info">
                    {c.condition_name}
                  </Badge>
                ))}
                {conditions.length > 3 ? <Badge variant="neutral">+{conditions.length - 3}</Badge> : null}
              </div>
            </div>
          </div>
          {canWrite ? (
            <Button variant="secondary" onClick={() => setIsEditProfileOpen(true)}>
              <Edit2 aria-hidden className="h-4 w-4" />
              संपादित करें (Edit)
            </Button>
          ) : null}
        </div>

        <div className="grid grid-cols-2 gap-2.5 sm:gap-3 lg:grid-cols-4">
          <InfoTile
            icon={Scale}
            tone="weight"
            label="वजन · Weight"
            value={patient.current_weight_kg ? `${patient.current_weight_kg} kg` : "—"}
            helper={patient.current_weight_kg ? "अभी का वजन" : "दर्ज नहीं"}
          />
          <InfoTile
            icon={Ruler}
            tone="activity"
            label="कद · Height"
            value={patient.height_cm ? `${patient.height_cm} cm` : "—"}
            helper={patient.height_cm ? "दर्ज कद" : "दर्ज नहीं"}
          />
          <InfoTile
            icon={Heart}
            tone="bp"
            label="लक्ष्य · Target"
            value={patient.target_weight_kg ? `${patient.target_weight_kg} kg` : "—"}
            helper={
              weightGap === null
                ? "लक्ष्य वजन तय नहीं"
                : weightGap === 0
                  ? "लक्ष्य के बराबर"
                  : `लक्ष्य से ${Math.abs(weightGap)} kg ${weightGap > 0 ? "ज़्यादा" : "कम"}`
            }
          />
          <InfoTile
            icon={Utensils}
            tone="food"
            label="कैलोरी · Calories"
            value={`${patient.daily_calorie_target} kcal`}
            helper="रोज़ का कैलोरी लक्ष्य"
          />
        </div>
      </Card>

      <Card>
        <CardHeader>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <CardTitle>Medical conditions</CardTitle>
              <Badge variant="info" lang="hi">
                स्वास्थ्य की स्थितियाँ
              </Badge>
            </div>
            <CardDescription>पुरानी बीमारियाँ, एलर्जी और दिल से जुड़ा इतिहास</CardDescription>
          </div>
          {canWrite ? (
            <Button variant="secondary" onClick={() => setIsAddConditionOpen(true)}>
              <Plus aria-hidden className="h-4 w-4" />
              स्थिति जोड़ें (Add)
            </Button>
          ) : null}
        </CardHeader>

        {conditions.length > 0 ? (
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {conditions.map((cond) => (
              <li key={cond.id} className="tile flex flex-col justify-between rounded-card p-4">
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="min-w-0 text-base font-semibold text-ink">{cond.condition_name}</h3>
                    {canWrite ? (
                      <IconButton
                        variant="ghost"
                        size="sm"
                        className="-mr-1.5 -mt-1.5"
                        aria-label={`हटाएँ (Remove) — ${cond.condition_name}`}
                        onClick={() => void handleDeleteCondition(cond.id, cond.condition_name)}
                      >
                        <Trash2 aria-hidden className="h-4 w-4" />
                      </IconButton>
                    ) : null}
                  </div>
                  {cond.diagnosed_year ? (
                    <p lang="hi" className="mt-1.5 flex items-center gap-1.5 text-xs font-medium text-ink-muted">
                      <Calendar aria-hidden className="h-3.5 w-3.5" />
                      {cond.diagnosed_year} में पता चला
                    </p>
                  ) : null}
                  {cond.notes ? <p className="mt-2 text-xs leading-relaxed text-ink-muted">{cond.notes}</p> : null}
                </div>
                <p lang="hi" className="mt-4 flex items-center gap-1 border-t border-line pt-3 text-xs text-ink-subtle">
                  <ShieldCheck aria-hidden className="h-3.5 w-3.5" />
                  निगरानी में
                </p>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState
            icon={ShieldCheck}
            title="अभी कोई स्थिति दर्ज नहीं"
            description="No medical conditions recorded yet."
            action={
              canWrite ? (
                <Button variant="secondary" onClick={() => setIsAddConditionOpen(true)}>
                  <Plus aria-hidden className="h-4 w-4" />
                  पहली स्थिति जोड़ें
                </Button>
              ) : undefined
            }
          />
        )}
      </Card>

      <Card>
        <CardHeader>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <CardTitle>Prescribed medicines</CardTitle>
              <Badge variant="neutral" lang="hi">
                दवाइयों की सूची
              </Badge>
            </div>
            <CardDescription>समय, मात्रा, कितनी बार और खाने से पहले/बाद</CardDescription>
          </div>
          {canWrite ? (
            <Button variant="primary" onClick={openAddMedicine}>
              <Plus aria-hidden className="h-4 w-4" />
              दवाई जोड़ें (Add)
            </Button>
          ) : null}
        </CardHeader>

        {sortedMedicines.length > 0 ? (
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {sortedMedicines.map((med) => {
              const meal = mealRelationLabel(med.meal_relation);
              return (
                <li
                  key={med.id}
                  className={cn(
                    "flex flex-col justify-between rounded-card p-4",
                    med.active ? "tile" : "border border-line bg-surface-sunken",
                  )}
                >
                  <div>
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex min-w-0 items-center gap-2.5">
                        <span
                          className={cn(
                            "grid h-9 w-9 shrink-0 place-items-center rounded-control",
                            med.active ? metricChipClasses.meds : "bg-surface text-ink-subtle",
                          )}
                        >
                          <Pill aria-hidden className="h-4 w-4" />
                        </span>
                        <div className="min-w-0">
                          <h3 className="truncate text-base font-semibold text-ink">{med.medicine_name}</h3>
                          <p className="text-xs font-medium text-ink-muted">{med.dose}</p>
                        </div>
                      </div>
                      <Badge variant={med.active ? "positive" : "neutral"}>
                        <span lang="hi">{med.active ? "चालू" : "बंद"}</span>
                      </Badge>
                    </div>

                    <dl className="mt-4 space-y-1.5 text-xs">
                      <div className="flex items-center justify-between gap-3">
                        <dt className="text-ink-muted">
                          <span lang="hi">समय</span> (Time)
                        </dt>
                        <dd className="tabular font-semibold text-ink">{clock12(med.scheduled_time)}</dd>
                      </div>
                      <div className="flex items-center justify-between gap-3">
                        <dt className="text-ink-muted">
                          <span lang="hi">खाने से</span> (Food)
                        </dt>
                        <dd lang="hi" className="text-right font-semibold text-ink">
                          {meal ?? "तय नहीं"}
                        </dd>
                      </div>
                      <div className="flex items-center justify-between gap-3">
                        <dt className="text-ink-muted">
                          <span lang="hi">कितनी बार</span> (Frequency)
                        </dt>
                        <dd lang="hi" className="text-right font-semibold text-ink">
                          {frequencyLabel(med.frequency) ?? "—"}
                        </dd>
                      </div>
                    </dl>
                  </div>

                  {canWrite ? (
                    <div className="mt-4 flex items-center justify-between gap-2 border-t border-line pt-3">
                      <Button variant="ghost" size="sm" onClick={() => void handleToggleMedicineActive(med)}>
                        {med.active ? "निष्क्रिय करें" : "सक्रिय करें"}
                      </Button>
                      <div className="flex items-center gap-1">
                        <IconButton
                          variant="ghost"
                          size="sm"
                          aria-label={`बदलें (Edit) — ${med.medicine_name}`}
                          onClick={() => {
                            setMedicineToEdit(med);
                            setIsAddMedicineOpen(true);
                          }}
                        >
                          <Edit2 aria-hidden className="h-4 w-4" />
                        </IconButton>
                        <IconButton
                          variant="ghost"
                          size="sm"
                          aria-label={`हटाएँ (Delete) — ${med.medicine_name}`}
                          onClick={() => void handleDeleteMedicine(med.id, med.medicine_name)}
                        >
                          <Trash2 aria-hidden className="h-4 w-4" />
                        </IconButton>
                      </div>
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        ) : (
          <EmptyState
            icon={Pill}
            title="अभी कोई दवाई दर्ज नहीं"
            description="No medicines recorded yet. Add the prescription to get dose reminders and adherence."
            action={
              canWrite ? (
                <Button variant="primary" onClick={openAddMedicine}>
                  <Plus aria-hidden className="h-4 w-4" />
                  पहली दवाई जोड़ें
                </Button>
              ) : undefined
            }
          />
        )}
      </Card>

      {canWrite ? (
        <>
          <EditPatientDialog
            isOpen={isEditProfileOpen}
            onClose={() => setIsEditProfileOpen(false)}
            patient={patient}
            onSuccess={() => {
              toast.success("प्रोफ़ाइल अपडेट हो गई", "Profile updated.");
              reload();
            }}
          />
          <AddConditionDialog
            isOpen={isAddConditionOpen}
            onClose={() => setIsAddConditionOpen(false)}
            patientId={patient.id}
            onSuccess={() => {
              toast.success("स्थिति जोड़ दी गई", "Condition added.");
              reload();
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
              toast.success(medicineToEdit ? "दवाई अपडेट हो गई" : "दवाई जोड़ दी गई", medicineToEdit ? "Medicine updated." : "Medicine added.");
              reload();
            }}
          />
        </>
      ) : null}
    </PageBody>
  );
}
