import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { metricChipClasses, type MetricTone } from "@/components/ui/card";
import { cn } from "@/lib/utils";

/** Literal strings so Tailwind sees them: the hairline that outlines a header icon chip. */
const chipRing: Record<MetricTone, string> = {
  brand: "ring-brand-line",
  bp: "ring-bp-line",
  weight: "ring-weight-line",
  food: "ring-food-line",
  meds: "ring-meds-line",
  activity: "ring-activity-line",
  sleep: "ring-sleep-line",
  neutral: "ring-line",
};

export function RecordHeader({
  icon: Icon,
  tone,
  title,
  hindiTitle,
  subtitle,
  action,
}: {
  icon: LucideIcon;
  tone: MetricTone;
  title: string;
  hindiTitle: string;
  subtitle: string;
  action?: ReactNode;
}) {
  return (
    // Wraps only on the narrowest phones (320px): the title keeps a floor of 9.5rem, so beside the
    // action it would be squeezed to a 3-line column; instead the action drops underneath.
    <div className="mb-3.5 flex flex-wrap items-start justify-between gap-x-3 gap-y-2.5">
      <div className="flex min-w-[9.5rem] flex-1 items-start gap-2.5">
        <span
          aria-hidden
          className={cn(
            "grid h-9 w-9 shrink-0 place-items-center rounded-control ring-1 ring-inset",
            metricChipClasses[tone],
            chipRing[tone],
          )}
        >
          <Icon className="h-[18px] w-[18px]" />
        </span>
        <div className="min-w-0">
          <h2 className="flex flex-wrap items-baseline gap-x-2 text-base font-semibold leading-tight text-ink">
            <span lang="hi">{hindiTitle}</span>
            <span className="text-xs font-medium text-ink-muted">{title}</span>
          </h2>
          <p lang="hi" className="mt-0.5 text-xs text-ink-muted">
            {subtitle}
          </p>
        </div>
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}
