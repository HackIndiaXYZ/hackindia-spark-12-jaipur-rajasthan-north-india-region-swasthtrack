import {
  Activity,
  CheckCircle2,
  ChevronRight,
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
import type { TimelineDomain, TimelineEvent } from "@/services/timeline-service";

export const domainIcons: Record<TimelineDomain, typeof Activity> = {
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

/** Each domain keeps the identity colour it has everywhere else in the app. */
export const domainStyles: Record<TimelineDomain, { iconBg: string; border: string }> = {
  food: { iconBg: "bg-food-soft text-food border-food-line", border: "border-food-line hover:border-food" },
  bp: { iconBg: "bg-bp-soft text-bp border-bp-line", border: "border-bp-line hover:border-bp" },
  medicine: { iconBg: "bg-meds-soft text-meds border-meds-line", border: "border-meds-line hover:border-meds" },
  activity: {
    iconBg: "bg-activity-soft text-activity border-activity-line",
    border: "border-activity-line hover:border-activity",
  },
  sleep: { iconBg: "bg-sleep-soft text-sleep border-sleep-line", border: "border-sleep-line hover:border-sleep" },
  weight: { iconBg: "bg-weight-soft text-weight border-weight-line", border: "border-weight-line hover:border-weight" },
  wellness_score: {
    iconBg: "bg-positive-soft text-positive border-positive-line",
    border: "border-positive-line hover:border-positive",
  },
  insight: { iconBg: "bg-gold-soft text-gold-ink border-gold-line", border: "border-gold-line hover:border-gold-ink" },
  alert: {
    iconBg: "bg-attention-soft text-attention border-attention-line",
    border: "border-attention-line hover:border-attention",
  },
  progress_photo: { iconBg: "bg-surface-sunken text-ink-muted border-line", border: "border-line hover:border-line-strong" },
  goal_change: { iconBg: "bg-info-soft text-info border-info-line", border: "border-info-line hover:border-info" },
  settings_change: { iconBg: "bg-surface-sunken text-ink-muted border-line", border: "border-line hover:border-line-strong" },
};

export function TimelineEventCard({
  event,
  onSelect,
}: {
  event: TimelineEvent;
  onSelect: (event: TimelineEvent) => void;
}) {
  const Icon = domainIcons[event.domain] || Activity;
  const style = domainStyles[event.domain] || domainStyles.activity;

  return (
    <button
      type="button"
      onClick={() => onSelect(event)}
      aria-haspopup="dialog"
      className={cn(
        "pressable flex min-h-control w-full cursor-pointer items-start justify-between gap-3 rounded-card border bg-surface p-3.5 text-left shadow-e1 hover:shadow-e2 sm:p-4",
        style.border,
      )}
    >
      <div className="flex min-w-0 items-start gap-3">
        <span className={cn("grid h-10 w-10 shrink-0 place-items-center rounded-control border", style.iconBg)}>
          <Icon aria-hidden className="h-5 w-5" />
        </span>

        <div className="min-w-0 space-y-0.5">
          <div className="flex flex-wrap items-center gap-2">
            <h4 lang="hi" className="text-sm font-semibold text-ink sm:text-base">
              {event.titleHi}
            </h4>
            {event.statusBadge ? <Badge variant={event.statusBadgeTone || "blue"}>{event.statusBadge}</Badge> : null}
          </div>

          {event.statusText ? <p className="text-xs text-ink-muted">{event.statusText}</p> : null}

          <p className="flex flex-wrap items-center gap-x-2 gap-y-1 pt-0.5 text-xs text-ink-subtle">
            {/* Date-only records (steps, sleep) say "पूरे दिन का" instead of an invented clock time. */}
            <span>{event.displayTime}</span>
            <span aria-hidden>•</span>
            <span className="rounded border border-line bg-surface-sunken px-1.5 py-0.5 font-medium text-ink-muted">
              {event.source}
            </span>
          </p>
        </div>
      </div>

      <div className="flex shrink-0 flex-col items-end justify-between self-stretch">
        {event.value ? <span className="tabular text-base font-semibold text-ink sm:text-lg">{event.value}</span> : <span />}
        <span className="mt-1 inline-flex items-center gap-0.5 text-xs font-medium text-ink-subtle">
          विवरण
          <ChevronRight aria-hidden className="h-3.5 w-3.5" />
        </span>
      </div>
    </button>
  );
}
