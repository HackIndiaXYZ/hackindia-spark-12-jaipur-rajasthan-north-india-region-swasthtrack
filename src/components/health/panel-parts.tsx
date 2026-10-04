"use client";

import type { ReactNode } from "react";
import { Edit3, ListOrdered, Plus, Trash2, TrendingUp } from "lucide-react";
import { IconButton } from "@/components/ui/button";
import { Segmented, type SegmentedOption } from "@/components/ui/segmented";
import { istRangeBounds } from "@/lib/health-rules";

/* ---- Trend range ---------------------------------------------------------- */

export type ChartRange = "7d" | "30d" | "3m" | "6m" | "1y";

const RANGE_DAYS: Record<ChartRange, number> = { "7d": 7, "30d": 30, "3m": 90, "6m": 180, "1y": 365 };

export const RANGE_OPTIONS: SegmentedOption<ChartRange>[] = [
  { value: "7d", label: "7 दिन" },
  { value: "30d", label: "30 दिन" },
  { value: "3m", label: "3 महीने" },
  { value: "6m", label: "6 महीने" },
  { value: "1y", label: "1 साल" },
];

/** Inclusive IST window ending today. */
export function rangeWindow(range: ChartRange): { startDate: string; endDate: string; days: number } {
  const days = RANGE_DAYS[range];
  const { startDate, endDate } = istRangeBounds(days);
  return { startDate, endDate, days };
}

export function RangeSelector({
  value,
  onChange,
  ariaLabel,
}: {
  value: ChartRange;
  onChange: (value: ChartRange) => void;
  ariaLabel: string;
}) {
  return <Segmented options={RANGE_OPTIONS} value={value} onChange={onChange} ariaLabel={ariaLabel} size="sm" />;
}

/* ---- Panel tabs (New / History / Trend) ------------------------------------ */

export type PanelTab = "form" | "history" | "chart";

export function panelTabOptions(canWrite: boolean): SegmentedOption<PanelTab>[] {
  const all: SegmentedOption<PanelTab>[] = [
    { value: "form", label: "New", hindiLabel: "नया", icon: Plus },
    { value: "history", label: "History", hindiLabel: "इतिहास", icon: ListOrdered },
    { value: "chart", label: "Trend", hindiLabel: "ट्रेंड", icon: TrendingUp },
  ];
  // Viewers cannot add readings, so the form tab is not offered at all.
  return canWrite ? all : all.filter((o) => o.value !== "form");
}

/* ---- Loading placeholder for lazily loaded charts --------------------------- */

export function ChartSkeleton() {
  return <div aria-hidden className="skeleton h-64 w-full rounded-card" />;
}

/* ---- Edit / delete buttons on a history row --------------------------------- */

export function RowActions({
  onEdit,
  onDelete,
  what,
}: {
  onEdit: () => void;
  onDelete: () => void;
  /** Spoken label suffix, e.g. "BP reading 128/82". */
  what: string;
}) {
  return (
    <div className="flex shrink-0 items-center gap-1">
      <IconButton variant="ghost" onClick={onEdit} aria-label={`बदलें (Edit) — ${what}`}>
        <Edit3 aria-hidden className="h-4 w-4" />
      </IconButton>
      <IconButton variant="ghost" onClick={onDelete} aria-label={`मिटाएँ (Delete) — ${what}`}>
        <Trash2 aria-hidden className="h-4 w-4" />
      </IconButton>
    </div>
  );
}

/* ---- Small stat tile -------------------------------------------------------- */

const tileTone = {
  neutral: "border-line bg-surface-sunken",
  positive: "border-positive-line bg-positive-soft",
  attention: "border-attention-line bg-attention-soft",
  critical: "border-critical-line bg-critical-soft",
  info: "border-info-line bg-info-soft",
} as const;

export function StatTile({
  label,
  value,
  unit,
  helper,
  tone = "neutral",
}: {
  label: string;
  value: string | number | null;
  unit?: string;
  helper?: string;
  tone?: keyof typeof tileTone;
}) {
  const has = value !== null && value !== "";
  return (
    <div className={`rounded-card border p-3 ${tileTone[tone]}`}>
      <p className="text-xs font-medium text-ink-muted">{label}</p>
      <p className="tabular mt-1 text-xl font-semibold text-ink">
        {has ? value : "—"}
        {has && unit ? <span className="ml-1 text-xs font-medium text-ink-subtle">{unit}</span> : null}
      </p>
      {helper ? <p className="mt-0.5 text-2xs text-ink-subtle">{helper}</p> : null}
    </div>
  );
}

/** Amber inline note, e.g. "only 3 readings — averages are rough". */
export function SmallNote({ children }: { children: ReactNode }) {
  return (
    <p className="rounded-field border border-attention-line bg-attention-soft px-3 py-2 text-xs text-ink-muted">
      {children}
    </p>
  );
}
