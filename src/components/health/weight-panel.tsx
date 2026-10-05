"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { Plus, Scale } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, NumberInput, TextInput } from "@/components/ui/form-field";
import { Modal } from "@/components/ui/modal";
import { EmptyState } from "@/components/ui/page";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { useToast } from "@/components/ui/toast";
import { WeightEntryForm } from "@/components/forms/add-weight-dialog";
import {
  fmtDateStr,
  fmtDateStrYear,
  fmtKg,
  fmtTime,
  istDateAndTime,
  parseDecimalInput,
  relativeDayLabel,
} from "@/components/health/format";
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
import {
  WEIGHT_RAPID_KG_7D,
  WEIGHT_RAPID_PCT_30D,
  addDaysIST,
  calcBMI,
  classifyBMI,
  istInstant,
  mean,
  toISTDate,
  todayIST,
} from "@/lib/health-rules";
import {
  deleteWeight,
  getWeightLogs,
  getWeightLogsInRange,
  updateWeight,
  type WeightLogEntry,
} from "@/services/patient-service";

const WeightTrendChart = dynamic(
  () => import("@/components/health/weight-trend-chart").then((m) => m.WeightTrendChart),
  { ssr: false, loading: () => <ChartSkeleton /> },
);

type WeightPanelProps = {
  patientId: string;
  /** Newest first. */
  logs: WeightLogEntry[];
  targetWeight?: number | null;
  heightCm?: number | null;
  /** False for viewers: the panel is read-only. */
  canWrite: boolean;
  /** False while another tracker is showing. */
  active?: boolean;
  /** The open New / History / Trend tab (kept by the page, so the overview can ask for "form"). */
  tab: PanelTab;
  onTabChange: (tab: PanelTab) => void;
  onSuccess?: () => void;
};

/** Same limits the service enforces, so the message appears before the request. */
function weightError(raw: string): string | null {
  const kg = parseDecimalInput(raw);
  if (Number.isNaN(kg)) return "वजन लिखें (kg में)";
  if (kg < 20 || kg > 350) return "20 से 350 kg के बीच लिखें";
  return null;
}

/** Monday (IST) of the week a date falls in. */
function weekStartOf(dateStr: string): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return addDaysIST(dateStr, -((dow + 6) % 7));
}

/** Weekly averages, newest week first, each compared with the week before it. */
function weeklySummaries(logs: WeightLogEntry[]) {
  const byWeek = new Map<string, number[]>();
  for (const log of logs) {
    const week = weekStartOf(toISTDate(log.measured_at));
    const list = byWeek.get(week);
    if (list) list.push(Number(log.weight_kg));
    else byWeek.set(week, [Number(log.weight_kg)]);
  }
  const weeks = [...byWeek.keys()].sort();
  let prev: number | null = null;
  const out = weeks.map((week) => {
    const values = byWeek.get(week)!;
    const avg = Number(mean(values)!.toFixed(1));
    const change = prev === null ? null : Number((avg - prev).toFixed(1));
    prev = avg;
    return { week, avg, count: values.length, change };
  });
  return out.reverse();
}

/** The weekly list stays short however long the window is. */
const WEEKS_SHOWN = 8;

/* ---- Edit dialog -------------------------------------------------------------- */

function EditWeightModal({
  log,
  onClose,
  onSaved,
}: {
  log: WeightLogEntry;
  onClose: () => void;
  onSaved: () => void;
}) {
  const toast = useToast();
  const initial = istDateAndTime(log.measured_at);
  const [weight, setWeight] = useState(fmtKg(log.weight_kg));
  const [date, setDate] = useState(initial.date);
  const [time, setTime] = useState(initial.time);
  const [notes, setNotes] = useState(log.notes || "");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function save() {
    const problem = weightError(weight);
    setError(problem);
    if (problem) return;
    if (!date || !time) {
      toast.error("तारीख़ और समय भरें", "Date and time are required.");
      return;
    }
    const measuredAt = istInstant(date, time);
    if (Number.isNaN(measuredAt.getTime())) {
      toast.error("तारीख़ या समय सही नहीं है", "Invalid date or time.");
      return;
    }
    if (measuredAt.getTime() > Date.now() + 5 * 60_000) {
      toast.error("यह समय अभी से आगे का है", "Time is in the future.");
      return;
    }
    setSaving(true);
    try {
      await updateWeight(log.id, {
        weight_kg: parseDecimalInput(weight),
        measured_at: measuredAt.toISOString(),
        notes: notes.trim() || null,
      });
      toast.success("वजन अपडेट हो गया", "Weight updated.");
      onSaved();
      onClose();
    } catch (err) {
      toast.error("अपडेट नहीं हो पाया", err instanceof Error ? err.message : undefined);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      isOpen
      onClose={onClose}
      title="वजन बदलें"
      hindiTitle="Edit weight"
      footer={
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="secondary" onClick={onClose}>
            रद्द करें (Cancel)
          </Button>
          <Button variant="primary" loading={saving} onClick={() => void save()}>
            सहेजें (Save)
          </Button>
        </div>
      }
    >
      <div className="space-y-3">
        <Field label="वजन (Weight, kg)" error={error ?? undefined} required>
          <NumberInput allowDecimal maxLength={6} value={weight} onChange={(e) => setWeight(e.target.value)} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="तारीख़ (Date)">
            <TextInput type="date" max={todayIST()} value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
          <Field label="समय (Time)">
            <TextInput type="time" value={time} onChange={(e) => setTime(e.target.value)} />
          </Field>
        </div>
        <Field label="टिप्पणी (Notes)">
          <TextInput value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Field>
      </div>
    </Modal>
  );
}

/* ---- Trend tab ---------------------------------------------------------------- */

function WeightTrend({
  patientId,
  targetWeight,
  range,
  onRangeChange,
}: {
  patientId: string;
  targetWeight?: number | null;
  range: ChartRange;
  onRangeChange: (range: ChartRange) => void;
}) {
  const { data, win, error, loading, stale, reload } = useRangeData(
    (start, end) => getWeightLogsInRange(patientId, start, end),
    patientId,
    range,
  );

  const stats = (() => {
    if (!data || data.length === 0) return null;
    const kg = data.map((l) => Number(l.weight_kg));
    const first = kg[0];
    const last = kg[kg.length - 1];

    // Rapid change is flagged with the shared rule (>= 2 kg in 7 days, >= 5% in 30 days).
    const today = todayIST();
    const inLast = (days: number) => data.filter((l) => toISTDate(l.measured_at) >= addDaysIST(today, -(days - 1)));
    const week = inLast(7);
    const month = inLast(30);
    const weekChange = week.length >= 2 ? Number(week[week.length - 1].weight_kg) - Number(week[0].weight_kg) : null;
    const monthPct =
      month.length >= 2 && Number(month[0].weight_kg) > 0
        ? ((Number(month[month.length - 1].weight_kg) - Number(month[0].weight_kg)) / Number(month[0].weight_kg)) * 100
        : null;
    const rapid =
      (weekChange !== null && Math.abs(weekChange) >= WEIGHT_RAPID_KG_7D) ||
      (monthPct !== null && Math.abs(monthPct) >= WEIGHT_RAPID_PCT_30D);

    return {
      count: data.length,
      avg: Number(mean(kg)!.toFixed(1)),
      min: Math.min(...kg),
      max: Math.max(...kg),
      change: Number((last - first).toFixed(1)),
      rapid,
    };
  })();

  const weeks = data ? weeklySummaries(data) : [];

  return (
    <TrendShell
      range={range}
      onRangeChange={onRangeChange}
      ariaLabel="Weight trend range — अवधि चुनें"
      loading={loading}
      stale={stale}
      error={error}
      onRetry={reload}
    >
      {stats ? (
        <>
          <div className="tile rounded-card p-3 sm:p-4">
            <WeightTrendChart
              logs={data ?? []}
              targetWeight={targetWeight}
              startDate={win.fixed ? win.startDate : undefined}
              endDate={win.endDate}
            />
          </div>

          <div className="space-y-3" aria-live="polite">
            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
              <StatTile label="औसत (Average)" value={stats.avg} unit="kg" />
              <StatTile label="कम–ज़्यादा" value={`${stats.min}–${stats.max}`} unit="kg" />
              <StatTile
                label="इस अवधि में बदलाव"
                value={`${stats.change > 0 ? "+" : ""}${stats.change}`}
                unit="kg"
                helper="पहली से आख़िरी तौल"
              />
              <StatTile label="तौल की संख्या" value={stats.count} />
            </div>
            {stats.rapid ? (
              <SmallNote>
                <span lang="hi">वजन में हाल में तेज़ बदलाव दिखा है। इसका मतलब कुछ भी हो सकता है; अगली डॉक्टर विज़िट में ज़रूर बताएँ।</span>
              </SmallNote>
            ) : null}
            {stats.count < 3 ? (
              <SmallNote>
                इस अवधि में सिर्फ़ {stats.count} तौल हैं, इसलिए ट्रेंड पर ज़्यादा भरोसा न करें। (Small sample.)
              </SmallNote>
            ) : null}
          </div>

          {weeks.length > 0 ? (
            <div>
              <h3 className="mb-2 text-sm font-semibold text-ink">साप्ताहिक औसत · Weekly average</h3>
              <ul className="space-y-1.5">
                {weeks.slice(0, WEEKS_SHOWN).map((w) => (
                  <li key={w.week} className="tile flex items-center justify-between gap-3 rounded-field px-3 py-2">
                    <span className="text-xs text-ink-muted">
                      <span lang="hi">हफ़्ता</span> {fmtDateStr(w.week)} <span lang="hi">से</span>
                      <span className="ml-1.5 text-ink-subtle">
                        ({w.count} <span lang="hi">तौल</span>)
                      </span>
                    </span>
                    <span className="tabular flex items-center gap-2 text-sm font-semibold text-ink">
                      {w.avg} kg
                      {w.change !== null ? (
                        <span className="text-xs font-medium text-ink-muted">
                          {w.change > 0 ? "↑" : w.change < 0 ? "↓" : "→"} {Math.abs(w.change)}
                        </span>
                      ) : null}
                    </span>
                  </li>
                ))}
              </ul>
              {weeks.length > WEEKS_SHOWN ? (
                <p lang="hi" className="mt-1.5 text-xs text-ink-subtle">
                  सबसे हाल के {WEEKS_SHOWN} हफ़्ते दिखाए गए हैं।
                </p>
              ) : null}
            </div>
          ) : null}
        </>
      ) : (
        <EmptyState
          icon={Scale}
          title="इस अवधि में कोई वजन दर्ज नहीं"
          description="No weigh-ins in this period. A longer range may show earlier ones."
        />
      )}
    </TrendShell>
  );
}

/* ---- Panel -------------------------------------------------------------------- */

export function WeightPanel({
  patientId,
  logs,
  targetWeight,
  heightCm,
  canWrite,
  active = true,
  tab,
  onTabChange,
  onSuccess,
}: WeightPanelProps) {
  const toast = useToast();
  const confirm = useConfirm();

  const [range, setRange] = useState<ChartRange>("30d");
  const [editing, setEditing] = useState<WeightLogEntry | null>(null);

  const pager = useHistoryPager({
    base: logs,
    pageSize: HISTORY_PAGE,
    fetchRows: (limit) => getWeightLogs(patientId, limit),
  });

  const latest = logs[0];
  const latestKg = latest ? Number(latest.weight_kg) : null;
  const bmi = latestKg && heightCm ? calcBMI(latestKg, heightCm) : null;
  const bmiClass = bmi ? classifyBMI(bmi) : null;
  const diff = latestKg !== null && targetWeight ? Number((latestKg - targetWeight).toFixed(1)) : null;

  function changed() {
    pager.refresh();
    onSuccess?.();
  }

  async function handleDelete(log: WeightLogEntry) {
    const ok = await confirm({
      title: "यह वजन एंट्री मिटाएँ?",
      message: `${fmtKg(log.weight_kg)} kg · ${fmtDateStrYear(toISTDate(log.measured_at))}। यह वापस नहीं आएगी।`,
      tone: "danger",
    });
    if (!ok) return;
    try {
      await deleteWeight(log.id);
      toast.success("वजन एंट्री मिटा दी गई", "Weight entry deleted.");
      changed();
    } catch (err) {
      toast.error("मिटाया नहीं जा सका", err instanceof Error ? err.message : undefined);
    }
  }

  return (
    <>
      <PanelFrame
        icon={Scale}
        tone="weight"
        title="Body Weight"
        hindiTitle="वजन"
        subtitle={
          targetWeight ? (
            <>
              <span lang="hi">लक्ष्य</span> (Target): {fmtKg(targetWeight)} kg
            </>
          ) : (
            <>
              <span lang="hi">लक्ष्य तय नहीं</span> · Target not set
            </>
          )
        }
        hero={
          <HeroTile label="ताज़ा वजन · Latest weight">
            {latest && latestKg !== null ? (
              <div className="mt-1 flex flex-wrap items-end justify-between gap-x-4 gap-y-3">
                <div>
                  <HeroNumber value={fmtKg(latest.weight_kg)} unit="kg" className="text-5xl" />
                  <p className="mt-2 text-xs text-ink-muted">
                    <span lang="hi">{relativeDayLabel(toISTDate(latest.measured_at))}</span>, {fmtTime(latest.measured_at)}
                    {latest.notes ? ` · ${latest.notes}` : ""}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {diff !== null ? (
                    <Badge variant="neutral" lang="hi">
                      लक्ष्य से {diff === 0 ? "बराबर" : `${Math.abs(diff)} kg ${diff > 0 ? "ज़्यादा" : "कम"}`}
                    </Badge>
                  ) : null}
                  {bmi && bmiClass ? (
                    <Badge variant={bmiClass.category === "normal" ? "positive" : bmiClass.category === "underweight" ? "info" : "attention"}>
                      BMI {bmi} · <span lang="hi">{bmiClass.labelHi}</span>
                    </Badge>
                  ) : null}
                </div>
              </div>
            ) : (
              <>
                <HeroNumber value="—" className="text-5xl text-ink-subtle" />
                <p lang="hi" className="mt-2 text-xs text-ink-muted">
                  अभी तक कोई वजन दर्ज नहीं
                </p>
              </>
            )}
          </HeroTile>
        }
        tab={tab}
        onTabChange={onTabChange}
        canWrite={canWrite}
        active={active}
        ariaLabel="Weight panel — नया, इतिहास या ट्रेंड"
        form={
          <div className="tile rounded-card p-4 lg:max-w-xl">
            <WeightEntryForm patientId={patientId} currentWeight={latestKg} onSuccess={changed} />
          </div>
        }
        history={
          <div className="space-y-3">
            <HistoryHeading title="वजन का इतिहास · Weight history" count={pager.rows.length} unit="तौल" />
            {pager.rows.length > 0 ? (
              <div className="space-y-4 lg:max-w-3xl">
                <HistoryList label="Weight history">
                  {pager.rows.map((log, i) => {
                    const kg = Number(log.weight_kg);
                    const d = targetWeight ? Number((kg - targetWeight).toFixed(1)) : null;
                    // The next row is the previous weigh-in (newest first).
                    const older = pager.rows[i + 1];
                    const step = older ? Number((kg - Number(older.weight_kg)).toFixed(1)) : null;
                    return (
                      <HistoryRow
                        key={log.id}
                        lead={<DateLead date={toISTDate(log.measured_at)} />}
                        actions={
                          canWrite ? (
                            <RowActions
                              what={`${fmtKg(log.weight_kg)} kg`}
                              onEdit={() => setEditing(log)}
                              onDelete={() => void handleDelete(log)}
                            />
                          ) : null
                        }
                      >
                        <p className="flex flex-wrap items-baseline gap-x-2 text-base font-semibold text-ink">
                          <span className="tabular">
                            {fmtKg(log.weight_kg)} <span className="text-xs font-normal text-ink-muted">kg</span>
                          </span>
                          {step !== null && step !== 0 ? (
                            <span className="tabular text-xs font-medium text-ink-muted" title="पिछली तौल से बदलाव">
                              {step > 0 ? "↑" : "↓"} {Math.abs(step)}
                            </span>
                          ) : null}
                        </p>
                        <p className="truncate text-xs text-ink-subtle">
                          {d !== null ? (
                            <span lang="hi">
                              लक्ष्य से {d > 0 ? "+" : ""}
                              {d} kg
                            </span>
                          ) : null}
                          {d !== null && log.notes ? " · " : ""}
                          {log.notes ? <span className="italic">{log.notes}</span> : null}
                        </p>
                      </HistoryRow>
                    );
                  })}
                </HistoryList>
                {pager.hasMore ? (
                  <LoadMoreButton loading={pager.loading} failed={pager.failed} onClick={pager.loadMore} what="तौल" />
                ) : null}
              </div>
            ) : (
              <EmptyState
                icon={Scale}
                title="अभी कोई वजन दर्ज नहीं"
                description="No weigh-ins yet."
                action={
                  canWrite ? (
                    <Button variant="primary" onClick={() => onTabChange("form")}>
                      <Plus aria-hidden className="h-4 w-4" />
                      पहला वजन दर्ज करें
                    </Button>
                  ) : undefined
                }
              />
            )}
          </div>
        }
        chart={<WeightTrend patientId={patientId} targetWeight={targetWeight} range={range} onRangeChange={setRange} />}
        footnote="वजन में बदलाव के कई कारण हो सकते हैं। अचानक बदलाव दिखे तो डॉक्टर से बात करें।"
      />

      {editing ? (
        <EditWeightModal key={editing.id} log={editing} onClose={() => setEditing(null)} onSaved={changed} />
      ) : null}
    </>
  );
}
