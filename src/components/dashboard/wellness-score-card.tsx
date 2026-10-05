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
    <div className="flex min-w-0 items-center gap-2.5">
      <span
        aria-hidden
        className="grid h-8 w-8 shrink-0 place-items-center rounded-control border border-gold-line grad-gold-button text-gold-ink shadow-gold-button"
      >
        <Sparkles className="h-4 w-4" />
      </span>
      <h2 className="flex min-w-0 flex-wrap items-baseline gap-x-2 text-base font-semibold leading-tight text-ink">
        <span lang="hi">स्कोर किससे बना</span>
        <span className="text-xs font-medium text-ink-muted">Score breakdown</span>
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
      <Card id="score-breakdown" aria-busy="true" aria-label="स्कोर की गणना हो रही है" className="scroll-mt-20">
        <div className="flex items-center justify-between">
          <div className="skeleton h-5 w-48" />
          <div className="skeleton h-6 w-20" />
        </div>
        <div className="mt-4 grid grid-cols-2 gap-2.5">
          {COMPONENTS.map((c) => (
            <div key={c.key} className="skeleton h-20" />
          ))}
        </div>
      </Card>
    );
  }

  if (wellness.status === "error") {
    return (
      <Card id="score-breakdown" className="scroll-mt-20">
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
      <Card id="score-breakdown" className="scroll-mt-20">
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
    <Card id="score-breakdown" className="scroll-mt-20" aria-label="Wellness score breakdown — स्कोर किससे बना">
      <div className="flex items-start justify-between gap-3">
        <CardTitleRow />
        {/* The hero ring already shows the score; this is the number the breakdown adds up to. */}
        <div className="shrink-0 text-right">
          <p className="tabular text-2xl font-semibold leading-none text-ink">
            {r.totalScore}
            <span className="text-sm font-medium text-ink-muted">/{r.maxScore}</span>
          </p>
          <Badge variant={categoryInfo.badgeTone} className="mt-1.5">
            {r.category}
          </Badge>
        </div>
      </div>
      <p lang="hi" className="mt-2 text-xs text-ink-muted">
        {DISCLAIMER}
      </p>

      <div className="mt-3 grid grid-cols-2 gap-2">
        <Button
          variant="secondary"
          onClick={() => setShowExplanation((v) => !v)}
          aria-expanded={showExplanation}
          className="px-2.5"
        >
          <Info aria-hidden className="h-4 w-4 shrink-0 text-brand-ink" />
          <span lang="hi">आज यह स्कोर क्यों?</span>
          {showExplanation ? (
            <ChevronUp aria-hidden className="h-4 w-4 shrink-0 text-ink-muted" />
          ) : (
            <ChevronDown aria-hidden className="h-4 w-4 shrink-0 text-ink-muted" />
          )}
        </Button>
        <Button
          variant={showCaregiverView ? "primary" : "secondary"}
          onClick={() => setShowCaregiverView((v) => !v)}
          aria-pressed={showCaregiverView}
          className="px-2.5"
        >
          <UserCheck aria-hidden className="h-4 w-4 shrink-0" />
          <span lang="hi">{showCaregiverView ? "सामान्य व्यू" : "परिवार का सारांश"}</span>
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
        <div className="tile mt-3 space-y-2 rounded-card p-4 text-sm">
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
      <div className="@container mt-4">
        <ul className="grid grid-cols-2 gap-2.5 @2xl:grid-cols-3">
          {COMPONENTS.map(({ key, nameHi, icon: Icon, tone }) => {
            const c = r.components[key];
            const scored = c.isScored;
            return (
              <li
                key={key}
                className={cn(
                  "flex flex-col justify-between rounded-card p-3",
                  scored ? "tile" : "border border-line bg-surface-sunken",
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <span lang="hi" className="text-xs font-semibold text-ink-muted">
                    {nameHi}
                  </span>
                  <span
                    aria-hidden
                    className={cn("grid h-6 w-6 shrink-0 place-items-center rounded-field", metricChipClasses[tone])}
                  >
                    <Icon className="h-3.5 w-3.5" />
                  </span>
                </div>
                {scored ? (
                  <>
                    <p className="tabular mt-2 text-lg font-semibold text-ink">
                      {c.score}
                      <span className="text-xs font-medium text-ink-muted">/{c.maxScore}</span>
                    </p>
                    <ProgressBar
                      size="sm"
                      value={c.percent}
                      max={100}
                      ariaLabel={`${nameHi} ${c.percent}%`}
                      className="mt-1.5"
                    />
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
      </div>
    </Card>
  );
}
