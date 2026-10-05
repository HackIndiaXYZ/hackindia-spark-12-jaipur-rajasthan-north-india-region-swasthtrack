"use client";

import { useEffect, useRef, useState } from "react";
import { Activity, Calendar, CalendarRange, Filter, HeartPulse, History, Moon, Pill, Scale, ShieldAlert, Utensils } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field, TextInput } from "@/components/ui/form-field";
import { EmptyState, ErrorState } from "@/components/ui/page";
import { Segmented, type SegmentedOption } from "@/components/ui/segmented";
import { useToast } from "@/components/ui/toast";
import { loadErrorMessage, useAsyncData } from "@/components/health/use-async-data";
import { TimelineEventCard, domainIcons, domainLabels, domainStyles } from "./timeline-event-card";
import { TimelineDetailDialog } from "./timeline-detail-dialog";
import { cn } from "@/lib/utils";
import { fmtDateStr, fmtDateStrWeekday, fmtDateStrYear } from "@/components/health/format";
import { addDaysIST, todayIST } from "@/lib/health-rules";
import {
  getHealthTimelineEvents,
  type CustomRange,
  type DateScope,
  type TimelineDomain,
  type TimelineEvent,
  type TimelineGroup,
  type TimelineResult,
} from "@/services/timeline-service";

const LIMIT = 25;

type TimelineViewProps = {
  patientId: string;
};

type DomainFilter = "all" | TimelineDomain;

const SCOPE_OPTIONS: SegmentedOption<DateScope>[] = [
  { value: "today", label: "Today", hindiLabel: "आज" },
  { value: "yesterday", label: "Yesterday", hindiLabel: "कल" },
  { value: "7d", label: "7 days", hindiLabel: "7 दिन" },
  { value: "30d", label: "30 days", hindiLabel: "30 दिन" },
  // "all" is the last 365 days, so it is named for what it covers.
  { value: "all", label: "1 year", hindiLabel: "1 साल" },
  { value: "custom", label: "Pick dates", hindiLabel: "तारीख़", icon: CalendarRange },
];

const FILTER_OPTIONS: SegmentedOption<DomainFilter>[] = [
  { value: "all", label: "All", hindiLabel: "सभी", icon: Filter },
  { value: "bp", label: "BP", hindiLabel: "रक्तचाप", icon: HeartPulse },
  { value: "medicine", label: "Meds", hindiLabel: "दवाइयाँ", icon: Pill },
  { value: "food", label: "Food", hindiLabel: "भोजन", icon: Utensils },
  { value: "activity", label: "Steps", hindiLabel: "कदम", icon: Activity },
  { value: "sleep", label: "Sleep", hindiLabel: "नींद", icon: Moon },
  { value: "weight", label: "Weight", hindiLabel: "वजन", icon: Scale },
  { value: "alert", label: "Alerts", hindiLabel: "अलर्ट", icon: ShieldAlert },
];

/** Append a later page to the days already on screen, without dropping or duplicating events. */
function mergeGroups(prev: TimelineGroup[], next: TimelineGroup[]): TimelineGroup[] {
  const out = prev.map((g) => ({ ...g, events: [...g.events] }));
  for (const g of next) {
    const existing = out.find((x) => x.groupKey === g.groupKey);
    if (!existing) {
      out.push({ ...g, events: [...g.events] });
      continue;
    }
    existing.totalInDay = g.totalInDay;
    for (const ev of g.events) if (!existing.events.some((e) => e.id === ev.id)) existing.events.push(ev);
  }
  // Pages arrive newest-first, but never trust arrival order for the day headers.
  return out.sort((a, b) => b.dateStr.localeCompare(a.dateStr));
}

type MoreState = { base: TimelineResult; groups: TimelineGroup[]; offset: number; hasMore: boolean };

const DOMAIN_ORDER: TimelineDomain[] = ["bp", "medicine", "food", "activity", "sleep", "weight", "alert"];

export function TimelineView({ patientId }: TimelineViewProps) {
  const toast = useToast();
  const today = todayIST();
  const [dateScope, setDateScope] = useState<DateScope>("today");
  const [activeFilter, setActiveFilter] = useState<DomainFilter>("all");
  const [range, setRange] = useState<CustomRange>({ start: addDaysIST(today, -6), end: today });
  const [selectedEvent, setSelectedEvent] = useState<TimelineEvent | null>(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  const customKey = dateScope === "custom" ? `${range.start}..${range.end}` : "";
  // The selection IS the request key: clicking a chip only changes state, the
  // single loader below reacts to it, and a response for an older selection is
  // dropped.
  const key = `${patientId}|${activeFilter}|${dateScope}|${customKey}`;
  const { data, error, loading, reload } = useAsyncData<TimelineResult>(
    () => getHealthTimelineEvents(patientId, activeFilter, dateScope, 0, LIMIT, dateScope === "custom" ? range : undefined),
    [patientId, activeFilter, dateScope, customKey],
  );

  // Extra pages are tied to the exact first-page result they extend, so a new
  // selection or a reload makes them stale and they are ignored.
  const [more, setMore] = useState<MoreState | null>(null);
  const keyRef = useRef(key);
  useEffect(() => {
    keyRef.current = key;
  }, [key]);

  const extra = more && data && more.base === data ? more : null;
  const groups = extra ? extra.groups : (data?.groups ?? []);
  const hasMore = extra ? extra.hasMore : (data?.hasMore ?? false);
  const offset = extra ? extra.offset : 0;
  const shown = groups.reduce((n, g) => n + g.events.length, 0);

  async function handleLoadMore() {
    if (!data) return;
    const requestKey = key;
    const nextOffset = offset + LIMIT;
    setLoadingMore(true);
    try {
      const res = await getHealthTimelineEvents(patientId, activeFilter, dateScope, nextOffset, LIMIT, dateScope === "custom" ? range : undefined);
      if (keyRef.current !== requestKey) return;
      setMore({ base: data, groups: mergeGroups(groups, res.groups), offset: nextOffset, hasMore: res.hasMore });
    } catch {
      if (keyRef.current === requestKey) toast.error("और रिकॉर्ड लोड नहीं हो पाए", "Could not load more. Please try again.");
    } finally {
      setLoadingMore(false);
    }
  }

  const rangeLabel = data
    ? data.coveredFrom === data.coveredTo
      ? fmtDateStrYear(data.coveredFrom)
      : data.coveredFrom.slice(0, 4) !== data.coveredTo.slice(0, 4)
        ? `${fmtDateStrYear(data.coveredFrom)} – ${fmtDateStrYear(data.coveredTo)}`
        : `${fmtDateStr(data.coveredFrom)} – ${fmtDateStrYear(data.coveredTo)}`
    : "";

  return (
    <div className="space-y-4">
      <Segmented options={SCOPE_OPTIONS} value={dateScope} onChange={setDateScope} ariaLabel="Date range — अवधि चुनें" />

      {dateScope === "custom" ? (
        <Card tone="raised" className="grid gap-3 sm:grid-cols-2">
          <Field label="से (From)">
            <TextInput
              type="date"
              value={range.start}
              max={today}
              onChange={(e) => {
                const start = e.target.value;
                if (start) setRange((r) => ({ start, end: r.end < start ? start : r.end }));
              }}
            />
          </Field>
          <Field label="तक (To)">
            <TextInput
              type="date"
              value={range.end}
              min={range.start}
              max={today}
              onChange={(e) => {
                const end = e.target.value;
                if (end) setRange((r) => ({ start: r.start > end ? end : r.start, end }));
              }}
            />
          </Field>
        </Card>
      ) : null}

      <Segmented options={FILTER_OPTIONS} value={activeFilter} onChange={setActiveFilter} ariaLabel="Record type — रिकॉर्ड का प्रकार" size="sm" />

      {data && !error && data.totalCount > 0 ? (
        <Card tone="premium" className="space-y-3">
          <div className="flex items-start justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <span className="tile grid h-11 w-11 shrink-0 place-items-center rounded-control text-gold-ink">
                <History aria-hidden className="h-5 w-5" />
              </span>
              <div className="min-w-0">
                <h2 className="text-base font-semibold leading-tight text-ink sm:text-lg">Health journey</h2>
                <p lang="hi" className="text-sm text-ink-muted">
                  स्वास्थ्य यात्रा
                </p>
              </div>
            </div>
            <div className="shrink-0 text-right" aria-live="polite">
              <p className="tabular text-4xl font-semibold leading-none text-ink">{data.totalCount}</p>
              <p lang="hi" className="text-2xs font-semibold uppercase tracking-wider text-ink-muted">
                रिकॉर्ड · records
              </p>
            </div>
          </div>
          <p className="tabular text-xs font-medium text-ink-muted">{rangeLabel}</p>
          {data.totalCount > 0 ? (
            <ul className="flex flex-wrap gap-1.5" aria-label="Records by type — प्रकार के अनुसार">
              {DOMAIN_ORDER.filter((d) => (data.domainCounts[d] ?? 0) > 0).map((d) => {
                const Icon = domainIcons[d];
                return (
                  <li
                    key={d}
                    className={cn("flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium", domainStyles[d].iconBg)}
                  >
                    <Icon aria-hidden className="h-3.5 w-3.5" />
                    <span lang="hi">{domainLabels[d].hi}</span>
                    <span className="tabular font-semibold">{data.domainCounts[d]}</span>
                  </li>
                );
              })}
            </ul>
          ) : null}
        </Card>
      ) : null}

      {error ? (
        <ErrorState
          title="टाइमलाइन लोड नहीं हो पाई"
          englishTitle="The timeline could not be loaded"
          description={loadErrorMessage(error)}
          onRetry={reload}
        />
      ) : loading ? (
        <div aria-busy="true" aria-label="लोड हो रहा है" className="space-y-3 pt-2">
          <div className="skeleton h-28 rounded-card" />
          <div className="skeleton h-44 rounded-card" />
          <div className="skeleton h-44 rounded-card" />
        </div>
      ) : groups.length === 0 ? (
        <EmptyState
          icon={Calendar}
          title="इस अवधि में कोई रिकॉर्ड नहीं"
          hindiTitle="No records for this selection"
          description={
            dateScope === "all"
              ? "पिछले 1 साल में इस श्रेणी में कुछ दर्ज नहीं हुआ है।"
              : "चुनी गई अवधि और श्रेणी में कुछ दर्ज नहीं है। लंबी अवधि चुनकर देखें।"
          }
          action={
            dateScope !== "all" ? (
              <Button variant="secondary" onClick={() => setDateScope("all")}>
                पिछले 1 साल के रिकॉर्ड देखें
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="space-y-5 pt-1">
          {groups.map((group) => {
            const isToday = group.relative === "today";
            const partial = group.totalInDay > group.events.length;
            return (
              <Card key={group.groupKey} flush aria-label={`${group.groupLabel}, ${group.dateStr}`} className="overflow-hidden">
                <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 border-b border-line px-3.5 py-3 sm:px-4">
                  {/* The "today" marker is this screen's one gold moment. */}
                  <span aria-hidden className={cn("h-2.5 w-2.5 shrink-0 rounded-full", isToday ? "grad-spring shadow-glow-gold" : "bg-brand")} />
                  <h3 className="text-sm font-semibold tracking-tight text-ink sm:text-base">
                    {group.relative ? (
                      <>
                        <span lang="hi">{group.groupLabelHi}</span>
                        <span className="ml-1.5 font-normal text-ink-muted">· {fmtDateStrWeekday(group.dateStr)}</span>
                      </>
                    ) : (
                      <>
                        {fmtDateStrWeekday(group.dateStr)}
                        {group.dateStr.slice(0, 4) !== today.slice(0, 4) ? ` ${group.dateStr.slice(0, 4)}` : ""}
                      </>
                    )}
                  </h3>
                  {isToday ? <Badge variant="gold">आज · Today</Badge> : null}
                  <span className="tabular ml-auto text-xs text-ink-muted">
                    {partial ? `${group.events.length} / ${group.totalInDay}` : group.totalInDay} <span lang="hi">रिकॉर्ड</span>
                  </span>
                </div>
                {/* One vertical rail runs through the day's icon chips. */}
                <ul className="relative divide-y divide-line before:absolute before:bottom-9 before:left-[34px] before:top-9 before:z-0 before:w-px before:bg-line-strong sm:before:left-[36px]">
                  {group.events.map((event) => (
                    <li key={event.id}>
                      <TimelineEventCard
                        event={event}
                        onSelect={(ev) => {
                          setSelectedEvent(ev);
                          setIsDetailOpen(true);
                        }}
                      />
                    </li>
                  ))}
                </ul>
              </Card>
            );
          })}

          <div className="flex flex-col items-center gap-2 pt-1 text-center">
            <p aria-live="polite" className="tabular text-xs text-ink-muted">
              {data ? (
                <span lang="hi">
                  {data.totalCount} में से {shown} रिकॉर्ड दिख रहे हैं
                </span>
              ) : null}
            </p>
            {hasMore ? (
              <Button variant="secondary" loading={loadingMore} onClick={() => void handleLoadMore()}>
                {loadingMore ? "लोड हो रहा है…" : "और रिकॉर्ड देखें (Load more)"}
              </Button>
            ) : (
              <p lang="hi" className="text-xs text-ink-subtle">
                बस इतना ही — यह अवधि पूरी हुई
              </p>
            )}
          </div>
        </div>
      )}

      <TimelineDetailDialog isOpen={isDetailOpen} onClose={() => setIsDetailOpen(false)} event={selectedEvent} />
    </div>
  );
}
