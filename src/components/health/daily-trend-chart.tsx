"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  type TooltipContentProps,
} from "recharts";
import { addDaysIST, daysBetweenIST } from "@/lib/health-rules";
import {
  AXIS_TICK,
  CHART_MARGIN,
  CROSSHAIR,
  ChartEmpty,
  LegendKey,
  TooltipCard,
  activeDotFor,
  dayStart,
  dotFor,
  niceScale,
  timeAxis,
} from "@/components/health/chart-utils";
import { fmtDateStr, fmtDateStrWeekday } from "@/components/health/format";

/** One recorded day (sleep night, step day). */
export type DailyRow = {
  /** IST calendar date, "YYYY-MM-DD". */
  date: string;
  value: number;
  /** A second line for the tooltip, already formatted ("22:30 से 06:00", "3.2 km · 40 मिनट"). */
  detail?: string;
};

type DailyTrendChartProps = {
  rows: DailyRow[];
  /** The patient's goal; a day at or above it is "met". */
  target: number;
  /** Chart colour token, e.g. "var(--color-sleep)". */
  color: string;
  /** "घंटे" / "कदम" */
  unit: string;
  /** Number formatting for the tooltip and the caption. */
  formatValue: (value: number) => string;
  /** Axis tick text (steps read as "6k"). */
  formatTick?: (value: number) => string;
  /** Spoken / printed one-line description of the series. */
  summary: string;
  emptyHindi: string;
  emptyEnglish: string;
  goalMetLabel: string;
  goalMissLabel: string;
  startDate?: string;
  endDate?: string;
};

/** Above this many days a bar per day is too thin to read, so the series is drawn as a line. */
const BAR_MAX_DAYS = 45;

type BarPoint = { date: string; value: number | null; detail?: string };
type LinePoint = { t: number; date: string; value: number; detail?: string };

function DailyTooltip({
  active,
  payload,
  target,
  unit,
  formatValue,
  goalMetLabel,
  goalMissLabel,
}: Partial<TooltipContentProps> &
  Pick<DailyTrendChartProps, "target" | "unit" | "formatValue" | "goalMetLabel" | "goalMissLabel">) {
  const point = active && payload && payload.length > 0 ? (payload[0].payload as BarPoint | LinePoint) : null;
  if (!point || point.value === null) return null;
  const met = point.value >= target;
  return (
    <TooltipCard>
      <p className="text-ink-muted">{fmtDateStrWeekday(point.date)}</p>
      <p className="tabular text-sm font-semibold text-ink">
        {formatValue(point.value)} <span lang="hi" className="text-xs font-normal text-ink-muted">{unit}</span>
      </p>
      {point.detail ? <p className="text-ink-muted">{point.detail}</p> : null}
      <p lang="hi" className={`mt-1 font-semibold ${met ? "text-positive" : "text-ink-muted"}`}>
        {met ? goalMetLabel : goalMissLabel}
      </p>
    </TooltipCard>
  );
}

export function DailyTrendChart({
  rows,
  target,
  color,
  unit,
  formatValue,
  formatTick,
  summary,
  emptyHindi,
  emptyEnglish,
  goalMetLabel,
  goalMissLabel,
  startDate,
  endDate,
}: DailyTrendChartProps) {
  if (rows.length === 0) return <ChartEmpty hindi={emptyHindi} english={emptyEnglish} />;

  const sorted = [...rows].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  const firstDay = startDate ?? sorted[0].date;
  const lastDay = endDate ?? sorted[sorted.length - 1].date;
  const days = Math.max(1, daysBetweenIST(firstDay, lastDay) + 1);
  const yScale = niceScale(0, Math.max(target, ...sorted.map((r) => r.value)) * 1.05);
  const tooltip = (props: Partial<TooltipContentProps>) => (
    <DailyTooltip
      {...props}
      target={target}
      unit={unit}
      formatValue={formatValue}
      goalMetLabel={goalMetLabel}
      goalMissLabel={goalMissLabel}
    />
  );
  const tick = formatTick ?? ((v: number) => String(v));
  const targetLine = (
    <ReferenceLine
      y={target}
      stroke="var(--color-chart-target)"
      strokeDasharray="5 4"
      strokeOpacity={0.75}
    />
  );
  const yAxis = (
    <YAxis
      domain={yScale.domain}
      ticks={yScale.ticks}
      width={38}
      tick={AXIS_TICK}
      tickLine={false}
      axisLine={false}
      tickFormatter={tick}
    />
  );

  let plot: React.ReactNode;
  if (days <= BAR_MAX_DAYS) {
    // One slot per day in the window, so a missed night/day is visible as a gap.
    const byDate = new Map(sorted.map((r) => [r.date, r]));
    const data: BarPoint[] = [];
    for (let i = 0; i < days; i++) {
      const date = addDaysIST(firstDay, i);
      const row = byDate.get(date);
      data.push({ date, value: row ? row.value : null, detail: row?.detail });
    }
    const step = Math.max(1, Math.ceil((days - 1) / 5));
    const ticks: string[] = [];
    for (let i = days - 1; i >= 0; i -= step) ticks.push(data[i].date);
    ticks.reverse();

    plot = (
      <BarChart data={data} margin={CHART_MARGIN} barCategoryGap="22%">
        <CartesianGrid stroke="var(--color-chart-grid)" vertical={false} />
        <XAxis
          dataKey="date"
          ticks={ticks}
          interval={0}
          tickFormatter={(d: string) => fmtDateStr(d)}
          tick={AXIS_TICK}
          tickLine={false}
          axisLine={{ stroke: "var(--color-chart-grid)" }}
        />
        {yAxis}
        <Tooltip content={tooltip} cursor={{ fill: "var(--color-line)", fillOpacity: 0.55 }} wrapperStyle={{ zIndex: 20, outline: "none" }} />
        {targetLine}
        <Bar dataKey="value" maxBarSize={24} radius={[4, 4, 0, 0]} isAnimationActive={false}>
          {data.map((p) => (
            <Cell key={p.date} fill={color} fillOpacity={p.value !== null && p.value >= target ? 1 : 0.45} />
          ))}
        </Bar>
      </BarChart>
    );
  } else {
    const data: LinePoint[] = sorted.map((r) => ({
      t: dayStart(r.date) + 43_200_000,
      date: r.date,
      value: r.value,
      detail: r.detail,
    }));
    const axis = timeAxis(firstDay, lastDay);
    plot = (
      <LineChart data={data} margin={CHART_MARGIN}>
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
        {yAxis}
        <Tooltip content={tooltip} cursor={CROSSHAIR} wrapperStyle={{ zIndex: 20, outline: "none" }} />
        {targetLine}
        <Line
          type="monotone"
          dataKey="value"
          stroke={color}
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          dot={dotFor(color, data.length)}
          activeDot={activeDotFor(color)}
          isAnimationActive={false}
        />
      </LineChart>
    );
  }

  return (
    <figure className="min-w-0">
      <figcaption className="mb-2 text-xs text-ink-muted">{summary}</figcaption>
      <div className="h-64 w-full min-w-0 sm:h-72">
        <ResponsiveContainer width="100%" height="100%">
          {plot as React.ReactElement}
        </ResponsiveContainer>
      </div>
      <ul className="mt-2 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-xs font-medium text-ink-muted">
        {days <= BAR_MAX_DAYS ? (
          <>
            <LegendKey kind="bar" color={color}>
              {goalMetLabel}
            </LegendKey>
            <LegendKey kind="bar" color={color} opacity={0.45}>
              {goalMissLabel}
            </LegendKey>
          </>
        ) : (
          <LegendKey kind="line" color={color}>
            <span lang="hi">{unit}</span>
          </LegendKey>
        )}
        <LegendKey kind="dash" color="var(--color-chart-target)">
          <span lang="hi">लक्ष्य</span> {formatValue(target)}
        </LegendKey>
      </ul>
    </figure>
  );
}
