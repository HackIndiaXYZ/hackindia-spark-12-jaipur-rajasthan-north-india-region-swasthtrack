"use client";

import {
  Footprints,
  HeartPulse,
  Moon,
  Pill,
  PlusCircle,
  Scale,
  Utensils,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Card, metricChipClasses, type MetricTone } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

type QuickActionsBarProps = {
  onOpenBP: () => void;
  onOpenWeight: () => void;
  onOpenFood: () => void;
  onOpenActivity: () => void;
  onOpenSleep: () => void;
  onOpenMedicine: () => void;
};

type QuickAction = {
  label: string;
  hindiLabel: string;
  hint: string;
  icon: LucideIcon;
  tone: MetricTone;
  onClick: () => void;
};

/**
 * Quick Log (§18). Six equal, thumb-sized targets in a 2×3 grid on a phone.
 *
 * The hint line describes what gets entered; it used to read "120/80 mmHg"
 * under Blood pressure, which looked like an actual reading for the day.
 */
export function QuickActionsBar({
  onOpenBP,
  onOpenWeight,
  onOpenFood,
  onOpenActivity,
  onOpenSleep,
  onOpenMedicine,
}: QuickActionsBarProps) {
  const actions: QuickAction[] = [
    {
      label: "BP",
      hindiLabel: "रक्तचाप",
      hint: "ऊपर / नीचे वाला",
      icon: HeartPulse,
      tone: "bp",
      onClick: onOpenBP,
    },
    {
      label: "Weight",
      hindiLabel: "वजन",
      hint: "kg में मापें",
      icon: Scale,
      tone: "weight",
      onClick: onOpenWeight,
    },
    {
      label: "Food",
      hindiLabel: "भोजन",
      hint: "रोटी, दाल, फल…",
      icon: Utensils,
      tone: "food",
      onClick: onOpenFood,
    },
    {
      label: "Medicine",
      hindiLabel: "दवाई",
      hint: "खुराक व समय",
      icon: Pill,
      tone: "meds",
      onClick: onOpenMedicine,
    },
    {
      label: "Steps",
      hindiLabel: "कदम",
      hint: "सैर व टहलना",
      icon: Footprints,
      tone: "activity",
      onClick: onOpenActivity,
    },
    {
      label: "Sleep",
      hindiLabel: "नींद",
      hint: "रात की नींद",
      icon: Moon,
      tone: "sleep",
      onClick: onOpenSleep,
    },
  ];

  return (
    <Card>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-base font-semibold text-ink">
          <PlusCircle aria-hidden className="h-4.5 w-4.5 text-brand" />
          <span lang="hi">आज क्या दर्ज करना है?</span>
        </h2>
        <Badge variant="brand">Quick Log · 1 टैप</Badge>
      </div>

      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-6">
        {actions.map((action) => {
          const Icon = action.icon;
          return (
            <button
              type="button"
              key={action.label}
              onClick={action.onClick}
              aria-label={`${action.label} दर्ज करें — ${action.hindiLabel}`}
              className={cn(
                "pressable flex min-h-24 cursor-pointer flex-col items-center justify-center gap-1.5",
                "rounded-card border border-line bg-surface p-3 text-center",
                "hover:border-brand-line hover:bg-brand-softer",
              )}
            >
              <span
                className={cn(
                  "grid h-9 w-9 place-items-center rounded-control",
                  metricChipClasses[action.tone],
                )}
              >
                <Icon aria-hidden className="h-4.5 w-4.5" />
              </span>
              <span className="w-full">
                <span
                  lang="hi"
                  className="block truncate text-sm font-semibold leading-tight text-ink"
                >
                  {action.hindiLabel}
                </span>
                <span className="block truncate text-2xs text-ink-subtle">
                  {action.hint}
                </span>
              </span>
            </button>
          );
        })}
      </div>
    </Card>
  );
}
