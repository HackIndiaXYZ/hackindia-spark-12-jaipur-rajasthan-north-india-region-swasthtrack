"use client";

import dynamic from "next/dynamic";

/**
 * Recharts is heavy and draws only in the browser, so every chart is loaded on
 * demand behind a same-size skeleton (no layout shift when it arrives).
 */
function chartFallback(height: number) {
  return function ChartFallback() {
    return <div aria-hidden className="skeleton w-full rounded-card" style={{ height }} />;
  };
}

export const TrendChart = dynamic(() => import("@/components/reports/trend-chart").then((m) => m.TrendChart), {
  ssr: false,
  loading: chartFallback(176),
});

export const WeeklyScoreChart = dynamic(() => import("@/components/reports/weekly-score-chart").then((m) => m.WeeklyScoreChart), {
  ssr: false,
  loading: chartFallback(224),
});
