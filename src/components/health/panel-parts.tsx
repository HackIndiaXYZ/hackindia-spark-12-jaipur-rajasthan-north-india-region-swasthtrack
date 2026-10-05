"use client";

import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from "react";
import { Edit3, Info, Trash2, type LucideIcon } from "lucide-react";
import { Button, IconButton } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { ErrorState } from "@/components/ui/page";
import { Segmented, segmentedPanelId, segmentedTabId, type SegmentedOption } from "@/components/ui/segmented";
import { fmtDateStr, fmtDateStrWeekday, fmtWeekdayShort, relativeDayLabel } from "@/components/health/format";
import { loadErrorMessage, useAsyncData } from "@/components/health/use-async-data";
import { istRangeBounds, todayIST } from "@/lib/health-rules";
import { cn } from "@/lib/utils";

/** Rows the page loads per tracker, and the step of "show older". */
export const HISTORY_PAGE = 30;

/* ---- Trend range ---------------------------------------------------------- */

export type ChartRange = "7d" | "30d" | "3m" | "1y" | "all";

const RANGE_DAYS: Record<Exclude<ChartRange, "all">, number> = { "7d": 7, "30d": 30, "3m": 90, "1y": 365 };

export const RANGE_OPTIONS: SegmentedOption<ChartRange>[] = [
  { value: "7d", label: "7 दिन" },
  { value: "30d", label: "30 दिन" },
  { value: "3m", label: "3 महीने" },
  { value: "1y", label: "1 साल" },
  { value: "all", label: "सभी" },
];

export type RangeWindow = {
  startDate: string;
  endDate: string;
  /** False for "all time": the start is only a floor for the query, the chart spans the data it gets. */
  fixed: boolean;
};

/** Inclusive IST window ending today. "all" reaches back far enough to hold every record. */
export function rangeWindow(range: ChartRange): RangeWindow {
  if (range === "all") return { startDate: "2000-01-01", endDate: todayIST(), fixed: false };
  const { startDate, endDate } = istRangeBounds(RANGE_DAYS[range]);
  return { startDate, endDate, fixed: true };
}

export function RangeSelector({
  value,
  onChange,
  ariaLabel,
}: {
  value: ChartRange;
  onChange: (value: ChartRange) => void;
  ariaLabel: string;
}) {
  return <Segmented options={RANGE_OPTIONS} value={value} onChange={onChange} ariaLabel={ariaLabel} size="sm" />;
}

/**
 * Loads the records of a trend window. Switching the range keeps the previous
 * chart on screen (dimmed, `stale`) until the new one arrives, so the frame
 * never collapses to a skeleton and jumps.
 */
export function useRangeData<T>(
  load: (startDate: string, endDate: string) => Promise<T[]>,
  patientId: string,
  range: ChartRange,
) {
  const win = rangeWindow(range);
  const res = useAsyncData(() => load(win.startDate, win.endDate), [patientId, range, win.endDate]);

  // Remember the last window that finished loading (state derived during render,
  // the pattern React documents for "adjusting state when a prop changes").
  const [kept, setKept] = useState<{ data: T[]; win: RangeWindow } | null>(null);
  if (res.data && (!kept || kept.data !== res.data)) setKept({ data: res.data, win });

  const fresh = res.data !== null;
  return {
    data: res.data ?? kept?.data ?? null,
    win: fresh ? win : (kept?.win ?? win),
    error: res.error,
    /** Nothing to show yet. */
    loading: !fresh && !kept && !res.error,
    /** A new window is loading over the previous one. */
    stale: !fresh && kept !== null && !res.error,
    reload: res.reload,
  };
}

/** Range chips + the loading / error / stale handling every trend tab shares. */
export function TrendShell({
  range,
  onRangeChange,
  ariaLabel,
  loading,
  stale,
  error,
  onRetry,
  children,
}: {
  range: ChartRange;
  onRangeChange: (range: ChartRange) => void;
  ariaLabel: string;
  loading: boolean;
  stale: boolean;
  error: unknown;
  onRetry: () => void;
  children: ReactNode;
}) {
  return (
    <div className="space-y-4">
      <RangeSelector value={range} onChange={onRangeChange} ariaLabel={ariaLabel} />
      {error ? (
        <ErrorState
          title="ट्रेंड लोड नहीं हो पाया"
          englishTitle="Could not load the trend"
          description={loadErrorMessage(error)}
          onRetry={onRetry}
        />
      ) : loading ? (
        <ChartSkeleton />
      ) : (
        <div aria-busy={stale} className={cn("space-y-4 transition-opacity duration-200", stale && "opacity-60")}>
          {children}
        </div>
      )}
    </div>
  );
}

/* ---- Panel tabs (New / History / Trend) ------------------------------------ */

export type PanelTab = "form" | "history" | "chart";

export function panelTabOptions(canWrite: boolean): SegmentedOption<PanelTab>[] {
  const all: SegmentedOption<PanelTab>[] = [
    // No icons: with them the three tabs are wider than a phone and the strip would scroll.
    { value: "form", label: "New", hindiLabel: "नया" },
    { value: "history", label: "History", hindiLabel: "इतिहास" },
    { value: "chart", label: "Trend", hindiLabel: "ट्रेंड" },
  ];
  // Viewers cannot add readings, so the form tab is not offered at all.
  return canWrite ? all : all.filter((o) => o.value !== "form");
}

/* ---- Panel frame ------------------------------------------------------------- */

export type PanelTone = "bp" | "weight" | "sleep" | "activity";

export const trackerChipClasses: Record<PanelTone, string> = {
  bp: "border-bp-line bg-bp-soft text-bp",
  weight: "border-weight-line bg-weight-soft text-weight",
  sleep: "border-sleep-line bg-sleep-soft text-sleep",
  activity: "border-activity-line bg-activity-soft text-activity",
};

/**
 * One tracker as a card: identity header, the latest-reading hero, then the
 * New / History / Trend tabs and the active tab's content. The four trackers
 * all use it so they behave and read the same.
 */
export function PanelFrame({
  icon: Icon,
  tone,
  title,
  hindiTitle,
  subtitle,
  hero,
  tab,
  onTabChange,
  canWrite,
  ariaLabel,
  form,
  history,
  chart,
  footnote,
  active = true,
}: {
  icon: LucideIcon;
  tone: PanelTone;
  title: string;
  hindiTitle: string;
  subtitle: ReactNode;
  hero: ReactNode;
  tab: PanelTab;
  onTabChange: (tab: PanelTab) => void;
  canWrite: boolean;
  ariaLabel: string;
  form: ReactNode;
  history: ReactNode;
  chart: ReactNode;
  footnote?: ReactNode;
  /** False while another tracker is showing: the chart is not mounted (it cannot be measured when hidden). */
  active?: boolean;
}) {
  const tabsId = useId();
  const headingId = useId();
  // A viewer who somehow holds "form" still lands on a tab that exists.
  const current: PanelTab = tab === "form" && !canWrite ? "history" : tab;

  const body: Record<PanelTab, ReactNode> = {
    form: canWrite ? form : null,
    history,
    chart: active ? chart : null,
  };

  return (
    <Card aria-labelledby={headingId} className="space-y-4">
      <header className="flex items-center gap-3">
        <span
          aria-hidden
          className={cn("grid h-11 w-11 shrink-0 place-items-center rounded-control border", trackerChipClasses[tone])}
        >
          <Icon className="h-5 w-5" />
        </span>
        <div className="min-w-0">
          <CardTitle className="flex flex-wrap items-baseline gap-x-2">
            <span id={headingId}>{title}</span>
            <span lang="hi" className="text-sm font-normal text-ink-muted">
              {hindiTitle}
            </span>
          </CardTitle>
          <p className="text-sm text-ink-muted">{subtitle}</p>
        </div>
      </header>

      {hero}

      <div>
        <Segmented
          mode="tabs"
          idPrefix={tabsId}
          options={panelTabOptions(canWrite)}
          value={current}
          onChange={onTabChange}
          ariaLabel={ariaLabel}
          size="sm"
          className="mb-2"
        />
        <div
          role="tabpanel"
          id={segmentedPanelId(tabsId, current)}
          aria-labelledby={segmentedTabId(tabsId, current)}
          tabIndex={-1}
          className="focus-visible:outline-none"
        >
          {body[current]}
        </div>
      </div>

      {footnote ? (
        <p className="flex items-start gap-2 text-xs text-ink-subtle">
          <Info aria-hidden className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span lang="hi">{footnote}</span>
        </p>
      ) : null}
    </Card>
  );
}

/* ---- Hero ---------------------------------------------------------------------- */

/**
 * The latest-reading number: large, proportional figures and a quiet unit.
 * Sits in a frosted `.tile` so it lifts off the gilt card.
 */
export function HeroTile({
  label,
  children,
  className,
}: {
  label: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("tile min-w-0 rounded-card p-4", className)}>
      <p className="text-xs font-semibold text-ink-muted">{label}</p>
      {children}
    </div>
  );
}

export function HeroNumber({
  value,
  unit,
  stacked = false,
  className,
}: {
  value: ReactNode;
  unit?: string;
  /** Put the unit under the number, for a number that shares a narrow row (BP in two columns). */
  stacked?: boolean;
  className?: string;
}) {
  return (
    <p
      className={cn(
        "mt-1 text-4xl font-semibold leading-none tracking-tight text-ink",
        stacked ? "block" : "flex items-baseline gap-1.5",
        className,
      )}
    >
      <span className="min-w-0">{value}</span>
      {unit ? (
        <span className={cn("text-xs font-medium tracking-normal text-ink-muted", stacked && "mt-1.5 block")}>{unit}</span>
      ) : null}
    </p>
  );
}

/* ---- Loading placeholder for lazily loaded charts --------------------------- */

export function ChartSkeleton() {
  return <div aria-hidden className="skeleton h-64 w-full rounded-card" />;
}

/* ---- History ------------------------------------------------------------------ */

/** "आज · Mon, 5 Oct" / "कल · …" / "Sat, 3 Oct" (with the year once it is not this year). */
export function dayHeading(dateStr: string, today: string = todayIST()): string {
  const base = fmtDateStrWeekday(dateStr);
  const year = dateStr.slice(0, 4);
  const withYear = year === today.slice(0, 4) ? base : `${base} ${year}`;
  const rel = relativeDayLabel(dateStr, today);
  return rel === "आज" || rel === "कल" ? `${rel} · ${withYear}` : withYear;
}

/** Splits an already sorted list into consecutive runs sharing one date. */
export function groupByDate<T>(rows: T[], dateOf: (row: T) => string): Array<{ date: string; rows: T[] }> {
  const groups: Array<{ date: string; rows: T[] }> = [];
  for (const row of rows) {
    const date = dateOf(row);
    const last = groups[groups.length - 1];
    if (last && last.date === date) last.rows.push(row);
    else groups.push({ date, rows: [row] });
  }
  return groups;
}

/** A frosted list of history rows. */
export function HistoryList({ children, label }: { children: ReactNode; label?: string }) {
  return (
    <ul aria-label={label} className="tile divide-y divide-line rounded-card px-3">
      {children}
    </ul>
  );
}

/** One day of history: a quiet date heading over a frosted list. */
export function HistoryDay({ date, children }: { date: string; children: ReactNode }) {
  return (
    <section>
      <h4 className="mb-1.5 px-1 text-xs font-semibold text-ink-muted">{dayHeading(date)}</h4>
      <HistoryList>{children}</HistoryList>
    </section>
  );
}

/** The date column of a history row that stands on its own (one record per day): "5 Oct" over "Mon". */
export function DateLead({ date }: { date: string }) {
  const year = date.slice(0, 4);
  const thisYear = todayIST().slice(0, 4);
  return (
    <div className="w-14 shrink-0 text-xs">
      <p className="font-semibold text-ink">{fmtDateStr(date)}</p>
      <p className="text-ink-subtle">
        {fmtWeekdayShort(date)}
        {year !== thisYear ? ` ’${year.slice(2)}` : ""}
      </p>
    </div>
  );
}

export function HistoryRow({
  lead,
  children,
  actions,
}: {
  lead?: ReactNode;
  children: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <li className="flex min-h-14 items-center gap-3 py-2">
      {lead}
      <div className="min-w-0 flex-1">{children}</div>
      {actions}
    </li>
  );
}

/** Edit / delete buttons on a history row. */
export function RowActions({
  onEdit,
  onDelete,
  what,
}: {
  onEdit: () => void;
  onDelete: () => void;
  /** Spoken label suffix, e.g. "BP 128/82". */
  what: string;
}) {
  return (
    <div className="-mr-2 flex shrink-0 items-center">
      <IconButton variant="ghost" onClick={onEdit} aria-label={`बदलें (Edit) — ${what}`}>
        <Edit3 aria-hidden className="h-4 w-4" />
      </IconButton>
      <IconButton variant="ghost" onClick={onDelete} aria-label={`मिटाएँ (Delete) — ${what}`}>
        <Trash2 aria-hidden className="h-4 w-4" />
      </IconButton>
    </div>
  );
}

/**
 * History beyond the first page. The page hands the newest `pageSize` rows
 * down; this fetches more on request and keeps them current after an edit or a
 * delete (`refresh`), so the list never shows a record that was just removed.
 */
export function useHistoryPager<T>({
  base,
  pageSize,
  fetchRows,
}: {
  base: T[];
  pageSize: number;
  fetchRows: (limit: number) => Promise<T[]>;
}) {
  const [limit, setLimit] = useState(pageSize);
  const [extra, setExtra] = useState<T[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);

  const fetchRef = useRef(fetchRows);
  useEffect(() => {
    fetchRef.current = fetchRows;
  });
  const request = useRef(0);

  const load = useCallback(async (next: number) => {
    const id = ++request.current;
    setLoading(true);
    setFailed(false);
    try {
      const rows = await fetchRef.current(next);
      if (id !== request.current) return;
      setExtra(rows);
      setLimit(next);
    } catch {
      if (id === request.current) setFailed(true);
    } finally {
      if (id === request.current) setLoading(false);
    }
  }, []);

  const rows = limit > pageSize && extra ? extra : base;
  return {
    rows,
    hasMore: rows.length >= limit,
    loading,
    failed,
    loadMore: () => void load(limit + pageSize),
    /** Call after the panel changed a record, so an extended list is re-read. */
    refresh: () => {
      if (limit > pageSize) void load(limit);
    },
  };
}

export function LoadMoreButton({
  loading,
  failed,
  onClick,
  what,
}: {
  loading: boolean;
  failed: boolean;
  onClick: () => void;
  /** "रीडिंग" / "तौल" / "रातें" / "दिन" */
  what: string;
}) {
  return (
    <div className="pt-1 text-center">
      {failed ? (
        <p role="alert" className="mb-2 text-xs font-medium text-critical">
          <span lang="hi">और {what} लोड नहीं हो पाईं। इंटरनेट जाँचकर फिर कोशिश करें।</span>
        </p>
      ) : null}
      <Button variant="secondary" loading={loading} onClick={onClick} className="w-full sm:w-auto">
        <span lang="hi">और पुरानी {what} दिखाएँ</span>
      </Button>
    </div>
  );
}

/** The heading above a history list: its title and how many records are loaded. */
export function HistoryHeading({ title, count, unit }: { title: string; count: number; unit: string }) {
  return (
    <div className="mb-3 flex items-baseline justify-between gap-2">
      <h3 className="text-sm font-semibold text-ink">{title}</h3>
      <span className="text-xs text-ink-subtle">
        <span className="tabular">{count}</span> <span lang="hi">{unit}</span>
      </span>
    </div>
  );
}

/* ---- Small stat tile -------------------------------------------------------- */

const tileTone = {
  neutral: "tile",
  positive: "border border-positive-line bg-positive-soft",
  attention: "border border-attention-line bg-attention-soft",
  critical: "border border-critical-line bg-critical-soft",
  info: "border border-info-line bg-info-soft",
} as const;

export function StatTile({
  label,
  value,
  unit,
  helper,
  tone = "neutral",
}: {
  label: string;
  value: string | number | null;
  unit?: string;
  helper?: string;
  tone?: keyof typeof tileTone;
}) {
  const has = value !== null && value !== "";
  return (
    <div className={cn("rounded-card p-3", tileTone[tone])}>
      <p className="text-xs font-medium text-ink-muted">{label}</p>
      <p className="mt-1 text-xl font-semibold tracking-tight text-ink">
        {has ? value : "—"}
        {has && unit ? <span className="ml-1 text-xs font-medium tracking-normal text-ink-muted">{unit}</span> : null}
      </p>
      {helper ? <p className="mt-0.5 text-2xs text-ink-muted">{helper}</p> : null}
    </div>
  );
}

/** Amber inline note, e.g. "only 3 readings — averages are rough". */
export function SmallNote({ children }: { children: ReactNode }) {
  return (
    <p className="rounded-field border border-attention-line bg-attention-soft px-3 py-2 text-xs text-ink-muted">
      {children}
    </p>
  );
}
