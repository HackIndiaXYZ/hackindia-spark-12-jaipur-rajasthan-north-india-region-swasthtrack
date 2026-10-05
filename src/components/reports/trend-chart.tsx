"use client";

import { useId } from "react";
import {
  Area,
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  type TooltipContentProps,
} from "recharts";
import { cn } from "@/lib/utils";

/**
 * The one chart used by every report and by "What changed". Colours are CSS
 * tokens only. A value of `null` is "nothing recorded": it leaves a gap (or no
 * bar), it is never drawn as zero.
 */

export type TrendSeries = {
  /** Key of the number in each data row. */
  key: string;
  name: string;
  /** A CSS colour token, e.g. `var(--color-bp)`. */
  color: string;
  type: "line" | "bar" | "area";
  dashed?: boolean;
  /** Draw a dot at every point (sparse series such as weight). Default: lines get dots only when short. */
  dots?: boolean;
  /** Lower the series to a muted tone (the "before" series of a comparison). */
  muted?: boolean;
};

export type TrendRefLine = {
  y: number;
  label?: string;
  /** Default: the target colour. */
  color?: string;
  /** Dash pattern; "2 3" is dotted. */
  dash?: string;
};

export type TrendRow = { x: string } & Record<string, number | string | null>;

type Props = {
  data: TrendRow[];
  series: TrendSeries[];
  refLines?: TrendRefLine[];
  /** Fixed [min, max]; either end may be left to "auto". Default: padded to the data and the reference lines. */
  yDomain?: [number | "auto", number | "auto"];
  height?: number;
  /** Tooltip number format. */
  format?: (value: number) => string;
  /** Axis number format (default: `format`); e.g. "7k" on the axis, "7,552" in the tooltip. */
  axisFormat?: (value: number) => string;
  /** Unit shown after a tooltip value. */
  unit?: string;
  /** Show every n-th x label. Default: fits the width. */
  xInterval?: number;
  /** Row key holding a longer label for the tooltip title (default: `x`). */
  titleKey?: string;
  /** Extra tooltip line per row, e.g. the matching date of another window. */
  noteKey?: string;
  /** A sentence that tells the same story as the chart, for screen readers. */
  summary: string;
  className?: string;
};

const AXIS_TICK = { fontSize: 11, fill: "var(--color-chart-axis)" } as const;

const STEPS = [0.1, 0.2, 0.5, 1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000, 2000, 2500, 5000, 10000];

/**
 * Round the data range out to tidy tick values (at most 6 gridlines). A fixed
 * end (`fixedLo` / `fixedHi`) is kept exactly and gets no padding.
 */
function niceScale(
  values: number[],
  extra: number[],
  fixedLo: number | null,
  fixedHi: number | null,
): { domain: [number, number]; ticks: number[] } {
  const all = [...values, ...extra, ...(fixedLo !== null ? [fixedLo] : []), ...(fixedHi !== null ? [fixedHi] : [])];
  if (all.length === 0) return { domain: [0, 1], ticks: [0, 1] };
  const lo = Math.min(...all);
  const hi = Math.max(...all);
  const span = hi - lo || Math.max(1, Math.abs(hi) * 0.1);
  const padLow = fixedLo !== null ? 0 : span * 0.08;
  const padHigh = fixedHi !== null ? 0 : span * 0.08;
  let best: { min: number; max: number; step: number } | null = null;
  for (const step of STEPS) {
    const min = fixedLo ?? Math.floor((lo - padLow) / step) * step;
    const max = fixedHi ?? Math.ceil((hi + padHigh) / step) * step;
    if (max <= min) continue;
    best = { min, max, step };
    if ((max - min) / step <= 5) break;
  }
  const { min, max, step } = best ?? { min: lo, max: hi + 1, step: 1 };
  const ticks: number[] = [];
  for (let v = Math.ceil(min / step) * step; v <= max + step / 1000; v += step) ticks.push(Math.round(v * 1000) / 1000);
  return { domain: [min, max], ticks };
}

/** Two-line x tick ("Tue" over "29", "5" over "Oct") so a week of labels fits a phone. */
function XTick({ x, y, payload }: { x?: number; y?: number; payload?: { value: string } }) {
  const text = String(payload?.value ?? "");
  const [first, ...rest] = text.split(" ");
  const second = rest.join(" ");
  return (
    <g transform={`translate(${x ?? 0},${y ?? 0})`}>
      <text textAnchor="middle" fill="var(--color-chart-axis)" fontSize={11}>
        <tspan x={0} dy={13}>
          {first}
        </tspan>
        {second ? (
          <tspan x={0} dy={12}>
            {second}
          </tspan>
        ) : null}
      </text>
    </g>
  );
}

function TrendTooltip({
  active,
  payload,
  series,
  format,
  unit,
  titleKey,
  noteKey,
}: Partial<TooltipContentProps> & Pick<Props, "series" | "format" | "unit" | "titleKey" | "noteKey">) {
  const row = active && payload && payload.length > 0 ? (payload[0].payload as TrendRow) : null;
  if (!row) return null;
  const fmt = format ?? ((v: number) => String(v));
  const shown = series
    .map((s) => ({ s, value: row[s.key] }))
    .filter((x): x is { s: TrendSeries; value: number } => typeof x.value === "number");
  const title = String(row[titleKey ?? "x"] ?? row.x);

  return (
    <div className="min-w-32 rounded-field border border-gold-line bg-surface p-2.5 text-xs shadow-e3">
      <p className="font-semibold text-ink">{title}</p>
      {shown.length === 0 ? (
        <p lang="hi" className="mt-0.5 text-ink-muted">
          कोई रिकॉर्ड नहीं
        </p>
      ) : (
        <ul className="mt-1 space-y-0.5">
          {shown.map(({ s, value }) => (
            <li key={s.key} className="flex items-center justify-between gap-3">
              <span className="flex items-center gap-1.5 text-ink-muted">
                <span aria-hidden className="h-2 w-2 rounded-full" style={{ background: s.color }} />
                {s.name}
              </span>
              <span className="tabular font-semibold text-ink">
                {fmt(value)}
                {unit ? <span className="ml-0.5 font-normal text-ink-muted">{unit}</span> : null}
              </span>
            </li>
          ))}
        </ul>
      )}
      {noteKey && typeof row[noteKey] === "string" ? <p className="mt-1 text-2xs text-ink-muted">{String(row[noteKey])}</p> : null}
    </div>
  );
}

export function TrendChart({
  data,
  series,
  refLines = [],
  yDomain,
  height = 176,
  format,
  axisFormat,
  unit,
  xInterval,
  titleKey,
  noteKey,
  summary,
  className,
}: Props) {
  const gradId = `trend-${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  const values = series.flatMap((s) => data.map((r) => r[s.key]).filter((v): v is number => typeof v === "number"));
  const hasBars = series.some((s) => s.type === "bar");

  if (values.length === 0) {
    return (
      <div
        className="flex flex-col items-center justify-center gap-0.5 rounded-card border border-dashed border-line-strong bg-surface-sunken px-4 text-center"
        style={{ height }}
      >
        <p lang="hi" className="text-sm font-medium text-ink-muted">
          इस अवधि में कोई रिकॉर्ड नहीं
        </p>
        <p className="text-xs text-ink-subtle">Nothing recorded in this period.</p>
      </div>
    );
  }

  // Bars always start at zero so their length means something.
  const fixedLo = typeof yDomain?.[0] === "number" ? yDomain[0] : hasBars ? 0 : null;
  const fixedHi = typeof yDomain?.[1] === "number" ? yDomain[1] : null;
  const scale = niceScale(
    values,
    refLines.map((r) => r.y),
    fixedLo,
    fixedHi,
  );
  const domain = scale.domain;
  const ticks = scale.ticks;
  const dotsByDefault = data.length <= 14;

  return (
    <div className={cn("min-w-0", className)} role="group" aria-label={summary}>
      <div className="w-full min-w-0" style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }} barCategoryGap="22%">
            <defs>
              {series
                .filter((s) => s.type === "area")
                .map((s) => (
                  <linearGradient key={s.key} id={`${gradId}-${s.key}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={s.color} stopOpacity={0.38} />
                    <stop offset="100%" stopColor={s.color} stopOpacity={0.02} />
                  </linearGradient>
                ))}
            </defs>
            <CartesianGrid stroke="var(--color-chart-grid)" strokeDasharray="3 3" vertical={false} />
            <XAxis
              dataKey="x"
              tick={<XTick />}
              height={36}
              tickLine={false}
              axisLine={{ stroke: "var(--color-chart-grid)" }}
              interval={xInterval ?? "preserveStartEnd"}
              minTickGap={14}
              padding={{ left: hasBars ? 0 : 8, right: hasBars ? 0 : 8 }}
            />
            <YAxis
              domain={domain}
              width={axisFormat || format ? 40 : 34}
              tick={AXIS_TICK}
              tickLine={false}
              axisLine={false}
              tickFormatter={axisFormat ?? format}
              ticks={ticks}
              allowDecimals
            />
            <Tooltip
              content={(props) => <TrendTooltip {...props} series={series} format={format} unit={unit} titleKey={titleKey} noteKey={noteKey} />}
              cursor={{ stroke: "var(--color-chart-axis)", strokeOpacity: 0.35, fill: "var(--color-surface-sunken)", fillOpacity: 0.6 }}
              wrapperStyle={{ zIndex: 20, outline: "none" }}
            />
            {refLines.map((r) => (
              <ReferenceLine
                key={`${r.y}-${r.label ?? ""}`}
                y={r.y}
                stroke={r.color ?? "var(--color-chart-target)"}
                strokeDasharray={r.dash ?? "5 4"}
                strokeOpacity={0.75}
                label={
                  r.label
                    ? { value: r.label, position: "insideTopRight", fill: "var(--color-chart-axis)", fontSize: 10 }
                    : undefined
                }
              />
            ))}
            {series.map((s) => {
              if (s.type === "bar") {
                return (
                  <Bar
                    key={s.key}
                    dataKey={s.key}
                    name={s.name}
                    fill={s.color}
                    fillOpacity={s.muted ? 0.45 : 1}
                    radius={[3, 3, 0, 0]}
                    maxBarSize={28}
                    isAnimationActive={false}
                  />
                );
              }
              if (s.type === "area") {
                return (
                  <Area
                    key={s.key}
                    type="monotone"
                    dataKey={s.key}
                    name={s.name}
                    stroke={s.color}
                    strokeWidth={2}
                    fill={`url(#${gradId}-${s.key})`}
                    connectNulls
                    dot={(s.dots ?? dotsByDefault) ? { r: 3, fill: s.color, stroke: "var(--color-surface)", strokeWidth: 1 } : false}
                    activeDot={{ r: 5 }}
                    isAnimationActive={false}
                  />
                );
              }
              return (
                <Line
                  key={s.key}
                  type="monotone"
                  dataKey={s.key}
                  name={s.name}
                  stroke={s.color}
                  strokeOpacity={s.muted ? 0.7 : 1}
                  strokeWidth={s.muted ? 1.75 : 2.25}
                  strokeDasharray={s.dashed ? "5 4" : undefined}
                  connectNulls
                  dot={
                    s.muted
                      ? false
                      : (s.dots ?? dotsByDefault)
                        ? { r: 3, fill: s.color, stroke: "var(--color-surface)", strokeWidth: 1 }
                        : false
                  }
                  activeDot={{ r: 5 }}
                  isAnimationActive={false}
                />
              );
            })}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
