"use client";

import type { ReactNode } from "react";
import { Footprints, HeartPulse, Moon, Plus, Scale, type LucideIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { IconButton } from "@/components/ui/button";
import { Sparkline } from "@/components/ui/sparkline";
import { BPChip } from "@/components/health/bp-chip";
import { fmtDateStrWeekday, fmtKg, fmtNum, fmtTime, relativeDayLabel } from "@/components/health/format";
import { trackerChipClasses, type PanelTone } from "@/components/health/panel-parts";
import { SLEEP_SHORT_HOURS, toISTDate, todayIST, type BPThresholds } from "@/lib/health-rules";
import { cn } from "@/lib/utils";
import type {
  ActivityLogEntry,
  BPLogEntry,
  SleepLogEntry,
  WeightLogEntry,
} from "@/services/patient-service";

export type Tracker = "bp" | "weight" | "sleep" | "activity";

const nf = new Intl.NumberFormat("en-IN");

/** Newest-first rows to an oldest-first series of the last `n` values, as the sparkline wants. */
function series<T>(rows: T[], pick: (row: T) => number, n = 14): number[] {
  return rows
    .slice(0, n)
    .map(pick)
    .filter((v) => Number.isFinite(v))
    .reverse();
}

function OverviewCard({
  tone,
  icon: Icon,
  title,
  hindiTitle,
  onOpen,
  onAdd,
  addLabel,
  spark,
  children,
}: {
  tone: PanelTone;
  icon: LucideIcon;
  title: string;
  hindiTitle: string;
  onOpen: () => void;
  /** Omitted for viewers, who cannot add. */
  onAdd?: () => void;
  addLabel: string;
  spark: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="gilt gilt-press relative rounded-card">
      <button
        type="button"
        onClick={onOpen}
        aria-label={`${title} — ${hindiTitle}: खोलें (Open)`}
        className={cn("block w-full cursor-pointer rounded-card p-4 text-left", onAdd && "pr-16")}
      >
        <span className="flex items-center gap-2.5">
          <span aria-hidden className={cn("grid h-9 w-9 shrink-0 place-items-center rounded-control border", trackerChipClasses[tone])}>
            <Icon className="h-[18px] w-[18px]" />
          </span>
          <span className="min-w-0">
            <span className="block text-sm font-semibold text-ink">{title}</span>
            <span lang="hi" className="block text-xs text-ink-muted">
              {hindiTitle}
            </span>
          </span>
        </span>
        {/* Number beside the trail when the card is wide enough, under it when it is not. */}
        <span className="@container mt-3 block">
          <span className="flex flex-col gap-3 @[17rem]:flex-row @[17rem]:items-end @[17rem]:justify-between">
            <span className="block min-w-0 flex-1">{children}</span>
            <span className="block w-full max-w-40 shrink-0 @[17rem]:w-28">{spark}</span>
          </span>
        </span>
      </button>
      {onAdd ? (
        <IconButton
          variant="quiet"
          onClick={onAdd}
          aria-label={addLabel}
          className="absolute right-3 top-3"
        >
          <Plus aria-hidden className="h-4 w-4" />
        </IconButton>
      ) : null}
    </div>
  );
}

function Big({ children, unit }: { children: ReactNode; unit?: string }) {
  return (
    <span className="flex items-baseline gap-1.5 text-3xl font-semibold leading-none tracking-tight text-ink">
      <span>{children}</span>
      {unit ? <span className="text-xs font-medium tracking-normal text-ink-muted">{unit}</span> : null}
    </span>
  );
}

function Empty({ children }: { children: ReactNode }) {
  return (
    <>
      <Big>
        <span className="text-ink-subtle">—</span>
      </Big>
      <span lang="hi" className="mt-2 block text-xs text-ink-muted">
        {children}
      </span>
    </>
  );
}

/**
 * "All": one calm card per tracker with its latest number and a short trail,
 * instead of four full panels stacked. Tapping a card opens that tracker; the
 * plus opens it on its entry form.
 */
export function HealthOverview({
  bp,
  weight,
  sleep,
  activity,
  thresholds,
  targetWeight,
  targetHours,
  targetSteps,
  canWrite,
  onOpen,
}: {
  bp: BPLogEntry[];
  weight: WeightLogEntry[];
  sleep: SleepLogEntry[];
  activity: ActivityLogEntry[];
  thresholds: BPThresholds;
  targetWeight?: number | null;
  targetHours: number;
  targetSteps: number;
  canWrite: boolean;
  /** `entry` asks for the New tab. */
  onOpen: (tracker: Tracker, entry?: boolean) => void;
}) {
  const today = todayIST();
  const bpLatest = bp[0];
  const wLatest = weight[0];
  const sLatest = sleep[0];
  const aLatest = activity[0];
  const wKg = wLatest ? Number(wLatest.weight_kg) : null;
  const wDiff = wKg !== null && targetWeight ? Number((wKg - targetWeight).toFixed(1)) : null;
  const sHours = sLatest ? Number(sLatest.sleep_hours) : null;

  const add = (tracker: Tracker) => (canWrite ? () => onOpen(tracker, true) : undefined);

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <OverviewCard
        tone="bp"
        icon={HeartPulse}
        title="Blood Pressure"
        hindiTitle="रक्तचाप"
        onOpen={() => onOpen("bp")}
        onAdd={add("bp")}
        addLabel="नई BP रीडिंग दर्ज करें (Add BP)"
        spark={
          <Sparkline
            values={series(bp, (l) => l.systolic)}
            tone="bp"
            width={112}
            height={40}
            label="ऊपर के BP का हाल का ट्रेंड"
          />
        }
      >
        {bpLatest ? (
          <>
            <Big unit="mmHg">
              {bpLatest.systolic}/{bpLatest.diastolic}
            </Big>
            <span className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-ink-muted">
              <BPChip systolic={bpLatest.systolic} diastolic={bpLatest.diastolic} thresholds={thresholds} />
              <span>
                <span lang="hi">{relativeDayLabel(toISTDate(bpLatest.measured_at), today)}</span>, {fmtTime(bpLatest.measured_at)}
              </span>
            </span>
          </>
        ) : (
          <Empty>अभी कोई रीडिंग नहीं</Empty>
        )}
      </OverviewCard>

      <OverviewCard
        tone="weight"
        icon={Scale}
        title="Body Weight"
        hindiTitle="वजन"
        onOpen={() => onOpen("weight")}
        onAdd={add("weight")}
        addLabel="नया वजन दर्ज करें (Add weight)"
        spark={
          <Sparkline
            values={series(weight, (l) => Number(l.weight_kg), 10)}
            tone="weight"
            width={112}
            height={40}
            label="वजन का हाल का ट्रेंड"
          />
        }
      >
        {wLatest && wKg !== null ? (
          <>
            <Big unit="kg">{fmtKg(wLatest.weight_kg)}</Big>
            <span className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-ink-muted">
              {wDiff !== null ? (
                <Badge variant="neutral" lang="hi">
                  लक्ष्य से {wDiff === 0 ? "बराबर" : `${Math.abs(wDiff)} kg ${wDiff > 0 ? "ज़्यादा" : "कम"}`}
                </Badge>
              ) : null}
              <span lang="hi">{relativeDayLabel(toISTDate(wLatest.measured_at), today)}</span>
            </span>
          </>
        ) : (
          <Empty>अभी कोई वजन दर्ज नहीं</Empty>
        )}
      </OverviewCard>

      <OverviewCard
        tone="sleep"
        icon={Moon}
        title="Sleep"
        hindiTitle="नींद"
        onOpen={() => onOpen("sleep")}
        onAdd={add("sleep")}
        addLabel="नींद दर्ज करें (Log sleep)"
        spark={
          <Sparkline
            values={series(sleep, (l) => Number(l.sleep_hours))}
            tone="sleep"
            width={112}
            height={40}
            label="नींद का हाल का ट्रेंड"
          />
        }
      >
        {sLatest && sHours !== null ? (
          <>
            <Big unit="घंटे">{fmtNum(sHours, 1)}</Big>
            <span className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-ink-muted">
              {sHours >= targetHours ? (
                <Badge variant="positive" lang="hi">
                  लक्ष्य पूरा
                </Badge>
              ) : sHours < SLEEP_SHORT_HOURS ? (
                <Badge variant="attention" lang="hi">
                  कम नींद
                </Badge>
              ) : null}
              <span>{fmtDateStrWeekday(sLatest.date)}</span>
            </span>
          </>
        ) : (
          <Empty>अभी कोई रिकॉर्ड नहीं</Empty>
        )}
      </OverviewCard>

      <OverviewCard
        tone="activity"
        icon={Footprints}
        title="Daily steps"
        hindiTitle="कदम"
        onOpen={() => onOpen("activity")}
        onAdd={add("activity")}
        addLabel="कदम दर्ज करें (Log steps)"
        spark={
          <Sparkline
            values={series(activity, (l) => l.steps || 0)}
            tone="activity"
            width={112}
            height={40}
            label="कदमों का हाल का ट्रेंड"
          />
        }
      >
        {aLatest ? (
          <>
            <Big unit="कदम">{nf.format(aLatest.steps || 0)}</Big>
            <span className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-ink-muted">
              {(aLatest.steps || 0) >= targetSteps ? (
                <Badge variant="positive" lang="hi">
                  लक्ष्य पूरा
                </Badge>
              ) : (
                <span lang="hi">लक्ष्य का {Math.round(((aLatest.steps || 0) / targetSteps) * 100)}%</span>
              )}
              <span>{aLatest.date === today ? <span lang="hi">आज</span> : fmtDateStrWeekday(aLatest.date)}</span>
            </span>
          </>
        ) : (
          <Empty>अभी कोई रिकॉर्ड नहीं</Empty>
        )}
      </OverviewCard>
    </div>
  );
}
