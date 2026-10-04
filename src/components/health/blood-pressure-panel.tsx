"use client";

import { useId, useState, type FormEvent } from "react";
import dynamic from "next/dynamic";
import { HeartPulse, Info, Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, NumberInput, Select, TextInput } from "@/components/ui/form-field";
import { Modal } from "@/components/ui/modal";
import { EmptyState, ErrorState } from "@/components/ui/page";
import { Segmented, segmentedPanelId, segmentedTabId } from "@/components/ui/segmented";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { useToast } from "@/components/ui/toast";
import { BPChip, bpSafetyNote, classifyReading, statusTextClass } from "@/components/health/bp-chip";
import { fmtTime, istDateAndTime, relativeDayLabel } from "@/components/health/format";
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
  classifyBP,
  isPlausibleBP,
  istHour,
  istInstant,
  mean,
  toISTDate,
  todayIST,
  type BPThresholds,
} from "@/lib/health-rules";
import {
  deleteBloodPressure,
  getBloodPressureLogsInRange,
  logBloodPressure,
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
  onSuccess?: () => void;
};

type FieldErrors = { systolic?: string; diastolic?: string; pulse?: string };

const PERIOD_LABEL: Record<string, string> = {
  Morning: "सुबह",
  Afternoon: "दोपहर",
  Evening: "शाम",
  Night: "रात",
  Special: "चेकअप",
};

function periodLabel(type: string | null): string {
  return (type && PERIOD_LABEL[type]) || type || "दर्ज";
}

/** Checks one entry. Returns field errors, or the parsed numbers. */
function parseBP(
  sysStr: string,
  diaStr: string,
  pulseStr: string,
): { errors: FieldErrors; values: { systolic: number; diastolic: number; pulse: number | null } | null } {
  const errors: FieldErrors = {};
  const systolic = parseInt(sysStr, 10);
  const diastolic = parseInt(diaStr, 10);
  const pulse = pulseStr.trim() ? parseInt(pulseStr, 10) : null;

  if (!sysStr.trim() || Number.isNaN(systolic)) errors.systolic = "ऊपर का नंबर लिखें";
  else if (systolic < 50 || systolic > 280) errors.systolic = "50 से 280 के बीच लिखें";

  if (!diaStr.trim() || Number.isNaN(diastolic)) errors.diastolic = "नीचे का नंबर लिखें";
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

function LatestCard({
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
  const { tone } = log ? classifyReading(log.systolic, log.diastolic, thresholds) : { tone: "info" as const };

  return (
    <div className="rounded-card border border-line bg-surface-sunken p-4">
      <p className="text-xs font-semibold text-ink-muted">{title}</p>
      {log && day ? (
        <>
          <p className={`tabular mt-1 text-3xl font-semibold ${statusTextClass[tone]}`}>
            {log.systolic}/{log.diastolic}
            <span className="ml-1 text-xs font-medium text-ink-subtle">mmHg</span>
          </p>
          <p className="mt-0.5 text-xs text-ink-subtle">
            {relativeDayLabel(day, today)}, {fmtTime(log.measured_at)}
            {log.pulse ? ` · नब्ज़ ${log.pulse}` : ""}
          </p>
          <BPChip systolic={log.systolic} diastolic={log.diastolic} thresholds={thresholds} className="mt-2" />
          {day !== today ? <p className="mt-1.5 text-xs text-ink-subtle">आज अभी दर्ज नहीं हुआ</p> : null}
        </>
      ) : (
        <>
          <p className="mt-1 text-3xl font-semibold text-ink-subtle">—</p>
          <p className="mt-1 text-xs text-ink-subtle">अभी तक कोई रीडिंग दर्ज नहीं</p>
        </>
      )}
    </div>
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
  const [period, setPeriod] = useState(log.reading_type || "Morning");
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
              <option value="Morning">सुबह (Morning)</option>
              <option value="Afternoon">दोपहर (Afternoon)</option>
              <option value="Evening">शाम (Evening)</option>
              <option value="Night">रात (Night)</option>
              <option value="Special">चेकअप (Special)</option>
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

function BPTrend({ patientId, thresholds }: { patientId: string; thresholds: BPThresholds }) {
  const [range, setRange] = useState<ChartRange>("30d");
  const win = rangeWindow(range);
  const { data, error, loading, reload } = useAsyncData(
    () => getBloodPressureLogsInRange(patientId, win.startDate, win.endDate),
    [patientId, range, win.endDate],
  );

  const stats = (() => {
    if (!data || data.length === 0) return null;
    const sys = data.map((l) => l.systolic);
    const dia = data.map((l) => l.diastolic);
    const classes = data.map((l) => classifyBP(l.systolic, l.diastolic, thresholds));
    const avgOf = (type: string) => {
      const part = data.filter((l) => l.reading_type === type);
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
      morning: avgOf("Morning"),
      evening: avgOf("Evening"),
    };
  })();

  return (
    <div className="space-y-4">
      <RangeSelector value={range} onChange={setRange} ariaLabel="BP trend range — अवधि चुनें" />

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
          <BPTrendChart logs={data ?? []} thresholds={thresholds} startDate={win.startDate} endDate={win.endDate} />

          {stats ? (
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
          ) : (
            <EmptyState
              icon={HeartPulse}
              title="इस अवधि में कोई रीडिंग नहीं"
              description="No readings in this period. A longer range may show earlier readings."
            />
          )}
        </>
      )}
    </div>
  );
}

/* ---- Panel -------------------------------------------------------------------- */

export function BloodPressurePanel({ patientId, logs, thresholds, canWrite, onSuccess }: BloodPressurePanelProps) {
  const toast = useToast();
  const confirm = useConfirm();
  const tabsId = useId();

  const [tab, setTab] = useState<PanelTab>(canWrite ? "form" : "history");
  const [systolic, setSystolic] = useState("");
  const [diastolic, setDiastolic] = useState("");
  const [pulse, setPulse] = useState("");
  // A convenience default for the slot, from India time; the reader can change it.
  const [period, setPeriod] = useState(() => (istHour(new Date()) < 14 ? "Morning" : "Evening"));
  const [notes, setNotes] = useState("");
  const [errors, setErrors] = useState<FieldErrors>({});
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState<BPLogEntry | null>(null);

  const latestMorning = logs.find((l) => l.reading_type === "Morning");
  const latestEvening = logs.find((l) => l.reading_type === "Evening");

  const typedSys = parseInt(systolic, 10);
  const typedDia = parseInt(diastolic, 10);
  const preview =
    Number.isFinite(typedSys) && Number.isFinite(typedDia) && isPlausibleBP(typedSys, typedDia)
      ? classifyReading(typedSys, typedDia, thresholds)
      : null;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const { errors: found, values } = parseBP(systolic, diastolic, pulse);
    setErrors(found);
    if (!values) return;

    const cls = classifyBP(values.systolic, values.diastolic, thresholds);
    const note = bpSafetyNote(cls);
    if (cls.category === "crisis" || cls.needsUrgentAttention) {
      const ok = await confirm({
        title: "क्या यह रीडिंग सही है?",
        message: `${values.systolic}/${values.diastolic} mmHg सामान्य से काफ़ी अलग है। ${note ?? ""} सही है तो सहेजें; टाइप की गलती हो तो रद्द करके जाँचें।`,
        confirmLabel: "हाँ, सही है — सहेजें",
        cancelLabel: "रद्द करें",
      });
      if (!ok) return;
    }

    setSaving(true);
    try {
      await logBloodPressure({
        patient_id: patientId,
        systolic: values.systolic,
        diastolic: values.diastolic,
        pulse: values.pulse,
        reading_type: period,
        measured_at: new Date().toISOString(),
        notes: notes.trim() || null,
      });
      setSystolic("");
      setDiastolic("");
      setPulse("");
      setNotes("");
      setErrors({});
      toast({
        title: `रीडिंग दर्ज हो गई: ${values.systolic}/${values.diastolic}`,
        description: note ?? "BP reading saved.",
        tone: "success",
        durationMs: note ? 12000 : undefined,
      });
      onSuccess?.();
    } catch (err) {
      toast.error("रीडिंग दर्ज नहीं हो पाई", err instanceof Error ? err.message : undefined);
    } finally {
      setSaving(false);
    }
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
      onSuccess?.();
    } catch (err) {
      toast.error("मिटाया नहीं जा सका", err instanceof Error ? err.message : undefined);
    }
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex min-w-0 items-center gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-control bg-bp-soft text-bp">
            <HeartPulse aria-hidden className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <CardTitle>Blood Pressure</CardTitle>
              <Badge variant="critical" lang="hi">
                रक्तचाप
              </Badge>
            </div>
            <CardDescription>
              लक्ष्य {thresholds.target_systolic}/{thresholds.target_diastolic} · अलर्ट {thresholds.alert_systolic}/{thresholds.alert_diastolic} mmHg
            </CardDescription>
          </div>
        </div>
      </CardHeader>

      <div className="mb-5 grid gap-3 sm:grid-cols-2">
        <LatestCard title="सुबह · Morning (ताज़ा)" log={latestMorning} thresholds={thresholds} />
        <LatestCard title="शाम · Evening (ताज़ा)" log={latestEvening} thresholds={thresholds} />
      </div>

      <Segmented
        mode="tabs"
        idPrefix={tabsId}
        options={panelTabOptions(canWrite)}
        value={tab}
        onChange={setTab}
        ariaLabel="BP panel — नया, इतिहास या ट्रेंड"
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
          <div className="grid grid-cols-2 gap-3">
            {/* Read and entered as a pair, so they stay side by side on a phone. */}
            <Field label="Systolic (ऊपर वाला)" hint="mmHg" error={errors.systolic} required>
              <NumberInput
                placeholder="जैसे 128"
                maxLength={3}
                value={systolic}
                onChange={(e) => setSystolic(e.target.value)}
                className="text-xl font-semibold"
              />
            </Field>
            <Field label="Diastolic (नीचे वाला)" hint="mmHg" error={errors.diastolic} required>
              <NumberInput
                placeholder="जैसे 82"
                maxLength={3}
                value={diastolic}
                onChange={(e) => setDiastolic(e.target.value)}
                className="text-xl font-semibold"
              />
            </Field>
          </div>

          {preview ? (
            <p aria-live="polite" className="flex flex-wrap items-center gap-2 text-xs text-ink-muted">
              <BPChip systolic={typedSys} diastolic={typedDia} thresholds={thresholds} />
              <span>इस मरीज़ के लक्ष्य के हिसाब से</span>
            </p>
          ) : null}

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Pulse (नब्ज़)" hint="bpm · वैकल्पिक" error={errors.pulse}>
              <NumberInput placeholder="जैसे 74" maxLength={3} value={pulse} onChange={(e) => setPulse(e.target.value)} />
            </Field>
            <Field label="कब नापा (Time of day)">
              <Select value={period} onChange={(e) => setPeriod(e.target.value)}>
                <option value="Morning">सुबह (Morning)</option>
                <option value="Evening">शाम (Evening)</option>
                <option value="Special">चेकअप (Special)</option>
              </Select>
            </Field>
          </div>
          <Field label="टिप्पणी (Notes)" hint="वैकल्पिक · optional">
            <TextInput
              placeholder="जैसे: दवाई के बाद, 10 मिनट आराम के बाद"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </Field>

          <Button type="submit" variant="primary" loading={saving} className="w-full sm:w-auto">
            <Plus aria-hidden className="h-4 w-4" />
            रीडिंग दर्ज करें (Save BP)
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
          <h3 className="mb-1 text-sm font-semibold text-ink">हाल की रीडिंग · Recent readings</h3>
          <p className="mb-3 text-xs text-ink-subtle">
            पिछली {logs.length} रीडिंग। पुरानी रीडिंग देखने के लिए ट्रेंड टैब में अवधि बदलें।
          </p>
          {logs.length > 0 ? (
            <ul className="divide-y divide-line">
              {logs.map((log) => (
                <li key={log.id} className="flex items-center justify-between gap-2 py-2.5">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <p className="tabular text-base font-semibold text-ink">
                        {log.systolic}/{log.diastolic}
                        <span className="ml-1 text-xs font-normal text-ink-subtle">mmHg</span>
                      </p>
                      <BPChip systolic={log.systolic} diastolic={log.diastolic} thresholds={thresholds} />
                    </div>
                    <p className="mt-0.5 text-xs text-ink-subtle">
                      {periodLabel(log.reading_type)} · {relativeDayLabel(toISTDate(log.measured_at))}, {fmtTime(log.measured_at)}
                      {log.pulse ? ` · नब्ज़ ${log.pulse}` : ""}
                    </p>
                    {log.notes ? <p className="truncate text-xs italic text-ink-subtle">{log.notes}</p> : null}
                  </div>
                  {canWrite ? (
                    <RowActions
                      what={`BP ${log.systolic}/${log.diastolic}`}
                      onEdit={() => setEditing(log)}
                      onDelete={() => void handleDelete(log)}
                    />
                  ) : null}
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState
              icon={HeartPulse}
              title="अभी कोई BP रीडिंग नहीं"
              description="No readings yet."
              action={
                canWrite ? (
                  <Button variant="primary" onClick={() => setTab("form")}>
                    <Plus aria-hidden className="h-4 w-4" />
                    पहली रीडिंग दर्ज करें
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
          <BPTrend patientId={patientId} thresholds={thresholds} />
        </div>
      ) : null}

      <p className="mt-4 flex items-start gap-2 rounded-card border border-info-line bg-info-soft p-3 text-xs text-ink-muted">
        <Info aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-info" />
        <span lang="hi">
          यह स्क्रीन सिर्फ़ रीडिंग दर्ज करती है। यह निदान नहीं करती और दवाई नहीं बदलती। चिंता हो तो डॉक्टर से बात करें; आपात स्थिति में 112 / 108।
        </span>
      </p>

      {editing ? (
        <EditBPModal
          key={editing.id}
          log={editing}
          thresholds={thresholds}
          onClose={() => setEditing(null)}
          onSaved={() => onSuccess?.()}
        />
      ) : null}
    </Card>
  );
}
