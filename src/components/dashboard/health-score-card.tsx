import { Activity, Info } from "lucide-react";
import { Card } from "@/components/ui/card";
import { ProgressBar } from "@/components/ui/progress-bar";
import type { DailyScore } from "@/types";

type HealthScoreCardProps = {
  score: DailyScore;
};

export function HealthScoreCard({ score }: HealthScoreCardProps) {
  return (
    <Card tone="premium" className="overflow-hidden shine-sweep p-0">
      <div className="grid gap-6 p-5 sm:grid-cols-[auto_1fr] sm:items-center sm:p-6">
        <div
          className="grid h-36 w-36 place-items-center rounded-full border border-surface bg-surface shadow-e1"
          style={{
            background: `conic-gradient(var(--color-spring-2) ${
              (score.score / score.maxScore) * 360
            }deg, var(--color-surface-sunken) 0deg)`,
          }}
        >
          <div className="grid h-28 w-28 place-items-center rounded-full bg-surface text-center">
            <div>
              <p className="text-4xl font-semibold text-ink">
                {score.score}
              </p>
              <p className="text-sm font-medium text-ink-subtle">
                /{score.maxScore}
              </p>
            </div>
          </div>
        </div>

        <div>
          <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-gold-line bg-gold-soft px-3 py-1 text-sm font-semibold text-gold-ink shadow-e1">
            <Activity aria-hidden className="h-4 w-4" />
            Today&apos;s Health Score
          </div>
          <h2 className="text-2xl font-semibold tracking-normal text-ink">
            {score.label}
          </h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-ink-muted">
            {score.note}
          </p>
          <ProgressBar
            className="mt-5 max-w-xl"
            label="Routine completion"
            max={score.maxScore}
            value={score.score}
          />
          <div className="mt-4 flex items-start gap-2 rounded-field border border-info-line bg-surface/80 p-3 text-sm text-ink-muted">
            <Info aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-info" />
            <span>
              Wellness tracking only. This is not a medical diagnosis,
              prognosis, or treatment recommendation.
            </span>
          </div>
        </div>
      </div>
    </Card>
  );
}
