"use client";

import { useState } from "react";
import { CheckCircle2, Footprints, HeartPulse, Plus, Scale, Utensils } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/page";
import { ProgressBar } from "@/components/ui/progress-bar";
import { useToast } from "@/components/ui/toast";
import { BPStatusChip, bpTextClass } from "@/components/dashboard/bp-status";
import { MedicineTodayCard } from "@/components/dashboard/medicine-today-card";
import { VitalTag } from "@/components/dashboard/vital-tag";
import { ManageMedicinesDialog } from "@/components/forms/manage-medicines-dialog";
import { useAuth } from "@/context/auth-context";
import {
  DEFAULT_BP_THRESHOLDS,
  classifyBP,
  isPlausibleBP,
  type BPThresholds,
} from "@/lib/health-rules";
import { fmtKg } from "@/components/health/format";
import { formatTimeIST } from "@/lib/medicine-format";
import { cn } from "@/lib/utils";
import { toggleChecklistItem, type BPLogEntry, type DashboardOverview } from "@/services/patient-service";

type DashboardSectionsProps = {
  data: DashboardOverview;
  bpThresholds?: BPThresholds;
  /** A dose or the medicine list changed: refresh the overview numbers. */
  onMedicineChange: () => void;
  onOpenBP: () => void;
  onOpenWeight: () => void;
  onOpenFood: () => void;
  onOpenActivity: () => void;
  onOpenMedicine: () => void;
};

function BPReadingTile({
  label,
  reading,
  thresholds,
}: {
  label: string;
  reading: BPLogEntry | null;
  thresholds: BPThresholds;
}) {
  if (!reading) {
    return (
      <div className="rounded-card border border-dashed border-line bg-surface-sunken p-4">
        <p lang="hi" className="text-xs font-semibold text-ink-muted">
          {label}
        </p>
        <p lang="hi" className="mt-1 text-sm text-ink-subtle">
          दर्ज नहीं किया
        </p>
      </div>
    );
  }
  const plausible = isPlausibleBP(reading.systolic, reading.diastolic);
  const tone = plausible ? bpTextClass(classifyBP(reading.systolic, reading.diastolic, thresholds)) : "text-ink";
  const time = formatTimeIST(reading.measured_at);
  return (
    <div className="rounded-card border border-bp-line bg-bp-soft p-4">
      <p lang="hi" className="text-xs font-semibold text-ink-muted">
        {label}
        {time ? <span className="tabular font-normal"> · {time}</span> : null}
      </p>
      <p className={cn("tabular mt-1 text-2xl font-bold", tone)}>
        {reading.systolic}/{reading.diastolic}
        <span className="text-xs font-semibold text-ink-muted"> mmHg</span>
      </p>
      <p className="mt-0.5 text-xs text-ink-muted">
        <span lang="hi">नब्ज़:</span> {reading.pulse ? `${reading.pulse} bpm` : "—"}
      </p>
      <BPStatusChip
        systolic={reading.systolic}
        diastolic={reading.diastolic}
        thresholds={thresholds}
        className="mt-2"
      />
    </div>
  );
}

export function DashboardSections({
  data,
  bpThresholds = DEFAULT_BP_THRESHOLDS,
  onMedicineChange,
  onOpenBP,
  onOpenWeight,
  onOpenFood,
  onOpenActivity,
  onOpenMedicine,
}: DashboardSectionsProps) {
  const { todayMorningBP, todayEveningBP, todayWeight, todayActivity, todayFoodCalories, todayProteinGrams, checklist, patient } =
    data;
  const { canWrite } = useAuth();
  const toast = useToast();

  const [isManageOpen, setIsManageOpen] = useState(false);
  // Optimistic checklist state; the rows are small and only this card edits them.
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [savingChecklist, setSavingChecklist] = useState<ReadonlySet<string>>(() => new Set());

  async function handleToggleChecklist(itemId: string, wasCompleted: boolean) {
    const next = !wasCompleted;
    setChecked((prev) => ({ ...prev, [itemId]: next }));
    setSavingChecklist((prev) => new Set(prev).add(itemId));
    try {
      await toggleChecklistItem(itemId, next);
    } catch {
      setChecked((prev) => ({ ...prev, [itemId]: wasCompleted }));
      toast.error("सेव नहीं हो पाया", "इंटरनेट जाँचकर दोबारा कोशिश करें।");
    } finally {
      setSavingChecklist((prev) => {
        const rest = new Set(prev);
        rest.delete(itemId);
        return rest;
      });
    }
  }

  const hasBP = Boolean(todayMorningBP || todayEveningBP);
  const goalDiff =
    todayWeight && patient.target_weight_kg ? Math.round((todayWeight.weight_kg - patient.target_weight_kg) * 10) / 10 : null;

  return (
    <div className="grid gap-5 xl:grid-cols-2">
      {/* 1. TODAY'S MEALS */}
      <Card>
        <CardHeader>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <CardTitle>Today&apos;s Meals</CardTitle>
              <VitalTag tone="food">
                <Utensils aria-hidden className="h-3.5 w-3.5" />
                <span lang="hi">आज का भोजन</span>
              </VitalTag>
            </div>
            <CardDescription>
              {todayFoodCalories !== null
                ? `${Math.round(todayFoodCalories)} / ${patient.daily_calorie_target} kcal`
                : "आज अभी तक कोई भोजन दर्ज नहीं है"}
            </CardDescription>
          </div>
          {canWrite ? (
            <Button variant="secondary" onClick={onOpenFood}>
              <Plus aria-hidden className="h-4 w-4" />
              <span lang="hi">भोजन जोड़ें</span>
            </Button>
          ) : null}
        </CardHeader>

        {todayFoodCalories !== null ? (
          <div className="space-y-3">
            <div className="rounded-card border border-food-line bg-food-soft p-4">
              <div className="flex items-center justify-between text-sm">
                <span lang="hi" className="font-semibold text-ink">
                  कुल कैलोरी
                </span>
                <span className="tabular font-semibold text-food">{Math.round(todayFoodCalories)} kcal</span>
              </div>
              <div className="mt-1 flex items-center justify-between text-xs text-ink-muted">
                <span lang="hi">कुल प्रोटीन</span>
                <span className="tabular font-semibold text-ink">
                  {todayProteinGrams ? `${Math.round(todayProteinGrams)} g` : "—"}
                </span>
              </div>
            </div>
            <ProgressBar label="रोज़ाना कैलोरी लक्ष्य" max={patient.daily_calorie_target} value={todayFoodCalories} />
          </div>
        ) : (
          <EmptyState
            icon={Utensils}
            title="No meals logged today"
            hindiTitle="आज कोई भोजन दर्ज नहीं किया गया है।"
            action={
              canWrite ? (
                <Button variant="secondary" onClick={onOpenFood}>
                  <Plus aria-hidden className="h-4 w-4" />
                  <span lang="hi">भोजन दर्ज करें</span>
                </Button>
              ) : undefined
            }
          />
        )}
      </Card>

      {/* 2. MEDICINES (the one place doses are marked on the dashboard) */}
      <MedicineTodayCard
        patientId={patient.id}
        onOpenTracker={onOpenMedicine}
        onManage={() => setIsManageOpen(true)}
        onChange={onMedicineChange}
      />

      {/* 3. BLOOD PRESSURE */}
      <Card>
        <CardHeader>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <CardTitle>Blood Pressure</CardTitle>
              <VitalTag tone="bp">
                <HeartPulse aria-hidden className="h-3.5 w-3.5" />
                <span lang="hi">रक्तचाप</span>
              </VitalTag>
            </div>
            <CardDescription>{hasBP ? "आज की रीडिंग" : "आज की रीडिंग का इंतज़ार"}</CardDescription>
          </div>
          {canWrite ? (
            <Button variant="secondary" onClick={onOpenBP}>
              <Plus aria-hidden className="h-4 w-4" />
              <span lang="hi">BP दर्ज करें</span>
            </Button>
          ) : null}
        </CardHeader>

        {hasBP ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <BPReadingTile label="सुबह · Morning" reading={todayMorningBP} thresholds={bpThresholds} />
            <BPReadingTile label="शाम · Evening" reading={todayEveningBP} thresholds={bpThresholds} />
          </div>
        ) : (
          <EmptyState
            icon={HeartPulse}
            title="No BP recorded today"
            hindiTitle="आज का BP दर्ज नहीं किया गया है।"
            action={
              canWrite ? (
                <Button variant="secondary" onClick={onOpenBP}>
                  <Plus aria-hidden className="h-4 w-4" />
                  <span lang="hi">BP दर्ज करें</span>
                </Button>
              ) : undefined
            }
          />
        )}
      </Card>

      {/* 4. WEIGHT */}
      <Card>
        <CardHeader>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <CardTitle>Body Weight</CardTitle>
              <VitalTag tone="weight">
                <Scale aria-hidden className="h-3.5 w-3.5" />
                <span lang="hi">वजन</span>
              </VitalTag>
            </div>
            <CardDescription>{todayWeight ? "आज का वजन दर्ज है" : "आज का वजन अभी दर्ज नहीं है"}</CardDescription>
          </div>
          {canWrite ? (
            <Button variant="secondary" onClick={onOpenWeight}>
              <Plus aria-hidden className="h-4 w-4" />
              <span lang="hi">वजन दर्ज करें</span>
            </Button>
          ) : null}
        </CardHeader>

        {todayWeight ? (
          <div className="rounded-card border border-weight-line bg-weight-soft p-4">
            <p className="tabular text-3xl font-bold text-ink">
              {fmtKg(todayWeight.weight_kg)}
              <span className="text-sm font-semibold text-ink-muted"> kg</span>
            </p>
            {patient.target_weight_kg ? (
              <p className="mt-1 text-xs font-medium text-ink-muted">
                <span lang="hi">लक्ष्य:</span> {patient.target_weight_kg} kg ·{" "}
                {goalDiff === null || goalDiff === 0 ? (
                  <span lang="hi">लक्ष्य पर</span>
                ) : goalDiff > 0 ? (
                  <span lang="hi">लक्ष्य से {goalDiff} kg ऊपर</span>
                ) : (
                  <span lang="hi">लक्ष्य से {Math.abs(goalDiff)} kg नीचे</span>
                )}
              </p>
            ) : (
              <p lang="hi" className="mt-1 text-xs text-ink-muted">
                लक्ष्य वजन अभी तय नहीं है
              </p>
            )}
            {todayWeight.notes ? <p className="mt-2 text-xs italic text-ink-muted">&quot;{todayWeight.notes}&quot;</p> : null}
          </div>
        ) : (
          <EmptyState
            icon={Scale}
            title="No weight recorded today"
            hindiTitle="आज का वजन दर्ज नहीं किया गया है।"
            description={patient.current_weight_kg ? `आख़िरी दर्ज वजन: ${patient.current_weight_kg} kg` : undefined}
            action={
              canWrite ? (
                <Button variant="secondary" onClick={onOpenWeight}>
                  <Plus aria-hidden className="h-4 w-4" />
                  <span lang="hi">वजन दर्ज करें</span>
                </Button>
              ) : undefined
            }
          />
        )}
      </Card>

      {/* 5. PHYSICAL ACTIVITY */}
      <Card>
        <CardHeader>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <CardTitle>Physical Activity</CardTitle>
              <VitalTag tone="activity">
                <Footprints aria-hidden className="h-3.5 w-3.5" />
                <span lang="hi">शारीरिक गतिविधि</span>
              </VitalTag>
            </div>
            <CardDescription>कदम, दूरी और चलने का समय</CardDescription>
          </div>
          {canWrite ? (
            <Button variant="secondary" onClick={onOpenActivity}>
              <Plus aria-hidden className="h-4 w-4" />
              <span lang="hi">कदम दर्ज करें</span>
            </Button>
          ) : null}
        </CardHeader>

        {todayActivity && (todayActivity.steps > 0 || todayActivity.distance_km > 0 || todayActivity.walking_minutes > 0) ? (
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-card border border-activity-line bg-activity-soft p-4">
              <p className="text-xs font-semibold text-activity">
                <span lang="hi">कदम</span> · Steps
              </p>
              <p className="tabular mt-1 text-2xl font-bold text-ink">{todayActivity.steps.toLocaleString("en-IN")}</p>
            </div>
            <div className="rounded-card border border-activity-line bg-activity-soft p-4">
              <p className="text-xs font-semibold text-activity">
                <span lang="hi">दूरी</span> · Distance
              </p>
              <p className="tabular mt-1 text-2xl font-bold text-ink">{todayActivity.distance_km} km</p>
            </div>
            <div className="rounded-card border border-line bg-surface-sunken p-4">
              <p className="text-xs font-semibold text-ink-muted">
                <span lang="hi">समय</span> · Active time
              </p>
              <p className="tabular mt-1 text-2xl font-bold text-ink">{todayActivity.walking_minutes || 0} min</p>
            </div>
          </div>
        ) : (
          <EmptyState
            icon={Footprints}
            title="No activity recorded today"
            hindiTitle="आज के कदम दर्ज नहीं किए गए हैं।"
            action={
              canWrite ? (
                <Button variant="secondary" onClick={onOpenActivity}>
                  <Plus aria-hidden className="h-4 w-4" />
                  <span lang="hi">कदम दर्ज करें</span>
                </Button>
              ) : undefined
            }
          />
        )}
      </Card>

      {/* 6. TODAY'S CHECKLIST */}
      <Card className="xl:col-span-2">
        <CardHeader>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <CardTitle>Today&apos;s Routine Checklist</CardTitle>
              <VitalTag tone="activity">
                <span lang="hi">दैनिक कार्य सूची</span>
              </VitalTag>
            </div>
            <CardDescription>रोज़ के काम पूरे होने पर टिक करें</CardDescription>
          </div>
          <CheckCircle2 aria-hidden className="h-5 w-5 text-positive" />
        </CardHeader>

        {checklist.length === 0 ? (
          <p lang="hi" className="text-sm text-ink-muted">
            आज की सूची अभी उपलब्ध नहीं है।
          </p>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {checklist.map((item) => {
              const isCompleted = checked[item.id] ?? item.status === "completed";
              return (
                <li key={item.id}>
                  <label
                    className={cn(
                      "flex min-h-16 items-center gap-3 rounded-card border p-3 text-sm font-medium transition-colors",
                      canWrite ? "cursor-pointer" : "cursor-default",
                      isCompleted
                        ? "border-positive-line bg-positive-soft text-positive"
                        : "border-line bg-surface text-ink-muted hover:border-positive-line hover:bg-surface-sunken",
                    )}
                  >
                    <input
                      type="checkbox"
                      checked={isCompleted}
                      disabled={!canWrite || savingChecklist.has(item.id)}
                      onChange={() => void handleToggleChecklist(item.id, isCompleted)}
                      className="h-5 w-5 shrink-0 accent-positive"
                    />
                    <span className={cn(isCompleted && "text-ink-muted line-through")}>{item.item_label}</span>
                  </label>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      {isManageOpen ? (
        <ManageMedicinesDialog
          isOpen={isManageOpen}
          onClose={() => setIsManageOpen(false)}
          patientId={patient.id}
          onSuccess={onMedicineChange}
        />
      ) : null}
    </div>
  );
}
