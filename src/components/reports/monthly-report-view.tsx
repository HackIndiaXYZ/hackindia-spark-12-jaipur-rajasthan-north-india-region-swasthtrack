"use client";

import { useEffect, useState } from "react";
import {
  Activity,
  AlertCircle,
  Calendar,
  CheckCircle2,
  Footprints,
  HeartPulse,
  Moon,
  Pill,
  Scale,
  Utensils,
} from "lucide-react";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { ProgressBar } from "@/components/ui/progress-bar";
import {
  getMonthlyReportData,
  type MonthlyReportSummary,
} from "@/services/reports-analytics-service";

type MonthlyReportViewProps = {
  patientId: string;
};

export function MonthlyReportView({ patientId }: MonthlyReportViewProps) {
  const [monthlyData, setMonthlyData] = useState<MonthlyReportSummary | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    getMonthlyReportData(patientId)
      .then((res) => {
        if (active) setMonthlyData(res);
      })
      .catch((err) => {
        console.error("Error loading monthly report:", err);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [patientId]);

  if (loading) {
    return (
      <div className="space-y-4 animate-pulse">
        <div className="h-28 rounded-card bg-surface-sunken" />
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="h-28 rounded-control bg-surface-sunken" />
          ))}
        </div>
      </div>
    );
  }

  if (!monthlyData) return null;

  const adherenceItems = [
    { label: "Medicine Adherence (दवाइयाँ)", val: monthlyData.medicineAdherencePercent, icon: Pill, color: "emerald" },
    { label: "Food Logging % (भोजन रिकॉर्ड)", val: monthlyData.foodLoggingPercent, icon: Utensils, color: "green" },
    { label: "Activity Consistency % (शारीरिक गतिविधि)", val: monthlyData.activityConsistencyPercent, icon: Footprints, color: "sky" },
    { label: "Sleep Logging % (नींद का रिकॉर्ड)", val: monthlyData.sleepLoggingPercent, icon: Moon, color: "indigo" },
    { label: "BP Logging % (रक्तचाप निगरानी)", val: monthlyData.bpLoggingPercent, icon: HeartPulse, color: "rose" },
    { label: "Weight Logging % (वजन निगरानी)", val: monthlyData.weightLoggingPercent, icon: Scale, color: "amber" },
  ];

  return (
    <div className="space-y-5">
      {/* Header Banner — hero: the one number the report exists to show */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between rounded-panel gold-edge p-5">
        <div>
          <div className="flex items-center gap-2">
            <Calendar className="h-5 w-5 text-brand" />
            <h3 className="font-semibold text-ink text-base">
              Monthly Health & Tracking Report · मासिक स्वास्थ्य रिपोर्ट
            </h3>
          </div>
          <p className="mt-1 text-xs text-ink-subtle">
            Window: <span className="font-semibold text-ink-muted">{monthlyData.monthLabel}</span> · {monthlyData.daysTrackedCount} of 30 days active
          </p>
        </div>

        <div className="text-right">
          <p className="text-2xs font-semibold uppercase tracking-wider text-ink-subtle">Monthly Avg Score</p>
          <p className="grad-text text-3xl font-bold">
            {monthlyData.averageScore}
            <span className="text-xs font-semibold text-ink-subtle">/100</span>
          </p>
        </div>
      </div>

      {/* 6 Adherence Progress Bars */}
      <Card className="p-5">
        <CardHeader className="p-0 pb-4">
          <CardTitle className="text-sm font-semibold text-ink flex items-center gap-2">
            <Activity className="h-4 w-4 text-emerald-600" />
            30-Day Habit Adherence Breakdown (30 दिवसीय निरंतरता)
          </CardTitle>
          <CardDescription className="text-xs">
            माह भर में प्रत्येक घटक की लॉगिंग निरंतरता का प्रतिशत
          </CardDescription>
        </CardHeader>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {adherenceItems.map((item) => {
            const Icon = item.icon;
            return (
              <div key={item.label} className="rounded-card border border-line bg-surface-sunken/70 p-3.5 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-ink-muted flex items-center gap-1.5">
                    <Icon className="h-3.5 w-3.5 text-ink-muted" />
                    {item.label}
                  </span>
                  <span className="text-xs font-bold text-ink">{item.val}%</span>
                </div>
                <ProgressBar
                  label={item.label}
                  max={100}
                  value={item.val}
                />
              </div>
            );
          })}
        </div>
      </Card>

      {/* Monthly Key Metrics */}
      <div className="grid gap-3 grid-cols-2 sm:grid-cols-4">
        <div className="rounded-card border border-line bg-surface p-4 shadow-e1">
          <span className="text-xs font-semibold uppercase tracking-wider text-ink-subtle">Active Days</span>
          <p className="mt-1 text-2xl font-bold text-ink">{monthlyData.daysTrackedCount}/30</p>
          <p className="text-2xs text-ink-subtle mt-0.5">सक्रिय ट्रैकिंग दिन</p>
        </div>

        <div className="rounded-card border border-line bg-surface p-4 shadow-e1">
          <span className="text-xs font-semibold uppercase tracking-wider text-ink-subtle">Total BP Logs</span>
          <p className="mt-1 text-2xl font-bold text-ink">{monthlyData.totalBpReadings}</p>
          <p className="text-2xs text-ink-subtle mt-0.5">रक्तचाप माप</p>
        </div>

        <div className="rounded-card border border-line bg-surface p-4 shadow-e1">
          <span className="text-xs font-semibold uppercase tracking-wider text-ink-subtle">Avg Steps</span>
          <p className="mt-1 text-2xl font-bold text-ink">
            {monthlyData.averageSteps ? monthlyData.averageSteps.toLocaleString() : "N/A"}
          </p>
          <p className="text-2xs text-ink-subtle mt-0.5">मासिक औसत कदम</p>
        </div>

        <div className="rounded-card border border-line bg-surface p-4 shadow-e1">
          <span className="text-xs font-semibold uppercase tracking-wider text-ink-subtle">Weight Trend</span>
          <p className="mt-1 text-2xl font-bold text-ink">
            {monthlyData.weightChangeKg !== null
              ? `${monthlyData.weightChangeKg > 0 ? "+" : ""}${monthlyData.weightChangeKg} kg`
              : "Stable"}
          </p>
          <p className="text-2xs text-ink-subtle mt-0.5">माह में शुद्ध बदलाव</p>
        </div>
      </div>

      {/* Rule-based insights */}
      {monthlyData.personalizedInsights.length > 0 && (
        <Card className="border-positive-line bg-positive-soft/40 p-5">
          <CardHeader className="p-0 pb-3">
            <CardTitle className="text-sm font-semibold text-positive flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-positive" />
              Monthly Observations · मासिक अवलोकन
            </CardTitle>
          </CardHeader>
          <div className="space-y-1.5 text-xs text-positive font-medium">
            {monthlyData.personalizedInsights.map((ins, idx) => (
              <div key={idx} className="flex items-start gap-2">
                <span className="mt-1 h-1.5 w-1.5 rounded-full bg-positive shrink-0" />
                <span>{ins}</span>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Disclaimer */}
      <div className="flex items-center gap-1.5 text-xs text-ink-subtle">
        <AlertCircle className="h-3 w-3 shrink-0" />
        <span>
          यह मासिक विश्लेषण केवल व्यवहारिक आदतों (habit consistency) की समीक्षा है। यह कोई चिकित्सीय परामर्श नहीं है।
        </span>
      </div>
    </div>
  );
}
