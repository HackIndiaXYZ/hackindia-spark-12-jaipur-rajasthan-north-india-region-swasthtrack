"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { HeartPulse, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, NumberInput, Select, TextInput } from "@/components/ui/form-field";
import { Modal } from "@/components/ui/modal";
import { EmptyState } from "@/components/ui/page";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { useToast } from "@/components/ui/toast";
import { BPEntryForm } from "@/components/forms/add-bp-dialog";
import { BPChip } from "@/components/health/bp-chip";
import { fmtTime, istDateAndTime, parseIntegerInput, relativeDayLabel } from "@/components/health/format";
import {
  ChartSkeleton,
  HISTORY_PAGE,
  HeroNumber,
  HeroTile,
  HistoryDay,
  HistoryHeading,
  HistoryRow,
  LoadMoreButton,
  PanelFrame,
  RowActions,
  SmallNote,
  StatTile,
  TrendShell,
  groupByDate,
  useHistoryPager,
  useRangeData,
  type ChartRange,
  type PanelTab,
} from "@/components/health/panel-parts";
import {
  classifyBP,
  isPlausibleBP,
  istInstant,
  mean,
  toISTDate,
  todayIST,
  type BPThresholds,
} from "@/lib/health-rules";
import {
  deleteBloodPressure,
  getBloodPressureLogs,
  getBloodPressureLogsInRange,
  updateBloodPressure,
  type BPLogEntry,
} from "@/services/patient-service";

// recharts is the heaviest dependency on this screen; it loads only when the
// Trend tab is opened.
const BPTrendChart = dynamic(() => import("@/components/health/bp-trend-chart").then((m) => m.BPTrendChart), {
  ssr: false,
  loading: () => <ChartSkeleton />,
});

type BloodPressurePanelProps = {
  patientId: string;
  /** Newest first. */
  logs: BPLogEntry[];
  thresholds: BPThresholds;
  /** False for viewers: the panel is read-only. */
  canWrite: boolean;
  /** False while another tracker is showing. */
  active?: boolean;
  /** The open New / History / Trend tab (kept by the page, so the overview can ask for "form"). */
  tab: PanelTab;
  onTabChange: (tab: PanelTab) => void;
  onSuccess?: () => void;
};

type FieldErrors = { systolic?: string; diastolic?: string; pulse?: string };

const PERIODS: Array<{ value: string; label: string }> = [
  { value: "Morning", label: "सुबह (Morning)" },
  { value: "Afternoon", label: "दोपहर (Afternoon)" },
  { value: "Evening", label: "शाम (Evening)" },
  { value: "Night", label: "रात (Night)" },
  { value: "Special", label: "चेकअप (Special)" },
];

const PERIOD_LABEL: Record<string, string> = {
  morning: "सुबह",
  afternoon: "दोपहर",
  evening: "शाम",
  night: "रात",
  special: "चेकअप",
};

function periodLabel(type: string | null): string {
  const key = (type ?? "").trim().toLowerCase();
  return PERIOD_LABEL[key] || type || "दर्ज";
}

/** Checks an edited entry. Returns field errors, or the parsed numbers. */
function parseBP(
  sysStr: string,
  diaStr: string,
  pulseStr: string,
): { errors: FieldErrors; values: { systolic: number; diastolic: number; pulse: number | null } | null } {
  const errors: FieldErrors = {};
  const systolic = parseIntegerInput(sysStr);
  const diastolic = parseIntegerInput(diaStr);
  const pulse = pulseStr.trim() ? parseIntegerInput(pulseStr) : null;

  if (Number.isNaN(systolic)) errors.systolic = "ऊपर का नंबर लिखें";
  else if (systolic < 50 || systolic > 280) errors.systolic = "50 से 280 के बीच लिखें";

  if (Number.isNaN(diastolic)) errors.diastolic = "नीचे का नंबर लिखें";
  else if (diastolic < 30 || diastolic > 180) errors.diastolic = "30 से 180 के बीच लिखें";

  if (!errors.systolic && !errors.diastolic && systolic <= diastolic) {
    errors.diastolic = "नीचे का नंबर ऊपर वाले से छोटा होना चाहिए";
  }
  if (pulse !== null && (Number.isNaN(pulse) || pulse < 25 || pulse > 250)) {
    errors.pulse = "25 से 250 के बीच लिखें";
  }

  if (Object.keys(errors).length > 0 || !isPlausibleBP(systolic, diastolic, pulse)) {
    return { errors, values: null };
  }
  return { errors, values: { systolic, diastolic, pulse } };
}

/* ---- Latest morning / evening ------------------------------------------------- */

function LatestTile({
  title,
  log,
  thresholds,
}: {
  title: string;
  log: BPLogEntry | undefined;
  thresholds: BPThresholds;
}) {
  const today = todayIST();
  const day = log ? toISTDate(log.measured_at) : null;

  return (
    <HeroTile label={title}>
      {log && day ? (
        <>
          <HeroNumber value={`${log.systolic}/${log.diastolic}`} unit="mmHg" stacked className="text-3xl" />
          <p className="mt-2 text-xs text-ink-muted">
            <span lang="hi">{relativeDayLabel(day, today)}</span>, {fmtTime(log.measured_at)}
            {log.pulse ? (
              <>
                {" · "}
                <span className="whitespace-nowrap">
                  <span lang="hi">नब्ज़</span> {log.pulse}
                </span>
              </>
            ) : null}
          </p>
          <BPChip systolic={log.systolic} diastolic={log.diastolic} thresholds={thresholds} className="mt-2" />
          {day !== today ? (
            <p lang="hi" className="mt-1.5 text-xs text-ink-muted">
              आज अभी दर्ज नहीं हुआ
            </p>
          ) : null}
        </>
      ) : (
        <>
          <HeroNumber value="—" className="text-3xl text-ink-subtle" />
          <p lang="hi" className="mt-2 text-xs text-ink-muted">
            अभी तक कोई रीडिंग दर्ज नहीं
          </p>
        </>
      )}
    </HeroTile>
  );
}

/* ---- Edit dialog -------------------------------------------------------------- */

function EditBPModal({
  log,
  thresholds,
  onClose,
  onSaved,
}: {
  log: BPLogEntry;
  thresholds: BPThresholds;
  onClose: () => void;
  onSaved: () => void;
}) {
  const toast = useToast();
  const confirm = useConfirm();
  const initial = istDateAndTime(log.measured_at);
  const [systolic, setSystolic] = useState(String(log.systolic));
  const [diastolic, setDiastolic] = useState(String(log.diastolic));
  const [pulse, setPulse] = useState(log.pulse ? String(log.pulse) : "");
  const [period, setPeriod] = useState(
    () => PERIODS.find((p) => p.value.toLowerCase() === (log.reading_type ?? "").trim().toLowerCase())?.value ?? "Morning",
  );
  const [date, setDate] = useState(initial.date);
  const [time, setTime] = useState(initial.time);
  const [notes, setNotes] = useState(log.notes || "");
  const [errors, setErrors] = useState<FieldErrors>({});
  const [saving, setSaving] = useState(false);

  async function save() {
    const { errors: found, values } = parseBP(systolic, diastolic, pulse);
    setErrors(found);
    if (!values) return;
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

    const cls = classifyBP(values.systolic, values.diastolic, thresholds);
    if (cls.category === "crisis" || cls.needsUrgentAttention) {
      const ok = await confirm({
        title: "क्या यह रीडिंग सही है?",
        message: `${values.systolic}/${values.diastolic} mmHg सामान्य से काफ़ी अलग है। सही है तो सहेजें; टाइप की गलती हो तो रद्द करके जाँचें।`,
        confirmLabel: "हाँ, सही है",
        cancelLabel: "रद्द करें",
      });
      if (!ok) return;
    }

    setSaving(true);
    try {
      await updateBloodPressure(log.id, {
        systolic: values.systolic,
        diastolic: values.diastolic,
        pulse: values.pulse,
        reading_type: period,
        measured_at: measuredAt.toISOString(),
        notes: notes.trim() || null,
      });
      toast.success("रीडिंग अपडेट हो गई", "BP reading updated.");
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
      title="BP reading बदलें"
      hindiTitle="रक्तचाप संपादित करें"
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
        <div className="grid grid-cols-2 gap-3">
          <Field label="Systolic (ऊपर वाला)" hint="mmHg" error={errors.systolic} required>
            <NumberInput maxLength={3} value={systolic} onChange={(e) => setSystolic(e.target.value)} />
          </Field>
          <Field label="Diastolic (नीचे वाला)" hint="mmHg" error={errors.diastolic} required>
            <NumberInput maxLength={3} value={diastolic} onChange={(e) => setDiastolic(e.target.value)} />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Pulse (नब्ज़)" hint="bpm · वैकल्पिक" error={errors.pulse}>
            <NumberInput maxLength={3} value={pulse} onChange={(e) => setPulse(e.target.value)} />
          </Field>
          <Field label="समय का हिस्सा (Period)">
            <Select value={period} onChange={(e) => setPeriod(e.target.value)}>
              {PERIODS.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="तारीख़ (Date)">
            <TextInput type="date" max={todayIST()} value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
          <Field label="समय (Time)">
            <TextInput type="time" value={time} onChange={(e) => setTime(e.target.value)} />
          </Field>
        </div>
        <Field label="टिप्पणी (Notes)">
          <TextInput value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="जैसे: दवाई के बाद, 10 मिनट आराम के बाद" />
        </Field>
      </div>
    </Modal>
  );
}

/* ---- Trend tab ---------------------------------------------------------------- */

function BPTrend({
  patientId,
  thresholds,
  range,
  onRangeChange,
}: {
  patientId: string;
  thresholds: BPThresholds;
  range: ChartRange;
  onRangeChange: (range: ChartRange) => void;
}) {
  const { data, win, error, loading, stale, reload } = useRangeData(
    (start, end) => getBloodPressureLogsInRange(patientId, start, end),
    patientId,
    range,
  );

  const stats = (() => {
    if (!data || data.length === 0) return null;
    const sys = data.map((l) => l.systolic);
    const dia = data.map((l) => l.diastolic);
    const classes = data.map((l) => classifyBP(l.systolic, l.diastolic, thresholds));
    const avgOf = (type: string) => {
      const part = data.filter((l) => (l.reading_type ?? "").trim().toLowerCase() === type);
      return part.length > 0
        ? { n: part.length, sys: Math.round(mean(part.map((l) => l.systolic))!), dia: Math.round(mean(part.map((l) => l.diastolic))!) }
        : null;
    };
    return {
      count: data.length,
      avgSys: Math.round(mean(sys)!),
      avgDia: Math.round(mean(dia)!),
      minSys: Math.min(...sys),
      maxSys: Math.max(...sys),
      minDia: Math.min(...dia),
      maxDia: Math.max(...dia),
      aboveTarget: classes.filter((c) => c.aboveTarget).length,
      aboveAlert: classes.filter((c) => c.exceedsAlert).length,
      morning: avgOf("morning"),
      evening: avgOf("evening"),
    };
  })();

  return (
    <TrendShell
      range={range}
      onRangeChange={onRangeChange}
      ariaLabel="BP trend range — अवधि चुनें"
      loading={loading}
      stale={stale}
      error={error}
      onRetry={reload}
    >
      {stats ? (
        <>
          <div className="tile rounded-card p-3 sm:p-4">
            <BPTrendChart
              logs={data ?? []}
              thresholds={thresholds}
              startDate={win.fixed ? win.startDate : undefined}
              endDate={win.endDate}
            />
          </div>

          <div className="space-y-3" aria-live="polite">
            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
              <StatTile label="औसत (Average)" value={`${stats.avgSys}/${stats.avgDia}`} unit="mmHg" />
              <StatTile
                label="ऊपर का: कम–ज़्यादा"
                value={`${stats.minSys}–${stats.maxSys}`}
                helper={`नीचे का ${stats.minDia}–${stats.maxDia}`}
              />
              <StatTile
                label="लक्ष्य से ऊपर"
                value={`${stats.aboveTarget}/${stats.count}`}
                unit="रीडिंग"
                tone={stats.aboveTarget > 0 ? "attention" : "positive"}
                helper={`लक्ष्य ${thresholds.target_systolic}/${thresholds.target_diastolic}`}
              />
              <StatTile
                label="अलर्ट सीमा से ऊपर"
                value={stats.aboveAlert}
                unit="रीडिंग"
                tone={stats.aboveAlert > 0 ? "critical" : "positive"}
                helper={`अलर्ट ${thresholds.alert_systolic}/${thresholds.alert_diastolic}`}
              />
            </div>
            {stats.morning || stats.evening ? (
              <div className="grid grid-cols-2 gap-2.5">
                <StatTile
                  label="सुबह का औसत"
                  value={stats.morning ? `${stats.morning.sys}/${stats.morning.dia}` : null}
                  unit="mmHg"
                  helper={stats.morning ? `${stats.morning.n} रीडिंग` : "इस अवधि में नहीं"}
                />
                <StatTile
                  label="शाम का औसत"
                  value={stats.evening ? `${stats.evening.sys}/${stats.evening.dia}` : null}
                  unit="mmHg"
                  helper={stats.evening ? `${stats.evening.n} रीडिंग` : "इस अवधि में नहीं"}
                />
              </div>
            ) : null}
            {stats.count < 5 ? (
              <SmallNote>
                इस अवधि में सिर्फ़ {stats.count} रीडिंग हैं, इसलिए औसत पर ज़्यादा भरोसा न करें। (Small sample — treat averages as rough.)
              </SmallNote>
            ) : null}
          </div>
        </>
      ) : (
        <EmptyState
          icon={HeartPulse}
          title="इस अवधि में कोई रीडिंग नहीं"
          description="No readings in this period. A longer range may show earlier readings."
        />
      )}
    </TrendShell>
  );
}

/* ---- Panel -------------------------------------------------------------------- */

export function BloodPressurePanel({
  patientId,
  logs,
  thresholds,
  canWrite,
  active = true,
  tab,
  onTabChange,
  onSuccess,
}: BloodPressurePanelProps) {
  const toast = useToast();
  const confirm = useConfirm();

  const [range, setRange] = useState<ChartRange>("30d");
  const [editing, setEditing] = useState<BPLogEntry | null>(null);

  const pager = useHistoryPager({
    base: logs,
    pageSize: HISTORY_PAGE,
    fetchRows: (limit) => getBloodPressureLogs(patientId, limit),
  });

  const slot = (type: string) => logs.find((l) => (l.reading_type ?? "").trim().toLowerCase() === type);
  const latestMorning = slot("morning");
  const latestEvening = slot("evening");

  function changed() {
    pager.refresh();
    onSuccess?.();
  }

  async function handleDelete(log: BPLogEntry) {
    const ok = await confirm({
      title: "यह BP रीडिंग मिटाएँ?",
      message: `${log.systolic}/${log.diastolic} mmHg · ${relativeDayLabel(toISTDate(log.measured_at))}, ${fmtTime(log.measured_at)}। यह वापस नहीं आएगी।`,
      tone: "danger",
    });
    if (!ok) return;
    try {
      await deleteBloodPressure(log.id);
      toast.success("रीडिंग मिटा दी गई", "BP reading deleted.");
      changed();
    } catch (err) {
      toast.error("मिटाया नहीं जा सका", err instanceof Error ? err.message : undefined);
    }
  }

  const groups = groupByDate(pager.rows, (l) => toISTDate(l.measured_at));

  return (
    <>
      <PanelFrame
        icon={HeartPulse}
        tone="bp"
        title="Blood Pressure"
        hindiTitle="रक्तचाप"
        subtitle={
          <>
            <span lang="hi">लक्ष्य</span> {thresholds.target_systolic}/{thresholds.target_diastolic} · <span lang="hi">अलर्ट</span>{" "}
            {thresholds.alert_systolic}/{thresholds.alert_diastolic} mmHg
          </>
        }
        hero={
          <div className="grid grid-cols-2 gap-3">
            <LatestTile title="सुबह · Morning (ताज़ा)" log={latestMorning} thresholds={thresholds} />
            <LatestTile title="शाम · Evening (ताज़ा)" log={latestEvening} thresholds={thresholds} />
          </div>
        }
        tab={tab}
        onTabChange={onTabChange}
        canWrite={canWrite}
        active={active}
        ariaLabel="BP panel — नया, इतिहास या ट्रेंड"
        form={
          <div className="tile rounded-card p-4 lg:max-w-xl">
            <BPEntryForm patientId={patientId} thresholds={thresholds} onSuccess={changed} />
          </div>
        }
        history={
          <div className="space-y-3">
            <HistoryHeading title="हाल की रीडिंग · Recent readings (mmHg)" count={pager.rows.length} unit="रीडिंग" />
            {groups.length > 0 ? (
              <div className="space-y-4 lg:max-w-3xl">
                {groups.map((group) => (
                  <HistoryDay key={group.date} date={group.date}>
                    {group.rows.map((log) => (
                      <HistoryRow
                        key={log.id}
                        lead={
                          <div className="w-14 shrink-0 text-xs">
                            <p className="font-semibold text-ink">{fmtTime(log.measured_at)}</p>
                            <p lang="hi" className="text-ink-subtle">
                              {periodLabel(log.reading_type)}
                            </p>
                          </div>
                        }
                        actions={
                          canWrite ? (
                            <RowActions
                              what={`BP ${log.systolic}/${log.diastolic}`}
                              onEdit={() => setEditing(log)}
                              onDelete={() => void handleDelete(log)}
                            />
                          ) : null
                        }
                      >
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                          <p className="tabular text-base font-semibold text-ink">
                            {log.systolic}/{log.diastolic}
                          </p>
                          <BPChip systolic={log.systolic} diastolic={log.diastolic} thresholds={thresholds} />
                        </div>
                        {log.pulse || log.notes ? (
                          <p className="truncate text-xs text-ink-subtle">
                            {log.pulse ? (
                              <>
                                <span lang="hi">नब्ज़</span> {log.pulse}
                              </>
                            ) : null}
                            {log.pulse && log.notes ? " · " : ""}
                            {log.notes ? <span className="italic">{log.notes}</span> : null}
                          </p>
                        ) : null}
                      </HistoryRow>
                    ))}
                  </HistoryDay>
                ))}
                {pager.hasMore ? (
                  <LoadMoreButton loading={pager.loading} failed={pager.failed} onClick={pager.loadMore} what="रीडिंग" />
                ) : null}
              </div>
            ) : (
              <EmptyState
                icon={HeartPulse}
                title="अभी कोई BP रीडिंग नहीं"
                description="No readings yet."
                action={
                  canWrite ? (
                    <Button variant="primary" onClick={() => onTabChange("form")}>
                      <Plus aria-hidden className="h-4 w-4" />
                      पहली रीडिंग दर्ज करें
                    </Button>
                  ) : undefined
                }
              />
            )}
          </div>
        }
        chart={<BPTrend patientId={patientId} thresholds={thresholds} range={range} onRangeChange={setRange} />}
        footnote="यह स्क्रीन सिर्फ़ रीडिंग दर्ज करती है। यह निदान नहीं करती और दवाई नहीं बदलती। चिंता हो तो डॉक्टर से बात करें; आपात स्थिति में 112 / 108।"
      />

      {editing ? (
        <EditBPModal
          key={editing.id}
          log={editing}
          thresholds={thresholds}
          onClose={() => setEditing(null)}
          onSaved={changed}
        />
      ) : null}
    </>
  );
}
