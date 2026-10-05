"use client";

import { ArrowDownRight, ArrowUpRight, Minus, type LucideIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, metricChipClasses, type MetricTone } from "@/components/ui/card";
import { fmtDateStr } from "@/components/health/format";
import { TrendChart } from "@/components/reports/lazy-charts";
import { TrendLegend } from "@/components/reports/report-parts";
import type { TrendRow, TrendSeries } from "@/components/reports/trend-chart";
import { cn } from "@/lib/utils";
import type { ChangeSeries, MetricHealthChange, TrendDirection } from "@/services/what-changed-service";

const DIR_ICON: Record<TrendDirection, LucideIcon> = {
  up: ArrowUpRight,
  down: ArrowDownRight,
  stable: Minus,
};

const DIR_WORD: Record<TrendDirection, string> = {
  up: "बढ़ा",
  down: "घटा",
  stable: "स्थिर",
};

const nf = new Intl.NumberFormat("en-IN");
const compact = (n: number) => (n >= 1000 ? `${Math.round(n / 100) / 10}k` : String(n));
const one = (n: number) => String(Math.round(n * 10) / 10);

/** How each metric is drawn: its colour, unit and number format. */
const KIND: Record<
  ChangeSeries["kind"],
  { color: string; unit?: string; format: (n: number) => string; axis?: (n: number) => string; bar: boolean; domain?: [number, number] }
> = {
  steps: { color: "var(--color-activity)", unit: "steps", format: (n) => nf.format(Math.round(n)), axis: compact, bar: true },
  sleep: { color: "var(--color-sleep)", unit: "hrs", format: one, bar: true },
  systolic: { color: "var(--color-chart-bp-sys)", unit: "mmHg", format: (n) => String(Math.round(n)), bar: false },
  weight: { color: "var(--color-weight)", unit: "kg", format: one, bar: false },
  calories: { color: "var(--color-food)", unit: "kcal", format: (n) => nf.format(Math.round(n)), axis: compact, bar: true },
  adherence: { color: "var(--color-meds)", unit: "%", format: (n) => String(Math.round(n)), bar: true, domain: [0, 100] },
};

const CHART_NOTE: Record<ChangeSeries["kind"], string> = {
  steps: "हर दिन के कदम",
  sleep: "हर रात की नींद",
  systolic: "हर दिन के सिस्टोलिक का औसत",
  weight: "तौल वाले दिनों का वजन",
  calories: "हर दिन की कुल कैलोरी (खाली = भोजन दर्ज नहीं)",
  adherence: "हर दिन ली गई खुराकों का %",
};

/** Two windows of one metric, day by day, drawn on top of each other so the shift is visible. */
function ComparisonChart({ series, change }: { series: ChangeSeries; change: MetricHealthChange }) {
  const spec = KIND[series.kind];
  const n = series.recent.length;
  const rows: TrendRow[] = series.recent.map((p, i) => {
    const prev = series.reference[i];
    return {
      x: fmtDateStr(p.date),
      title: `दिन ${i + 1} · ${fmtDateStr(p.date)}`,
      note: prev ? `पिछली अवधि की तुलना: ${fmtDateStr(prev.date)}` : "",
      recent: p.value,
      previous: prev?.value ?? null,
    };
  });
  const asBars = spec.bar && n <= 8;
  const lines: TrendSeries[] = [
    { key: "previous", name: "पिछली अवधि", color: asBars ? spec.color : "var(--color-chart-axis)", type: asBars ? "bar" : "line", dashed: !asBars, muted: true },
    { key: "recent", name: "यह अवधि", color: spec.color, type: asBars ? "bar" : "line", dots: series.kind === "weight" ? true : undefined },
  ];

  return (
    <div>
      <TrendChart
        data={rows}
        series={lines}
        height={168}
        format={spec.format}
        axisFormat={spec.axis}
        unit={spec.unit}
        yDomain={spec.domain}
        xInterval={n > 10 ? Math.max(0, Math.ceil(n / 6) - 1) : 0}
        titleKey="title"
        noteKey="note"
        summary={`${change.metricHi}: ${CHART_NOTE[series.kind]}, यह अवधि बनाम पिछली अवधि।`}
      />
      <TrendLegend
        items={[
          { label: "यह अवधि", color: spec.color, kind: asBars ? "bar" : "line" },
          { label: "पिछली अवधि", color: asBars ? spec.color : "var(--color-chart-axis)", kind: asBars ? "bar" : "dashed", muted: asBars },
        ]}
      />
      <p lang="hi" className="mt-1 text-2xs text-ink-muted">
        {CHART_NOTE[series.kind]} · x-अक्ष पर यह अवधि की तारीख़ें
      </p>
    </div>
  );
}

/**
 * One measure of "What changed": the recent window against the one before it —
 * the two levels, the shift between them, the days behind them, and what the
 * earlier window's normal range was.
 */
export function ChangeCard({
  change: m,
  series,
  icon: Icon,
  tone,
}: {
  change: MetricHealthChange;
  series?: ChangeSeries;
  icon: LucideIcon;
  tone: MetricTone;
}) {
  const comparable = m.isSufficient && m.hasReference;
  const DirIcon = DIR_ICON[m.direction];
  const hasPoints = series ? [...series.recent, ...series.reference].some((p) => p.value !== null) : false;
  const sign = m.difference > 0 ? "+" : "";

  return (
    <Card className="flex h-full flex-col gap-3.5">
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className={cn("grid h-10 w-10 shrink-0 place-items-center rounded-control", metricChipClasses[tone])}>
            <Icon aria-hidden className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <h3 lang="hi" className="text-sm font-semibold leading-snug text-ink sm:text-base">
              {m.metricHi}
            </h3>
            <p lang="hi" className="text-xs text-ink-muted">
              {m.dataPoints} रिकॉर्ड · {m.confidenceLabelHi}
            </p>
          </div>
        </div>

        {comparable ? (
          <Badge variant={m.direction === "stable" ? "neutral" : "info"} className="shrink-0">
            <DirIcon aria-hidden className="h-3 w-3" />
            <span lang="hi">{DIR_WORD[m.direction]}</span>
          </Badge>
        ) : (
          <Badge variant="neutral" className="shrink-0">
            <span lang="hi">{m.isSufficient ? "पिछला रिकॉर्ड नहीं" : "डेटा कम है"}</span>
          </Badge>
        )}
      </div>

      {comparable ? (
        <>
          <div className="tile grid grid-cols-[1fr_auto_1fr] items-center gap-2 rounded-card p-3 text-center">
            <div>
              <p lang="hi" className="text-2xs font-medium text-ink-muted">
                यह अवधि
              </p>
              <p className="tabular text-xl font-semibold leading-tight text-ink sm:text-2xl">{m.recentValue.toLocaleString("en-IN")}</p>
              <p lang="hi" className="text-2xs text-ink-muted">
                {m.unit}
              </p>
            </div>
            <div
              className={cn(
                "tabular flex flex-col items-center rounded-control border px-2.5 py-1 text-xs font-semibold",
                m.direction === "stable" ? "border-line bg-surface-sunken text-ink-muted" : "border-info-line bg-info-soft text-info",
              )}
            >
              <DirIcon aria-hidden className="h-4 w-4" />
              <span>
                {sign}
                {m.difference.toLocaleString("en-IN")}
              </span>
              {/* No percentage against an earlier level of zero: it is undefined, not 0%. */}
              {m.referenceValue !== 0 ? (
                <span className="font-normal">
                  ({m.percentChange > 0 ? "+" : ""}
                  {m.percentChange}%)
                </span>
              ) : null}
            </div>
            <div>
              <p lang="hi" className="text-2xs font-medium text-ink-muted">
                पिछली अवधि
              </p>
              <p className="tabular text-xl font-semibold leading-tight text-ink-muted sm:text-2xl">{m.referenceValue.toLocaleString("en-IN")}</p>
              <p lang="hi" className="text-2xs text-ink-muted">
                {m.unit}
              </p>
            </div>
          </div>
          <p lang="hi" className="text-sm leading-snug text-ink">
            {m.explanationHi}
          </p>
        </>
      ) : (
        <p lang="hi" className="rounded-field border border-line bg-surface-sunken p-3 text-xs text-ink-muted">
          {m.insufficientReasonHi || (m.isSufficient ? "तुलना के लिए पिछली अवधि का रिकॉर्ड नहीं है।" : "इस माप के लिए अभी पर्याप्त डेटा नहीं है।")}
        </p>
      )}

      {series && hasPoints ? <ComparisonChart series={series} change={m} /> : null}

      {comparable && m.personalPatternRange ? (
        <p lang="hi" className="mt-auto border-t border-line pt-2.5 text-xs text-ink-muted">
          पिछली अवधि का सामान्य दायरा: <span className="tabular font-semibold text-ink">{m.personalPatternRange}</span>
        </p>
      ) : null}
    </Card>
  );
}
