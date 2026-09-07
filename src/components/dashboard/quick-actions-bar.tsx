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
import { Pressable, Reveal, Stagger } from "@/components/motion/primitives";
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
  /** Coloured ambient shadow on hover — one per vital. */
  glow: string;
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
      glow: "hover:shadow-glow-bp",
      onClick: onOpenBP,
    },
    {
      label: "Weight",
      hindiLabel: "वजन",
      hint: "kg में मापें",
      icon: Scale,
      tone: "weight",
      glow: "hover:shadow-glow-weight",
      onClick: onOpenWeight,
    },
    {
      label: "Food",
      hindiLabel: "भोजन",
      hint: "रोटी, दाल, फल…",
      icon: Utensils,
      tone: "food",
      glow: "hover:shadow-glow-food",
      onClick: onOpenFood,
    },
    {
      label: "Medicine",
      hindiLabel: "दवाई",
      hint: "खुराक व समय",
      icon: Pill,
      tone: "meds",
      glow: "hover:shadow-glow-meds",
      onClick: onOpenMedicine,
    },
    {
      label: "Steps",
      hindiLabel: "कदम",
      hint: "सैर व टहलना",
      icon: Footprints,
      tone: "activity",
      glow: "hover:shadow-glow-activity",
      onClick: onOpenActivity,
    },
    {
      label: "Sleep",
      hindiLabel: "नींद",
      hint: "रात की नींद",
      icon: Moon,
      tone: "sleep",
      glow: "hover:shadow-glow-sleep",
      onClick: onOpenSleep,
    },
  ];

  return (
    <Card className="surface-lift" tone="default">
      <div className="mb-3.5 flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-base font-semibold text-ink">
          <span className="grid h-7 w-7 place-items-center rounded-field grad-spring text-white shadow-e1">
            <PlusCircle aria-hidden className="h-4 w-4" />
          </span>
          <span lang="hi">आज क्या दर्ज करना है?</span>
        </h2>
        <Badge variant="brand">Quick Log · 1 टैप</Badge>
      </div>

      <Stagger className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-6">
        {actions.map((action, i) => {
          const Icon = action.icon;
          return (
            <Reveal key={action.label} index={i}>
              <Pressable
                onClick={action.onClick}
                ariaLabel={`${action.label} दर्ज करें — ${action.hindiLabel}`}
                className={cn(
                  "group surface-lift relative flex h-full w-full flex-col items-center",
                  "justify-center gap-2 overflow-hidden rounded-card p-3.5 text-center",
                  "transition-shadow duration-200",
                  action.glow,
                )}
              >
                {/* Colour wash that blooms on hover. At rest the tile is
                    white, so six of them side by side stay calm. */}
                <span
                  aria-hidden
                  className={cn(
                    "pointer-events-none absolute inset-x-0 -bottom-8 h-16 opacity-0 blur-2xl",
                    "transition-opacity duration-300 group-hover:opacity-70",
                    metricChipClasses[action.tone],
                  )}
                />
                <span
                  className={cn(
                    "relative grid h-11 w-11 place-items-center rounded-control shadow-e1",
                    "transition-transform duration-200 group-hover:scale-105",
                    metricChipClasses[action.tone],
                  )}
                >
                  <Icon aria-hidden className="h-5 w-5" />
                </span>
                <span className="relative w-full">
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
              </Pressable>
            </Reveal>
          );
        })}
      </Stagger>
    </Card>
  );
}
