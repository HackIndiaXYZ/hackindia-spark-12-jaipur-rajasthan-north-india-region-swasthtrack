"use client";

import { useState, type ReactNode } from "react";
import { CheckCircle2, Footprints, HeartPulse, ListChecks, Plus, Scale, Utensils } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/page";
import { ProgressBar } from "@/components/ui/progress-bar";
import { Sparkline } from "@/components/ui/sparkline";
import { useToast } from "@/components/ui/toast";
import { BPStatusChip, bpTextClass } from "@/components/dashboard/bp-status";
import { MedicineTodayCard } from "@/components/dashboard/medicine-today-card";
import { RecordHeader } from "@/components/dashboard/record-header";
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
import {
  toggleChecklistItem,
  type BPLogEntry,
  type DailyChecklistEntry,
  type DashboardOverview,
} from "@/services/patient-service";

/**
 * The "Today's records" cards. They used to be one grid component; the page now
 * places each one itself (a two-column dashboard on wide screens, one priority
 * order on a phone), so each is its own export and they share one header.
 */

/**
 * In a card header the title already says what is being recorded, so the visible label is
 * the short "दर्ज करें" and the full phrase is the accessible name; elsewhere (empty states)
 * the full label is shown.
 */
function AddButton({ label, onClick, compact = false }: { label: string; onClick: () => void; compact?: boolean }) {
  return (
    <Button variant="secondary" onClick={onClick} aria-label={compact ? label : undefined}>
      <Plus aria-hidden className="h-4 w-4" />
      <span lang="hi">{compact ? "दर्ज करें" : label}</span>
    </Button>
  );
}

/** A labelled number on frosted glass. */
function StatTile({
  label,
  hindiLabel,
  englishFromSm = false,
  value,
  unit,
  valueClassName,
  children,
  className,
}: {
  label: string;
  hindiLabel?: string;
  /** Narrow tiles (three across on a phone) show the Hindi label alone and add the English from `sm`. */
  englishFromSm?: boolean;
  value: ReactNode;
  unit?: string;
  valueClassName?: string;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("tile rounded-card p-3.5", className)}>
      <p className="text-xs font-semibold text-ink-muted">
        {hindiLabel ? <span lang="hi">{hindiLabel}</span> : null}
        {englishFromSm ? (
          <span className="hidden sm:inline"> · {label}</span>
        ) : (
          <>
            {hindiLabel ? " · " : null}
            {label}
          </>
        )}
      </p>
      <p className={cn("tabular mt-1 text-2xl font-semibold leading-tight text-ink", valueClassName)}>
        {value}
        {unit ? <span className="ml-1 text-sm font-medium text-ink-muted">{unit}</span> : null}
      </p>
      {children}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Meals
// ---------------------------------------------------------------------------

export function MealsCard({ data, onOpenFood }: { data: DashboardOverview; onOpenFood: () => void }) {
  const { canWrite } = useAuth();
  const { todayFoodCalories, todayProteinGrams, todayFoodCount, patient } = data;

  return (
    <Card aria-label="Today's meals — आज का भोजन">
      <RecordHeader
        icon={Utensils}
        tone="food"
        title="Today's Meals"
        hindiTitle="आज का भोजन"
        subtitle={
          todayFoodCalories !== null
            ? `${Math.round(todayFoodCalories)} / ${patient.daily_calorie_target} kcal`
            : "आज अभी तक कोई भोजन दर्ज नहीं है"
        }
        action={canWrite ? <AddButton compact label="भोजन जोड़ें" onClick={onOpenFood} /> : null}
      />

      {todayFoodCalories !== null ? (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2.5">
            <StatTile label="Calories" hindiLabel="कुल कैलोरी" value={Math.round(todayFoodCalories)} unit="kcal" />
            <StatTile
              label="Protein"
              hindiLabel="कुल प्रोटीन"
              value={todayProteinGrams ? Math.round(todayProteinGrams) : "—"}
              unit={todayProteinGrams ? "g" : undefined}
            >
              {todayFoodCount > 0 ? (
                <p lang="hi" className="mt-0.5 text-2xs text-ink-muted">
                  {todayFoodCount} व्यंजन दर्ज
                </p>
              ) : null}
            </StatTile>
          </div>
          <ProgressBar label="रोज़ाना कैलोरी लक्ष्य" max={patient.daily_calorie_target} value={todayFoodCalories} />
        </div>
      ) : (
        <EmptyState
          icon={Utensils}
          title="No meals logged today"
          hindiTitle="आज कोई भोजन दर्ज नहीं किया गया है।"
          action={canWrite ? <AddButton label="भोजन दर्ज करें" onClick={onOpenFood} /> : undefined}
        />
      )}
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Medicines (the one place doses are marked on the dashboard)
// ---------------------------------------------------------------------------

export function MedicinesSection({
  patientId,
  onOpenTracker,
  onChange,
}: {
  patientId: string;
  onOpenTracker: () => void;
  /** A dose or the medicine list changed: refresh the overview numbers. */
  onChange: () => void;
}) {
  const [isManageOpen, setIsManageOpen] = useState(false);
  return (
    <>
      <MedicineTodayCard
        patientId={patientId}
        onOpenTracker={onOpenTracker}
        onManage={() => setIsManageOpen(true)}
        onChange={onChange}
      />
      {isManageOpen ? (
        <ManageMedicinesDialog
          isOpen={isManageOpen}
          onClose={() => setIsManageOpen(false)}
          patientId={patientId}
          onSuccess={onChange}
        />
      ) : null}
    </>
  );
}

// ---------------------------------------------------------------------------
// Blood pressure
// ---------------------------------------------------------------------------

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
      <div className="rounded-card border border-dashed border-line-strong bg-surface-sunken p-3.5">
        <p lang="hi" className="text-xs font-semibold text-ink-muted">
          {label}
        </p>
        <p lang="hi" className="mt-1 text-sm text-ink-muted">
          दर्ज नहीं किया
        </p>
      </div>
    );
  }
  const plausible = isPlausibleBP(reading.systolic, reading.diastolic);
  const tone = plausible ? bpTextClass(classifyBP(reading.systolic, reading.diastolic, thresholds)) : "text-ink";
  const time = formatTimeIST(reading.measured_at);
  return (
    <div className="tile rounded-card p-3.5">
      <p lang="hi" className="text-xs font-semibold text-ink-muted">
        {label}
      </p>
      <p className={cn("tabular mt-1 flex flex-wrap items-baseline gap-x-1 text-2xl font-semibold leading-tight", tone)}>
        <span>
          {reading.systolic}/{reading.diastolic}
        </span>
        <span className="text-xs font-medium text-ink-muted">mmHg</span>
      </p>
      <p className="tabular mt-0.5 text-xs text-ink-muted">
        {time ?? "—"}
        <span className="block">
          <span lang="hi">नब्ज़:</span> {reading.pulse ? `${reading.pulse} bpm` : "—"}
        </span>
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

export function BloodPressureCard({
  data,
  bpThresholds = DEFAULT_BP_THRESHOLDS,
  onOpenBP,
}: {
  data: DashboardOverview;
  bpThresholds?: BPThresholds;
  onOpenBP: () => void;
}) {
  const { canWrite } = useAuth();
  const { todayMorningBP, todayEveningBP, trends } = data;
  const hasBP = Boolean(todayMorningBP || todayEveningBP);

  return (
    <Card aria-label="Blood pressure — रक्तचाप">
      <RecordHeader
        icon={HeartPulse}
        tone="bp"
        title="Blood Pressure"
        hindiTitle="रक्तचाप"
        subtitle={hasBP ? "आज की रीडिंग" : "आज की रीडिंग का इंतज़ार"}
        action={canWrite ? <AddButton compact label="BP दर्ज करें" onClick={onOpenBP} /> : null}
      />

      {hasBP ? (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2.5">
            <BPReadingTile label="सुबह · Morning" reading={todayMorningBP} thresholds={bpThresholds} />
            <BPReadingTile label="शाम · Evening" reading={todayEveningBP} thresholds={bpThresholds} />
          </div>
          {trends.systolic.length > 1 ? (
            <div className="tile rounded-card px-3.5 py-2.5">
              <p lang="hi" className="mb-1 text-2xs font-medium text-ink-muted">
                ऊपरी BP · पिछली {trends.systolic.length} रीडिंग
              </p>
              <Sparkline values={trends.systolic} tone="bp" height={36} />
            </div>
          ) : null}
        </div>
      ) : (
        <EmptyState
          icon={HeartPulse}
          title="No BP recorded today"
          hindiTitle="आज का BP दर्ज नहीं किया गया है।"
          action={canWrite ? <AddButton label="BP दर्ज करें" onClick={onOpenBP} /> : undefined}
        />
      )}
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Weight
// ---------------------------------------------------------------------------

export function WeightCard({ data, onOpenWeight }: { data: DashboardOverview; onOpenWeight: () => void }) {
  const { canWrite } = useAuth();
  const { todayWeight, patient, trends } = data;
  const goalDiff =
    todayWeight && patient.target_weight_kg ? Math.round((todayWeight.weight_kg - patient.target_weight_kg) * 10) / 10 : null;

  return (
    <Card aria-label="Body weight — वजन">
      <RecordHeader
        icon={Scale}
        tone="weight"
        title="Body Weight"
        hindiTitle="वजन"
        subtitle={todayWeight ? "आज का वजन दर्ज है" : "आज का वजन अभी दर्ज नहीं है"}
        action={canWrite ? <AddButton compact label="वजन दर्ज करें" onClick={onOpenWeight} /> : null}
      />

      {todayWeight ? (
        <div className="tile rounded-card p-3.5">
          <div className="flex items-end justify-between gap-4">
            <div className="min-w-0">
              <p className="tabular text-3xl font-semibold leading-tight text-ink">
                {fmtKg(todayWeight.weight_kg)}
                <span className="ml-1 text-sm font-medium text-ink-muted">kg</span>
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
            </div>
            {trends.weight.length > 1 ? (
              <div className="w-24 shrink-0 sm:w-32">
                <Sparkline values={trends.weight} tone="weight" height={36} />
              </div>
            ) : null}
          </div>
          {todayWeight.notes ? <p className="mt-2 text-xs italic text-ink-muted">&quot;{todayWeight.notes}&quot;</p> : null}
        </div>
      ) : (
        <EmptyState
          icon={Scale}
          title="No weight recorded today"
          hindiTitle="आज का वजन दर्ज नहीं किया गया है।"
          description={patient.current_weight_kg ? `आख़िरी दर्ज वजन: ${patient.current_weight_kg} kg` : undefined}
          action={canWrite ? <AddButton label="वजन दर्ज करें" onClick={onOpenWeight} /> : undefined}
        />
      )}
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Physical activity
// ---------------------------------------------------------------------------

export function ActivityCard({ data, onOpenActivity }: { data: DashboardOverview; onOpenActivity: () => void }) {
  const { canWrite } = useAuth();
  const { todayActivity, trends } = data;
  const hasActivity =
    todayActivity && (todayActivity.steps > 0 || todayActivity.distance_km > 0 || todayActivity.walking_minutes > 0);

  return (
    <Card aria-label="Physical activity — शारीरिक गतिविधि">
      <RecordHeader
        icon={Footprints}
        tone="activity"
        title="Physical Activity"
        hindiTitle="शारीरिक गतिविधि"
        subtitle="कदम, दूरी और चलने का समय"
        action={canWrite ? <AddButton compact label="कदम दर्ज करें" onClick={onOpenActivity} /> : null}
      />

      {todayActivity && hasActivity ? (
        <div className="space-y-3">
          <div className="grid grid-cols-3 gap-2.5">
            <StatTile
              label="Steps"
              englishFromSm
              hindiLabel="कदम"
              value={todayActivity.steps.toLocaleString("en-IN")}
              className="p-3 sm:p-3.5"
              valueClassName="text-xl sm:text-2xl"
            />
            <StatTile
              label="Distance"
              englishFromSm
              hindiLabel="दूरी"
              value={todayActivity.distance_km}
              unit="km"
              className="p-3 sm:p-3.5"
              valueClassName="text-xl sm:text-2xl"
            />
            <StatTile
              label="Active"
              englishFromSm
              hindiLabel="समय"
              value={todayActivity.walking_minutes || 0}
              unit="min"
              className="p-3 sm:p-3.5"
              valueClassName="text-xl sm:text-2xl"
            />
          </div>
          {trends.steps.length > 1 ? (
            <div className="tile rounded-card px-3.5 py-2.5">
              <p lang="hi" className="mb-1 text-2xs font-medium text-ink-muted">
                कदम · पिछले {trends.steps.length} दर्ज दिन
              </p>
              <Sparkline values={trends.steps} tone="activity" height={36} />
            </div>
          ) : null}
        </div>
      ) : (
        <EmptyState
          icon={Footprints}
          title="No activity recorded today"
          hindiTitle="आज के कदम दर्ज नहीं किए गए हैं।"
          action={canWrite ? <AddButton label="कदम दर्ज करें" onClick={onOpenActivity} /> : undefined}
        />
      )}
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Routine checklist
// ---------------------------------------------------------------------------

/** Checklist labels are stored as "English / हिंदी"; show the Hindi first, as the product does everywhere. */
function splitLabel(label: string): { primary: string; secondary: string | null; primaryIsHindi: boolean } {
  const parts = label.split(" / ");
  if (parts.length === 2 && /[ऀ-ॿ]/.test(parts[1]) && !/[ऀ-ॿ]/.test(parts[0])) {
    return { primary: parts[1], secondary: parts[0], primaryIsHindi: true };
  }
  return { primary: label, secondary: null, primaryIsHindi: /[ऀ-ॿ]/.test(label) };
}

export function ChecklistCard({ checklist }: { checklist: DailyChecklistEntry[] }) {
  const { canWrite } = useAuth();
  const toast = useToast();
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

  const doneCount = checklist.filter((item) => checked[item.id] ?? item.status === "completed").length;

  return (
    <Card aria-label="Today's routine checklist — दैनिक कार्य सूची">
      <RecordHeader
        icon={ListChecks}
        tone="activity"
        title="Routine Checklist"
        hindiTitle="दैनिक कार्य सूची"
        subtitle="रोज़ के काम पूरे होने पर टिक करें"
        action={
          checklist.length > 0 ? (
            <Badge variant={doneCount === checklist.length ? "positive" : "neutral"}>
              {doneCount === checklist.length ? <CheckCircle2 aria-hidden className="h-3.5 w-3.5" /> : null}
              <span className="tabular">
                {doneCount}/{checklist.length}
              </span>
            </Badge>
          ) : null
        }
      />

      {checklist.length === 0 ? (
        <p lang="hi" className="text-sm text-ink-muted">
          आज की सूची अभी उपलब्ध नहीं है।
        </p>
      ) : (
        <div className="@container">
          <ul className="grid gap-2 @xl:grid-cols-2">
            {checklist.map((item) => {
              const isCompleted = checked[item.id] ?? item.status === "completed";
              const label = splitLabel(item.item_label);
              return (
                <li key={item.id}>
                  <label
                    className={cn(
                      "tile flex min-h-control items-center gap-3 rounded-card px-3 py-2.5 text-sm font-medium transition-colors",
                      canWrite ? "cursor-pointer" : "cursor-default",
                      isCompleted
                        ? "border-positive-line bg-positive-soft"
                        : "text-ink hover:border-positive-line",
                    )}
                  >
                    <input
                      type="checkbox"
                      checked={isCompleted}
                      disabled={!canWrite || savingChecklist.has(item.id)}
                      onChange={() => void handleToggleChecklist(item.id, isCompleted)}
                      className="h-5 w-5 shrink-0 accent-positive"
                    />
                    <span className="min-w-0">
                      <span
                        lang={label.primaryIsHindi ? "hi" : undefined}
                        className={cn("block leading-snug", isCompleted ? "text-ink-muted line-through" : "text-ink")}
                      >
                        {label.primary}
                      </span>
                      {label.secondary ? (
                        <span className="block text-2xs font-normal leading-snug text-ink-muted">{label.secondary}</span>
                      ) : null}
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </Card>
  );
}
