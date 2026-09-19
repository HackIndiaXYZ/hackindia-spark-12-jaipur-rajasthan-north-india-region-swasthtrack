"use client";

import { useState } from "react";
import {
  Activity,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  HeartPulse,
  Info,
  Moon,
  Pill,
  Scale,
  Sparkles,
  Utensils,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { TimelineEvent, TimelineDomain } from "@/services/timeline-service";

const domainIcons: Record<TimelineDomain, typeof Activity> = {
  food: Utensils,
  bp: HeartPulse,
  medicine: Pill,
  activity: Activity,
  sleep: Moon,
  weight: Scale,
  wellness_score: CheckCircle2,
  insight: Sparkles,
  alert: Info,
  progress_photo: Activity,
  goal_change: Activity,
  settings_change: Activity,
};

const domainStyles: Record<TimelineDomain, { iconBg: string; border: string; accent: string }> = {
  // These six mirror the app-wide vital identity tokens (globals.css §25,
  // §45) so a colour means the same vital in the timeline as everywhere else.
  food: {
    iconBg: "bg-food-soft text-food border-food-line",
    border: "border-food-line/80 hover:border-food",
    accent: "bg-food",
  },
  bp: {
    iconBg: "bg-bp-soft text-bp border-bp-line",
    border: "border-bp-line/80 hover:border-bp",
    accent: "bg-bp",
  },
  medicine: {
    iconBg: "bg-meds-soft text-meds border-meds-line",
    border: "border-meds-line/80 hover:border-meds",
    accent: "bg-meds",
  },
  activity: {
    iconBg: "bg-activity-soft text-activity border-activity-line",
    border: "border-activity-line/80 hover:border-activity",
    accent: "bg-activity",
  },
  sleep: {
    iconBg: "bg-sleep-soft text-sleep border-sleep-line",
    border: "border-sleep-line/80 hover:border-sleep",
    accent: "bg-sleep",
  },
  weight: {
    iconBg: "bg-weight-soft text-weight border-weight-line",
    border: "border-weight-line/80 hover:border-weight",
    accent: "bg-weight",
  },
  wellness_score: {
    iconBg: "bg-emerald-100 text-emerald-800 border-emerald-200",
    border: "border-emerald-200/80 hover:border-emerald-300",
    accent: "bg-emerald-500",
  },
  insight: {
    iconBg: "bg-indigo-100 text-indigo-800 border-indigo-200",
    border: "border-indigo-200/80 hover:border-indigo-300",
    accent: "bg-indigo-500",
  },
  alert: {
    iconBg: "bg-rose-100 text-rose-800 border-rose-200",
    border: "border-rose-200/80 hover:border-rose-300",
    accent: "bg-rose-500",
  },
  progress_photo: {
    iconBg: "bg-surface-sunken text-ink-muted border-line",
    border: "border-line hover:border-line-strong",
    accent: "bg-ink-subtle",
  },
  goal_change: {
    iconBg: "bg-sky-100 text-sky-800 border-sky-200",
    border: "border-sky-200/80 hover:border-sky-300",
    accent: "bg-sky-500",
  },
  settings_change: {
    iconBg: "bg-surface-sunken text-ink-muted border-line",
    border: "border-line hover:border-line-strong",
    accent: "bg-ink-subtle",
  },
};

export function TimelineEventCard({
  event,
  onSelect,
}: {
  event: TimelineEvent;
  onSelect?: (event: TimelineEvent) => void;
}) {
  const [isExpanded, setIsExpanded] = useState(false);
  const Icon = domainIcons[event.domain] || Activity;
  const style = domainStyles[event.domain] || domainStyles.activity;

  return (
    <div
      onClick={() => {
        if (onSelect) {
          onSelect(event);
        } else {
          setIsExpanded(!isExpanded);
        }
      }}
      className={cn(
        "rounded-card border-2 bg-surface p-3.5 sm:p-4 shadow-e1 transition-all duration-150 cursor-pointer select-none",
        "active:scale-[0.985] active:translate-y-0.5 hover:shadow-e2",
        style.border
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          {/* ICON BADGE */}
          <div className={cn("h-10 w-10 rounded-control border flex items-center justify-center shrink-0 shadow-2xs", style.iconBg)}>
            <Icon className="h-5 w-5 stroke-[2.2]" />
          </div>

          <div className="space-y-0.5">
            <div className="flex flex-wrap items-center gap-2">
              <h4 className="text-sm sm:text-base font-bold text-ink tracking-tight">
                {event.titleHi}
              </h4>
              {event.statusBadge && (
                <Badge variant={event.statusBadgeTone || "blue"} className="text-2xs font-bold">
                  {event.statusBadge}
                </Badge>
              )}
            </div>

            {event.statusText && (
              <p className="text-xs font-semibold text-ink-muted">
                {event.statusText}
              </p>
            )}

            <div className="flex items-center gap-2 text-xs font-semibold text-ink-subtle pt-0.5">
              <span>{event.displayTime}</span>
              <span>•</span>
              <span className="bg-surface-sunken px-1.5 py-0.5 rounded text-ink-muted font-semibold border border-line">
                {event.source}
              </span>
            </div>
          </div>
        </div>

        {/* VALUE BADGE */}
        <div className="text-right shrink-0">
          {event.value ? (
            <span className="tabular block text-base font-semibold text-ink sm:text-lg">
              {event.value}
            </span>
          ) : null}
          <button
            type="button"
            className="text-xs font-semibold text-ink-subtle hover:text-ink-muted inline-flex items-center gap-0.5 mt-0.5"
          >
            <span>विवरण</span>
            {isExpanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
          </button>
        </div>
      </div>

      {/* EXPANDABLE DETAIL */}
      {isExpanded && (
        <div className="mt-3 pt-3 border-t border-line text-xs text-ink-muted space-y-1.5 animate-in fade-in">
          <div className="flex items-center justify-between text-ink-subtle font-semibold text-xs">
            <span>तारीख: {event.dateStr}</span>
            <span>स्रोत: {event.source === "Manual" ? "उपयोगकर्ता द्वारा दर्ज (Manual)" : "सिस्टम द्वारा आकलित"}</span>
          </div>
          {event.detailNote ? (
            <p className="p-2.5 rounded-control bg-surface-sunken border border-line text-ink-muted font-medium">
              📝 {event.detailNote}
            </p>
          ) : (
            <p className="text-xs text-ink-subtle italic">
              कोई अतिरिक्त टिप्पणी नहीं है।
            </p>
          )}
        </div>
      )}
    </div>
  );
}
