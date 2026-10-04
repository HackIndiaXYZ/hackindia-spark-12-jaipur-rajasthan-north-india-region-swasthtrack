"use client";

import { useState } from "react";
import { AlertCircle, CalendarDays, ChevronLeft, ChevronRight, Copy, Pencil, Trash2, Utensils } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button, IconButton } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field, NumberInput, Select } from "@/components/ui/form-field";
import { Modal } from "@/components/ui/modal";
import { EmptyState, ErrorState } from "@/components/ui/page";
import { ProgressBar } from "@/components/ui/progress-bar";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { useToast } from "@/components/ui/toast";
import { fmtDateStrFull, fmtTime, relativeDayLabel } from "@/components/health/format";
import {
  MEAL_ORDER,
  MEAL_SLOTS,
  OIL_OPTIONS,
  UNKNOWN_OIL_NOTE,
  mealLabel,
  oilCalories,
} from "@/components/food/food-math";
import { addDaysIST, todayIST } from "@/lib/health-rules";
import { getExactFoodEmoji } from "@/lib/utils";
import { copyPreviousMeal, deleteFoodLog, updateFoodLog, type FoodLogEntry } from "@/services/patient-service";

type FoodLogListProps = {
  logs: FoodLogEntry[] | null;
  loading: boolean;
  error: boolean;
  onRetry: () => void;
  patientId: string;
  selectedDate: string;
  onRefresh: () => void;
  onDateChange: (date: string) => void;
  /** The patient's own daily target from settings. */
  dailyCalorieTarget: number;
  /** False for viewers: no edit, delete or copy. */
  canWrite: boolean;
};

const confidenceVariant = { High: "positive", Medium: "info", Low: "attention" } as const;

/* ---- Edit dialog ------------------------------------------------------------------- */

function EditFoodModal({ item, onClose, onSaved }: { item: FoodLogEntry; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [qty, setQty] = useState(String(item.quantity));
  const [oil, setOil] = useState(item.oil_quantity || "None");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function save() {
    const next = parseFloat(qty);
    if (!qty.trim() || Number.isNaN(next) || next <= 0 || next > 20) {
      setError("मात्रा 0 से ज़्यादा और 20 तक होनी चाहिए");
      return;
    }
    setError(null);

    // Scale the stored numbers by the change in quantity; the oil is swapped separately.
    const ratio = next / item.quantity;
    const base = (item.calories - (item.oil_calories || 0)) * ratio;
    const newOil = oilCalories(oil);

    setSaving(true);
    try {
      await updateFoodLog(item.id, {
        quantity: next,
        oil_quantity: oil,
        oil_calories: newOil,
        calories: Math.round(base + newOil),
        standardized_grams: item.standardized_grams ? Math.round(item.standardized_grams * ratio) : item.standardized_grams,
        protein_g: Math.round((item.protein_g || 0) * ratio),
        carbs_g: Math.round((item.carbs_g || 0) * ratio),
        fat_g: Math.round((item.fat_g || 0) * ratio),
        fibre_g: Math.round((item.fibre_g || 0) * ratio),
        calorie_confidence: oil === "Unknown" ? "Low" : item.calorie_confidence,
        notes: oil === "Unknown" ? UNKNOWN_OIL_NOTE : item.notes === UNKNOWN_OIL_NOTE ? null : item.notes,
      });
      toast.success("बदलाव सुरक्षित हो गए", `${item.food_name}`);
      onSaved();
      onClose();
    } catch (err) {
      toast.error("बदलाव सेव नहीं हो पाए", err instanceof Error ? err.message : undefined);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      isOpen
      onClose={onClose}
      title="दर्ज भोजन बदलें"
      hindiTitle="Edit logged food"
      description={item.food_name}
      size="sm"
      footer={
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="secondary" onClick={onClose}>
            रद्द करें
          </Button>
          <Button variant="primary" loading={saving} onClick={() => void save()}>
            सहेजें (Save)
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <Field label="मात्रा (Quantity)" hint={`अभी: ${item.quantity} ${item.unit}`} error={error ?? undefined} required>
          <NumberInput allowDecimal maxLength={5} value={qty} onChange={(e) => setQty(e.target.value)} />
        </Field>
        <Field label="बनाने में तेल (Cooking oil)">
          <Select value={oil} onChange={(e) => setOil(e.target.value)}>
            {OIL_OPTIONS.map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
                {o.cal > 0 ? ` (+${o.cal} cal)` : ""}
              </option>
            ))}
          </Select>
        </Field>
        <p lang="hi" className="text-xs text-ink-subtle">
          मात्रा बदलने पर कैलोरी और प्रोटीन उसी अनुपात में बदलते हैं।
        </p>
      </div>
    </Modal>
  );
}

/* ---- List -------------------------------------------------------------------------- */

export function FoodLogList({
  logs,
  loading,
  error,
  onRetry,
  patientId,
  selectedDate,
  onRefresh,
  onDateChange,
  dailyCalorieTarget,
  canWrite,
}: FoodLogListProps) {
  const toast = useToast();
  const confirm = useConfirm();
  const [editing, setEditing] = useState<FoodLogEntry | null>(null);
  const [copySlot, setCopySlot] = useState<string>("Breakfast");
  const [copying, setCopying] = useState(false);

  const today = todayIST();
  const isToday = selectedDate === today;
  const dayBefore = addDaysIST(selectedDate, -1);
  const items = logs ?? [];

  // Group by meal slot (anything unrecognised goes to "Other").
  const grouped = MEAL_ORDER.map((slot) => ({
    slot,
    items: items.filter((l) => (MEAL_ORDER.includes(l.meal_type) ? l.meal_type === slot : slot === "Other")),
  })).filter((g) => g.items.length > 0);

  const totalCalories = items.reduce((sum, l) => sum + l.calories, 0);
  const totalProtein = items.reduce((sum, l) => sum + (l.protein_g || 0), 0);
  const diff = totalCalories - dailyCalorieTarget;

  async function handleDelete(item: FoodLogEntry) {
    const ok = await confirm({
      title: "यह भोजन हटाएँ?",
      message: `${item.food_name} · ${item.calories} kcal। यह वापस नहीं आएगा।`,
      tone: "danger",
    });
    if (!ok) return;
    try {
      await deleteFoodLog(item.id);
      toast.success("भोजन सूची से हटा दिया गया");
      onRefresh();
    } catch (err) {
      toast.error("हटाया नहीं जा सका", err instanceof Error ? err.message : undefined);
    }
  }

  async function handleCopy() {
    const slotLabel = MEAL_SLOTS.find((m) => m.id === copySlot)?.label ?? copySlot;
    const existing = items.filter((l) => l.meal_type === copySlot).length;
    if (existing > 0) {
      const ok = await confirm({
        title: `${slotLabel} में पहले से ${existing} चीज़ें हैं`,
        message: `${relativeDayLabel(dayBefore, today)} का ${slotLabel} कॉपी करने पर ये दोबारा जुड़ जाएँगी। जारी रखें?`,
        confirmLabel: "हाँ, कॉपी करें",
        cancelLabel: "रद्द करें",
      });
      if (!ok) return;
    }
    setCopying(true);
    try {
      const copied = await copyPreviousMeal(patientId, dayBefore, selectedDate, copySlot);
      if (copied) {
        toast.success(`${relativeDayLabel(dayBefore, today)} का ${slotLabel} कॉपी हो गया`);
        onRefresh();
      } else {
        toast.info(`${relativeDayLabel(dayBefore, today)} को ${slotLabel} में कुछ दर्ज नहीं था`);
      }
    } catch (err) {
      toast.error("कॉपी नहीं हो पाया", err instanceof Error ? err.message : undefined);
    } finally {
      setCopying(false);
    }
  }

  return (
    <Card flush className="overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line bg-surface-sunken px-3 py-3 sm:px-6 sm:py-4">
        <div className="flex min-w-0 items-center gap-1.5 sm:gap-2">
          <IconButton variant="ghost" aria-label="पिछला दिन (Previous day)" onClick={() => onDateChange(dayBefore)}>
            <ChevronLeft aria-hidden className="h-5 w-5" />
          </IconButton>
          <div className="min-w-0 text-center">
            <p className="flex items-center justify-center gap-1.5 text-sm font-semibold text-ink sm:text-base">
              <CalendarDays aria-hidden className="h-4 w-4 shrink-0 text-brand" />
              <span className="truncate">{relativeDayLabel(selectedDate, today)}</span>
            </p>
            <p className="truncate text-2xs text-ink-subtle">{fmtDateStrFull(selectedDate)}</p>
          </div>
          <IconButton
            variant="ghost"
            aria-label="अगला दिन (Next day)"
            disabled={isToday}
            onClick={() => onDateChange(addDaysIST(selectedDate, 1))}
          >
            <ChevronRight aria-hidden className="h-5 w-5" />
          </IconButton>
          {!isToday ? (
            <Button variant="secondary" size="sm" onClick={() => onDateChange(today)}>
              आज
            </Button>
          ) : null}
        </div>

        <div className="min-w-0 text-right" aria-live="polite">
          <span className="block text-xs font-medium text-ink-subtle">
            {isToday ? "आज की कैलोरी" : "इस दिन की कैलोरी"}
          </span>
          <span className="tabular text-lg font-semibold text-ink">
            {totalCalories} / {dailyCalorieTarget} kcal
          </span>
          {items.length > 0 ? (
            <span lang="hi" className="mt-0.5 block text-xs text-ink-muted">
              {diff > 0 ? `लक्ष्य से ${diff} kcal ज़्यादा` : `${Math.abs(diff)} kcal बाकी`}
              {totalProtein > 0 ? ` · प्रोटीन ${Math.round(totalProtein)} g` : ""}
            </span>
          ) : null}
        </div>
      </div>

      {items.length > 0 ? (
        <div className="px-4 pt-4 sm:px-6">
          <ProgressBar value={totalCalories} max={dailyCalorieTarget} label="कैलोरी लक्ष्य का हिस्सा" />
        </div>
      ) : null}

      <div className="space-y-5 p-4 sm:p-6">
        {canWrite ? (
          <div className="flex flex-wrap items-end gap-2 rounded-card border border-line bg-surface p-3">
            <Field label={`${relativeDayLabel(dayBefore, today)} से कॉपी करें`} className="min-w-44 flex-1">
              <Select value={copySlot} onChange={(e) => setCopySlot(e.target.value)}>
                {MEAL_SLOTS.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.label}
                  </option>
                ))}
              </Select>
            </Field>
            <Button variant="secondary" loading={copying} onClick={() => void handleCopy()}>
              <Copy aria-hidden className="h-4 w-4" />
              कॉपी करें
            </Button>
          </div>
        ) : null}

        {error ? (
          <ErrorState
            title="भोजन का रिकॉर्ड लोड नहीं हो पाया"
            englishTitle="Food records could not be loaded"
            onRetry={onRetry}
          />
        ) : loading ? (
          <div aria-busy="true" aria-label="लोड हो रहा है" className="space-y-3">
            <div className="skeleton h-24 rounded-card" />
            <div className="skeleton h-24 rounded-card" />
          </div>
        ) : grouped.length > 0 ? (
          <div className="space-y-5">
            {grouped.map(({ slot, items: slotItems }) => {
              const slotTotal = slotItems.reduce((sum, i) => sum + i.calories, 0);
              return (
                <section key={slot} aria-label={mealLabel(slot)} className="overflow-hidden rounded-card border border-line bg-surface shadow-e1">
                  <div className="flex items-center justify-between gap-3 border-b border-line bg-surface-sunken px-4 py-3">
                    <div className="min-w-0">
                      <h3 lang="hi" className="text-sm font-semibold text-ink">
                        {mealLabel(slot)}
                      </h3>
                      <span className="text-2xs text-ink-subtle">{slotItems.length} चीज़ें</span>
                    </div>
                    <span className="tabular text-sm font-semibold text-ink">~{slotTotal} kcal</span>
                  </div>

                  <ul className="divide-y divide-line">
                    {slotItems.map((item) => (
                      <li key={item.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
                        <div className="min-w-0 space-y-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span aria-hidden className="shrink-0 text-xl">
                              {getExactFoodEmoji(item.food_name)}
                            </span>
                            <span className="font-semibold text-ink">{item.food_name}</span>
                            <Badge variant={confidenceVariant[item.calorie_confidence] ?? "neutral"}>
                              {item.calorie_confidence} confidence
                            </Badge>
                            <span className="text-xs text-ink-subtle">{fmtTime(item.consumed_at)}</span>
                          </div>
                          <p className="text-xs text-ink-muted">
                            मात्रा: {item.quantity} {item.unit}
                            {item.standardized_grams ? ` (${item.standardized_grams} g)` : ""}
                            {item.oil_quantity === "Unknown" ? (
                              <span lang="hi" className="ml-2 text-attention">
                                तेल की मात्रा पता नहीं
                              </span>
                            ) : item.oil_quantity && item.oil_quantity !== "None" ? (
                              <span lang="hi" className="ml-2 rounded border border-food-line bg-food-soft px-1.5 py-0.5 font-medium text-food">
                                तेल: {item.oil_quantity} (+{item.oil_calories} kcal)
                              </span>
                            ) : null}
                          </p>
                          {item.notes ? (
                            <p className="flex items-start gap-1.5 rounded border border-attention-line bg-attention-soft p-1.5 text-xs text-ink-muted">
                              <AlertCircle aria-hidden className="mt-0.5 h-3.5 w-3.5 shrink-0 text-attention" />
                              {item.notes}
                            </p>
                          ) : null}
                        </div>

                        <div className="flex items-center justify-between gap-3 sm:justify-end">
                          <span className="tabular text-base font-semibold text-ink">~{item.calories} kcal</span>
                          {canWrite ? (
                            <div className="flex items-center gap-1">
                              <IconButton variant="ghost" aria-label={`बदलें (Edit) — ${item.food_name}`} onClick={() => setEditing(item)}>
                                <Pencil aria-hidden className="h-4 w-4" />
                              </IconButton>
                              <IconButton variant="ghost" aria-label={`हटाएँ (Delete) — ${item.food_name}`} onClick={() => void handleDelete(item)}>
                                <Trash2 aria-hidden className="h-4 w-4" />
                              </IconButton>
                            </div>
                          ) : null}
                        </div>
                      </li>
                    ))}
                  </ul>
                </section>
              );
            })}
          </div>
        ) : (
          <EmptyState
            icon={Utensils}
            title={isToday ? "आज अभी तक कोई भोजन दर्ज नहीं हुआ" : "इस दिन कोई भोजन दर्ज नहीं है"}
            hindiTitle="No meals logged"
            description={
              canWrite
                ? "ऊपर खोज से भोजन चुनकर दर्ज करें, या पिछले दिन का भोजन कॉपी करें।"
                : "अभी इस दिन का कोई रिकॉर्ड नहीं है।"
            }
          />
        )}
      </div>

      {editing ? <EditFoodModal key={editing.id} item={editing} onClose={() => setEditing(null)} onSaved={onRefresh} /> : null}
    </Card>
  );
}
