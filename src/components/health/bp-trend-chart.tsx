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
import { addDaysIST, daysBetweenIST, istInstant, toISTDate, type BPThresholds } from "@/lib/health-rules";
import { classifyReading, statusTextClass } from "@/components/health/bp-chip";
import { fmtDateStr, fmtDay, fmtTime } from "@/components/health/format";
import type { BPLogEntry } from "@/services/patient-service";

type BPTrendChartProps = {
  /** Readings in the window, any order. */
  logs: BPLogEntry[];
  thresholds: BPThresholds;
  /** IST window shown on the x axis (defaults to the span of the data). */
  startDate?: string;
  endDate?: string;
};

type Point = {
  t: number;
  systolic: number;
  diastolic: number;
  pulse: number | null;
  type: string;
};

const AXIS_TICK = { fontSize: 11, fill: "var(--color-chart-axis)" } as const;
const MS_PER_DAY = 86_400_000;

const dayStart = (date: string) => istInstant(date, "00:00").getTime();

function BPTooltip({ active, payload, thresholds }: Partial<TooltipContentProps> & { thresholds: BPThresholds }) {
  const point = active && payload && payload.length > 0 ? (payload[0].payload as Point) : null;
  if (!point) return null;
  const { classification, tone } = classifyReading(point.systolic, point.diastolic, thresholds);
  const when = new Date(point.t);
  return (
    <div className="rounded-field border border-line bg-surface p-3 text-xs shadow-e3">
      <p className="tabular text-sm font-semibold text-ink">
        {point.systolic}/{point.diastolic} <span className="text-xs font-normal text-ink-subtle">mmHg</span>
      </p>
      {point.pulse ? <p className="tabular text-ink-muted">नब्ज़ · Pulse {point.pulse} bpm</p> : null}
      <p className="text-ink-subtle">
        {point.type} · {fmtDay(when)}, {fmtTime(when)}
      </p>
      <p lang="hi" className={`mt-1 font-semibold ${statusTextClass[tone]}`}>
        {classification.labelHi}
      </p>
    </div>
  );
}

export function BPTrendChart({ logs, thresholds, startDate, endDate }: BPTrendChartProps) {
  if (logs.length < 2) {
    return (
      <div className="flex h-48 flex-col items-center justify-center gap-1 rounded-card border border-dashed border-line-strong bg-surface-sunken px-4 text-center">
        <p lang="hi" className="text-sm font-medium text-ink-muted">
          कम से कम 2 रीडिंग चाहिए
        </p>
        <p className="text-xs text-ink-subtle">At least 2 readings are needed to draw a trend.</p>
      </div>
    );
  }

  const points: Point[] = logs
    .map((log) => ({
      t: new Date(log.measured_at).getTime(),
      systolic: log.systolic,
      diastolic: log.diastolic,
      pulse: log.pulse,
      type: log.reading_type || "Recorded",
    }))
    .sort((a, b) => a.t - b.t);

  const firstDay = startDate ?? toISTDate(points[0].t);
  const lastDay = endDate ?? toISTDate(points[points.length - 1].t);
  const span = Math.max(0, daysBetweenIST(firstDay, lastDay));
  const step = Math.max(1, Math.ceil(span / 5));
  const ticks: number[] = [];
  for (let d = 0; d <= span; d += step) ticks.push(dayStart(addDaysIST(firstDay, d)));

  const minDia = Math.min(...points.map((p) => p.diastolic));
  const maxSys = Math.max(...points.map((p) => p.systolic));
  const yMin = Math.floor((Math.min(minDia, thresholds.low_diastolic) - 10) / 10) * 10;
  const yMax = Math.ceil((Math.max(maxSys, thresholds.alert_systolic) + 10) / 10) * 10;

  const avgSys = Math.round(points.reduce((s, p) => s + p.systolic, 0) / points.length);
  const avgDia = Math.round(points.reduce((s, p) => s + p.diastolic, 0) / points.length);
  const summary = `${points.length} रीडिंग, ${fmtDateStr(toISTDate(points[0].t))} से ${fmtDateStr(toISTDate(points[points.length - 1].t))}। औसत ${avgSys}/${avgDia} mmHg, ऊपर का ${Math.min(...points.map((p) => p.systolic))}–${maxSys}।`;

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
              width={34}
              tick={AXIS_TICK}
              tickLine={false}
              axisLine={false}
              allowDecimals={false}
            />
            <Tooltip content={(props) => <BPTooltip {...props} thresholds={thresholds} />} wrapperStyle={{ zIndex: 20, outline: "none" }} />

            <ReferenceLine
              y={thresholds.target_systolic}
              stroke="var(--color-chart-target)"
              strokeDasharray="5 4"
              strokeOpacity={0.7}
              label={{ value: `लक्ष्य ${thresholds.target_systolic}`, position: "insideTopRight", fill: "var(--color-chart-axis)", fontSize: 10 }}
            />
            <ReferenceLine
              y={thresholds.target_diastolic}
              stroke="var(--color-chart-target)"
              strokeDasharray="5 4"
              strokeOpacity={0.7}
              label={{ value: `लक्ष्य ${thresholds.target_diastolic}`, position: "insideBottomRight", fill: "var(--color-chart-axis)", fontSize: 10 }}
            />
            <ReferenceLine
              y={thresholds.alert_systolic}
              stroke="var(--color-critical)"
              strokeDasharray="2 3"
              strokeOpacity={0.7}
              label={{ value: `अलर्ट ${thresholds.alert_systolic}`, position: "insideTopRight", fill: "var(--color-chart-axis)", fontSize: 10 }}
            />

            <Line
              type="monotone"
              dataKey="systolic"
              name="Systolic"
              stroke="var(--color-chart-bp-sys)"
              strokeWidth={2}
              dot={{ r: 3, fill: "var(--color-chart-bp-sys)", stroke: "var(--color-surface)", strokeWidth: 1 }}
              activeDot={{ r: 6 }}
              isAnimationActive={false}
            />
            <Line
              type="monotone"
              dataKey="diastolic"
              name="Diastolic"
              stroke="var(--color-chart-bp-dia)"
              strokeWidth={2}
              dot={{ r: 3, fill: "var(--color-chart-bp-dia)", stroke: "var(--color-surface)", strokeWidth: 1 }}
              activeDot={{ r: 6 }}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <ul className="mt-2 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-xs font-medium text-ink-muted">
        <li className="flex items-center gap-1.5">
          <span aria-hidden className="inline-block h-0.5 w-4 rounded bg-chart-bp-sys" />
          Systolic (ऊपर)
        </li>
        <li className="flex items-center gap-1.5">
          <span aria-hidden className="inline-block h-0.5 w-4 rounded bg-chart-bp-dia" />
          Diastolic (नीचे)
        </li>
        <li className="flex items-center gap-1.5">
          <span aria-hidden className="inline-block w-4 border-t-2 border-dashed border-chart-target" />
          लक्ष्य (Target)
        </li>
        <li className="flex items-center gap-1.5">
          <span aria-hidden className="inline-block w-4 border-t-2 border-dotted border-critical" />
          अलर्ट (Alert)
        </li>
      </ul>
    </figure>
  );
}
