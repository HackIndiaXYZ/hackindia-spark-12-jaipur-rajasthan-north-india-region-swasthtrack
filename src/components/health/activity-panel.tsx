"use client";

import { useState } from "react";
import { Clock, Flame, Footprints, Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/page";
import { AddActivityDialog } from "@/components/forms/add-activity-dialog";
import { fmtDateStrWeekday } from "@/components/health/format";
import { SmallNote } from "@/components/health/panel-parts";
import { mean } from "@/lib/health-rules";
import type { ActivityLogEntry } from "@/services/patient-service";

type ActivityPanelProps = {
  patientId: string;
  /** Newest first. */
  logs: ActivityLogEntry[];
  /** The patient's own daily step goal from settings. */
  targetSteps: number;
  /** False for viewers: the panel is read-only. */
  canWrite: boolean;
  onSuccess?: () => void;
};

const nf = new Intl.NumberFormat("en-IN");

export function ActivityPanel({ patientId, logs, targetSteps, canWrite, onSuccess }: ActivityPanelProps) {
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  const total = logs.length;
  const avgSteps = total > 0 ? Math.round(mean(logs.map((l) => l.steps || 0))!) : null;
  const burned = logs.reduce((sum, l) => sum + (l.estimated_calories_burned || 0), 0);
  const hasBurn = logs.some((l) => (l.estimated_calories_burned || 0) > 0);
  const latest = logs[0] ?? null;
  const goalDays = logs.filter((l) => (l.steps || 0) >= targetSteps).length;

  return (
    <>
      <Card className="overflow-hidden">
        <CardHeader>
          <div className="flex min-w-0 items-center gap-3">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-control bg-activity-soft text-activity">
              <Footprints aria-hidden className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <CardTitle>Daily steps</CardTitle>
                <Badge variant="neutral" lang="hi">
                  कदम
                </Badge>
              </div>
              <CardDescription>
                रोज़ का लक्ष्य: {nf.format(targetSteps)} कदम · Goal from settings
              </CardDescription>
            </div>
          </div>
          {canWrite ? (
            <Button variant="primary" onClick={() => setIsDialogOpen(true)}>
              <Plus aria-hidden className="h-4 w-4" />
              कदम दर्ज करें (Log steps)
            </Button>
          ) : null}
        </CardHeader>

        <div className="space-y-5">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="rounded-card border border-activity-line bg-activity-soft p-4">
              <div className="flex items-center justify-between text-ink-muted">
                <span className="text-xs font-semibold">औसत रोज़ के कदम (Average)</span>
                <Footprints aria-hidden className="h-4 w-4 text-activity" />
              </div>
              <p className="tabular mt-2 text-3xl font-semibold text-ink">
                {avgSteps !== null ? nf.format(avgSteps) : "—"}
              </p>
              <p className="mt-1 text-xs text-ink-muted">
                {total > 0 ? `${total} दिनों के रिकॉर्ड से · ${goalDays} दिन लक्ष्य पूरा` : "अभी कोई रिकॉर्ड नहीं"}
              </p>
            </div>

            <div className="rounded-card border border-line bg-surface-sunken p-4">
              <div className="flex items-center justify-between text-ink-muted">
                <span className="text-xs font-semibold">कुल बर्न कैलोरी (Burned)</span>
                <Flame aria-hidden className="h-4 w-4 text-activity" />
              </div>
              <p className="tabular mt-2 text-3xl font-semibold text-ink">
                {hasBurn ? Math.round(burned) : "—"}
                {hasBurn ? <span className="ml-1.5 text-sm font-medium text-ink-muted">kcal</span> : null}
              </p>
              <p className="mt-1 text-xs text-ink-muted">
                {hasBurn ? `पिछले ${total} दिनों का अनुमान` : "कैलोरी का अनुमान दर्ज नहीं"}
              </p>
            </div>

            <div className="rounded-card border border-line bg-surface-sunken p-4">
              <div className="flex items-center justify-between text-ink-muted">
                <span className="text-xs font-semibold">ताज़ा दिन (Latest)</span>
                <Clock aria-hidden className="h-4 w-4 text-activity" />
              </div>
              <p className="tabular mt-2 text-3xl font-semibold text-ink">{latest ? nf.format(latest.steps) : "—"}</p>
              <p className="mt-1 truncate text-xs text-ink-muted">
                {latest
                  ? `${fmtDateStrWeekday(latest.date)}${latest.distance_km ? ` · ${latest.distance_km} km` : ""}`
                  : "अभी कोई रिकॉर्ड नहीं"}
              </p>
            </div>
          </div>

          {total > 0 && total < 5 ? (
            <SmallNote>सिर्फ़ {total} दिनों का रिकॉर्ड है, इसलिए औसत मोटा अंदाज़ा है। (Small sample.)</SmallNote>
          ) : null}

          <div>
            <div className="mb-2 flex items-center justify-between gap-2">
              <h3 className="text-sm font-semibold text-ink">टहलने का इतिहास · Activity history</h3>
              <span className="text-xs text-ink-subtle">{total} दिन</span>
            </div>

            {total === 0 ? (
              <EmptyState
                icon={Footprints}
                title="अभी कोई गतिविधि दर्ज नहीं"
                description="No steps recorded yet."
                action={
                  canWrite ? (
                    <Button variant="primary" onClick={() => setIsDialogOpen(true)}>
                      <Plus aria-hidden className="h-4 w-4" />
                      पहले कदम दर्ज करें
                    </Button>
                  ) : undefined
                }
              />
            ) : (
              <ul className="divide-y divide-line overflow-hidden rounded-card border border-line bg-surface">
                {logs.map((log) => {
                  const met = (log.steps || 0) >= targetSteps;
                  const mins = log.walking_minutes && log.walking_minutes > 0 ? log.walking_minutes : null;
                  return (
                    <li key={log.id} className="flex items-center gap-3 p-3.5">
                      <div
                        className={`flex h-11 min-w-11 shrink-0 flex-col items-center justify-center rounded-control border px-1.5 ${
                          met ? "border-activity-line bg-activity-soft text-activity" : "border-line bg-surface-sunken text-ink-muted"
                        }`}
                      >
                        <span className="tabular text-sm font-semibold leading-none">{nf.format(log.steps)}</span>
                        <span className="text-2xs">कदम</span>
                      </div>
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-semibold text-ink">{fmtDateStrWeekday(log.date)}</span>
                          {met ? <Badge variant="positive">लक्ष्य पूरा</Badge> : null}
                        </div>
                        <p className="mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-ink-subtle">
                          {log.distance_km > 0 ? <span>दूरी {log.distance_km} km</span> : null}
                          {mins ? <span>{mins} मिनट</span> : null}
                          {log.estimated_calories_burned > 0 ? <span>~{log.estimated_calories_burned} kcal (अनुमान)</span> : null}
                        </p>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      </Card>

      {canWrite ? (
        <AddActivityDialog
          isOpen={isDialogOpen}
          onClose={() => setIsDialogOpen(false)}
          patientId={patientId}
          onSuccess={() => {
            setIsDialogOpen(false);
            onSuccess?.();
          }}
        />
      ) : null}
    </>
  );
}
