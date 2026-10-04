"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  type TooltipContentProps,
} from "recharts";

export type ScoreBar = {
  date: string;
  dayLabel: string;
  /** null when nothing was logged that day: no bar, never a 0. */
  score: number | null;
  category: string;
};

type Props = {
  days: ScoreBar[];
  selectedDate: string | null;
  onSelect: (date: string) => void;
};

const AXIS_TICK = { fontSize: 11, fill: "var(--color-chart-axis)" } as const;

/** Same bands as getScoreCategory, expressed as colour tokens. */
function bandColor(score: number): string {
  if (score >= 90) return "var(--color-positive)";
  if (score >= 75) return "var(--color-info)";
  if (score >= 60) return "var(--color-attention)";
  return "var(--color-critical)";
}

function ScoreTooltip({ active, payload }: Partial<TooltipContentProps>) {
  const bar = active && payload && payload.length > 0 ? (payload[0].payload as ScoreBar) : null;
  if (!bar) return null;
  return (
    <div className="rounded-control border border-line bg-surface p-2.5 text-xs shadow-e3">
      <p className="font-semibold text-ink">{bar.dayLabel}</p>
      {bar.score === null ? (
        <p lang="hi" className="text-ink-subtle">
          कोई रिकॉर्ड नहीं
        </p>
      ) : (
        <>
          <p className="tabular text-sm font-semibold text-ink">{bar.score}/100</p>
          <p className="text-2xs text-ink-subtle">{bar.category}</p>
        </>
      )}
    </div>
  );
}

export function WeeklyScoreChart({ days, selectedDate, onSelect }: Props) {
  return (
    <div className="h-56 w-full min-w-0">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={days} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid stroke="var(--color-chart-grid)" strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="dayLabel" tick={AXIS_TICK} tickLine={false} axisLine={{ stroke: "var(--color-chart-grid)" }} />
          <YAxis domain={[0, 100]} ticks={[0, 25, 50, 75, 100]} width={30} tick={AXIS_TICK} tickLine={false} axisLine={false} />
          <Tooltip content={(props) => <ScoreTooltip {...props} />} cursor={{ fill: "var(--color-surface-sunken)" }} />
          <ReferenceLine y={75} stroke="var(--color-chart-target)" strokeDasharray="4 4" strokeOpacity={0.7} />
          <Bar
            dataKey="score"
            radius={[4, 4, 0, 0]}
            maxBarSize={44}
            cursor="pointer"
            isAnimationActive={false}
            onClick={(_, index) => {
              const day = days[index];
              if (day) onSelect(day.date);
            }}
          >
            {days.map((d) => (
              <Cell
                key={d.date}
                fill={d.score === null ? "var(--color-line)" : bandColor(d.score)}
                stroke={selectedDate === d.date ? "var(--color-ink)" : undefined}
                strokeWidth={selectedDate === d.date ? 2 : 0}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
