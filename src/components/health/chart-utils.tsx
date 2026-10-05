import type { ReactNode } from "react";
import { addDaysIST, daysBetweenIST, istInstant } from "@/lib/health-rules";
import { fmtDay, fmtDayYY } from "@/components/health/format";

/** Recessive, readable axis text; colour comes from the chart token. */
export const AXIS_TICK = { fontSize: 11, fill: "var(--color-chart-axis)" } as const;

export const CHART_MARGIN = { top: 14, right: 10, left: 0, bottom: 4 } as const;

export const MS_PER_DAY = 86_400_000;

/** Start of an IST calendar day, as an epoch. */
export const dayStart = (date: string) => istInstant(date, "00:00").getTime();

/**
 * x axis for a window of IST days: the domain covers every whole day, and the
 * labels sit at the middle of a day (so a reading belongs visibly to its day)
 * and count back from the last day, so the newest date is always labelled.
 */
export function timeAxis(firstDay: string, lastDay: string) {
  const span = Math.max(0, daysBetweenIST(firstDay, lastDay));
  const step = Math.max(1, Math.ceil(span / 5));
  const ticks: number[] = [];
  for (let d = span; d >= 0; d -= step) ticks.push(dayStart(addDaysIST(firstDay, d)) + MS_PER_DAY / 2);
  ticks.reverse();
  const crossesYear = firstDay.slice(0, 4) !== lastDay.slice(0, 4);
  return {
    span,
    domain: [dayStart(firstDay), dayStart(lastDay) + MS_PER_DAY] as [number, number],
    ticks,
    format: (t: number) => (crossesYear ? fmtDayYY(t) : fmtDay(t)),
  };
}

/**
 * A y axis that starts and ends on round numbers and ticks at 1 / 2 / 5 x 10^n
 * (60, 80, 100 ...), instead of the awkward 70 / 95 / 120 a data-driven axis gives.
 */
export function niceScale(min: number, max: number, intervals = 5) {
  const raw = Math.max(max - min, 1) / intervals;
  const p = 10 ** Math.floor(Math.log10(raw));
  const m = raw / p;
  const step = (m <= 1 ? 1 : m <= 2 ? 2 : m <= 5 ? 5 : 10) * p;
  const lo = Math.floor(min / step) * step;
  const hi = Math.ceil(max / step) * step;
  const ticks: number[] = [];
  for (let v = lo; v <= hi + step / 2; v += step) ticks.push(Math.round(v * 1000) / 1000);
  return { domain: [lo, hi] as [number, number], ticks };
}

/** The frosted readout every chart tooltip uses. */
export function TooltipCard({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-field border border-line-strong bg-surface p-3 text-xs shadow-e3">{children}</div>
  );
}

/** Crosshair that follows the pointer to the nearest reading. */
export const CROSSHAIR = { stroke: "var(--color-line-strong)", strokeWidth: 1 } as const;

/** Points beyond this many are drawn as a bare line: hundreds of dots are noise, the tooltip still finds each one. */
export const MAX_DOT_POINTS = 45;

/** Dots with a 2px surface ring, so they stay legible where they cross the line. */
export function dotFor(color: string, count: number) {
  return count > MAX_DOT_POINTS
    ? false
    : ({ r: 4, fill: color, stroke: "var(--color-surface)", strokeWidth: 2 } as const);
}

export function activeDotFor(color: string) {
  return { r: 6, fill: color, stroke: "var(--color-surface)", strokeWidth: 2 } as const;
}

/** A chart that has no data to draw. Keeps the frame so the tab does not jump. */
export function ChartEmpty({ hindi, english }: { hindi: string; english: string }) {
  return (
    <div className="flex h-48 flex-col items-center justify-center gap-1 rounded-card border border-dashed border-line-strong bg-surface-sunken px-4 text-center">
      <p lang="hi" className="text-sm font-medium text-ink-muted">
        {hindi}
      </p>
      <p className="text-xs text-ink-subtle">{english}</p>
    </div>
  );
}

/** Legend key: a short stroke (line) or a small rounded block (bar), in the series colour. */
export function LegendKey({
  kind,
  color,
  opacity = 1,
  children,
}: {
  kind: "line" | "bar" | "dash";
  color: string;
  /** For a bar drawn lighter when it misses its goal. */
  opacity?: number;
  children: ReactNode;
}) {
  return (
    <li className="flex items-center gap-1.5">
      {kind === "bar" ? (
        <span aria-hidden className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: color, opacity }} />
      ) : kind === "dash" ? (
        <span aria-hidden className="inline-block w-4 border-t-2 border-dashed" style={{ borderColor: color }} />
      ) : (
        <span aria-hidden className="inline-block h-0.5 w-4 rounded" style={{ background: color }} />
      )}
      {children}
    </li>
  );
}
