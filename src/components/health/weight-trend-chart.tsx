"use client";

import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  type TooltipContentProps,
} from "recharts";
import { toISTDate } from "@/lib/health-rules";
import {
  AXIS_TICK,
  CHART_MARGIN,
  CROSSHAIR,
  ChartEmpty,
  LegendKey,
  TooltipCard,
  activeDotFor,
  dotFor,
  niceScale,
  timeAxis,
} from "@/components/health/chart-utils";
import { fmtDateStr, fmtDayYear, fmtKg, fmtTime } from "@/components/health/format";
import type { WeightLogEntry } from "@/services/patient-service";

type WeightTrendChartProps = {
  /** Weigh-ins in the window, any order. */
  logs: WeightLogEntry[];
  targetWeight?: number | null;
  /** IST window shown on the x axis (defaults to the span of the data). */
  startDate?: string;
  endDate?: string;
};

type Point = { t: number; weight: number; notes: string | null; diff: number | null };

const COLOR = "var(--color-weight)";

function WeightTooltip({ active, payload }: Partial<TooltipContentProps>) {
  const point = active && payload && payload.length > 0 ? (payload[0].payload as Point) : null;
  if (!point) return null;
  return (
    <TooltipCard>
      <p className="tabular text-sm font-semibold text-ink">
        {fmtKg(point.weight)} <span className="text-xs font-normal text-ink-muted">kg</span>
      </p>
      <p className="text-ink-muted">
        {fmtDayYear(new Date(point.t))}, {fmtTime(new Date(point.t))}
      </p>
      {point.diff !== null ? (
        <p lang="hi" className="mt-1 font-semibold text-ink-muted">
          लक्ष्य से {point.diff > 0 ? "+" : ""}
          {point.diff} kg
        </p>
      ) : null}
      {point.notes ? <p className="mt-1 text-ink-muted">{point.notes}</p> : null}
    </TooltipCard>
  );
}

export function WeightTrendChart({ logs, targetWeight, startDate, endDate }: WeightTrendChartProps) {
  if (logs.length === 0) {
    return <ChartEmpty hindi="इस अवधि में कोई वजन दर्ज नहीं" english="No weigh-ins in this period." />;
  }

  const points: Point[] = logs
    .map((log) => ({
      t: new Date(log.measured_at).getTime(),
      weight: Number(log.weight_kg),
      notes: log.notes,
      diff: targetWeight ? Number((Number(log.weight_kg) - targetWeight).toFixed(1)) : null,
    }))
    .sort((a, b) => a.t - b.t);

  const firstDay = startDate ?? toISTDate(points[0].t);
  const lastDay = endDate ?? toISTDate(points[points.length - 1].t);
  const axis = timeAxis(firstDay, lastDay);

  const weights = points.map((p) => p.weight);
  const lo = Math.min(...weights, targetWeight ?? Infinity);
  const hi = Math.max(...weights, targetWeight ?? -Infinity);
  const yScale = niceScale(lo - 0.5, hi + 0.5);

  const first = points[0];
  const last = points[points.length - 1];
  const change = Number((last.weight - first.weight).toFixed(1));
  const summary =
    points.length === 1
      ? `1 बार वजन, ${fmtDateStr(toISTDate(first.t))}: ${fmtKg(first.weight)} kg।`
      : `${points.length} बार वजन, ${fmtDateStr(toISTDate(first.t))} से ${fmtDateStr(toISTDate(last.t))}। ${fmtKg(first.weight)} kg से ${fmtKg(last.weight)} kg (${change > 0 ? "+" : ""}${change} kg)।`;

  return (
    <figure className="min-w-0">
      <figcaption className="mb-2 text-xs text-ink-muted">{summary}</figcaption>
      <div className="h-64 w-full min-w-0 sm:h-72">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={points} margin={CHART_MARGIN}>
            <CartesianGrid stroke="var(--color-chart-grid)" vertical={false} />
            <XAxis
              dataKey="t"
              type="number"
              scale="time"
              domain={axis.domain}
              ticks={axis.ticks}
              tickFormatter={axis.format}
              tick={AXIS_TICK}
              tickLine={false}
              axisLine={{ stroke: "var(--color-chart-grid)" }}
              interval={0}
            />
            <YAxis
              domain={yScale.domain}
              ticks={yScale.ticks}
              width={38}
              tick={AXIS_TICK}
              tickLine={false}
              axisLine={false}
            />
            <Tooltip content={(props) => <WeightTooltip {...props} />} cursor={CROSSHAIR} wrapperStyle={{ zIndex: 20, outline: "none" }} />

            {targetWeight ? (
              <ReferenceLine
                y={targetWeight}
                stroke="var(--color-chart-target)"
                strokeDasharray="5 4"
                strokeOpacity={0.75}
              />
            ) : null}

            <Line
              type="monotone"
              dataKey="weight"
              name="Weight"
              stroke={COLOR}
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              dot={dotFor(COLOR, points.length)}
              activeDot={activeDotFor(COLOR)}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {targetWeight ? (
        <ul className="mt-2 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-xs font-medium text-ink-muted">
          <LegendKey kind="line" color={COLOR}>
            Weight (वजन)
          </LegendKey>
          <LegendKey kind="dash" color="var(--color-chart-target)">
            लक्ष्य (Target) {targetWeight} kg
          </LegendKey>
        </ul>
      ) : null}
    </figure>
  );
}
