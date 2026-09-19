"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Activity,
  ArrowDownRight,
  ArrowUpRight,
  HeartPulse,
  Minus,
  Moon,
  Scale,
  Sparkles,
  Utensils,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { DepthCard } from "@/components/ui/depth-card";
import { cn } from "@/lib/utils";
import {
  getHealthChanges,
  type HealthChangesResult,
  type MetricHealthChange,
  type TrendDirection,
} from "@/services/what-changed-service";

type WhatChangedCardProps = {
  patientId: string;
};

const metricIcons: Record<string, typeof Activity> = {
  daily_steps: Activity,
  sleep_duration: Moon,
  systolic_bp: HeartPulse,
  body_weight: Scale,
  food_consistency: Utensils,
};

const dirConfig: Record<
  TrendDirection,
  { badgeTone: "green" | "blue" | "amber"; icon: typeof ArrowUpRight; color: string; border: string; bg: string }
> = {
  up: {
    badgeTone: "green",
    icon: ArrowUpRight,
    color: "text-emerald-700",
    border: "border-emerald-200",
    bg: "bg-emerald-50/50",
  },
  stable: {
    badgeTone: "blue",
    icon: Minus,
    color: "text-sky-700",
    border: "border-sky-200",
    bg: "bg-sky-50/50",
  },
  down: {
    badgeTone: "amber",
    icon: ArrowDownRight,
    color: "text-amber-700",
    border: "border-amber-200",
    bg: "bg-amber-50/50",
  },
};

export function WhatChangedCard({ patientId }: WhatChangedCardProps) {
  const [data, setData] = useState<HealthChangesResult | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    getHealthChanges(patientId, "7d")
      .then((res) => {
        if (active) setData(res);
      })
      .catch((err) => console.error("WhatChanged error:", err))
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [patientId]);

  if (loading) {
    return (
      <DepthCard depth={2} className="p-5 animate-pulse">
        <div className="h-5 w-48 rounded bg-surface-sunken" />
        <div className="mt-2 h-3.5 w-64 rounded bg-surface-sunken" />
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <div className="h-20 rounded-card bg-surface-sunken" />
          <div className="h-20 rounded-card bg-surface-sunken" />
          <div className="h-20 rounded-card bg-surface-sunken" />
        </div>
      </DepthCard>
    );
  }

  if (!data || !data.dataSufficiency.isSufficient || data.metrics.length === 0) return null;

  // Maximum 3 important changes (§26)
  const topChanges = data.rankedKeyChanges.length > 0
    ? data.rankedKeyChanges.slice(0, 3)
    : data.metrics.filter((m) => m.isSufficient).slice(0, 3);

  return (
    <DepthCard depth={2} surface="gradient" className="p-4 sm:p-5 border-line shadow-e2">
      {/* HEADER */}
      <div className="flex items-center justify-between gap-3 pb-3 border-b border-line">
        <div className="flex items-center gap-2.5">
          <div className="h-8 w-8 rounded-control bg-purple-100 border border-purple-200 text-purple-700 flex items-center justify-center shrink-0 shadow-2xs">
            <Sparkles className="h-4 w-4 stroke-[2.2]" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm sm:text-base font-bold text-ink tracking-tight">
                पिछले 7 दिनों में क्या बदला?
              </h3>
              <Badge variant="blue" className="text-2xs font-semibold">
                What Changed
              </Badge>
            </div>
            <p className="text-xs font-semibold text-ink-subtle">
              हालिया दौर बनाम संदर्भ दौर (Personal Comparison)
            </p>
          </div>
        </div>

        <Link
          href="/insights/changes"
          className="text-xs font-bold text-purple-700 hover:text-purple-950 flex items-center gap-1 shrink-0"
        >
          <span>विस्तृत देखें →</span>
        </Link>
      </div>

      {/* TOP 3 HIGHLIGHTED CHANGES (§26) */}
      <div className="mt-3 grid gap-2.5 sm:grid-cols-3">
        {topChanges.map((c: MetricHealthChange) => {
          const cfg = dirConfig[c.direction] || dirConfig.stable;
          const Icon = metricIcons[c.metric] || Activity;
          const DirIcon = cfg.icon;

          return (
            <div
              key={c.metric}
              className={cn(
                "rounded-card border-2 p-3 transition-all",
                cfg.border,
                cfg.bg
              )}
            >
              <div className="flex items-center justify-between mb-1.5">
                <div className="flex items-center gap-1.5">
                  <div className="h-6 w-6 rounded-lg bg-surface border border-line flex items-center justify-center shrink-0 shadow-2xs">
                    <Icon className="h-3.5 w-3.5 text-ink-muted" />
                  </div>
                  <span className="text-xs font-bold text-ink truncate">
                    {c.metricHi}
                  </span>
                </div>
                <Badge variant={cfg.badgeTone} className="text-2xs font-bold px-1.5 py-0">
                  <DirIcon className="h-2.5 w-2.5 inline mr-0.5" />
                  {c.direction === "up" ? "वृद्धि" : c.direction === "down" ? "कमी" : "स्थिर"}
                </Badge>
              </div>

              <div className="text-xs font-semibold text-ink-muted">
                <span>{c.recentValue.toLocaleString()} {c.unit}</span>
                <span className="text-2xs text-ink-subtle font-semibold ml-1">
                  (पूर्व: {c.referenceValue.toLocaleString()})
                </span>
              </div>

              {c.personalPatternRange && (
                <p className="text-2xs text-ink-subtle font-medium mt-0.5">
                  सामान्य: {c.personalPatternRange}
                </p>
              )}
            </div>
          );
        })}
      </div>

      {/* FOOTER ACTION */}
      <div className="mt-3 pt-2.5 border-t border-line flex items-center justify-between text-xs font-semibold text-ink-subtle">
        <span>* सांख्यिकीय मध्यमान पर आधारित तुलना</span>
        <Link
          href="/insights/changes"
          className="text-purple-700 hover:text-purple-950 font-bold"
        >
          View all changes (सभी विश्लेषण) →
        </Link>
      </div>
    </DepthCard>
  );
}
