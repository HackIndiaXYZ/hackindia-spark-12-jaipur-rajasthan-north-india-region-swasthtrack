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
import { toISTDate, type BPThresholds } from "@/lib/health-rules";
import { classifyReading, statusTextClass } from "@/components/health/bp-chip";
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

const SYS = "var(--color-chart-bp-sys)";
const DIA = "var(--color-chart-bp-dia)";

function BPTooltip({ active, payload, thresholds }: Partial<TooltipContentProps> & { thresholds: BPThresholds }) {
  const point = active && payload && payload.length > 0 ? (payload[0].payload as Point) : null;
  if (!point) return null;
  const { classification, tone } = classifyReading(point.systolic, point.diastolic, thresholds);
  const when = new Date(point.t);
  return (
    <TooltipCard>
      <p className="tabular text-sm font-semibold text-ink">
        {point.systolic}/{point.diastolic} <span className="text-xs font-normal text-ink-muted">mmHg</span>
      </p>
      {point.pulse ? <p className="tabular text-ink-muted">नब्ज़ · Pulse {point.pulse} bpm</p> : null}
      <p className="text-ink-muted">
        <span className="capitalize">{point.type}</span> · {fmtDay(when)}, {fmtTime(when)}
      </p>
      <p lang="hi" className={`mt-1 font-semibold ${statusTextClass[tone]}`}>
        {classification.labelHi}
      </p>
    </TooltipCard>
  );
}

export function BPTrendChart({ logs, thresholds, startDate, endDate }: BPTrendChartProps) {
  if (logs.length === 0) {
    return <ChartEmpty hindi="इस अवधि में कोई रीडिंग नहीं" english="No readings in this period." />;
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
  const axis = timeAxis(firstDay, lastDay);

  const minDia = Math.min(...points.map((p) => p.diastolic));
  const maxSys = Math.max(...points.map((p) => p.systolic));
  const minSys = Math.min(...points.map((p) => p.systolic));
  const yScale = niceScale(Math.min(minDia, thresholds.target_diastolic) - 6, Math.max(maxSys, thresholds.alert_systolic) + 6);

  const avgSys = Math.round(points.reduce((s, p) => s + p.systolic, 0) / points.length);
  const avgDia = Math.round(points.reduce((s, p) => s + p.diastolic, 0) / points.length);
  const summary = `${points.length} रीडिंग, ${fmtDateStr(toISTDate(points[0].t))} से ${fmtDateStr(toISTDate(points[points.length - 1].t))}। औसत ${avgSys}/${avgDia} mmHg, ऊपर का ${minSys}–${maxSys}।`;

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
              minTickGap={8}
            />
            <YAxis
              domain={yScale.domain}
              ticks={yScale.ticks}
              width={34}
              tick={AXIS_TICK}
              tickLine={false}
              axisLine={false}
            />
            <Tooltip
              content={(props) => <BPTooltip {...props} thresholds={thresholds} />}
              cursor={CROSSHAIR}
              wrapperStyle={{ zIndex: 20, outline: "none" }}
            />

            <ReferenceLine
              y={thresholds.target_systolic}
              stroke="var(--color-chart-target)"
              strokeDasharray="5 4"
              strokeOpacity={0.75}
            />
            <ReferenceLine
              y={thresholds.target_diastolic}
              stroke="var(--color-chart-target)"
              strokeDasharray="5 4"
              strokeOpacity={0.75}
            />
            <ReferenceLine
              y={thresholds.alert_systolic}
              stroke="var(--color-critical)"
              strokeDasharray="2 3"
              strokeOpacity={0.75}
            />

            <Line
              type="monotone"
              dataKey="systolic"
              name="Systolic"
              stroke={SYS}
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              dot={dotFor(SYS, points.length)}
              activeDot={activeDotFor(SYS)}
              isAnimationActive={false}
            />
            <Line
              type="monotone"
              dataKey="diastolic"
              name="Diastolic"
              stroke={DIA}
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              dot={dotFor(DIA, points.length)}
              activeDot={activeDotFor(DIA)}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <ul className="mt-2 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-xs font-medium text-ink-muted">
        <LegendKey kind="line" color={SYS}>
          Systolic (ऊपर)
        </LegendKey>
        <LegendKey kind="line" color={DIA}>
          Diastolic (नीचे)
        </LegendKey>
        <LegendKey kind="dash" color="var(--color-chart-target)">
          <span lang="hi">लक्ष्य</span> {thresholds.target_systolic} / {thresholds.target_diastolic}
        </LegendKey>
        <LegendKey kind="dash" color="var(--color-critical)">
          <span lang="hi">अलर्ट</span> {thresholds.alert_systolic}
        </LegendKey>
      </ul>
    </figure>
  );
}
