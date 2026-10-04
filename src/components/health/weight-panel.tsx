"use client";

import { useId, useState, type FormEvent } from "react";
import dynamic from "next/dynamic";
import { Info, Plus, Scale } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, NumberInput, TextInput } from "@/components/ui/form-field";
import { Modal } from "@/components/ui/modal";
import { EmptyState, ErrorState } from "@/components/ui/page";
import { Segmented, segmentedPanelId, segmentedTabId } from "@/components/ui/segmented";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { useToast } from "@/components/ui/toast";
import { fmtDateStr, fmtDateStrYear, fmtKg, istDateAndTime, relativeDayLabel } from "@/components/health/format";
import {
  ChartSkeleton,
  RangeSelector,
  RowActions,
  SmallNote,
  StatTile,
  panelTabOptions,
  rangeWindow,
  type ChartRange,
  type PanelTab,
} from "@/components/health/panel-parts";
import { loadErrorMessage, useAsyncData } from "@/components/health/use-async-data";
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
  getWeightLogsInRange,
  logWeight,
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
  onSuccess?: () => void;
};

/** Same limits the service enforces, so the message appears before the request. */
function weightError(raw: string): string | null {
  const kg = parseFloat(raw);
  if (!raw.trim() || Number.isNaN(kg)) return "वजन लिखें (kg में)";
  if (kg < 20 || kg > 350) return "20 से 350 kg के बीच लिखें";
  return null;
}

/** Monday (IST) of the week a date falls in. */
function weekStartOf(dateStr: string): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return addDaysIST(dateStr, -((dow + 6) % 7));
}

function weeklySummaries(logs: WeightLogEntry[]) {
  const byWeek = new Map<string, number[]>();
  for (const log of logs) {
    const week = weekStartOf(toISTDate(log.measured_at));
    const list = byWeek.get(week);
    if (list) list.push(log.weight_kg);
    else byWeek.set(week, [log.weight_kg]);
  }
  const weeks = [...byWeek.keys()].sort();
  let prev: number | null = null;
  return weeks.map((week) => {
    const values = byWeek.get(week)!;
    const avg = Number(mean(values)!.toFixed(1));
    const change = prev === null ? null : Number((avg - prev).toFixed(1));
    prev = avg;
    return { week, avg, count: values.length, change };
  });
}

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
  const [weight, setWeight] = useState(String(log.weight_kg));
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
    if (measuredAt.getTime() > Date.now() + 5 * 60_000) {
      toast.error("यह समय अभी से आगे का है", "Time is in the future.");
      return;
    }
    setSaving(true);
    try {
      await updateWeight(log.id, {
        weight_kg: parseFloat(weight),
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
          <NumberInput allowDecimal maxLength={5} value={weight} onChange={(e) => setWeight(e.target.value)} />
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

function WeightTrend({ patientId, targetWeight }: { patientId: string; targetWeight?: number | null }) {
  const [range, setRange] = useState<ChartRange>("30d");
  const win = rangeWindow(range);
  const { data, error, loading, reload } = useAsyncData(
    () => getWeightLogsInRange(patientId, win.startDate, win.endDate),
    [patientId, range, win.endDate],
  );

  const stats = (() => {
    if (!data || data.length === 0) return null;
    const kg = data.map((l) => l.weight_kg);
    const first = data[0];
    const last = data[data.length - 1];

    // Rapid change is flagged with the shared rule (>= 2 kg in 7 days, >= 5% in 30 days).
    const today = todayIST();
    const inLast = (days: number) => data.filter((l) => toISTDate(l.measured_at) >= addDaysIST(today, -(days - 1)));
    const week = inLast(7);
    const month = inLast(30);
    const weekChange = week.length >= 2 ? week[week.length - 1].weight_kg - week[0].weight_kg : null;
    const monthPct =
      month.length >= 2 && month[0].weight_kg > 0
        ? ((month[month.length - 1].weight_kg - month[0].weight_kg) / month[0].weight_kg) * 100
        : null;
    const rapid =
      (weekChange !== null && Math.abs(weekChange) >= WEIGHT_RAPID_KG_7D) ||
      (monthPct !== null && Math.abs(monthPct) >= WEIGHT_RAPID_PCT_30D);

    return {
      count: data.length,
      avg: Number(mean(kg)!.toFixed(1)),
      min: Math.min(...kg),
      max: Math.max(...kg),
      change: Number((last.weight_kg - first.weight_kg).toFixed(1)),
      rapid,
    };
  })();

  const weeks = data ? weeklySummaries(data) : [];

  return (
    <div className="space-y-4">
      <RangeSelector value={range} onChange={setRange} ariaLabel="Weight trend range — अवधि चुनें" />

      {error ? (
        <ErrorState
          title="ट्रेंड लोड नहीं हो पाया"
          englishTitle="Could not load the trend"
          description={loadErrorMessage(error)}
          onRetry={reload}
        />
      ) : loading ? (
        <ChartSkeleton />
      ) : (
        <>
          <WeightTrendChart logs={data ?? []} targetWeight={targetWeight} startDate={win.startDate} endDate={win.endDate} />

          {stats ? (
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
          ) : (
            <EmptyState
              icon={Scale}
              title="इस अवधि में कोई वजन दर्ज नहीं"
              description="No weigh-ins in this period. A longer range may show earlier ones."
            />
          )}

          {weeks.length > 0 ? (
            <div>
              <h3 className="mb-2 text-sm font-semibold text-ink">साप्ताहिक औसत · Weekly average</h3>
              <ul className="space-y-1.5">
                {weeks.map((w) => (
                  <li key={w.week} className="flex items-center justify-between gap-3 rounded-field bg-surface-sunken px-3 py-2">
                    <span className="text-xs text-ink-muted">
                      हफ़्ता {fmtDateStr(w.week)} से
                      <span className="ml-1.5 text-ink-subtle">({w.count} तौल)</span>
                    </span>
                    <span className="tabular flex items-center gap-2 text-sm font-semibold text-ink">
                      {w.avg} kg
                      {w.change !== null ? (
                        <span className="text-xs font-medium text-ink-subtle">
                          {w.change > 0 ? "↑" : w.change < 0 ? "↓" : "→"} {Math.abs(w.change)}
                        </span>
                      ) : null}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}

/* ---- Panel -------------------------------------------------------------------- */

export function WeightPanel({ patientId, logs, targetWeight, heightCm, canWrite, onSuccess }: WeightPanelProps) {
  const toast = useToast();
  const confirm = useConfirm();
  const tabsId = useId();

  const [tab, setTab] = useState<PanelTab>(canWrite ? "form" : "history");
  const [weight, setWeight] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState<WeightLogEntry | null>(null);

  const latest = logs[0];
  const bmi = latest && heightCm ? calcBMI(latest.weight_kg, heightCm) : null;
  const bmiClass = bmi ? classifyBMI(bmi) : null;
  const diff = latest && targetWeight ? Number((latest.weight_kg - targetWeight).toFixed(1)) : null;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const problem = weightError(weight);
    setError(problem);
    if (problem) return;

    const kg = parseFloat(weight);
    setSaving(true);
    try {
      await logWeight({
        patient_id: patientId,
        weight_kg: kg,
        measured_at: new Date().toISOString(),
        notes: notes.trim() || null,
      });
      setWeight("");
      setNotes("");
      toast.success(`वजन दर्ज हो गया: ${kg} kg`, "Weight saved.");
      onSuccess?.();
    } catch (err) {
      toast.error("वजन दर्ज नहीं हो पाया", err instanceof Error ? err.message : undefined);
    } finally {
      setSaving(false);
    }
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
      onSuccess?.();
    } catch (err) {
      toast.error("मिटाया नहीं जा सका", err instanceof Error ? err.message : undefined);
    }
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex min-w-0 items-center gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-control bg-weight-soft text-weight">
            <Scale aria-hidden className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <CardTitle>Body Weight</CardTitle>
              <Badge variant="info" lang="hi">
                वजन
              </Badge>
            </div>
            <CardDescription>
              {targetWeight ? `लक्ष्य (Target): ${targetWeight} kg` : "लक्ष्य तय नहीं · Target not set"}
            </CardDescription>
          </div>
        </div>
      </CardHeader>

      <div className="mb-5 rounded-card border border-line bg-surface-sunken p-4">
        <p className="text-xs font-semibold text-ink-muted">ताज़ा वजन · Latest weight</p>
        {latest ? (
          <div className="mt-1 flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
            <div>
              <p className="tabular text-4xl font-semibold text-weight">
                {fmtKg(latest.weight_kg)}
                <span className="ml-1 text-sm font-medium text-ink-subtle">kg</span>
              </p>
              <p className="mt-0.5 text-xs text-ink-subtle">
                {relativeDayLabel(toISTDate(latest.measured_at))}
                {latest.notes ? ` · ${latest.notes}` : ""}
              </p>
            </div>
            <div className="text-right text-xs text-ink-muted">
              {diff !== null ? (
                <p lang="hi" className="tabular font-semibold">
                  लक्ष्य से {diff === 0 ? "बराबर" : `${Math.abs(diff)} kg ${diff > 0 ? "ज़्यादा" : "कम"}`}
                </p>
              ) : null}
              {bmi && bmiClass ? (
                <p className="mt-0.5">
                  BMI <span className="tabular font-semibold text-ink">{bmi}</span> ·{" "}
                  <span lang="hi">{bmiClass.labelHi}</span>
                </p>
              ) : null}
            </div>
          </div>
        ) : (
          <>
            <p className="mt-1 text-4xl font-semibold text-ink-subtle">—</p>
            <p className="mt-1 text-xs text-ink-subtle">अभी तक कोई वजन दर्ज नहीं</p>
          </>
        )}
      </div>

      <Segmented
        mode="tabs"
        idPrefix={tabsId}
        options={panelTabOptions(canWrite)}
        value={tab}
        onChange={setTab}
        ariaLabel="Weight panel — नया, इतिहास या ट्रेंड"
        size="sm"
        className="mb-3"
      />

      {tab === "form" && canWrite ? (
        <form
          role="tabpanel"
          id={segmentedPanelId(tabsId, "form")}
          aria-labelledby={segmentedTabId(tabsId, "form")}
          onSubmit={(e) => void handleSubmit(e)}
          noValidate
          className="space-y-3 rounded-card border border-line bg-surface p-4"
        >
          <Field label="वजन (Weight, kg)" hint="जैसे 78.4 · सुबह खाली पेट सबसे सही रहता है" error={error ?? undefined} required>
            <NumberInput
              allowDecimal
              maxLength={5}
              placeholder="जैसे 78.4"
              value={weight}
              onChange={(e) => setWeight(e.target.value)}
              className="text-xl font-semibold"
            />
          </Field>
          <Field label="टिप्पणी (Notes)" hint="वैकल्पिक · optional">
            <TextInput placeholder="जैसे: सुबह खाली पेट" value={notes} onChange={(e) => setNotes(e.target.value)} />
          </Field>
          <Button type="submit" variant="primary" loading={saving} className="w-full sm:w-auto">
            <Plus aria-hidden className="h-4 w-4" />
            वजन दर्ज करें (Save weight)
          </Button>
        </form>
      ) : null}

      {tab === "history" ? (
        <div
          role="tabpanel"
          id={segmentedPanelId(tabsId, "history")}
          aria-labelledby={segmentedTabId(tabsId, "history")}
          className="rounded-card border border-line bg-surface p-4"
        >
          <h3 className="mb-1 text-sm font-semibold text-ink">वजन का इतिहास · Weight history</h3>
          <p className="mb-3 text-xs text-ink-subtle">
            पिछली {logs.length} तौल। पुरानी तौल देखने के लिए ट्रेंड टैब में अवधि बदलें।
          </p>
          {logs.length > 0 ? (
            <ul className="divide-y divide-line">
              {logs.map((log) => {
                const d = targetWeight ? Number((log.weight_kg - targetWeight).toFixed(1)) : null;
                return (
                  <li key={log.id} className="flex items-center justify-between gap-2 py-2.5">
                    <div className="min-w-0 flex-1">
                      <p className="tabular text-base font-semibold text-ink">
                        {fmtKg(log.weight_kg)} <span className="text-xs font-normal text-ink-subtle">kg</span>
                        {d !== null ? (
                          <span className="ml-2 text-xs font-medium text-ink-muted">
                            (लक्ष्य से {d > 0 ? "+" : ""}
                            {d} kg)
                          </span>
                        ) : null}
                      </p>
                      <p className="text-xs text-ink-subtle">
                        {fmtDateStrYear(toISTDate(log.measured_at))}
                        {log.notes ? ` · ${log.notes}` : ""}
                      </p>
                    </div>
                    {canWrite ? (
                      <RowActions
                        what={`${fmtKg(log.weight_kg)} kg`}
                        onEdit={() => setEditing(log)}
                        onDelete={() => void handleDelete(log)}
                      />
                    ) : null}
                  </li>
                );
              })}
            </ul>
          ) : (
            <EmptyState
              icon={Scale}
              title="अभी कोई वजन दर्ज नहीं"
              description="No weigh-ins yet."
              action={
                canWrite ? (
                  <Button variant="primary" onClick={() => setTab("form")}>
                    <Plus aria-hidden className="h-4 w-4" />
                    पहला वजन दर्ज करें
                  </Button>
                ) : undefined
              }
            />
          )}
        </div>
      ) : null}

      {tab === "chart" ? (
        <div
          role="tabpanel"
          id={segmentedPanelId(tabsId, "chart")}
          aria-labelledby={segmentedTabId(tabsId, "chart")}
          className="rounded-card border border-line bg-surface p-4"
        >
          <WeightTrend patientId={patientId} targetWeight={targetWeight} />
        </div>
      ) : null}

      <p className="mt-4 flex items-start gap-2 rounded-card border border-info-line bg-info-soft p-3 text-xs text-ink-muted">
        <Info aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-info" />
        <span lang="hi">वजन में बदलाव के कई कारण हो सकते हैं। अचानक बदलाव दिखे तो डॉक्टर से बात करें।</span>
      </p>

      {editing ? (
        <EditWeightModal key={editing.id} log={editing} onClose={() => setEditing(null)} onSaved={() => onSuccess?.()} />
      ) : null}
    </Card>
  );
}
