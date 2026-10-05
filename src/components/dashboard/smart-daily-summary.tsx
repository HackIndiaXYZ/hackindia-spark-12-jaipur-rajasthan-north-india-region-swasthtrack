"use client";

import Link from "next/link";
import {
  ArrowRight,
  CheckCircle2,
  Footprints,
  HeartPulse,
  ListTodo,
  Moon,
  Pill,
  Scale,
  Utensils,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, metricChipClasses, type MetricTone } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { SmartDailySummary as DailySummaryType } from "@/services/smart-insights-service";

/** The service names each item's icon; this maps it to the vital's own icon and hue. */
const ITEM_VISUALS: Record<string, { icon: LucideIcon; tone: MetricTone }> = {
  Pill: { icon: Pill, tone: "meds" },
  Utensils: { icon: Utensils, tone: "food" },
  HeartPulse: { icon: HeartPulse, tone: "bp" },
  Footprints: { icon: Footprints, tone: "activity" },
  Moon: { icon: Moon, tone: "sleep" },
  Scale: { icon: Scale, tone: "weight" },
};

function visualFor(icon: string): { icon: LucideIcon; tone: MetricTone } {
  return ITEM_VISUALS[icon] ?? { icon: CheckCircle2, tone: "brand" };
}

type SmartDailySummaryProps = {
  summary: DailySummaryType;
  /**
   * What "दर्ज करें" does, keyed by the item's icon name (e.g. `Moon`, `Footprints`).
   * - omitted: every missing item links to the page the service names;
   * - a map: an item with a handler opens that form in place (steps and sleep
   *   would otherwise link back to this very page and do nothing);
   * - `null`: read-only member — nothing to record, so no action is offered.
   */
  actions?: Partial<Record<string, () => void>> | null;
};

export function SmartDailySummaryCard({ summary, actions }: SmartDailySummaryProps) {
  const { completedItems, missingItems, summaryTextHi, statusTone } = summary;

  return (
    <Card aria-label="Today's tracking summary — आज का सारांश">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-2.5">
          <span
            aria-hidden
            className="grid h-8 w-8 shrink-0 place-items-center rounded-control bg-brand-soft text-brand-ink ring-1 ring-inset ring-brand-line"
          >
            <ListTodo className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <h2 className="flex flex-wrap items-baseline gap-x-2 text-base font-semibold leading-tight text-ink">
              <span lang="hi">आज का सारांश</span>
              <span className="text-xs font-medium text-ink-muted">Tracking summary</span>
            </h2>
            <p lang="hi" className="mt-0.5 text-xs text-ink-muted">
              {summaryTextHi}
            </p>
          </div>
        </div>
        {missingItems.length === 0 && completedItems.length > 0 ? (
          <Badge variant="positive" className="shrink-0">
            <CheckCircle2 aria-hidden className="h-3.5 w-3.5" />
            <span lang="hi">सब दर्ज</span>
          </Badge>
        ) : missingItems.length > 0 ? (
          <Badge variant={statusTone === "attention" ? "attention" : "neutral"} className="shrink-0">
            <span lang="hi">{missingItems.length} बाकी</span>
          </Badge>
        ) : null}
      </div>

      {completedItems.length > 0 ? (
        <ul aria-label="दर्ज की गई प्रविष्टियाँ" className="mt-3 flex flex-wrap gap-1.5">
          {completedItems.map((item) => {
            const v = visualFor(item.icon);
            const Icon = v.icon;
            return (
              <li
                key={item.label}
                className="tile inline-flex max-w-full items-center gap-1.5 rounded-full py-1 pl-1 pr-2.5 text-xs font-medium text-ink"
              >
                <span
                  aria-hidden
                  className={cn("grid h-5 w-5 shrink-0 place-items-center rounded-full", metricChipClasses[v.tone])}
                >
                  <Icon className="h-3 w-3" />
                </span>
                <span lang="hi" className="truncate">
                  {item.labelHi}
                </span>
              </li>
            );
          })}
        </ul>
      ) : null}

      {missingItems.length > 0 ? (
        <ul aria-label="दर्ज होना बाकी" className="mt-3 space-y-2">
          {missingItems.map((item) => {
            const v = visualFor(item.icon);
            const Icon = v.icon;
            const open = actions ? actions[item.icon] : undefined;
            const actionClass =
              "flex min-h-control shrink-0 items-center gap-1 rounded-control px-2 text-xs font-semibold text-brand-ink hover:underline";
            return (
              <li
                key={item.label}
                className="tile flex items-center justify-between gap-2 rounded-card border-attention-line py-0.5 pl-3 pr-1"
              >
                <span className="flex min-w-0 items-center gap-2.5 py-1.5">
                  <span
                    aria-hidden
                    className={cn("grid h-7 w-7 shrink-0 place-items-center rounded-field", metricChipClasses[v.tone])}
                  >
                    <Icon className="h-3.5 w-3.5" />
                  </span>
                  <span lang="hi" className="text-sm font-medium text-ink">
                    {item.labelHi}
                  </span>
                </span>
                {actions === null ? null : open ? (
                  <button type="button" onClick={open} className={cn(actionClass, "cursor-pointer")}>
                    <span lang="hi">दर्ज करें</span>
                    <ArrowRight aria-hidden className="h-3 w-3" />
                  </button>
                ) : item.actionUrl && item.actionUrl !== "/" ? (
                  <Link href={item.actionUrl} className={actionClass}>
                    <span lang="hi">दर्ज करें</span>
                    <ArrowRight aria-hidden className="h-3 w-3" />
                  </Link>
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : null}
    </Card>
  );
}
