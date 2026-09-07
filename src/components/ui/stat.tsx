import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { ArrowDownRight, ArrowRight, ArrowUpRight } from "lucide-react";
import { metricChipClasses, type MetricTone } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export type TrendDirection = "up" | "down" | "flat";

/**
 * A single health value. Used by the dashboard snapshot, the health page and
 * the reports so a BP reading is typeset identically wherever it appears
 * (§15: health values are never small).
 */
export function Stat({
  label,
  hindiLabel,
  value,
  unit,
  helper,
  icon: Icon,
  tone = "neutral",
  trend,
  footer,
  onClick,
  emptyLabel = "—",
  className,
}: {
  label: string;
  hindiLabel?: string;
  value: string | number | null | undefined;
  unit?: string;
  helper?: string;
  icon?: LucideIcon;
  tone?: MetricTone;
  trend?: TrendDirection;
  footer?: ReactNode;
  onClick?: () => void;
  emptyLabel?: string;
  className?: string;
}) {
  const hasValue = value !== null && value !== undefined && value !== "";
  const Wrapper = onClick ? "button" : "div";

  const TrendIcon =
    trend === "up" ? ArrowUpRight : trend === "down" ? ArrowDownRight : ArrowRight;

  return (
    <Wrapper
      {...(onClick
        ? { type: "button" as const, onClick, "aria-label": `${label} — ${hasValue ? value : emptyLabel}` }
        : {})}
      className={cn(
        "flex w-full flex-col rounded-card border border-line bg-surface p-3.5 text-left shadow-e1",
        onClick && "pressable cursor-pointer hover:border-brand-line",
        className,
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-xs font-medium text-ink-muted">{label}</p>
          {hindiLabel ? (
            <p lang="hi" className="truncate text-2xs text-ink-subtle">
              {hindiLabel}
            </p>
          ) : null}
        </div>
        {Icon ? (
          <span
            className={cn(
              "grid h-8 w-8 shrink-0 place-items-center rounded-field",
              metricChipClasses[tone],
            )}
          >
            <Icon aria-hidden className="h-4 w-4" />
          </span>
        ) : null}
      </div>

      <div className="mt-2 flex items-baseline gap-1">
        <span
          className={cn(
            "tabular text-2xl font-semibold tracking-tight",
            hasValue ? "text-ink" : "text-ink-subtle",
          )}
        >
          {hasValue ? value : emptyLabel}
        </span>
        {unit && hasValue ? (
          <span className="text-xs font-medium text-ink-subtle">{unit}</span>
        ) : null}
        {trend && hasValue ? (
          <TrendIcon
            aria-hidden
            className={cn(
              "ml-0.5 h-4 w-4 shrink-0",
              trend === "up" && "text-critical",
              trend === "down" && "text-positive",
              trend === "flat" && "text-ink-subtle",
            )}
          />
        ) : null}
      </div>

      {helper ? (
        <p className="mt-1 line-clamp-2 text-2xs text-ink-subtle">{helper}</p>
      ) : null}
      {footer ? <div className="mt-2">{footer}</div> : null}
    </Wrapper>
  );
}

/**
 * Responsive grid for `Stat`s: two columns on a phone, up to six on desktop
 * so the layout is not just a stretched mobile page (§9).
 */
export function StatGrid({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-6",
        className,
      )}
    >
      {children}
    </div>
  );
}
