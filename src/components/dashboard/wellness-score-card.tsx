"use client";

import { useState } from "react";
import {
  Activity,
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  HeartPulse,
  Info,
  Moon,
  Pill,
  Scale,
  Sparkles,
  UserCheck,
  Utensils,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, metricChipClasses, type MetricTone } from "@/components/ui/card";
import { ErrorState } from "@/components/ui/page";
import { ProgressBar } from "@/components/ui/progress-bar";
import type { WellnessView } from "@/components/dashboard/hero-health-card";
import { cn } from "@/lib/utils";
import type { ComponentKey } from "@/lib/analytics/wellness-calc";
import { getScoreCategory } from "@/services/wellness-score-service";

type WellnessScoreCardProps = {
  wellness: WellnessView;
  onRetry?: () => void;
};

const COMPONENTS: Array<{ key: ComponentKey; nameHi: string; icon: LucideIcon; tone: MetricTone }> = [
  { key: "medicine", nameHi: "दवाइयाँ", icon: Pill, tone: "meds" },
  { key: "food", nameHi: "भोजन", icon: Utensils, tone: "food" },
  { key: "activity", nameHi: "गतिविधि", icon: Activity, tone: "activity" },
  { key: "sleep", nameHi: "नींद", icon: Moon, tone: "sleep" },
  { key: "bp", nameHi: "रक्तचाप", icon: HeartPulse, tone: "bp" },
  { key: "weight", nameHi: "वजन", icon: Scale, tone: "weight" },
];

function CardTitleRow() {
  return (
    <div className="flex items-center gap-2">
      <span className="flex h-7 w-7 items-center justify-center rounded-control bg-gold-soft text-gold-ink">
        <Sparkles aria-hidden className="h-4 w-4" />
      </span>
      <h2 className="text-base font-semibold text-ink sm:text-lg">
        Today&apos;s Wellness Score <span lang="hi" className="font-normal text-ink-muted">· दैनिक ट्रैकिंग स्कोर</span>
      </h2>
    </div>
  );
}

const DISCLAIMER =
  "यह स्कोर रोज़ के रिकॉर्ड और अच्छी आदतों की निरंतरता दिखाता है। यह डॉक्टरी जाँच या सलाह का विकल्प नहीं है।";

export function WellnessScoreCard({ wellness, onRetry }: WellnessScoreCardProps) {
  const [showExplanation, setShowExplanation] = useState(false);
  const [showCaregiverView, setShowCaregiverView] = useState(false);

  if (wellness.status === "loading") {
    return (
      <Card aria-busy="true" aria-label="स्कोर की गणना हो रही है">
        <div className="flex items-center justify-between">
          <div className="skeleton h-5 w-48" />
          <div className="skeleton h-6 w-20" />
        </div>
        <div className="mt-4 skeleton h-16 w-full" />
        <div className="mt-4 grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-6">
          {COMPONENTS.map((c) => (
            <div key={c.key} className="skeleton h-20" />
          ))}
        </div>
      </Card>
    );
  }

  if (wellness.status === "error") {
    return (
      <Card>
        <CardTitleRow />
        <ErrorState
          className="mt-3"
          title="आज का स्कोर नहीं बन पाया"
          englishTitle="The wellness score could not be calculated"
          description="आपके रिकॉर्ड सुरक्षित हैं। इंटरनेट जाँचकर दोबारा कोशिश करें।"
          onRetry={onRetry}
        />
      </Card>
    );
  }

  const r = wellness.result;

  if (!r.isSufficient) {
    return (
      <Card>
        <CardTitleRow />
        <div className="mt-3 rounded-card border border-dashed border-line-strong bg-surface-sunken p-4">
          <p lang="hi" className="text-sm font-semibold text-ink">
            अभी स्कोर बनाने लायक डेटा नहीं है
          </p>
          <p lang="hi" className="mt-1 text-sm text-ink-muted">
            {r.insufficientReasonHi ?? "कुछ रिकॉर्ड दर्ज करते ही आज का स्कोर दिखेगा।"}
          </p>
          {r.missingDataItems.length > 0 ? (
            <ul lang="hi" className="mt-2 list-inside list-disc space-y-0.5 text-sm text-ink-muted">
              {r.missingDataItems.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          ) : null}
        </div>
        <p className="mt-3 flex items-start gap-1.5 text-xs text-ink-muted">
          <AlertCircle aria-hidden className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span lang="hi">{DISCLAIMER}</span>
        </p>
      </Card>
    );
  }

  const categoryInfo = getScoreCategory(r.totalScore);

  return (
    <Card>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <CardTitleRow />
          <p lang="hi" className="mt-1 text-xs text-ink-muted">
            {DISCLAIMER}
          </p>
        </div>
        <Button
          size="sm"
          variant={showCaregiverView ? "primary" : "secondary"}
          onClick={() => setShowCaregiverView((v) => !v)}
          aria-pressed={showCaregiverView}
          className="self-start"
        >
          <UserCheck aria-hidden className="h-4 w-4" />
          <span lang="hi">{showCaregiverView ? "सामान्य व्यू" : "परिवार का सारांश"}</span>
        </Button>
      </div>

      {/* Score hero: the one gold moment in this card */}
      <div className="gold-edge mt-4 flex flex-col gap-4 rounded-panel p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-baseline gap-3">
          <div className="flex items-baseline">
            <span className="grad-text tabular text-4xl font-bold tracking-tight sm:text-5xl">{r.totalScore}</span>
            <span className="text-sm font-semibold text-ink-muted sm:text-base">/{r.maxScore}</span>
          </div>
          <div className="space-y-0.5">
            <Badge variant={categoryInfo.badgeTone}>{r.category}</Badge>
            <p lang="hi" className="text-xs font-medium text-ink-muted">
              {r.categoryHi}
            </p>
          </div>
        </div>

        <Button variant="secondary" onClick={() => setShowExplanation((v) => !v)} aria-expanded={showExplanation}>
          <Info aria-hidden className="h-4 w-4 text-brand" />
          <span lang="hi">आज यह स्कोर क्यों?</span>
          {showExplanation ? (
            <ChevronUp aria-hidden className="h-4 w-4 text-ink-muted" />
          ) : (
            <ChevronDown aria-hidden className="h-4 w-4 text-ink-muted" />
          )}
        </Button>
      </div>

      {r.scoreCap ? (
        <p role="status" lang="hi" className="mt-3 rounded-card border border-attention-line bg-attention-soft p-3 text-sm text-attention">
          स्कोर सीमित रखा गया है ({r.scoreCap.cap} तक): {r.scoreCap.reasonHi}
        </p>
      ) : null}

      <div className="mt-3">
        <ProgressBar
          label="आज तक का ज़रूरी डेटा दर्ज हुआ"
          value={r.dataCompleteness}
          max={100}
        />
      </div>

      {r.alerts.length > 0 ? (
        <ul className="mt-3 space-y-2">
          {r.alerts.map((a) => (
            <li
              key={`${a.severity}-${a.messageHi}`}
              lang="hi"
              className={cn(
                "rounded-card border p-3 text-sm",
                a.severity === "URGENT" || a.severity === "IMPORTANT"
                  ? "border-critical-line bg-critical-soft text-critical"
                  : "border-attention-line bg-attention-soft text-attention",
              )}
            >
              {a.messageHi}
            </li>
          ))}
        </ul>
      ) : null}

      {showCaregiverView ? (
        <div className="mt-3 rounded-card border border-positive-line bg-positive-soft p-4">
          <div className="flex items-start gap-2">
            <UserCheck aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-positive" />
            <div className="space-y-1 text-sm">
              <p lang="hi" className="font-semibold text-positive">
                परिवार के लिए सारांश
              </p>
              {r.missingDataItems.length > 0 ? (
                <div>
                  <p lang="hi" className="font-medium text-ink">
                    अभी {r.missingDataItems.length} बातें दर्ज होना बाकी हैं:
                  </p>
                  <ul lang="hi" className="mt-1 list-inside list-disc space-y-0.5 text-ink-muted">
                    {r.missingDataItems.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </div>
              ) : (
                <p lang="hi" className="flex items-center gap-1 font-medium text-positive">
                  <CheckCircle2 aria-hidden className="h-4 w-4" />
                  अब तक के सभी ज़रूरी रिकॉर्ड दर्ज हैं।
                </p>
              )}
            </div>
          </div>
        </div>
      ) : null}

      {showExplanation ? (
        <div className="mt-3 space-y-2 rounded-card border border-line bg-surface-sunken p-4 text-sm">
          <p lang="hi" className="text-xs font-semibold text-ink-muted">
            स्कोर के मुख्य कारण
          </p>
          {r.reasons.positive.map((pos) => (
            <p key={pos} lang="hi" className="flex items-start gap-2 font-medium text-positive">
              <span aria-hidden className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-positive-soft text-xs font-bold">
                +
              </span>
              <span>{pos}</span>
            </p>
          ))}
          {r.reasons.deductions.map((ded) => (
            <p key={ded} lang="hi" className="flex items-start gap-2 font-medium text-critical">
              <span aria-hidden className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-critical-soft text-xs font-bold">
                −
              </span>
              <span>{ded}</span>
            </p>
          ))}
          {r.reasons.positive.length === 0 && r.reasons.deductions.length === 0 ? (
            <p lang="hi" className="text-ink-muted">
              अभी कोई अलग कारण दर्ज नहीं हुआ।
            </p>
          ) : null}
          {r.nutritionContext?.calorieStatusMessage ? (
            <p lang="hi" className="rounded-field border border-line bg-surface p-2 text-xs text-ink-muted">
              <span className="font-semibold text-ink">कैलोरी नोट: </span>
              {r.nutritionContext.calorieStatusMessage}
            </p>
          ) : null}
        </div>
      ) : null}

      {/* Component breakdown */}
      <ul className="mt-4 grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-6">
        {COMPONENTS.map(({ key, nameHi, icon: Icon, tone }) => {
          const c = r.components[key];
          const scored = c.isScored;
          return (
            <li
              key={key}
              className={cn(
                "flex flex-col justify-between rounded-card border p-3",
                scored ? "border-line bg-surface" : "border-line bg-surface-sunken",
              )}
            >
              <div className="flex items-center justify-between gap-2">
                <span lang="hi" className="text-xs font-semibold text-ink-muted">
                  {nameHi}
                </span>
                <span className={cn("grid h-6 w-6 place-items-center rounded-field", metricChipClasses[tone])}>
                  <Icon aria-hidden className="h-3.5 w-3.5" />
                </span>
              </div>
              {scored ? (
                <>
                  <p className="tabular mt-2 text-lg font-bold text-ink">
                    {c.score}
                    <span className="text-xs font-medium text-ink-muted">/{c.maxScore}</span>
                  </p>
                  <div
                    role="progressbar"
                    aria-label={`${nameHi} ${c.percent}%`}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={c.percent}
                    className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-surface-sunken"
                  >
                    <div className="h-full rounded-full bg-brand" style={{ width: `${c.percent}%` }} />
                  </div>
                </>
              ) : (
                <p lang="hi" className="mt-2 text-sm font-semibold text-ink-muted">
                  अभी लागू नहीं
                </p>
              )}
              <p lang="hi" className="mt-2 line-clamp-2 text-2xs text-ink-muted" title={c.detailsHi}>
                {c.detailsHi}
              </p>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
