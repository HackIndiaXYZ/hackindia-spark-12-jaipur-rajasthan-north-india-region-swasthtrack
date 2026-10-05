"use client";

import type { ReactNode } from "react";
import { Footprints, HeartPulse, Moon, Scale, Sparkles, Utensils } from "lucide-react";
import { fmtDateStrWeekday } from "@/components/health/format";
import { cn } from "@/lib/utils";
import { ChartCard, TrendLegend } from "@/components/reports/report-parts";
import { TrendChart } from "@/components/reports/lazy-charts";
import type { TrendRow } from "@/components/reports/trend-chart";
import type { DayTrendPoint, ReportTargets } from "@/services/reports-analytics-service";

export type PeriodChartKey = "score" | "bp" | "weight" | "steps" | "sleep" | "calories";

const nf = new Intl.NumberFormat("en-IN");
const compact = (n: number) => (n >= 1000 ? `${Math.round(n / 100) / 10}k` : String(n));
const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
const nums = (xs: Array<number | null>) => xs.filter((x): x is number => x !== null);

/**
 * The trend charts of a weekly / monthly / doctor report: one chart per vital,
 * one point per IST day, the patient's own goal drawn as a dashed line.
 * `null` days (nothing recorded) are gaps, never zeros.
 */
export function PeriodCharts({
  trend,
  targets,
  include,
  layout = "grid",
  gridClass = "lg:grid-cols-2",
}: {
  trend: DayTrendPoint[];
  targets: ReportTargets;
  include: PeriodChartKey[];
  layout?: "grid" | "stack";
  /** Column rule of the grid layout (the doctor summary uses `sm:` so two charts share an A4 page width). */
  gridClass?: string;
}) {
  const long = trend.length > 10;
  const interval = Math.max(0, Math.ceil(trend.length / 6) - 1);
  const rows = (pick: (d: DayTrendPoint) => Record<string, number | null>): TrendRow[] =>
    trend.map((d) => ({ x: long ? d.shortLabel : d.label, title: fmtDateStrWeekday(d.date), ...pick(d) }));
  const common = { xInterval: long ? interval : 0, titleKey: "title" } as const;
  const has = (k: PeriodChartKey) => include.includes(k);

  const sys = nums(trend.map((d) => d.sys));
  const dia = nums(trend.map((d) => d.dia));
  const weights = nums(trend.map((d) => d.weightKg));
  const steps = nums(trend.map((d) => d.steps));
  const sleep = nums(trend.map((d) => d.sleepHours));
  const kcal = nums(trend.map((d) => d.calories));
  const scores = nums(trend.map((d) => d.score));
  const t = targets.bp;

  const cards: Array<{ key: PeriodChartKey; node: ReactNode; wide?: boolean }> = [];

  if (has("score")) {
    cards.push({
      key: "score",
      wide: true,
      node: (
        <ChartCard icon={Sparkles} tone="brand" title="Tracking score" hindiTitle="दिन-प्रतिदिन स्कोर" description="हर दिन कितना रिकॉर्ड नियमित दर्ज हुआ (0–100)">
          <TrendChart
            data={rows((d) => ({ score: d.score }))}
            series={[{ key: "score", name: "Score", color: "var(--color-spring-3)", type: "area" }]}
            refLines={[{ y: 75 }]}
            yDomain={[0, 100]}
            unit="/100"
            summary={`Daily tracking score: ${scores.length} of ${trend.length} days have a score${scores.length ? `, average ${Math.round(avg(scores) as number)}` : ""}.`}
            {...common}
          />
          <TrendLegend
            items={[
              { label: "Daily score", color: "var(--color-spring-3)" },
              { label: "अच्छा ≥ 75", color: "var(--color-chart-target)", kind: "dashed" },
            ]}
          />
        </ChartCard>
      ),
    });
  }

  if (has("bp")) {
    cards.push({
      key: "bp",
      wide: layout === "stack",
      node: (
        <ChartCard
          icon={HeartPulse}
          tone="bp"
          title="Blood pressure"
          hindiTitle="रक्तचाप"
          description={sys.length ? `हर दिन के माप का औसत · औसत ${Math.round(avg(sys) as number)}/${Math.round(avg(dia) as number)} mmHg` : "इस अवधि में कोई BP दर्ज नहीं"}
        >
          <TrendChart
            data={rows((d) => ({ sys: d.sys, dia: d.dia }))}
            series={[
              { key: "sys", name: "Systolic", color: "var(--color-chart-bp-sys)", type: "line" },
              { key: "dia", name: "Diastolic", color: "var(--color-chart-bp-dia)", type: "line" },
            ]}
            refLines={[{ y: t.target_systolic }, { y: t.target_diastolic }]}
            unit="mmHg"
            summary={`Daily average blood pressure over ${trend.length} days; ${sys.length} days have readings.`}
            {...common}
          />
          <TrendLegend
            items={[
              { label: "Systolic (ऊपर)", color: "var(--color-chart-bp-sys)" },
              { label: "Diastolic (नीचे)", color: "var(--color-chart-bp-dia)" },
              { label: `लक्ष्य (Target) ${t.target_systolic}/${t.target_diastolic}`, color: "var(--color-chart-target)", kind: "dashed" },
            ]}
          />
        </ChartCard>
      ),
    });
  }

  if (has("weight")) {
    cards.push({
      key: "weight",
      node: (
        <ChartCard
          icon={Scale}
          tone="weight"
          title="Weight"
          hindiTitle="वजन"
          description={weights.length ? `${weights.length} तौल · ${weights[0]} → ${weights[weights.length - 1]} kg` : "इस अवधि में कोई वजन दर्ज नहीं"}
        >
          <TrendChart
            data={rows((d) => ({ weight: d.weightKg }))}
            series={[{ key: "weight", name: "Weight", color: "var(--color-weight)", type: "line", dots: true }]}
            unit="kg"
            format={(v) => String(Math.round(v * 10) / 10)}
            summary={`Weight over ${trend.length} days; ${weights.length} weigh-ins.`}
            {...common}
          />
        </ChartCard>
      ),
    });
  }

  if (has("steps")) {
    cards.push({
      key: "steps",
      node: (
        <ChartCard
          icon={Footprints}
          tone="activity"
          title="Steps"
          hindiTitle="कदम"
          description={steps.length ? `रोज़ औसत ${nf.format(Math.round(avg(steps) as number))} · लक्ष्य ${nf.format(targets.stepGoal)}` : "इस अवधि में कदम दर्ज नहीं"}
        >
          <TrendChart
            data={rows((d) => ({ steps: d.steps }))}
            series={[{ key: "steps", name: "Steps", color: "var(--color-activity)", type: "bar" }]}
            refLines={[{ y: targets.stepGoal }]}
            format={(v) => nf.format(Math.round(v))}
            axisFormat={compact}
            summary={`Daily steps over ${trend.length} days; ${steps.length} days recorded.`}
            {...common}
          />
          <TrendLegend
            items={[
              { label: "Steps", color: "var(--color-activity)", kind: "bar" },
              { label: `लक्ष्य (Goal) ${nf.format(targets.stepGoal)}`, color: "var(--color-chart-target)", kind: "dashed" },
            ]}
          />
        </ChartCard>
      ),
    });
  }

  if (has("sleep")) {
    cards.push({
      key: "sleep",
      node: (
        <ChartCard
          icon={Moon}
          tone="sleep"
          title="Sleep"
          hindiTitle="नींद"
          description={sleep.length ? `औसत ${Math.round((avg(sleep) as number) * 10) / 10} घंटे · लक्ष्य ${targets.sleepTargetHours}` : "इस अवधि में नींद दर्ज नहीं"}
        >
          <TrendChart
            data={rows((d) => ({ sleep: d.sleepHours }))}
            series={[{ key: "sleep", name: "Sleep", color: "var(--color-sleep)", type: "bar" }]}
            refLines={[{ y: targets.sleepTargetHours }]}
            format={(v) => String(Math.round(v * 10) / 10)}
            unit="hrs"
            summary={`Hours slept over ${trend.length} days; ${sleep.length} nights recorded.`}
            {...common}
          />
          <TrendLegend
            items={[
              { label: "Sleep (hrs)", color: "var(--color-sleep)", kind: "bar" },
              { label: `लक्ष्य (Target) ${targets.sleepTargetHours} hrs`, color: "var(--color-chart-target)", kind: "dashed" },
            ]}
          />
        </ChartCard>
      ),
    });
  }

  if (has("calories")) {
    cards.push({
      key: "calories",
      node: (
        <ChartCard
          icon={Utensils}
          tone="food"
          title="Calories"
          hindiTitle="कैलोरी"
          description={kcal.length ? `रोज़ औसत ${nf.format(Math.round(avg(kcal) as number))} kcal · लक्ष्य ${nf.format(targets.calorieTarget)}` : "इस अवधि में भोजन दर्ज नहीं"}
        >
          <TrendChart
            data={rows((d) => ({ calories: d.calories }))}
            series={[{ key: "calories", name: "Calories", color: "var(--color-food)", type: "bar" }]}
            refLines={[{ y: targets.calorieTarget }]}
            format={(v) => nf.format(Math.round(v))}
            axisFormat={compact}
            unit="kcal"
            summary={`Calories eaten per day over ${trend.length} days; ${kcal.length} days recorded.`}
            {...common}
          />
          <TrendLegend
            items={[
              { label: "Calories", color: "var(--color-food)", kind: "bar" },
              { label: `लक्ष्य (Target) ${nf.format(targets.calorieTarget)}`, color: "var(--color-chart-target)", kind: "dashed" },
            ]}
          />
        </ChartCard>
      ),
    });
  }

  return (
    <div className={layout === "grid" ? cn("grid gap-5", gridClass) : "space-y-5"}>
      {cards.map((c) => (
        <div key={c.key} className={cn("h-full [&>section]:h-full", c.wide && layout === "grid" && "col-span-full")}>
          {c.node}
        </div>
      ))}
    </div>
  );
}
