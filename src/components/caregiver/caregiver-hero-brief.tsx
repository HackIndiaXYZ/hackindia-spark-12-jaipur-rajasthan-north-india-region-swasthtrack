"use client";

import { useId, useState } from "react";
import Link from "next/link";
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  HeartPulse,
  History,
  Info,
  Moon,
  Pill,
  PlusCircle,
  RefreshCw,
  Scale,
  Sparkles,
  UserCheck,
  Utensils,
  type LucideIcon,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button, IconButton, buttonClasses } from "@/components/ui/button";
import { Card, metricChipClasses, type MetricTone } from "@/components/ui/card";
import { ErrorState } from "@/components/ui/page";
import { ProgressBar } from "@/components/ui/progress-bar";
import { Segmented, segmentedPanelId, segmentedTabId, type SegmentedOption } from "@/components/ui/segmented";
import { Select } from "@/components/ui/form-field";
import { loadErrorMessage, useAsyncData } from "@/components/health/use-async-data";
import { useAuth } from "@/context/auth-context";
import { addDaysIST, todayIST } from "@/lib/health-rules";
import { cn } from "@/lib/utils";
import {
  getCaregiverDailyBrief,
  getCaregiverMonthlyBrief,
  getCaregiverWeeklyBrief,
  type CaregiverAttentionLevel,
  type CaregiverDailyBrief,
  type CaregiverMonthlyBrief,
  type CaregiverWeeklyBrief,
} from "@/services/caregiver-intelligence-service";
import { CaregiverQuickLogModal } from "./caregiver-quick-log-modal";

type CaregiverHeroBriefProps = {
  patientId: string;
  /** The patient's own name from their profile. */
  patientName: string;
};

type ViewMode = "daily" | "weekly" | "monthly";
type DayChoice = "today" | "yesterday";

const VIEW_OPTIONS: SegmentedOption<ViewMode>[] = [
  { value: "daily", label: "Daily", hindiLabel: "दैनिक" },
  { value: "weekly", label: "This week", hindiLabel: "साप्ताहिक" },
  { value: "monthly", label: "This month", hindiLabel: "मासिक" },
];

const DAY_OPTIONS: SegmentedOption<DayChoice>[] = [
  { value: "today", label: "Today", hindiLabel: "आज" },
  { value: "yesterday", label: "Yesterday", hindiLabel: "कल" },
];

const VITAL_STYLE: Record<string, { icon: LucideIcon; tone: MetricTone }> = {
  bp: { icon: HeartPulse, tone: "bp" },
  medicines: { icon: Pill, tone: "meds" },
  food: { icon: Utensils, tone: "food" },
  activity: { icon: Activity, tone: "activity" },
  sleep: { icon: Moon, tone: "sleep" },
  weight: { icon: Scale, tone: "weight" },
};

const LEVEL_STYLE: Record<CaregiverAttentionLevel, { dot: string; label: string }> = {
  IMPORTANT: { dot: "bg-critical", label: "ज़रूरी" },
  ATTENTION: { dot: "bg-attention", label: "ध्यान दें" },
  INFO: { dot: "bg-info", label: "जानकारी" },
};

const WEIGHT_TREND_HI: Record<CaregiverMonthlyBrief["weightTrend"], string> = {
  Stable: "स्थिर (Stable)",
  Gaining: "हल्की बढ़त",
  Losing: "हल्की कमी",
  "Insufficient data": "डेटा कम है",
};

const BP_TREND_HI: Record<CaregiverMonthlyBrief["bpTrend"], string> = {
  Stable: "स्थिर (Stable)",
  Elevated: "लक्ष्य से ऊपर",
  Fluctuating: "घटता-बढ़ता",
  "Insufficient data": "डेटा कम है",
};

function Metric({ label, value, helper }: { label: string; value: string; helper?: string }) {
  const empty = value === "—";
  return (
    <div className="rounded-card border border-line bg-surface-sunken p-3 text-center">
      <span className="block text-2xs font-semibold text-ink-subtle">{label}</span>
      <span className={cn("tabular mt-0.5 block text-sm font-semibold", empty ? "text-ink-subtle" : "text-ink")}>{value}</span>
      {helper ? <span className="block text-2xs text-ink-subtle">{helper}</span> : null}
    </div>
  );
}

function BriefSkeleton() {
  return (
    <div aria-busy="true" aria-label="लोड हो रहा है" className="space-y-3 rounded-panel border border-line bg-surface p-5">
      <div className="skeleton h-6 w-48" />
      <div className="skeleton h-20 rounded-card" />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <div className="skeleton h-20 rounded-card" />
        <div className="skeleton h-20 rounded-card" />
        <div className="skeleton h-20 rounded-card" />
      </div>
    </div>
  );
}

/* ---- Daily ---------------------------------------------------------------------- */

function DailyView({
  brief,
  patientName,
  isToday,
  canWrite,
  onQuickLog,
}: {
  brief: CaregiverDailyBrief;
  patientName: string;
  isToday: boolean;
  canWrite: boolean;
  onQuickLog: () => void;
}) {
  const [showAllAttention, setShowAllAttention] = useState(false);
  const title = isToday ? `आज ${patientName} कैसे रहे?` : `${patientName} — ${brief.dateLabelHi}`;
  const attention = showAllAttention ? brief.attentionItems : brief.attentionItems.slice(0, 3);

  return (
    <Card tone="premium" className="space-y-5">
      <div className="flex flex-col gap-3 border-b border-line pb-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <span className="grid h-12 w-12 shrink-0 place-items-center rounded-card border border-gold-line bg-gold-soft text-gold-ink">
            <Sparkles aria-hidden className="h-6 w-6" />
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 lang="hi" className="text-base font-semibold tracking-tight text-ink sm:text-xl">
                {title}
              </h2>
              <Badge
                variant={
                  brief.routineStatus === "Routine on track" ? "positive" : brief.routineStatus === "Needs attention" ? "attention" : "neutral"
                }
              >
                <span lang="hi">{brief.routineStatusHi}</span>
              </Badge>
            </div>
            <p className="mt-0.5 text-xs text-ink-subtle">Daily health summary · {brief.dateLabelHi}</p>
          </div>
        </div>

        <div className="flex items-center gap-3 self-start sm:self-auto">
          <div className="sm:text-right">
            <span className="block text-2xs font-semibold text-ink-subtle">रूटीन स्कोर</span>
            {brief.isScoreSufficient ? (
              <span className="tabular text-lg font-semibold text-ink">
                {brief.routineScore} <span className="text-xs font-medium text-ink-subtle">/ 100</span>
              </span>
            ) : (
              <span lang="hi" className="text-xs font-medium text-ink-subtle">
                अभी पर्याप्त रिकॉर्ड नहीं
              </span>
            )}
          </div>
          <div aria-hidden className="h-8 w-px bg-line" />
          <div className="text-xs text-ink-subtle">
            <span lang="hi">अंतिम अपडेट</span>
            <span className="block font-medium text-ink-muted">{brief.cachedAt}</span>
          </div>
        </div>
      </div>

      <div className="rounded-card border border-info-line bg-info-soft p-4">
        <div className="flex items-start gap-2.5">
          <Info aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-info" />
          <div className="space-y-1">
            <span lang="hi" className="block text-xs font-semibold text-info">
              संक्षिप्त सारांश
            </span>
            <p lang="hi" className="text-sm leading-relaxed text-ink">
              {brief.naturalLanguageSummaryHi}
            </p>
          </div>
        </div>
      </div>

      <div className="space-y-1.5 rounded-card border border-line bg-surface p-3">
        <ProgressBar value={brief.completenessPercent} max={100} label={`दैनिक ट्रैकिंग पूर्णता: ${brief.completenessLabelHi}`} />
        <p lang="hi" className="text-2xs text-ink-subtle">
          यह सिर्फ़ बताता है कि कितना रिकॉर्ड दर्ज हुआ, सेहत की स्थिति नहीं। ({brief.recordedItemsCount} में से {brief.expectedItemsCount} अपेक्षित चीज़ें दर्ज)
        </p>
      </div>

      <div>
        <h3 className="mb-2.5 text-xs font-semibold text-ink-subtle">
          मुख्य रिकॉर्ड · Snapshot
        </h3>
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
          {Object.entries(brief.snapshot).map(([key, vital]) => {
            const style = VITAL_STYLE[key] ?? { icon: Activity, tone: "neutral" as MetricTone };
            const Icon = style.icon;
            return (
              <div
                key={key}
                className={cn(
                  "rounded-card border p-3",
                  vital.isLogged ? "border-line bg-surface shadow-e1" : "border-dashed border-line-strong bg-surface-sunken",
                )}
              >
                <div className="mb-1.5 flex items-center justify-between gap-2">
                  <span lang="hi" className="truncate text-xs font-semibold text-ink-muted">
                    {vital.labelHi}
                  </span>
                  <span className={cn("grid h-6 w-6 shrink-0 place-items-center rounded-field", metricChipClasses[style.tone])}>
                    <Icon aria-hidden className="h-3.5 w-3.5" />
                  </span>
                </div>
                <p className={cn("tabular text-sm font-semibold sm:text-base", vital.isLogged ? "text-ink" : "text-ink-subtle")}>
                  {vital.value}
                </p>
                {vital.subtext ? <p className="mt-0.5 truncate text-2xs text-ink-subtle">{vital.subtext}</p> : null}
              </div>
            );
          })}
        </div>
      </div>

      <div className="grid gap-3.5 sm:grid-cols-2">
        <div className="space-y-2 rounded-card border border-positive-line bg-positive-soft p-3.5">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-positive sm:text-sm">
            <CheckCircle2 aria-hidden className="h-4 w-4" />
            <span lang="hi">आज के अच्छे बिंदु</span>
          </div>
          {brief.highlights.length > 0 ? (
            <ul lang="hi" className="space-y-1.5 text-xs text-ink-muted">
              {brief.highlights.map((h) => (
                <li key={h} className="flex items-start gap-1.5">
                  <span aria-hidden>•</span>
                  <span>{h}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p lang="hi" className="text-xs text-ink-muted">
              अभी बताने लायक कोई खास बात दर्ज नहीं है।
            </p>
          )}
        </div>

        <div className="space-y-2 rounded-card border border-attention-line bg-attention-soft p-3.5">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-attention sm:text-sm">
              <AlertTriangle aria-hidden className="h-4 w-4" />
              <span lang="hi">ध्यान देने योग्य</span>
            </div>
            {brief.attentionItems.length > 3 ? (
              <Button variant="ghost" size="sm" onClick={() => setShowAllAttention((v) => !v)} aria-expanded={showAllAttention}>
                {showAllAttention ? "कम देखें" : `सभी देखें (${brief.attentionItems.length})`}
              </Button>
            ) : null}
          </div>
          {attention.length > 0 ? (
            <ul className="space-y-2 text-xs">
              {attention.map((item) => (
                <li key={item.id} className="flex items-start gap-2">
                  <span aria-hidden className={cn("mt-1.5 h-2 w-2 shrink-0 rounded-full", LEVEL_STYLE[item.level].dot)} />
                  <div>
                    <span className="sr-only">{LEVEL_STYLE[item.level].label}: </span>
                    <span lang="hi" className="font-medium text-ink">
                      {item.textHi}
                    </span>
                    {item.detail ? <span className="block text-2xs text-ink-subtle">{item.detail}</span> : null}
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p lang="hi" className="text-xs text-ink-muted">
              इस समय कोई लंबित चेतावनी नहीं है।
            </p>
          )}
        </div>
      </div>

      {brief.todayVsUsual.length > 0 ? (
        <div className="space-y-2">
          <h3 className="text-xs font-semibold text-ink-subtle">
            {isToday ? "आज" : "इस दिन"} बनाम सामान्य · vs usual
          </h3>
          <div className="grid gap-2.5 sm:grid-cols-3">
            {brief.todayVsUsual.map((c) => (
              <div key={c.metric} className="space-y-1 rounded-card border border-line bg-surface p-3 shadow-e1">
                <div className="flex items-center justify-between gap-2 text-xs font-semibold text-ink">
                  <span lang="hi">{c.metricHi}</span>
                  <span lang="hi" className="text-2xs font-normal text-ink-subtle">
                    भरोसा: {c.confidence === "High" ? "अच्छा" : c.confidence === "Medium" ? "मध्यम" : "कम डेटा"}
                  </span>
                </div>
                <p className="text-xs text-ink-muted">
                  <span lang="hi">{isToday ? "आज" : "इस दिन"}: {c.todayValueStr}</span>
                  <span lang="hi" className="ml-1 text-ink-subtle">
                    (सामान्य: {c.usualValueStr})
                  </span>
                </p>
                <p lang="hi" className="text-xs font-medium text-ink-muted">
                  {c.comparisonTextHi}
                </p>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <div className="flex flex-col items-stretch justify-between gap-3 border-t border-line pt-3 sm:flex-row sm:items-center">
        <p lang="hi" className="flex items-start gap-2 text-xs text-ink-muted">
          <Sparkles aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-info" />
          <span>
            <strong className="font-semibold text-ink">क्या बदला:</strong> {brief.whatChangedCompactHi}
          </span>
        </p>
        <div className="no-print flex shrink-0 items-center gap-2 print:hidden">
          <Link href="/insights/changes" className={buttonClasses({ variant: "secondary", size: "sm" })}>
            बदलाव का विवरण
          </Link>
          <Link href="/timeline" className={buttonClasses({ variant: "secondary", size: "sm" })}>
            <History aria-hidden className="h-3.5 w-3.5" />
            स्वास्थ्य यात्रा
          </Link>
        </div>
      </div>

      {canWrite ? (
        <div className="no-print text-center print:hidden">
          <Button variant="primary" size="lg" onClick={onQuickLog} className="w-full sm:w-auto">
            <PlusCircle aria-hidden className="h-4 w-4" />
            {patientName} के लिए रिकॉर्ड जोड़ें
          </Button>
        </div>
      ) : null}
    </Card>
  );
}

/* ---- Weekly / Monthly ----------------------------------------------------------- */

function WeeklyView({ brief, patientName }: { brief: CaregiverWeeklyBrief; patientName: string }) {
  const has = brief.hasData;
  return (
    <Card className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line pb-3">
        <div className="min-w-0">
          <h2 lang="hi" className="text-base font-semibold text-ink sm:text-lg">
            {patientName} — इस हफ़्ते का सारांश
          </h2>
          <p className="text-xs text-ink-subtle">
            {brief.weekStartStr} से {brief.weekEndStr} · औसत और नियमितता
          </p>
        </div>
        <Badge variant="neutral">
          रूटीन स्कोर: {brief.routineScoreIsSufficient ? brief.routineScore : "—"}
        </Badge>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Metric label="औसत BP" value={has.bp ? brief.avgBP : "—"} helper={has.bp ? undefined : "रीडिंग नहीं"} />
        <Metric label="औसत कदम" value={has.steps ? `${brief.avgSteps.toLocaleString("en-IN")} / दिन` : "—"} helper={has.steps ? undefined : "डेटा नहीं"} />
        <Metric label="औसत नींद" value={has.sleep ? `${brief.avgSleepHours} घंटे` : "—"} helper={has.sleep ? undefined : "डेटा नहीं"} />
        <Metric
          label="दवा पालन"
          value={brief.medAdherencePercent === null ? "—" : `${brief.medAdherencePercent}%`}
          helper={brief.medAdherencePercent === null ? "दवा का डेटा नहीं" : undefined}
        />
      </div>

      <p className="text-xs text-ink-muted">
        <span lang="hi">डेटा पूर्णता: {brief.dataCompletenessPercent}%</span>
      </p>

      {brief.topChanges.length > 0 ? (
        <div className="space-y-1 rounded-card border border-info-line bg-info-soft p-3.5 text-xs">
          <span lang="hi" className="block font-semibold text-info">
            इस हफ़्ते के मुख्य बदलाव
          </span>
          {brief.topChanges.map((c) => (
            <p key={c} lang="hi" className="text-ink-muted">
              • {c}
            </p>
          ))}
        </div>
      ) : (
        <p lang="hi" className="text-xs text-ink-subtle">
          तुलना के लिए अभी पर्याप्त डेटा नहीं है।
        </p>
      )}
    </Card>
  );
}

function MonthlyView({ brief, patientName }: { brief: CaregiverMonthlyBrief; patientName: string }) {
  const has = brief.hasData;
  return (
    <Card className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line pb-3">
        <div className="min-w-0">
          <h2 lang="hi" className="text-base font-semibold text-ink sm:text-lg">
            {patientName} — पिछले 30 दिनों का रुझान
          </h2>
          <p className="text-xs text-ink-subtle">{brief.monthLabel}</p>
        </div>
        <Badge variant="neutral">
          औसत स्कोर: {brief.routineScoreIsSufficient ? brief.routineScore : "—"}
        </Badge>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Metric label="वजन ट्रेंड" value={WEIGHT_TREND_HI[brief.weightTrend]} />
        <Metric label="BP ट्रेंड" value={BP_TREND_HI[brief.bpTrend]} />
        <Metric label="औसत कदम" value={has.steps ? brief.stepsAvg.toLocaleString("en-IN") : "—"} helper={has.steps ? undefined : "डेटा नहीं"} />
        <Metric
          label="दवा पालन"
          value={brief.medAdherencePercent === null ? "—" : `${brief.medAdherencePercent}%`}
          helper={brief.medAdherencePercent === null ? "दवा का डेटा नहीं" : undefined}
        />
      </div>

      {brief.notableChanges.length > 0 ? (
        <div className="space-y-1.5 rounded-card border border-line bg-surface-sunken p-3.5 text-xs">
          <span lang="hi" className="block font-semibold text-ink">
            महीने के मुख्य बिंदु
          </span>
          {brief.notableChanges.map((item) => (
            <p key={item} lang="hi" className="text-ink-muted">
              • {item}
            </p>
          ))}
        </div>
      ) : null}
    </Card>
  );
}

/* ---- Container ------------------------------------------------------------------ */

export function CaregiverHeroBrief({ patientId, patientName }: CaregiverHeroBriefProps) {
  const { authorizedPatients, setActivePatientId, canWrite } = useAuth();
  const tabsId = useId();
  const patientSelectId = useId();
  const today = todayIST();
  const yesterday = addDaysIST(today, -1);

  const [viewMode, setViewMode] = useState<ViewMode>("daily");
  const [selectedDate, setSelectedDate] = useState(today);
  const [isQuickLogOpen, setIsQuickLogOpen] = useState(false);

  const daily = useAsyncData(() => getCaregiverDailyBrief(patientId, selectedDate), [patientId, selectedDate], viewMode === "daily");
  const weekly = useAsyncData(() => getCaregiverWeeklyBrief(patientId), [patientId], viewMode === "weekly");
  const monthly = useAsyncData(() => getCaregiverMonthlyBrief(patientId), [patientId], viewMode === "monthly");
  const active = viewMode === "daily" ? daily : viewMode === "weekly" ? weekly : monthly;

  const dayChoice: DayChoice = selectedDate === yesterday ? "yesterday" : "today";

  return (
    <div className="space-y-4">
      <div className="no-print flex flex-wrap items-end justify-between gap-3 rounded-card border border-line bg-surface p-3 shadow-e1 print:hidden">
        {authorizedPatients.length > 1 ? (
          <div className="min-w-0 flex-1 sm:max-w-xs">
            <label htmlFor={patientSelectId} className="mb-1 flex items-center gap-1.5 text-xs font-medium text-ink-muted">
              <UserCheck aria-hidden className="h-3.5 w-3.5 text-brand" />
              मरीज़ चुनें (Viewing)
            </label>
            <Select id={patientSelectId} value={patientId} onChange={(e) => setActivePatientId(e.target.value)}>
              {authorizedPatients.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </Select>
          </div>
        ) : (
          <p className="flex items-center gap-2 text-sm font-semibold text-ink">
            <UserCheck aria-hidden className="h-4 w-4 text-brand" />
            <span className="text-xs font-medium text-ink-muted">Viewing:</span>
            {patientName}
          </p>
        )}

        <div className="flex items-center gap-2">
          {viewMode === "daily" ? (
            <Segmented
              options={DAY_OPTIONS}
              value={dayChoice}
              onChange={(v) => setSelectedDate(v === "yesterday" ? yesterday : today)}
              ariaLabel="Day — दिन चुनें"
              size="sm"
            />
          ) : null}
          <IconButton aria-label="रिफ्रेश करें (Refresh)" loading={active.refreshing} onClick={active.reload}>
            <RefreshCw aria-hidden className="h-4 w-4" />
          </IconButton>
        </div>
      </div>

      <Segmented
        mode="tabs"
        idPrefix={tabsId}
        options={VIEW_OPTIONS}
        value={viewMode}
        onChange={setViewMode}
        ariaLabel="Brief period — अवधि"
        className="no-print print:hidden"
      />

      <div role="tabpanel" id={segmentedPanelId(tabsId, viewMode)} aria-labelledby={segmentedTabId(tabsId, viewMode)}>
        {active.error ? (
          <ErrorState
            title="ब्रीफ लोड नहीं हो पाया"
            englishTitle="The brief could not be loaded"
            description={loadErrorMessage(active.error)}
            onRetry={active.reload}
          />
        ) : active.loading || !active.data ? (
          <BriefSkeleton />
        ) : viewMode === "daily" ? (
          <DailyView
            brief={daily.data!}
            patientName={patientName}
            isToday={selectedDate === today}
            canWrite={canWrite}
            onQuickLog={() => setIsQuickLogOpen(true)}
          />
        ) : viewMode === "weekly" ? (
          <WeeklyView brief={weekly.data!} patientName={patientName} />
        ) : (
          <MonthlyView brief={monthly.data!} patientName={patientName} />
        )}
      </div>

      {canWrite ? (
        <CaregiverQuickLogModal
          isOpen={isQuickLogOpen}
          onClose={() => setIsQuickLogOpen(false)}
          patientId={patientId}
          patientName={patientName}
          onSuccess={daily.reload}
        />
      ) : null}
    </div>
  );
}
