"use client";

import { useState } from "react";
import { BedDouble, CheckCircle2, Clock, Moon, Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/page";
import { AddSleepDialog } from "@/components/forms/add-sleep-dialog";
import { fmtDateStrWeekday } from "@/components/health/format";
import { SmallNote } from "@/components/health/panel-parts";
import { SLEEP_SHORT_HOURS, mean } from "@/lib/health-rules";
import type { SleepLogEntry } from "@/services/patient-service";

type SleepPanelProps = {
  patientId: string;
  /** Newest first. */
  logs: SleepLogEntry[];
  /** The patient's own goal from settings. */
  targetHours: number;
  /** False for viewers: the panel is read-only. */
  canWrite: boolean;
  onSuccess?: () => void;
};

export function SleepPanel({ patientId, logs, targetHours, canWrite, onSuccess }: SleepPanelProps) {
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  const total = logs.length;
  const avg = total > 0 ? Number(mean(logs.map((l) => l.sleep_hours))!.toFixed(1)) : null;
  const metNights = logs.filter((l) => l.sleep_hours >= targetHours).length;
  const metPct = total > 0 ? Math.round((metNights / total) * 100) : null;
  const latest = logs[0] ?? null;

  return (
    <>
      <Card className="overflow-hidden">
        <CardHeader>
          <div className="flex min-w-0 items-center gap-3">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-control bg-sleep-soft text-sleep">
              <Moon aria-hidden className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <CardTitle>Sleep</CardTitle>
                <Badge variant="neutral" lang="hi">
                  नींद
                </Badge>
              </div>
              <CardDescription>
                लक्ष्य: रोज़ {targetHours} घंटे या ज़्यादा · Goal from settings
              </CardDescription>
            </div>
          </div>
          {canWrite ? (
            <Button variant="primary" onClick={() => setIsDialogOpen(true)}>
              <Plus aria-hidden className="h-4 w-4" />
              नींद दर्ज करें (Log sleep)
            </Button>
          ) : null}
        </CardHeader>

        <div className="space-y-5">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="rounded-card border border-sleep-line bg-sleep-soft p-4">
              <div className="flex items-center justify-between text-ink-muted">
                <span className="text-xs font-semibold">औसत नींद (Average)</span>
                <Clock aria-hidden className="h-4 w-4 text-sleep" />
              </div>
              <p className="tabular mt-2 text-3xl font-semibold text-ink">
                {avg !== null ? avg : "—"}
                {avg !== null ? <span className="ml-1.5 text-sm font-medium text-ink-muted">घंटे / रात</span> : null}
              </p>
              <p className="mt-1 text-xs text-ink-muted">
                {total > 0 ? `पिछली ${total} रातों का औसत` : "अभी कोई रिकॉर्ड नहीं"}
              </p>
            </div>

            <div className="rounded-card border border-line bg-surface-sunken p-4">
              <div className="flex items-center justify-between text-ink-muted">
                <span className="text-xs font-semibold">लक्ष्य पूरा (Goal met)</span>
                <CheckCircle2 aria-hidden className="h-4 w-4 text-sleep" />
              </div>
              <p className="tabular mt-2 text-3xl font-semibold text-ink">{metPct !== null ? `${metPct}%` : "—"}</p>
              <p className="mt-1 text-xs text-ink-muted">
                {total > 0 ? `${total} में से ${metNights} रातें ${targetHours}+ घंटे` : "अभी कोई रिकॉर्ड नहीं"}
              </p>
            </div>

            <div className="rounded-card border border-line bg-surface-sunken p-4">
              <div className="flex items-center justify-between text-ink-muted">
                <span className="text-xs font-semibold">ताज़ा रिकॉर्ड (Latest)</span>
                <BedDouble aria-hidden className="h-4 w-4 text-sleep" />
              </div>
              <p className="tabular mt-2 text-3xl font-semibold text-ink">{latest ? `${latest.sleep_hours} h` : "—"}</p>
              <p className="mt-1 truncate text-xs text-ink-muted">
                {latest ? fmtDateStrWeekday(latest.date) : "अभी कोई रिकॉर्ड नहीं"}
              </p>
            </div>
          </div>

          {total > 0 && total < 5 ? (
            <SmallNote>सिर्फ़ {total} रातों का रिकॉर्ड है, इसलिए औसत और प्रतिशत मोटा अंदाज़ा है। (Small sample.)</SmallNote>
          ) : null}

          <div>
            <div className="mb-2 flex items-center justify-between gap-2">
              <h3 className="text-sm font-semibold text-ink">नींद का इतिहास · Sleep history</h3>
              <span className="text-xs text-ink-subtle">{total} रातें</span>
            </div>

            {total === 0 ? (
              <EmptyState
                icon={Moon}
                title="अभी कोई नींद का रिकॉर्ड नहीं"
                description="No sleep recorded yet."
                action={
                  canWrite ? (
                    <Button variant="primary" onClick={() => setIsDialogOpen(true)}>
                      <Plus aria-hidden className="h-4 w-4" />
                      पहली रात दर्ज करें
                    </Button>
                  ) : undefined
                }
              />
            ) : (
              <ul className="divide-y divide-line overflow-hidden rounded-card border border-line bg-surface">
                {logs.map((log) => {
                  const met = log.sleep_hours >= targetHours;
                  const short = log.sleep_hours < SLEEP_SHORT_HOURS;
                  return (
                    <li key={log.id} className="flex items-center gap-3 p-3.5">
                      <div
                        className={`flex h-11 w-11 shrink-0 flex-col items-center justify-center rounded-control border ${
                          met
                            ? "border-sleep-line bg-sleep-soft text-sleep"
                            : short
                              ? "border-attention-line bg-attention-soft text-attention"
                              : "border-line bg-surface-sunken text-ink-muted"
                        }`}
                      >
                        <span className="tabular text-base font-semibold leading-none">{log.sleep_hours}</span>
                        <span className="text-2xs">घंटे</span>
                      </div>
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-semibold text-ink">{fmtDateStrWeekday(log.date)}</span>
                          {met ? (
                            <Badge variant="positive">लक्ष्य पूरा</Badge>
                          ) : short ? (
                            <Badge variant="attention">कम नींद ({SLEEP_SHORT_HOURS} घंटे से कम)</Badge>
                          ) : null}
                        </div>
                        {(log.bedtime && log.wake_time) || log.notes ? (
                          <p className="mt-0.5 text-xs text-ink-subtle">
                            {log.bedtime && log.wake_time ? `${log.bedtime} से ${log.wake_time}` : ""}
                            {log.bedtime && log.wake_time && log.notes ? " · " : ""}
                            {log.notes ?? ""}
                          </p>
                        ) : null}
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
        <AddSleepDialog
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
