"use client";

import { useEffect, useRef, useState } from "react";
import { Activity, Calendar, Filter, HeartPulse, Moon, Pill, Scale, ShieldAlert, Utensils } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState, ErrorState } from "@/components/ui/page";
import { Segmented, type SegmentedOption } from "@/components/ui/segmented";
import { useToast } from "@/components/ui/toast";
import { loadErrorMessage, useAsyncData } from "@/components/health/use-async-data";
import { TimelineEventCard } from "./timeline-event-card";
import { TimelineDetailDialog } from "./timeline-detail-dialog";
import { cn } from "@/lib/utils";
import { fmtDateStr } from "@/components/health/format";
import {
  getHealthTimelineEvents,
  type DateScope,
  type TimelineDomain,
  type TimelineEvent,
  type TimelineGroup,
  type TimelineResult,
  type TimelineTimeGroup,
} from "@/services/timeline-service";

// Canonical chronological order of timeline groups (mirrors timeline-service.ts).
const GROUP_ORDER: TimelineTimeGroup[] = ["Today", "Yesterday", "This Week", "Older"];
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
  { value: "all", label: "All", hindiLabel: "सभी" },
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

/** Append a later page to the groups already on screen, without dropping or duplicating events. */
function mergeGroups(prev: TimelineGroup[], next: TimelineGroup[]): TimelineGroup[] {
  const buckets: Partial<Record<TimelineTimeGroup, TimelineEvent[]>> = {};
  const meta: Partial<Record<TimelineTimeGroup, TimelineGroup>> = {};

  for (const g of prev) {
    buckets[g.groupKey] = [...g.events];
    meta[g.groupKey] = g;
  }
  for (const g of next) {
    const list = (buckets[g.groupKey] ??= []);
    meta[g.groupKey] = g;
    for (const ev of g.events) if (!list.some((e) => e.id === ev.id)) list.push(ev);
  }

  return GROUP_ORDER.filter((key) => buckets[key]).map((key) => ({
    ...meta[key]!,
    groupKey: key,
    events: buckets[key]!,
  }));
}

type MoreState = { base: TimelineResult; groups: TimelineGroup[]; offset: number; hasMore: boolean };

export function TimelineView({ patientId }: TimelineViewProps) {
  const toast = useToast();
  const [dateScope, setDateScope] = useState<DateScope>("today");
  const [activeFilter, setActiveFilter] = useState<DomainFilter>("all");
  const [selectedEvent, setSelectedEvent] = useState<TimelineEvent | null>(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  // The selection IS the request key: clicking a chip only changes state, the
  // single loader below reacts to it, and a response for an older selection is
  // dropped. (Previously every click also called loadEvents directly, so two
  // requests raced per click.)
  const key = `${patientId}|${activeFilter}|${dateScope}`;
  const { data, error, loading, reload } = useAsyncData<TimelineResult>(
    () => getHealthTimelineEvents(patientId, activeFilter, dateScope, 0, LIMIT),
    [patientId, activeFilter, dateScope],
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
      const res = await getHealthTimelineEvents(patientId, activeFilter, dateScope, nextOffset, LIMIT);
      if (keyRef.current !== requestKey) return;
      setMore({ base: data, groups: mergeGroups(groups, res.groups), offset: nextOffset, hasMore: res.hasMore });
    } catch {
      if (keyRef.current === requestKey) toast.error("और रिकॉर्ड लोड नहीं हो पाए", "Could not load more. Please try again.");
    } finally {
      setLoadingMore(false);
    }
  }

  return (
    <div className="space-y-4">
      <Segmented
        options={SCOPE_OPTIONS}
        value={dateScope}
        onChange={setDateScope}
        ariaLabel="Date range — अवधि चुनें"
      />
      <Segmented
        options={FILTER_OPTIONS}
        value={activeFilter}
        onChange={setActiveFilter}
        ariaLabel="Record type — रिकॉर्ड का प्रकार"
        size="sm"
      />

      {error ? (
        <ErrorState
          title="टाइमलाइन लोड नहीं हो पाई"
          englishTitle="The timeline could not be loaded"
          description={loadErrorMessage(error)}
          onRetry={reload}
        />
      ) : loading ? (
        <div aria-busy="true" aria-label="लोड हो रहा है" className="space-y-3 pt-2">
          <div className="skeleton h-24 rounded-card" />
          <div className="skeleton h-24 rounded-card" />
          <div className="skeleton h-24 rounded-card" />
        </div>
      ) : groups.length === 0 ? (
        <EmptyState
          icon={Calendar}
          title="इस अवधि में कोई रिकॉर्ड नहीं"
          hindiTitle="No records for this selection"
          description={
            dateScope === "all"
              ? "अभी तक इस श्रेणी में कुछ दर्ज नहीं हुआ है।"
              : "चुनी गई अवधि और श्रेणी में कुछ दर्ज नहीं है। लंबी अवधि चुनकर देखें।"
          }
          action={
            dateScope !== "all" ? (
              <Button variant="secondary" onClick={() => setDateScope("all")}>
                सभी रिकॉर्ड देखें
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="space-y-6 pt-1">
          <p aria-live="polite" className="text-xs text-ink-subtle">
            {data ? `कुल ${data.totalCount} रिकॉर्ड · ${fmtDateStr(data.coveredFrom)} से ${fmtDateStr(data.coveredTo)}` : null}
            {hasMore ? ` · अभी ${shown} दिख रहे हैं` : null}
          </p>

          {groups.map((group) => {
            const isToday = group.groupKey === "Today";
            return (
              <section key={group.groupKey} aria-label={group.groupLabelHi} className="space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                  {/* The "today" marker is this screen's one gold moment. */}
                  <span aria-hidden className={cn("h-2.5 w-2.5 rounded-full", isToday ? "grad-spring" : "bg-brand")} />
                  <h3 lang="hi" className="text-sm font-semibold tracking-tight text-ink sm:text-base">
                    {group.groupLabelHi}
                  </h3>
                  {isToday ? <Badge variant="gold">आज · Today</Badge> : null}
                  <span className="text-xs text-ink-subtle">· {group.events.length} रिकॉर्ड</span>
                </div>

                <div className="space-y-2.5">
                  {group.events.map((event) => (
                    <TimelineEventCard
                      key={event.id}
                      event={event}
                      onSelect={(ev) => {
                        setSelectedEvent(ev);
                        setIsDetailOpen(true);
                      }}
                    />
                  ))}
                </div>
              </section>
            );
          })}

          {hasMore ? (
            <div className="pt-2 text-center">
              <Button variant="secondary" loading={loadingMore} onClick={() => void handleLoadMore()}>
                {loadingMore ? "लोड हो रहा है…" : "और रिकॉर्ड देखें (Load more)"}
              </Button>
            </div>
          ) : null}
        </div>
      )}

      <TimelineDetailDialog isOpen={isDetailOpen} onClose={() => setIsDetailOpen(false)} event={selectedEvent} />
    </div>
  );
}
