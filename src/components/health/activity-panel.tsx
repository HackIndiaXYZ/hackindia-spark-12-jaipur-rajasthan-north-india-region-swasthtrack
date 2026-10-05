"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { Footprints, Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/page";
import { ProgressBar } from "@/components/ui/progress-bar";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { useToast } from "@/components/ui/toast";
import { ActivityEntryForm, EditActivityDialog } from "@/components/forms/add-activity-dialog";
import { fmtDateStr, fmtDateStrWeekday, fmtNum } from "@/components/health/format";
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
import { mean, todayIST } from "@/lib/health-rules";
import {
  deleteActivityLog,
  getActivityLogs,
  getActivityLogsInRange,
  type ActivityLogEntry,
} from "@/services/patient-service";

const DailyTrendChart = dynamic(
  () => import("@/components/health/daily-trend-chart").then((m) => m.DailyTrendChart),
  { ssr: false, loading: () => <ChartSkeleton /> },
);

type ActivityPanelProps = {
  patientId: string;
  /** Newest first. */
  logs: ActivityLogEntry[];
  /** The patient's own daily step goal from settings. */
  targetSteps: number;
  /** The patient's weight, so a calorie estimate does not fall back to a default one. */
  bodyWeightKg?: number | null;
  /** False for viewers: the panel is read-only. */
  canWrite: boolean;
  /** False while another tracker is showing. */
  active?: boolean;
  /** The open New / History / Trend tab (kept by the page, so the overview can ask for "form"). */
  tab: PanelTab;
  onTabChange: (tab: PanelTab) => void;
  onSuccess?: () => void;
};

const nf = new Intl.NumberFormat("en-IN");
const ACTIVITY_COLOR = "var(--color-activity)";

/** "3.2 km · 40 मिनट · ~150 kcal" for the parts of a day that were recorded. */
function detailLine(log: ActivityLogEntry): string {
  const parts: string[] = [];
  if (Number(log.distance_km) > 0) parts.push(`${fmtNum(log.distance_km, 2)} km`);
  if (log.walking_minutes && log.walking_minutes > 0) parts.push(`${log.walking_minutes} मिनट`);
  if (Number(log.estimated_calories_burned) > 0) parts.push(`~${Math.round(Number(log.estimated_calories_burned))} kcal`);
  return parts.join(" · ");
}

const compactSteps = (v: number) => (v >= 1000 ? `${fmtNum(v / 1000, 1)}k` : String(v));

/* ---- Trend tab ---------------------------------------------------------------- */

function ActivityTrend({
  patientId,
  targetSteps,
  range,
  onRangeChange,
}: {
  patientId: string;
  targetSteps: number;
  range: ChartRange;
  onRangeChange: (range: ChartRange) => void;
}) {
  const { data, win, error, loading, stale, reload } = useRangeData(
    (start, end) => getActivityLogsInRange(patientId, start, end),
    patientId,
    range,
  );

  const rows = (data ?? []).map((l) => ({
    date: l.date,
    value: l.steps || 0,
    detail: detailLine(l) || undefined,
  }));
  const steps = rows.map((r) => r.value);
  const met = steps.filter((s) => s >= targetSteps).length;
  const avg = steps.length ? Math.round(mean(steps)!) : null;

  return (
    <TrendShell
      range={range}
      onRangeChange={onRangeChange}
      ariaLabel="Steps trend range — अवधि चुनें"
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
              target={targetSteps}
              color={ACTIVITY_COLOR}
              unit="कदम"
              formatValue={(v) => nf.format(Math.round(v))}
              formatTick={compactSteps}
              summary={`${rows.length} दिन, ${fmtDateStr(rows[0].date)} से ${fmtDateStr(rows[rows.length - 1].date)}। औसत ${nf.format(avg)} कदम, ${met} दिन लक्ष्य (${nf.format(targetSteps)}) के पार।`}
              emptyHindi="इस अवधि में कोई गतिविधि दर्ज नहीं"
              emptyEnglish="No steps recorded in this period."
              goalMetLabel="लक्ष्य पूरा"
              goalMissLabel="लक्ष्य से कम"
              startDate={win.fixed ? win.startDate : undefined}
              endDate={win.endDate}
            />
          </div>

          <div className="space-y-3" aria-live="polite">
            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
              <StatTile label="औसत रोज़ के कदम" value={nf.format(avg)} unit="कदम" />
              <StatTile label="सबसे ज़्यादा दिन" value={nf.format(Math.max(...steps))} unit="कदम" />
              <StatTile
                label="लक्ष्य पूरा"
                value={`${met}/${rows.length}`}
                unit="दिन"
                tone={met / rows.length >= 0.6 ? "positive" : "neutral"}
                helper={`लक्ष्य ${nf.format(targetSteps)} कदम`}
              />
              <StatTile label="कुल कदम" value={nf.format(steps.reduce((a, b) => a + b, 0))} />
            </div>
            {rows.length < 5 ? (
              <SmallNote>
                इस अवधि में सिर्फ़ {rows.length} दिनों का रिकॉर्ड है, इसलिए औसत मोटा अंदाज़ा है। (Small sample.)
              </SmallNote>
            ) : null}
          </div>
        </>
      ) : (
        <EmptyState
          icon={Footprints}
          title="इस अवधि में कोई गतिविधि दर्ज नहीं"
          description="No steps recorded in this period. A longer range may show earlier days."
        />
      )}
    </TrendShell>
  );
}

/* ---- Panel -------------------------------------------------------------------- */

export function ActivityPanel({
  patientId,
  logs,
  targetSteps,
  bodyWeightKg,
  canWrite,
  active = true,
  tab,
  onTabChange,
  onSuccess,
}: ActivityPanelProps) {
  const toast = useToast();
  const confirm = useConfirm();

  const [range, setRange] = useState<ChartRange>("30d");
  const [editing, setEditing] = useState<ActivityLogEntry | null>(null);

  const pager = useHistoryPager({
    base: logs,
    pageSize: HISTORY_PAGE,
    fetchRows: (limit) => getActivityLogs(patientId, limit),
  });

  const total = logs.length;
  const avgSteps = total > 0 ? Math.round(mean(logs.map((l) => l.steps || 0))!) : null;
  const goalDays = logs.filter((l) => (l.steps || 0) >= targetSteps).length;
  const burned = logs.reduce((sum, l) => sum + Number(l.estimated_calories_burned || 0), 0);
  const hasBurn = logs.some((l) => Number(l.estimated_calories_burned || 0) > 0);
  const latest = logs[0] ?? null;
  const today = todayIST();
  const todayLog = logs.find((l) => l.date === today) ?? null;

  function changed() {
    pager.refresh();
    onSuccess?.();
  }

  async function handleDelete(log: ActivityLogEntry) {
    const ok = await confirm({
      title: "इस दिन के कदम मिटाएँ?",
      message: `${nf.format(log.steps)} कदम · ${fmtDateStrWeekday(log.date)}। यह वापस नहीं आएगा।`,
      tone: "danger",
    });
    if (!ok) return;
    try {
      await deleteActivityLog(log.id);
      toast.success("कदमों का रिकॉर्ड मिटा दिया गया", "Activity record deleted.");
      changed();
    } catch (err) {
      toast.error("मिटाया नहीं जा सका", err instanceof Error ? err.message : undefined);
    }
  }

  return (
    <>
      <PanelFrame
        icon={Footprints}
        tone="activity"
        title="Daily steps"
        hindiTitle="कदम"
        subtitle={
          <>
            <span lang="hi">रोज़ का लक्ष्य: {nf.format(targetSteps)} कदम</span> · Goal from settings
          </>
        }
        hero={
          <div className="space-y-3">
            <HeroTile label={latest ? (latest.date === today ? "आज के कदम · Today" : "ताज़ा दिन · Latest day") : "कदम · Steps"}>
              {latest ? (
                <>
                  <HeroNumber value={nf.format(latest.steps || 0)} unit="कदम" />
                  <p className="mt-2 text-xs text-ink-muted">
                    {fmtDateStrWeekday(latest.date)}
                    {detailLine(latest) ? ` · ${detailLine(latest)}` : ""}
                  </p>
                  <ProgressBar
                    className="mt-3"
                    value={latest.steps || 0}
                    max={targetSteps}
                    label={`लक्ष्य ${nf.format(targetSteps)} कदम`}
                  />
                </>
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
                  label="औसत रोज़ के कदम"
                  value={avgSteps !== null ? nf.format(avgSteps) : null}
                  helper={total > 0 ? `${total} दिनों के रिकॉर्ड से` : "अभी कोई रिकॉर्ड नहीं"}
                />
                <StatTile
                  label="लक्ष्य पूरा"
                  value={total > 0 ? `${goalDays}/${total}` : null}
                  unit="दिन"
                  helper={hasBurn ? `~${nf.format(Math.round(burned))} kcal बर्न (अनुमान)` : "कैलोरी का अनुमान दर्ज नहीं"}
                />
              </div>
            ) : null}
            {total > 0 && total < 5 ? (
              <SmallNote>सिर्फ़ {total} दिनों का रिकॉर्ड है, इसलिए औसत मोटा अंदाज़ा है। (Small sample.)</SmallNote>
            ) : null}
          </div>
        }
        tab={tab}
        onTabChange={onTabChange}
        canWrite={canWrite}
        active={active}
        ariaLabel="Steps panel — नया, इतिहास या ट्रेंड"
        form={
          <div className="space-y-3 lg:max-w-xl">
            {todayLog ? (
              <p lang="hi" className="rounded-field border border-info-line bg-info-soft px-3 py-2 text-xs text-ink-muted">
                आज का दर्ज कुल: {nf.format(todayLog.steps || 0)} कदम। नया कुल लिखकर सेव करने से आज का रिकॉर्ड बदल जाएगा।
              </p>
            ) : null}
            <div className="tile rounded-card p-4">
              <ActivityEntryForm patientId={patientId} bodyWeightKg={bodyWeightKg} onSuccess={changed} />
            </div>
          </div>
        }
        history={
          <div className="space-y-3">
            <HistoryHeading title="टहलने का इतिहास · Activity history" count={pager.rows.length} unit="दिन" />
            {pager.rows.length > 0 ? (
              <div className="space-y-4 lg:max-w-3xl">
                <HistoryList label="Activity history">
                  {pager.rows.map((log) => {
                    const met = (log.steps || 0) >= targetSteps;
                    return (
                      <HistoryRow
                        key={log.id}
                        lead={<DateLead date={log.date} />}
                        actions={
                          canWrite ? (
                            <RowActions
                              what={`${nf.format(log.steps || 0)} कदम, ${fmtDateStrWeekday(log.date)}`}
                              onEdit={() => setEditing(log)}
                              onDelete={() => void handleDelete(log)}
                            />
                          ) : null
                        }
                      >
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                          <p className="tabular text-base font-semibold text-ink">
                            {nf.format(log.steps || 0)} <span lang="hi" className="text-xs font-normal text-ink-muted">कदम</span>
                          </p>
                          {met ? (
                            <Badge variant="positive" lang="hi">
                              लक्ष्य पूरा
                            </Badge>
                          ) : null}
                        </div>
                        {detailLine(log) ? <p className="truncate text-xs text-ink-subtle">{detailLine(log)}</p> : null}
                      </HistoryRow>
                    );
                  })}
                </HistoryList>
                {pager.hasMore ? (
                  <LoadMoreButton loading={pager.loading} failed={pager.failed} onClick={pager.loadMore} what="दिन" />
                ) : null}
              </div>
            ) : (
              <EmptyState
                icon={Footprints}
                title="अभी कोई गतिविधि दर्ज नहीं"
                description="No steps recorded yet."
                action={
                  canWrite ? (
                    <Button variant="primary" onClick={() => onTabChange("form")}>
                      <Plus aria-hidden className="h-4 w-4" />
                      पहले कदम दर्ज करें
                    </Button>
                  ) : undefined
                }
              />
            )}
          </div>
        }
        chart={<ActivityTrend patientId={patientId} targetSteps={targetSteps} range={range} onRangeChange={setRange} />}
        footnote="कैलोरी का आँकड़ा अनुमान है, मापा हुआ नहीं। कदम की गिनती फ़ोन या घड़ी से थोड़ी अलग हो सकती है।"
      />

      {canWrite && editing ? (
        <EditActivityDialog
          log={editing}
          patientId={patientId}
          bodyWeightKg={bodyWeightKg}
          onClose={() => setEditing(null)}
          onSuccess={changed}
        />
      ) : null}
    </>
  );
}
