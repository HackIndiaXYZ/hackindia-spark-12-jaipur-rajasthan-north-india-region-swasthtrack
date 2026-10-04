import type { ReactNode } from "react";
import { AlertCircle, Calendar, type LucideIcon } from "lucide-react";
import { metricChipClasses, type MetricTone } from "@/components/ui/card";
import { cn } from "@/lib/utils";

/** Hero strip of a report: title, period, and the one headline number. */
export function ReportHero({
  title,
  hindiTitle,
  period,
  scoreLabel,
  score,
  controls,
}: {
  title: string;
  hindiTitle: string;
  /** e.g. "28 Sep – 4 Oct". */
  period: ReactNode;
  scoreLabel: string;
  score: number | null;
  controls?: ReactNode;
}) {
  return (
    <div className="gold-edge flex flex-col gap-3 rounded-panel p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <Calendar aria-hidden className="h-5 w-5 shrink-0 text-brand" />
          <h2 className="text-base font-semibold text-ink">
            {title}
            <span lang="hi" className="ml-2 text-sm font-normal text-ink-muted">
              {hindiTitle}
            </span>
          </h2>
        </div>
        <p className="mt-1 text-xs text-ink-subtle">{period}</p>
        {controls ? <div className="mt-3">{controls}</div> : null}
      </div>

      <div className="sm:text-right">
        <p className="text-2xs font-semibold uppercase tracking-wider text-ink-subtle">{scoreLabel}</p>
        {score === null ? (
          <p className="text-2xl font-semibold text-ink-subtle">—</p>
        ) : (
          <p className="tabular text-3xl font-semibold text-ink">
            {score}
            <span className="text-sm font-medium text-ink-subtle">/100</span>
          </p>
        )}
      </div>
    </div>
  );
}

/** One measure, in the identity colour of its vital. */
export function MetricCard({
  icon: Icon,
  tone = "neutral",
  label,
  hindiLabel,
  value,
  helper,
  className,
}: {
  icon?: LucideIcon;
  tone?: MetricTone;
  label: string;
  hindiLabel?: string;
  /** null renders an em dash: "no data", never a made-up number. */
  value: string | number | null;
  helper?: string;
  className?: string;
}) {
  const has = value !== null && value !== "";
  return (
    <div className={cn("rounded-card border border-line bg-surface p-3.5 shadow-e1", className)}>
      <div className="flex items-start gap-2">
        {Icon ? (
          <span className={cn("grid h-8 w-8 shrink-0 place-items-center rounded-field", metricChipClasses[tone])}>
            <Icon aria-hidden className="h-4 w-4" />
          </span>
        ) : null}
        <div className="min-w-0">
          <p className="text-xs font-medium text-ink-muted">{label}</p>
          {hindiLabel ? (
            <p lang="hi" className="text-2xs text-ink-subtle">
              {hindiLabel}
            </p>
          ) : null}
        </div>
      </div>
      <p className={cn("tabular mt-2 text-2xl font-semibold", has ? "text-ink" : "text-ink-subtle")}>{has ? value : "—"}</p>
      {helper ? <p className="mt-0.5 text-2xs text-ink-subtle">{helper}</p> : null}
    </div>
  );
}

/** "7 दिनों में से 5 दिन कुछ दर्ज हुआ": how much data the numbers stand on. */
export function CoverageLine({ tracked, total }: { tracked: number; total: number }) {
  return (
    <p className="text-xs text-ink-muted">
      <span lang="hi">
        {total} दिनों में से {tracked} दिन कुछ दर्ज हुआ
      </span>
      <span className="text-ink-subtle"> · {tracked} of {total} days have records</span>
    </p>
  );
}

export function ReportDisclaimer({ children }: { children: ReactNode }) {
  return (
    <p className="flex items-start gap-1.5 text-xs text-ink-subtle">
      <AlertCircle aria-hidden className="mt-0.5 h-3.5 w-3.5 shrink-0" />
      <span lang="hi">{children}</span>
    </p>
  );
}

/** Card of short bullet observations (the rule-based insights from the analytics service). */
export function InsightList({ title, hindiTitle, note, items }: { title: string; hindiTitle: string; note?: string; items: string[] }) {
  if (items.length === 0) return null;
  return (
    <section className="rounded-card border border-brand-line bg-brand-softer p-4 sm:p-5">
      <h3 className="text-sm font-semibold text-ink">
        {title}
        <span lang="hi" className="ml-2 text-xs font-normal text-ink-muted">
          {hindiTitle}
        </span>
      </h3>
      {note ? (
        <p lang="hi" className="mt-0.5 text-xs text-ink-muted">
          {note}
        </p>
      ) : null}
      <ul className="mt-3 space-y-1.5 text-sm text-ink-muted">
        {items.map((item) => (
          <li key={item} lang="hi" className="flex items-start gap-2">
            <span aria-hidden className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-brand" />
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function ReportSkeleton({ blocks = 3 }: { blocks?: number }) {
  return (
    <div aria-busy="true" aria-label="लोड हो रहा है" className="space-y-4">
      <div className="skeleton h-28 rounded-card" />
      {Array.from({ length: blocks }).map((_, i) => (
        <div key={i} className="skeleton h-28 rounded-card" />
      ))}
    </div>
  );
}

/** A report that cannot be computed yet: honest, with what to do next. */
export function NotEnoughData({ days, label }: { days: number; label: string }) {
  return (
    <div className="rounded-card border border-dashed border-attention-line bg-attention-soft p-5 text-center">
      <p lang="hi" className="text-sm font-semibold text-ink">
        अभी पर्याप्त डेटा नहीं है
      </p>
      <p lang="hi" className="mx-auto mt-1 max-w-md text-xs text-ink-muted">
        {label} के लिए कम से कम {days} दिन का रिकॉर्ड चाहिए। कुछ दिन नियमित रूप से दर्ज करें, फिर यहाँ ट्रेंड दिखेगा।
      </p>
    </div>
  );
}
