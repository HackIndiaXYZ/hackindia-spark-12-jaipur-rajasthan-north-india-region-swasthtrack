"use client";

import { useRef, type ReactNode } from "react";
import { AlertCircle, CalendarDays, ChevronLeft, ChevronRight, Lightbulb, type LucideIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button, IconButton } from "@/components/ui/button";
import { Card, metricChipClasses, type MetricTone } from "@/components/ui/card";
import { getScoreCategory } from "@/lib/analytics/wellness-calc";
import { cn } from "@/lib/utils";

/* ---------------------------------------------------------------------------
   Period navigation: ‹ label › · "latest" · optional date picker
   --------------------------------------------------------------------------- */

export function PeriodNav({
  label,
  prevLabel,
  nextLabel,
  onPrev,
  onNext,
  canPrev = true,
  canNext,
  latestLabel,
  atLatest,
  onLatest,
  datePicker,
  actions,
}: {
  /** The period on screen, e.g. "29 Sept – 5 Oct 2026". */
  label: string;
  prevLabel: string;
  nextLabel: string;
  onPrev: () => void;
  onNext: () => void;
  canPrev?: boolean;
  canNext: boolean;
  /** Text of the jump-back button ("Today", "This week"); it only appears once the reader has left the latest period. */
  latestLabel?: string;
  atLatest?: boolean;
  onLatest?: () => void;
  datePicker?: { label: string; value: string; max: string; min?: string; onChange: (value: string) => void };
  /** Extra buttons (CSV) that sit at the end of the row. */
  actions?: ReactNode;
}) {
  const pickerRef = useRef<HTMLInputElement>(null);

  return (
    <div className="no-print flex flex-wrap items-center gap-2 print:hidden">
      <div className="surface-lift inline-flex w-full min-w-0 items-center justify-between rounded-control p-0.5 sm:w-auto">
        <IconButton variant="ghost" aria-label={prevLabel} disabled={!canPrev} onClick={onPrev}>
          <ChevronLeft aria-hidden className="h-5 w-5" />
        </IconButton>
        <span aria-live="polite" className="tabular min-w-0 px-1.5 text-center text-sm font-semibold text-ink sm:min-w-44 sm:px-3">
          {label}
        </span>
        <IconButton variant="ghost" aria-label={nextLabel} disabled={!canNext} onClick={onNext}>
          <ChevronRight aria-hidden className="h-5 w-5" />
        </IconButton>
      </div>

      {datePicker ? (
        <span className="relative inline-flex">
          <Button
            variant="secondary"
            aria-label={datePicker.label}
            onClick={() => {
              const el = pickerRef.current;
              if (!el) return;
              try {
                el.showPicker();
              } catch {
                el.focus();
              }
            }}
          >
            <CalendarDays aria-hidden className="h-4 w-4" />
            <span className="hidden sm:inline">{datePicker.label}</span>
          </Button>
          {/* The native picker, driven by the button above; visually hidden but a real date input. */}
          <input
            ref={pickerRef}
            type="date"
            tabIndex={-1}
            aria-hidden
            data-period-date
            value={datePicker.value}
            max={datePicker.max}
            min={datePicker.min}
            onChange={(e) => {
              if (e.target.value) datePicker.onChange(e.target.value);
            }}
            className="pointer-events-none absolute inset-0 h-full w-full opacity-0"
          />
        </span>
      ) : null}

      {latestLabel && onLatest && !atLatest ? (
        <Button variant="secondary" onClick={onLatest}>
          {latestLabel}
        </Button>
      ) : null}

      {actions}
    </div>
  );
}

/* ---------------------------------------------------------------------------
   Hero: the one premium card of a report
   --------------------------------------------------------------------------- */

/** One cell per day of the period: filled when anything was recorded that day. */
function CoverageStrip({ flags }: { flags: boolean[] }) {
  return (
    <div aria-hidden className="flex gap-0.5">
      {flags.map((on, i) => (
        <span key={i} className={cn("h-2 min-w-0 flex-1 rounded-sm", on ? "bg-brand" : "bg-ink/15")} />
      ))}
    </div>
  );
}

/** Hero strip of a report: title, the period navigator, coverage and the one headline number. */
export function ReportHero({
  icon: Icon = CalendarDays,
  title,
  hindiTitle,
  period,
  scoreLabel,
  score,
  loading = false,
  nav,
  coverage,
  note,
}: {
  icon?: LucideIcon;
  title: string;
  hindiTitle: string;
  /** The period as text: shown on paper, where the navigator is hidden. */
  period: string;
  scoreLabel: string;
  score: number | null;
  /** The numbers are on their way: the score slot shows a skeleton, not "—". */
  loading?: boolean;
  /** The period navigator (a `PeriodNav`) or any other controls. */
  nav?: ReactNode;
  coverage?: { tracked: number; total: number; flags?: boolean[] };
  note?: ReactNode;
}) {
  const category = score === null || loading ? null : getScoreCategory(score);
  return (
    <Card tone="premium" className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <span className="tile grid h-11 w-11 shrink-0 place-items-center rounded-control text-gold-ink">
            <Icon aria-hidden className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <h2 className="text-lg font-semibold leading-tight text-ink sm:text-xl">{title}</h2>
            <p lang="hi" className="text-sm text-ink-muted">
              {hindiTitle}
            </p>
          </div>
        </div>

        <div className="shrink-0 text-right">
          <p className="text-2xs font-semibold uppercase tracking-wider text-ink-muted">{scoreLabel}</p>
          {loading ? (
            <div aria-hidden className="skeleton ml-auto mt-1 h-9 w-20" />
          ) : score === null ? (
            <p className="text-3xl font-semibold leading-none text-ink-muted">—</p>
          ) : (
            <p className="tabular text-4xl font-semibold leading-none text-ink">
              {score}
              <span className="text-sm font-medium text-ink-muted">/100</span>
            </p>
          )}
          {category ? (
            <Badge variant={category.badgeTone} className="mt-1.5">
              <span lang="hi">{category.categoryHi}</span>
            </Badge>
          ) : null}
        </div>
      </div>

      <p className="tabular hidden text-sm font-semibold text-ink print:block">{period}</p>
      {nav}

      {coverage && !loading ? (
        <div className="space-y-1.5">
          <p className="text-xs text-ink-muted">
            <span lang="hi">
              {coverage.total} दिनों में से {coverage.tracked} दिन कुछ दर्ज हुआ
            </span>
            <span> · {coverage.tracked} of {coverage.total} days have records</span>
          </p>
          {coverage.flags && coverage.flags.length > 0 ? <CoverageStrip flags={coverage.flags} /> : null}
        </div>
      ) : null}

      {note ? <div className="text-xs text-ink-muted">{note}</div> : null}
    </Card>
  );
}

/* ---------------------------------------------------------------------------
   Building blocks
   --------------------------------------------------------------------------- */

/** One measure, in the identity colour of its vital. Lives inside a card as a frosted tile. */
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
    <div className={cn("tile rounded-card p-3.5", className)}>
      <div className="flex items-start gap-2">
        {Icon ? (
          <span className={cn("grid h-8 w-8 shrink-0 place-items-center rounded-field", metricChipClasses[tone])}>
            <Icon aria-hidden className="h-4 w-4" />
          </span>
        ) : null}
        <div className="min-w-0">
          <p className="text-xs font-semibold text-ink">{label}</p>
          {hindiLabel ? (
            <p lang="hi" className="text-2xs text-ink-muted">
              {hindiLabel}
            </p>
          ) : null}
        </div>
      </div>
      <p className={cn("tabular mt-2 text-2xl font-semibold leading-tight", has ? "text-ink" : "text-ink-subtle")}>{has ? value : "—"}</p>
      {helper ? <p className="mt-0.5 text-2xs text-ink-muted">{helper}</p> : null}
    </div>
  );
}

/** A slim gold-foil progress bar (0–100) with its own accessible name. */
export function Meter({ value, label, className }: { value: number; label: string; className?: string }) {
  const pct = Math.min(100, Math.max(0, Math.round(value)));
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={pct}
      className={cn("h-1.5 overflow-hidden rounded-full bg-surface-sunken", className)}
    >
      <div className="grad-spring h-full rounded-full" style={{ width: `${pct}%` }} />
    </div>
  );
}

/** A report section: a gilt card with a titled header (icon chip in the vital's colour). */
export function ChartCard({
  icon: Icon,
  tone = "neutral",
  title,
  hindiTitle,
  description,
  aside,
  children,
  className,
}: {
  icon?: LucideIcon;
  tone?: MetricTone;
  title: string;
  hindiTitle?: string;
  description?: string;
  /** Right side of the header (a badge, a value). */
  aside?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Card className={className}>
      <div className="mb-3 flex flex-wrap items-start justify-between gap-x-3 gap-y-2">
        <div className="flex min-w-0 items-start gap-2.5">
          {Icon ? (
            <span className={cn("grid h-9 w-9 shrink-0 place-items-center rounded-control", metricChipClasses[tone])}>
              <Icon aria-hidden className="h-[18px] w-[18px]" />
            </span>
          ) : null}
          <div className="min-w-0">
            <h3 className="text-base font-semibold leading-snug text-ink">
              {title}
              {hindiTitle ? (
                <span lang="hi" className="ml-2 text-sm font-normal text-ink-muted">
                  {hindiTitle}
                </span>
              ) : null}
            </h3>
            {description ? <p className="mt-0.5 text-xs text-ink-muted">{description}</p> : null}
          </div>
        </div>
        {aside ? <div className="shrink-0">{aside}</div> : null}
      </div>
      {children}
    </Card>
  );
}

export function TrendLegend({
  items,
  className,
}: {
  items: Array<{ label: string; color: string; kind?: "line" | "bar" | "dashed"; muted?: boolean }>;
  className?: string;
}) {
  return (
    <ul className={cn("mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs font-medium text-ink-muted", className)}>
      {items.map((item) => (
        <li key={item.label} className="flex items-center gap-1.5">
          {item.kind === "bar" ? (
            <span aria-hidden className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: item.color, opacity: item.muted ? 0.45 : 1 }} />
          ) : item.kind === "dashed" ? (
            <span aria-hidden className="inline-block w-4 border-t-2 border-dashed" style={{ borderColor: item.color }} />
          ) : (
            <span aria-hidden className="inline-block h-0.5 w-4 rounded" style={{ background: item.color }} />
          )}
          {item.label}
        </li>
      ))}
    </ul>
  );
}

export function ReportDisclaimer({ children }: { children: ReactNode }) {
  return (
    <p className="flex items-start gap-1.5 text-xs text-ink-muted">
      <AlertCircle aria-hidden className="mt-0.5 h-3.5 w-3.5 shrink-0" />
      <span lang="hi">{children}</span>
    </p>
  );
}

/** Card of short bullet observations (the rule-based insights from the analytics service). */
export function InsightList({ title, hindiTitle, note, items }: { title: string; hindiTitle: string; note?: string; items: string[] }) {
  if (items.length === 0) return null;
  return (
    <ChartCard icon={Lightbulb} tone="brand" title={title} hindiTitle={hindiTitle} description={note}>
      <ul className="space-y-2 text-sm text-ink-muted">
        {items.map((item) => (
          <li key={item} lang="hi" className="flex items-start gap-2.5">
            <span aria-hidden className="grad-spring mt-2 h-1.5 w-1.5 shrink-0 rounded-full" />
            <span className="text-ink">{item}</span>
          </li>
        ))}
      </ul>
    </ChartCard>
  );
}

export function ReportSkeleton({ blocks = 3 }: { blocks?: number }) {
  return (
    <div aria-busy="true" aria-label="लोड हो रहा है" className="space-y-4">
      <div className="skeleton h-44 rounded-card" />
      {Array.from({ length: blocks }).map((_, i) => (
        <div key={i} className="skeleton h-40 rounded-card" />
      ))}
    </div>
  );
}

/** A report that cannot be computed yet: honest, with what to do next. */
export function NotEnoughData({ days, label }: { days: number; label: string }) {
  return (
    <div className="rounded-card border border-dashed border-attention-line bg-attention-soft p-4 text-center">
      <p lang="hi" className="text-sm font-semibold text-ink">
        अभी पर्याप्त डेटा नहीं है
      </p>
      <p lang="hi" className="mx-auto mt-1 max-w-md text-xs text-ink-muted">
        {label} के लिए कम से कम {days} दिन का रिकॉर्ड चाहिए। कुछ दिन नियमित रूप से दर्ज करें, फिर यहाँ ट्रेंड दिखेगा।
      </p>
    </div>
  );
}
