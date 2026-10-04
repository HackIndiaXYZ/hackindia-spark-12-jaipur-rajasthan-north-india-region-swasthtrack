"use client";

import { useState } from "react";
import {
  Activity,
  CheckCircle2,
  Sparkles,
  ThumbsDown,
  ThumbsUp,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { submitInsightFeedback } from "@/services/health-ml-service";

type PersonalHealthPatternCardProps = {
  patientId: string;
  bullets: { en: string; hi: string }[];
  multiFactorObservations?: {
    id: string;
    factors: string[];
    observationHi: string;
  }[];
};

export function PersonalHealthPatternCard({
  patientId,
  bullets,
  multiFactorObservations,
}: PersonalHealthPatternCardProps) {
  const [feedbackSent, setFeedbackSent] = useState<Record<string, boolean>>({});

  function handleFeedback(insightId: string, isHelpful: boolean) {
    submitInsightFeedback(insightId, patientId, isHelpful);
    setFeedbackSent((prev) => ({ ...prev, [insightId]: true }));
  }

  if (bullets.length === 0 && (!multiFactorObservations || multiFactorObservations.length === 0)) {
    return null;
  }

  return (
    <Card className="border-brand-line bg-brand-softer p-5">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="flex h-6 w-6 items-center justify-center rounded-control bg-brand text-ink-inverse shadow-xs">
            <Sparkles className="h-3.5 w-3.5" />
          </span>
          <div>
            <h3 className="font-semibold text-ink text-sm sm:text-base">
              Personal Health Pattern · आपका हाल का पैटर्न
            </h3>
            <p className="text-xs text-ink-muted font-medium">
              Data-driven observational summary of recent logs (30-day baseline)
            </p>
          </div>
        </div>
        <Badge variant="green">Observational</Badge>
      </div>

      {/* Pattern Observations */}
      <div className="mt-4 space-y-2 text-xs">
        {bullets.map((b, idx) => {
          const insightKey = `bullet-${idx}`;
          const isSubmitted = feedbackSent[insightKey];

          return (
            <div
              key={idx}
              className="flex items-start justify-between gap-3 rounded-card border border-brand-line bg-surface p-3"
            >
              <div className="flex items-start gap-2.5">
                <span aria-hidden className="mt-2 h-1.5 w-1.5 rounded-full bg-brand shrink-0" />
                <p className="text-ink font-medium leading-relaxed">
                  {b.hi}
                </p>
              </div>

              {/* Feedback */}
              <div className="-my-1.5 -mr-1.5 flex shrink-0 items-center">
                {isSubmitted ? (
                  <span lang="hi" className="flex min-h-control items-center gap-1 px-2 text-xs font-semibold text-brand-ink">
                    <CheckCircle2 aria-hidden className="h-3.5 w-3.5" />
                    धन्यवाद
                  </span>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={() => handleFeedback(insightKey, true)}
                      aria-label="उपयोगी थी (Helpful)"
                      className="pressable grid h-11 w-11 cursor-pointer place-items-center rounded-control text-ink-muted transition-colors hover:bg-brand-soft hover:text-brand-ink"
                    >
                      <ThumbsUp aria-hidden className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleFeedback(insightKey, false)}
                      aria-label="सही नहीं लगी (Not helpful)"
                      className="pressable grid h-11 w-11 cursor-pointer place-items-center rounded-control text-ink-muted transition-colors hover:bg-critical-soft hover:text-critical"
                    >
                      <ThumbsDown aria-hidden className="h-4 w-4" />
                    </button>
                  </>
                )}
              </div>
            </div>
          );
        })}

        {/* Multi-Factor Insights */}
        {multiFactorObservations?.map((mf) => (
          <div
            key={mf.id}
            className="flex items-start gap-2.5 rounded-card border border-info-line bg-info-soft p-3 text-info"
          >
            <Activity className="h-4 w-4 text-info shrink-0 mt-0.5" />
            <div>
              <span className="block font-semibold text-xs text-info mb-0.5">
                Multi-Factor Observation ({mf.factors.join(" + ")}):
              </span>
              <p className="text-ink-muted font-medium leading-relaxed text-xs">
                {mf.observationHi}
              </p>
            </div>
          </div>
        ))}
      </div>

      <p className="mt-3 text-xs text-ink-muted italic">
        * यह अवलोकन आपकी हाल की प्रविष्टियों पर आधारित है और किसी चिकित्सीय निदान (Medical Diagnosis) का विकल्प नहीं है।
      </p>
    </Card>
  );
}
