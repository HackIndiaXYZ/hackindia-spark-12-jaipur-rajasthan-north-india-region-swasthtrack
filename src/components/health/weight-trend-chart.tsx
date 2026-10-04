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
import { addDaysIST, daysBetweenIST, istInstant, toISTDate } from "@/lib/health-rules";
import { fmtDateStr, fmtDay, fmtDayYear } from "@/components/health/format";
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

const AXIS_TICK = { fontSize: 11, fill: "var(--color-chart-axis)" } as const;
const MS_PER_DAY = 86_400_000;
const dayStart = (date: string) => istInstant(date, "00:00").getTime();

function WeightTooltip({ active, payload }: Partial<TooltipContentProps>) {
  const point = active && payload && payload.length > 0 ? (payload[0].payload as Point) : null;
  if (!point) return null;
  return (
    <div className="rounded-field border border-line bg-surface p-3 text-xs shadow-e3">
      <p className="tabular text-sm font-semibold text-ink">
        {point.weight} <span className="text-xs font-normal text-ink-subtle">kg</span>
      </p>
      <p className="text-ink-subtle">{fmtDayYear(new Date(point.t))}</p>
      {point.diff !== null ? (
        <p lang="hi" className="mt-1 font-semibold text-ink-muted">
          लक्ष्य से {point.diff > 0 ? "+" : ""}
          {point.diff} kg
        </p>
      ) : null}
      {point.notes ? <p className="mt-1 text-ink-subtle">{point.notes}</p> : null}
    </div>
  );
}

export function WeightTrendChart({ logs, targetWeight, startDate, endDate }: WeightTrendChartProps) {
  if (logs.length < 2) {
    return (
      <div className="flex h-48 flex-col items-center justify-center gap-1 rounded-card border border-dashed border-line-strong bg-surface-sunken px-4 text-center">
        <p lang="hi" className="text-sm font-medium text-ink-muted">
          कम से कम 2 रीडिंग चाहिए
        </p>
        <p className="text-xs text-ink-subtle">At least 2 weigh-ins are needed to draw a trend.</p>
      </div>
    );
  }

  const points: Point[] = logs
    .map((log) => ({
      t: new Date(log.measured_at).getTime(),
      weight: log.weight_kg,
      notes: log.notes,
      diff: targetWeight ? Number((log.weight_kg - targetWeight).toFixed(1)) : null,
    }))
    .sort((a, b) => a.t - b.t);

  const firstDay = startDate ?? toISTDate(points[0].t);
  const lastDay = endDate ?? toISTDate(points[points.length - 1].t);
  const span = Math.max(0, daysBetweenIST(firstDay, lastDay));
  const step = Math.max(1, Math.ceil(span / 5));
  const ticks: number[] = [];
  for (let d = 0; d <= span; d += step) ticks.push(dayStart(addDaysIST(firstDay, d)));

  const weights = points.map((p) => p.weight);
  const lo = Math.min(...weights, targetWeight ?? Infinity);
  const hi = Math.max(...weights, targetWeight ?? -Infinity);
  const yMin = Math.floor(lo - 1);
  const yMax = Math.ceil(hi + 1);

  const first = points[0];
  const last = points[points.length - 1];
  const change = Number((last.weight - first.weight).toFixed(1));
  const summary = `${points.length} बार वजन, ${fmtDateStr(toISTDate(first.t))} से ${fmtDateStr(toISTDate(last.t))}। ${first.weight} kg से ${last.weight} kg (${change > 0 ? "+" : ""}${change} kg)।`;

  return (
    <figure className="min-w-0">
      <figcaption className="mb-2 text-xs text-ink-muted">{summary}</figcaption>
      <div className="h-64 w-full min-w-0">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={points} margin={{ top: 12, right: 8, left: 0, bottom: 4 }}>
            <CartesianGrid stroke="var(--color-chart-grid)" strokeDasharray="3 3" vertical={false} />
            <XAxis
              dataKey="t"
              type="number"
              scale="time"
              domain={[dayStart(firstDay), dayStart(lastDay) + MS_PER_DAY]}
              ticks={ticks}
              tickFormatter={(t: number) => fmtDay(new Date(t))}
              tick={AXIS_TICK}
              tickLine={false}
              axisLine={{ stroke: "var(--color-chart-grid)" }}
            />
            <YAxis
              domain={[yMin, yMax]}
              width={38}
              tick={AXIS_TICK}
              tickLine={false}
              axisLine={false}
              allowDecimals={false}
            />
            <Tooltip content={(props) => <WeightTooltip {...props} />} wrapperStyle={{ zIndex: 20, outline: "none" }} />

            {targetWeight ? (
              <ReferenceLine
                y={targetWeight}
                stroke="var(--color-chart-target)"
                strokeDasharray="5 4"
                strokeOpacity={0.7}
                label={{ value: `लक्ष्य ${targetWeight} kg`, position: "insideTopRight", fill: "var(--color-chart-axis)", fontSize: 10 }}
              />
            ) : null}

            <Line
              type="monotone"
              dataKey="weight"
              name="Weight"
              stroke="var(--color-weight)"
              strokeWidth={2}
              dot={{ r: 3, fill: "var(--color-weight)", stroke: "var(--color-surface)", strokeWidth: 1 }}
              activeDot={{ r: 6 }}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <ul className="mt-2 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-xs font-medium text-ink-muted">
        <li className="flex items-center gap-1.5">
          <span aria-hidden className="inline-block h-0.5 w-4 rounded bg-weight" />
          Weight (वजन)
        </li>
        {targetWeight ? (
          <li className="flex items-center gap-1.5">
            <span aria-hidden className="inline-block w-4 border-t-2 border-dashed border-chart-target" />
            लक्ष्य (Target) {targetWeight} kg
          </li>
        ) : null}
      </ul>
    </figure>
  );
}
