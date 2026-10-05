"use client";

import { useState } from "react";
import { ChevronDown, Clock, Database, LineChart, ShieldCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { HealthPrediction } from "@/services/health-ml-service";

type HealthForecastCardProps = {
  predictions: HealthPrediction[];
  modelVersion?: string;
  /** Admin-only: opens the engine diagnostics. */
  onOpenDiagnostics?: () => void;
};

const dayFmt = new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short" });

function formatBasis(basedOn?: { from: string; to: string }): string | null {
  if (!basedOn) return null;
  const a = new Date(`${basedOn.from}T12:00:00+05:30`);
  const b = new Date(`${basedOn.to}T12:00:00+05:30`);
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return null;
  return `${dayFmt.format(a)} – ${dayFmt.format(b)}`;
}

export function HealthForecastCard({ predictions, modelVersion, onOpenDiagnostics }: HealthForecastCardProps) {
  // The range and its confidence are the answer; the "why" is one tap away, so three
  // paragraphs of explanation do not push the rest of the page off the screen.
  const [openIds, setOpenIds] = useState<ReadonlySet<string>>(() => new Set());
  const toggle = (id: string) =>
    setOpenIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  if (!predictions || predictions.length === 0) return null;

  return (
    <Card aria-label="Health trend forecast — अगले 7 दिन का अनुमान">
      <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-2">
        <div className="flex min-w-0 items-start gap-2.5">
          <span
            aria-hidden
            className="grid h-8 w-8 shrink-0 place-items-center rounded-control bg-info-soft text-info ring-1 ring-inset ring-info-line"
          >
            <LineChart className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <h2 className="flex flex-wrap items-baseline gap-x-2 text-base font-semibold leading-tight text-ink">
              <span lang="hi">अगले 7 दिन का अनुमान</span>
              <span className="text-xs font-medium text-ink-muted">Health Trend Forecast</span>
            </h2>
            <p lang="hi" className="mt-0.5 text-xs text-ink-muted">
              हाल के रिकॉर्ड जारी रहें तो रीडिंग किस दायरे में रह सकती है (सांख्यिकीय अनुमान)
            </p>
          </div>
        </div>

        {onOpenDiagnostics ? (
          <Button variant="ghost" onClick={onOpenDiagnostics}>
            <Database aria-hidden className="h-3.5 w-3.5" />
            ML Details
          </Button>
        ) : null}
      </div>

      <div className="@container mt-3.5">
        <ul className="grid gap-2.5 @xl:grid-cols-2 @4xl:grid-cols-3">
          {predictions.map((p) => {
            if (!p.isAvailable) {
              return (
                <li key={p.id} className="tile flex flex-col justify-between rounded-card p-3.5 text-xs">
                  <div>
                    <div className="flex items-center justify-between gap-2">
                      <p lang="hi" className="text-sm font-semibold text-ink-muted">
                        {p.metricLabelHi}
                      </p>
                      <Badge variant="neutral" className="shrink-0">
                        <span lang="hi">डेटा कम</span>
                      </Badge>
                    </div>
                    <p lang="hi" className="mt-2.5 text-sm font-semibold text-ink">
                      अनुमान के लिए डेटा अपर्याप्त है
                    </p>
                    <p lang="hi" className="mt-1 leading-relaxed text-ink-muted">
                      {p.unavailableReasonHi || "भरोसेमंद अनुमान के लिए कुछ और रीडिंग दर्ज करें।"}
                    </p>
                  </div>
                  <p className="mt-3 flex items-center gap-1 text-2xs text-ink-muted">
                    <Database aria-hidden className="h-3 w-3" />
                    {p.dataPointsUsed} <span lang="hi">रिकॉर्ड दर्ज</span>
                  </p>
                </li>
              );
            }

            const badgeVariant = p.confidence === "High" ? "green" : p.confidence === "Medium" ? "blue" : "amber";
            const basis = formatBasis(p.basedOn);
            const isOpen = openIds.has(p.id);

            return (
              <li key={p.id} className="tile flex flex-col justify-between rounded-card p-3.5 text-xs">
                <div>
                  <p lang="hi" className="text-sm font-semibold leading-snug text-ink">
                    {p.metricLabelHi}
                  </p>

                  <div className="mt-1.5 flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
                    <p className="tabular text-lg font-bold tracking-tight text-ink">{p.rangeFormatted}</p>
                    <Badge variant={badgeVariant} className="shrink-0">
                      {p.confidence} confidence
                    </Badge>
                  </div>

                  <Button
                    variant="ghost"
                    onClick={() => toggle(p.id)}
                    aria-expanded={isOpen}
                    aria-controls={`forecast-why-${p.id}`}
                    className="-ml-2.5 mt-0.5"
                  >
                    <span lang="hi">{isOpen ? "ब्यौरा छिपाएँ" : "यह अनुमान कैसे बना?"}</span>
                    <ChevronDown aria-hidden className={cn("h-4 w-4 transition-transform", isOpen && "rotate-180")} />
                  </Button>

                  <p
                    id={`forecast-why-${p.id}`}
                    hidden={!isOpen}
                    lang="hi"
                    className="text-xs font-medium leading-relaxed text-ink-muted"
                  >
                    {p.explanationHi}
                  </p>
                </div>

                <div className="mt-3 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-t border-line pt-2 text-2xs text-ink-muted">
                  <span className="flex items-center gap-1">
                    <Database aria-hidden className="h-3 w-3" />
                    {p.dataPointsUsed} <span lang="hi">दिन के रिकॉर्ड</span>
                    {basis ? <span className="tabular"> · {basis}</span> : null}
                  </span>
                  <span className="flex items-center gap-1">
                    <Clock aria-hidden className="h-3 w-3" />
                    <span lang="hi">अगले 7 दिन</span>
                  </span>
                </div>
              </li>
            );
          })}
        </ul>
      </div>

      <div className="mt-3 flex items-start gap-1.5 rounded-card border border-line bg-surface-sunken p-2.5 text-2xs text-ink-muted">
        <ShieldCheck aria-hidden className="mt-0.5 h-3.5 w-3.5 shrink-0 text-positive" />
        <span>
          {modelVersion ? `${modelVersion} · ` : ""}
          <span lang="hi">यह निदान नहीं है, सिर्फ़ रिकॉर्ड के आधार पर अनुमान है।</span> Non-diagnostic statistical estimate.
        </span>
      </div>
    </Card>
  );
}
