"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { Moon, Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/page";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { useToast } from "@/components/ui/toast";
import { EditSleepDialog, SleepEntryForm } from "@/components/forms/add-sleep-dialog";
import { fmtClock, fmtDateStr, fmtDateStrWeekday, fmtNum } from "@/components/health/format";
import {
  ChartSkeleton,
  DateLead,
  HISTORY_PAGE,
  HeroNumber,
  HeroTile,
  HistoryHeading,
  HistoryList,
  HistoryRow,
  LoadMoreButton,
  PanelFrame,
  RowActions,
  SmallNote,
  StatTile,
  TrendShell,
  useHistoryPager,
  useRangeData,
  type ChartRange,
  type PanelTab,
} from "@/components/health/panel-parts";
import { SLEEP_SHORT_HOURS, mean } from "@/lib/health-rules";
import {
  deleteSleepLog,
  getSleepLogs,
  getSleepLogsInRange,
  type SleepLogEntry,
} from "@/services/patient-service";

const DailyTrendChart = dynamic(
  () => import("@/components/health/daily-trend-chart").then((m) => m.DailyTrendChart),
  { ssr: false, loading: () => <ChartSkeleton /> },
);

type SleepPanelProps = {
  patientId: string;
  /** Newest first. */
  logs: SleepLogEntry[];
  /** The patient's own goal from settings. */
  targetHours: number;
  /** False for viewers: the panel is read-only. */
  canWrite: boolean;
  /** False while another tracker is showing. */
  active?: boolean;
  /** The open New / History / Trend tab (kept by the page, so the overview can ask for "form"). */
  tab: PanelTab;
  onTabChange: (tab: PanelTab) => void;
  onSuccess?: () => void;
};

const SLEEP_COLOR = "var(--color-sleep)";

function bedWake(log: SleepLogEntry): string {
  return log.bedtime && log.wake_time ? `${fmtClock(log.bedtime)} → ${fmtClock(log.wake_time)}` : "";
}

/* ---- Trend tab ---------------------------------------------------------------- */

function SleepTrend({
  patientId,
  targetHours,
  range,
  onRangeChange,
}: {
  patientId: string;
  targetHours: number;
  range: ChartRange;
  onRangeChange: (range: ChartRange) => void;
}) {
  const { data, win, error, loading, stale, reload } = useRangeData(
    (start, end) => getSleepLogsInRange(patientId, start, end),
    patientId,
    range,
  );

  const rows = (data ?? []).map((l) => ({
    date: l.date,
    value: Number(l.sleep_hours),
    detail: bedWake(l) || undefined,
  }));
  const hours = rows.map((r) => r.value);
  const met = hours.filter((h) => h >= targetHours).length;
  const short = hours.filter((h) => h < SLEEP_SHORT_HOURS).length;
  const avg = hours.length ? Number(mean(hours)!.toFixed(1)) : null;

  return (
    <TrendShell
      range={range}
      onRangeChange={onRangeChange}
      ariaLabel="Sleep trend range — अवधि चुनें"
      loading={loading}
      stale={stale}
      error={error}
      onRetry={reload}
    >
      {rows.length > 0 && avg !== null ? (
        <>
          <div className="tile rounded-card p-3 sm:p-4">
            <DailyTrendChart
              rows={rows}
              target={targetHours}
              color={SLEEP_COLOR}
              unit="घंटे"
              formatValue={(v) => fmtNum(v, 1)}
              summary={`${rows.length} रातें, ${fmtDateStr(rows[0].date)} से ${fmtDateStr(rows[rows.length - 1].date)}। औसत ${avg} घंटे, ${met} रातें लक्ष्य (${targetHours} घंटे) के पार।`}
              emptyHindi="इस अवधि में कोई नींद दर्ज नहीं"
              emptyEnglish="No sleep recorded in this period."
              goalMetLabel="लक्ष्य पूरा"
              goalMissLabel="लक्ष्य से कम"
              startDate={win.fixed ? win.startDate : undefined}
              endDate={win.endDate}
            />
          </div>

          <div className="space-y-3" aria-live="polite">
            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
              <StatTile label="औसत नींद (Average)" value={avg} unit="घंटे" />
              <StatTile label="कम–ज़्यादा" value={`${fmtNum(Math.min(...hours), 1)}–${fmtNum(Math.max(...hours), 1)}`} unit="घंटे" />
              <StatTile
                label="लक्ष्य पूरा"
                value={`${met}/${rows.length}`}
                unit="रातें"
                tone={met / rows.length >= 0.6 ? "positive" : "neutral"}
                helper={`लक्ष्य ${targetHours}+ घंटे`}
              />
              <StatTile
                label="कम नींद की रातें"
                value={short}
                unit="रातें"
                tone={short > 0 ? "attention" : "positive"}
                helper={`${SLEEP_SHORT_HOURS} घंटे से कम`}
              />
            </div>
            {rows.length < 5 ? (
              <SmallNote>
                इस अवधि में सिर्फ़ {rows.length} रातों का रिकॉर्ड है, इसलिए औसत मोटा अंदाज़ा है। (Small sample.)
              </SmallNote>
            ) : null}
          </div>
        </>
      ) : (
        <EmptyState
          icon={Moon}
          title="इस अवधि में कोई नींद दर्ज नहीं"
          description="No sleep recorded in this period. A longer range may show earlier nights."
        />
      )}
    </TrendShell>
  );
}

/* ---- Panel -------------------------------------------------------------------- */

export function SleepPanel({ patientId, logs, targetHours, canWrite, active = true, tab, onTabChange, onSuccess }: SleepPanelProps) {
  const toast = useToast();
  const confirm = useConfirm();

  const [range, setRange] = useState<ChartRange>("30d");
  const [editing, setEditing] = useState<SleepLogEntry | null>(null);

  const pager = useHistoryPager({
    base: logs,
    pageSize: HISTORY_PAGE,
    fetchRows: (limit) => getSleepLogs(patientId, limit),
  });

  const total = logs.length;
  const avg = total > 0 ? Number(mean(logs.map((l) => Number(l.sleep_hours)))!.toFixed(1)) : null;
  const metNights = logs.filter((l) => Number(l.sleep_hours) >= targetHours).length;
  const metPct = total > 0 ? Math.round((metNights / total) * 100) : null;
  const latest = logs[0] ?? null;
  const latestMet = latest ? Number(latest.sleep_hours) >= targetHours : false;
  const latestShort = latest ? Number(latest.sleep_hours) < SLEEP_SHORT_HOURS : false;

  function changed() {
    pager.refresh();
    onSuccess?.();
  }

  async function handleDelete(log: SleepLogEntry) {
    const ok = await confirm({
      title: "यह नींद का रिकॉर्ड मिटाएँ?",
      message: `${fmtNum(log.sleep_hours, 1)} घंटे · ${fmtDateStrWeekday(log.date)}। यह वापस नहीं आएगा।`,
      tone: "danger",
    });
    if (!ok) return;
    try {
      await deleteSleepLog(log.id);
      toast.success("नींद का रिकॉर्ड मिटा दिया गया", "Sleep record deleted.");
      changed();
    } catch (err) {
      toast.error("मिटाया नहीं जा सका", err instanceof Error ? err.message : undefined);
    }
  }

  return (
    <>
      <PanelFrame
        icon={Moon}
        tone="sleep"
        title="Sleep"
        hindiTitle="नींद"
        subtitle={
          <>
            <span lang="hi">लक्ष्य: रोज़ {targetHours} घंटे या ज़्यादा</span> · Goal from settings
          </>
        }
        hero={
          <div className="space-y-3">
            <HeroTile label="पिछली रात · Last night">
              {latest ? (
                <div className="mt-1 flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
                  <div>
                    <HeroNumber value={fmtNum(latest.sleep_hours, 1)} unit="घंटे" />
                    <p className="mt-2 text-xs text-ink-muted">
                      {fmtDateStrWeekday(latest.date)}
                      {bedWake(latest) ? ` · ${bedWake(latest)}` : ""}
                    </p>
                  </div>
                  {latestMet ? (
                    <Badge variant="positive" lang="hi">
                      लक्ष्य पूरा
                    </Badge>
                  ) : latestShort ? (
                    <Badge variant="attention" lang="hi">
                      कम नींद
                    </Badge>
                  ) : null}
                </div>
              ) : (
                <>
                  <HeroNumber value="—" className="text-ink-subtle" />
                  <p lang="hi" className="mt-2 text-xs text-ink-muted">
                    अभी कोई रिकॉर्ड नहीं
                  </p>
                </>
              )}
            </HeroTile>
            {total > 0 ? (
              <div className="grid grid-cols-2 gap-3">
                <StatTile
                  label="औसत नींद"
                  value={avg}
                  unit="घंटे"
                  helper={total > 0 ? `पिछली ${total} रातों का औसत` : "अभी कोई रिकॉर्ड नहीं"}
                />
                <StatTile
                  label="लक्ष्य पूरा"
                  value={metPct !== null ? `${metPct}%` : null}
                  helper={total > 0 ? `${total} में से ${metNights} रातें ${targetHours}+ घंटे` : "अभी कोई रिकॉर्ड नहीं"}
                />
              </div>
            ) : null}
            {total > 0 && total < 5 ? (
              <SmallNote>सिर्फ़ {total} रातों का रिकॉर्ड है, इसलिए औसत और प्रतिशत मोटा अंदाज़ा है। (Small sample.)</SmallNote>
            ) : null}
          </div>
        }
        tab={tab}
        onTabChange={onTabChange}
        canWrite={canWrite}
        active={active}
        ariaLabel="Sleep panel — नया, इतिहास या ट्रेंड"
        form={
          <div className="tile rounded-card p-4 lg:max-w-xl">
            <SleepEntryForm patientId={patientId} onSuccess={changed} />
          </div>
        }
        history={
          <div className="space-y-3">
            <HistoryHeading title="नींद का इतिहास · Sleep history" count={pager.rows.length} unit="रातें" />
            {pager.rows.length > 0 ? (
              <div className="space-y-4 lg:max-w-3xl">
                <HistoryList label="Sleep history">
                  {pager.rows.map((log) => {
                    const hrs = Number(log.sleep_hours);
                    const met = hrs >= targetHours;
                    const short = hrs < SLEEP_SHORT_HOURS;
                    return (
                      <HistoryRow
                        key={log.id}
                        lead={<DateLead date={log.date} />}
                        actions={
                          canWrite ? (
                            <RowActions
                              what={`${fmtNum(hrs, 1)} घंटे नींद, ${fmtDateStrWeekday(log.date)}`}
                              onEdit={() => setEditing(log)}
                              onDelete={() => void handleDelete(log)}
                            />
                          ) : null
                        }
                      >
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                          <p className="tabular text-base font-semibold text-ink">
                            {fmtNum(hrs, 1)} <span lang="hi" className="text-xs font-normal text-ink-muted">घंटे</span>
                          </p>
                          {met ? (
                            <Badge variant="positive" lang="hi">
                              लक्ष्य पूरा
                            </Badge>
                          ) : short ? (
                            <Badge variant="attention" lang="hi" title={`${SLEEP_SHORT_HOURS} घंटे से कम`}>
                              कम नींद
                            </Badge>
                          ) : null}
                        </div>
                        {bedWake(log) || log.notes ? (
                          <p className="truncate text-xs text-ink-subtle">
                            {bedWake(log)}
                            {bedWake(log) && log.notes ? " · " : ""}
                            {log.notes ?? ""}
                          </p>
                        ) : null}
                      </HistoryRow>
                    );
                  })}
                </HistoryList>
                {pager.hasMore ? (
                  <LoadMoreButton loading={pager.loading} failed={pager.failed} onClick={pager.loadMore} what="रातें" />
                ) : null}
              </div>
            ) : (
              <EmptyState
                icon={Moon}
                title="अभी कोई नींद का रिकॉर्ड नहीं"
                description="No sleep recorded yet."
                action={
                  canWrite ? (
                    <Button variant="primary" onClick={() => onTabChange("form")}>
                      <Plus aria-hidden className="h-4 w-4" />
                      पहली रात दर्ज करें
                    </Button>
                  ) : undefined
                }
              />
            )}
          </div>
        }
        chart={<SleepTrend patientId={patientId} targetHours={targetHours} range={range} onRangeChange={setRange} />}
        footnote="नींद का रिकॉर्ड सिर्फ़ जानकारी के लिए है। लगातार कम नींद या थकान रहे तो डॉक्टर से बात करें।"
      />

      {canWrite && editing ? (
        <EditSleepDialog log={editing} patientId={patientId} onClose={() => setEditing(null)} onSuccess={changed} />
      ) : null}
    </>
  );
}
