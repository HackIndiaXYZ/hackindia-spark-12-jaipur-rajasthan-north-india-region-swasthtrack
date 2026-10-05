import { Activity, CheckCircle2, ChevronRight, HeartPulse, Info, Moon, Pill, Scale, Sparkles, Utensils } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { langOf } from "@/components/ui/lang";
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

export const domainLabels: Record<TimelineDomain, { en: string; hi: string }> = {
  food: { en: "Meals", hi: "भोजन" },
  bp: { en: "Blood pressure", hi: "रक्तचाप" },
  medicine: { en: "Medicines", hi: "दवाइयाँ" },
  activity: { en: "Steps", hi: "कदम" },
  sleep: { en: "Sleep", hi: "नींद" },
  weight: { en: "Weight", hi: "वजन" },
  wellness_score: { en: "Score", hi: "स्कोर" },
  insight: { en: "Insight", hi: "सुझाव" },
  alert: { en: "Alerts", hi: "अलर्ट" },
  progress_photo: { en: "Photo", hi: "फ़ोटो" },
  goal_change: { en: "Goal", hi: "लक्ष्य" },
  settings_change: { en: "Settings", hi: "सेटिंग्स" },
};

/** Each domain keeps the identity colour it has everywhere else in the app. */
export const domainStyles: Record<TimelineDomain, { iconBg: string }> = {
  food: { iconBg: "bg-food-soft text-food border-food-line" },
  bp: { iconBg: "bg-bp-soft text-bp border-bp-line" },
  medicine: { iconBg: "bg-meds-soft text-meds border-meds-line" },
  activity: { iconBg: "bg-activity-soft text-activity border-activity-line" },
  sleep: { iconBg: "bg-sleep-soft text-sleep border-sleep-line" },
  weight: { iconBg: "bg-weight-soft text-weight border-weight-line" },
  wellness_score: { iconBg: "bg-positive-soft text-positive border-positive-line" },
  insight: { iconBg: "bg-gold-soft text-gold-ink border-gold-line" },
  alert: { iconBg: "bg-attention-soft text-attention border-attention-line" },
  progress_photo: { iconBg: "bg-surface-sunken text-ink-muted border-line" },
  goal_change: { iconBg: "bg-info-soft text-info border-info-line" },
  settings_change: { iconBg: "bg-surface-sunken text-ink-muted border-line" },
};

const TONE_TEXT = {
  green: "text-positive",
  blue: "text-info",
  amber: "text-attention",
  red: "text-critical",
  neutral: "text-ink",
} as const;

/**
 * One record of the feed. A row, not a card: a day's rows share one gilt card
 * and one vertical rail, so the page reads as a timeline.
 */
export function TimelineEventCard({ event, onSelect }: { event: TimelineEvent; onSelect: (event: TimelineEvent) => void }) {
  const Icon = domainIcons[event.domain] || Activity;
  const style = domainStyles[event.domain] || domainStyles.activity;
  // A dose's status is its value ("ली गई ✓", "छूटी ✗"), so it takes the status colour.
  const valueTone = event.domain === "medicine" ? TONE_TEXT[event.statusBadgeTone ?? "neutral"] : "text-ink";

  return (
    <button
      type="button"
      onClick={() => onSelect(event)}
      aria-haspopup="dialog"
      className={cn(
        "pressable group flex min-h-control w-full cursor-pointer items-start gap-3 px-3.5 py-3 text-left sm:px-4",
        "hover:bg-gold-soft/70 focus-visible:-outline-offset-2",
      )}
    >
      <span className={cn("relative z-10 grid h-10 w-10 shrink-0 place-items-center rounded-control border", style.iconBg)}>
        <Icon aria-hidden className="h-5 w-5" />
      </span>

      <div className="min-w-0 flex-1 space-y-0.5">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <h4 lang={langOf(event.titleHi)} className="text-sm font-semibold text-ink sm:text-base">
            {event.titleHi}
          </h4>
          {event.statusBadge ? <Badge variant={event.statusBadgeTone || "blue"}>{event.statusBadge}</Badge> : null}
        </div>
        {event.statusText ? (
          <p lang={langOf(event.statusText)} className="text-xs text-ink-muted">
            {event.statusText}
          </p>
        ) : null}
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 pt-0.5 text-xs text-ink-muted">
          {/* Date-only records (steps, sleep) say "पूरे दिन का" instead of an invented clock time. */}
          <span lang={event.isDateOnly ? "hi" : undefined} className="tabular font-medium">
            {event.displayTime}
          </span>
          <span aria-hidden>•</span>
          <span className="rounded border border-line bg-surface-sunken px-1.5 py-0.5 text-2xs font-medium">{event.source}</span>
        </p>
      </div>

      <div className="flex shrink-0 flex-col items-end gap-1 self-stretch">
        {event.value ? (
          <span lang={langOf(event.value)} className={cn("tabular text-sm font-semibold sm:text-base", valueTone)}>
            {event.value}
          </span>
        ) : (
          <span />
        )}
        <ChevronRight aria-hidden className="mt-auto h-4 w-4 text-ink-subtle transition-transform group-hover:translate-x-0.5" />
        <span className="sr-only">विवरण देखें</span>
      </div>
    </button>
  );
}
