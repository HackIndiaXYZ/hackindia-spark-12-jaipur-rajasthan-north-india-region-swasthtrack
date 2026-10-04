"use client";

import { AlertCircle, CheckCircle2, ShieldAlert } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ErrorState } from "@/components/ui/page";
import { loadErrorMessage, useAsyncData } from "@/components/health/use-async-data";
import { getFoodDataQualityReport } from "@/services/patient-service";

/**
 * Food catalogue data-quality metrics. Admin-only: the page mounts this only
 * for `profile.role === "admin"`, so a normal member's browser never requests
 * the report at all.
 */
export function FoodDataQuality() {
  const { data: report, error, loading, reload } = useAsyncData(() => getFoodDataQualityReport(), []);

  const metrics = report
    ? [
        { label: "Total food items", hindi: "कुल खाद्य पदार्थ", value: report.totalFoods },
        { label: "Duplicate names", hindi: "दोहरे नाम", value: report.duplicateNamesCount },
        { label: "Missing calories", hindi: "बिना कैलोरी", value: report.missingCaloriesCount },
        { label: "Calorie variants", hindi: "कैलोरी के प्रकार", value: report.duplicateVariantsCount },
        { label: "Missing portions", hindi: "बिना मात्रा-अनुपात", value: report.missingPortionsCount },
      ]
    : [];

  return (
    <Card>
      <CardHeader>
        <div className="min-w-0">
          <CardTitle className="flex items-center gap-2">
            <ShieldAlert aria-hidden className="h-5 w-5 text-brand" />
            Food database quality
          </CardTitle>
          <CardDescription>Validation metrics for the food catalogue tables (admin only).</CardDescription>
        </div>
        <Badge variant="gold">Admin</Badge>
      </CardHeader>

      {error ? (
        <ErrorState
          title="गुणवत्ता रिपोर्ट लोड नहीं हो पाई"
          englishTitle="The quality report could not be loaded"
          description={loadErrorMessage(error)}
          onRetry={reload}
        />
      ) : loading || !report ? (
        <div aria-busy="true" className="skeleton h-32 rounded-card" />
      ) : (
        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
            {metrics.map((m) => (
              <div key={m.label} className="rounded-card border border-line bg-surface p-3.5 shadow-e1">
                <p className="text-xs font-medium text-ink-muted">{m.label}</p>
                <p className="tabular mt-1 text-2xl font-semibold text-ink">{m.value}</p>
                <p lang="hi" className="mt-0.5 text-2xs text-ink-subtle">
                  {m.hindi}
                </p>
              </div>
            ))}
          </div>

          <div className="grid gap-5 md:grid-cols-2">
            <NameList
              title={`Needs verification / custom (${report.requireVerificationCount})`}
              names={report.details.requireVerification}
              emptyText="All custom entries are verified."
              tone="attention"
            />
            <NameList
              title={`Missing calories (${report.missingCaloriesCount})`}
              names={report.details.missingCalories}
              emptyText="No missing calories found."
              tone="critical"
            />
          </div>
        </div>
      )}
    </Card>
  );
}

function NameList({
  title,
  names,
  emptyText,
  tone,
}: {
  title: string;
  names: string[];
  emptyText: string;
  tone: "attention" | "critical";
}) {
  return (
    <div className="space-y-2">
      <h4 className="flex items-center gap-1.5 text-sm font-semibold text-ink">
        <AlertCircle aria-hidden className={tone === "critical" ? "h-4 w-4 text-critical" : "h-4 w-4 text-attention"} />
        {title}
      </h4>
      {names.length > 0 ? (
        <ul
          tabIndex={0}
          aria-label={title}
          className={
            tone === "critical"
              ? "max-h-48 space-y-1 overflow-y-auto rounded-card border border-critical-line bg-critical-soft p-3 font-mono text-xs text-ink-muted"
              : "max-h-48 space-y-1 overflow-y-auto rounded-card border border-attention-line bg-attention-soft p-3 font-mono text-xs text-ink-muted"
          }
        >
          {names.map((name, idx) => (
            <li key={`${name}-${idx}`}>• {name}</li>
          ))}
        </ul>
      ) : (
        <p className="flex items-center gap-1.5 rounded-card bg-positive-soft p-3 text-xs text-positive">
          <CheckCircle2 aria-hidden className="h-4 w-4" />
          {emptyText}
        </p>
      )}
    </div>
  );
}
