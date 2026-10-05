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
    <Card aria-label="Personal health pattern — आपका हाल का पैटर्न">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-2.5">
          <span
            aria-hidden
            className="grid h-8 w-8 shrink-0 place-items-center rounded-control bg-brand text-ink-inverse shadow-e1"
          >
            <Sparkles className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <h2 className="flex flex-wrap items-baseline gap-x-2 text-base font-semibold leading-tight text-ink">
              <span lang="hi">आपका हाल का पैटर्न</span>
              <span className="text-xs font-medium text-ink-muted">Personal Health Pattern</span>
            </h2>
            <p className="mt-0.5 text-xs text-ink-muted">
              Data-driven observational summary of recent logs (30-day baseline)
            </p>
          </div>
        </div>
        <span className="hidden shrink-0 sm:block">
          <Badge variant="green">Observational</Badge>
        </span>
      </div>

      {/* Pattern Observations */}
      <div className="mt-3.5 space-y-2">
        {bullets.map((b, idx) => {
          const insightKey = `bullet-${idx}`;
          const isSubmitted = feedbackSent[insightKey];

          return (
            <div key={idx} className="tile flex items-start justify-between gap-2 rounded-card py-1 pl-3 pr-1">
              <div className="flex items-start gap-2.5 py-2">
                <span aria-hidden className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-brand" />
                <p lang="hi" className="text-sm font-medium leading-relaxed text-ink">
                  {b.hi}
                </p>
              </div>

              {/* Feedback */}
              <div className="flex shrink-0 items-center">
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
          <div key={mf.id} className="tile flex items-start gap-2.5 rounded-card border-info-line p-3">
            <span
              aria-hidden
              className="grid h-7 w-7 shrink-0 place-items-center rounded-field bg-info-soft text-info ring-1 ring-inset ring-info-line"
            >
              <Activity className="h-3.5 w-3.5" />
            </span>
            <div className="min-w-0">
              <span className="mb-0.5 block text-xs font-semibold text-info">
                Multi-Factor Observation ({mf.factors.join(" + ")}):
              </span>
              <p lang="hi" className="text-sm font-medium leading-relaxed text-ink-muted">
                {mf.observationHi}
              </p>
            </div>
          </div>
        ))}
      </div>

      <p lang="hi" className="mt-3 text-xs italic text-ink-muted">
        * यह अवलोकन आपकी हाल की प्रविष्टियों पर आधारित है और किसी चिकित्सीय निदान (Medical Diagnosis) का विकल्प नहीं है।
      </p>
    </Card>
  );
}
