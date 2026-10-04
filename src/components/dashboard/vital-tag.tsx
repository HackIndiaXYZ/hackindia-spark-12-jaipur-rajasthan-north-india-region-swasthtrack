import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export type VitalTone = "bp" | "weight" | "food" | "meds" | "activity" | "sleep";

// Literal class strings (not built from the tone) so Tailwind can see them.
const toneClasses: Record<VitalTone, string> = {
  bp: "border-bp-line bg-bp-soft text-bp",
  weight: "border-weight-line bg-weight-soft text-weight",
  food: "border-food-line bg-food-soft text-food",
  meds: "border-meds-line bg-meds-soft text-meds",
  activity: "border-activity-line bg-activity-soft text-activity",
  sleep: "border-sleep-line bg-sleep-soft text-sleep",
};

/** Small label chip in a vital's own hue: one colour per vital, everywhere. */
export function VitalTag({
  tone,
  children,
  className,
}: {
  tone: VitalTone;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex max-w-full items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium",
        toneClasses[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}
