"use client";

import { useEffect, useState } from "react";
import {
  Activity,
  Calendar,
  Filter,
  HeartPulse,
  Moon,
  Pill,
  Scale,
  ShieldAlert,
  Utensils,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { DepthCard } from "@/components/ui/depth-card";
import { TimelineEventCard } from "./timeline-event-card";
import { TimelineDetailDialog } from "./timeline-detail-dialog";
import { cn } from "@/lib/utils";
import {
  getHealthTimelineEvents,
  type DateScope,
  type TimelineDomain,
  type TimelineEvent,
  type TimelineGroup,
  type TimelineTimeGroup,
} from "@/services/timeline-service";

// Canonical chronological order of timeline groups (mirrors timeline-service.ts).
const GROUP_ORDER: TimelineTimeGroup[] = ["Today", "Yesterday", "This Week", "Older"];

type TimelineViewProps = {
  patientId: string;
};

const dateScopeOptions: { id: DateScope; label: string; hindiLabel: string }[] = [
  { id: "today", label: "Today", hindiLabel: "आज" },
  { id: "yesterday", label: "Yesterday", hindiLabel: "कल" },
  { id: "7d", label: "Last 7 Days", hindiLabel: "7 दिन" },
  { id: "30d", label: "Last 30 Days", hindiLabel: "30 दिन" },
  { id: "all", label: "All Records", hindiLabel: "सभी" },
];

const filterTabs: { id: "all" | TimelineDomain; label: string; hindiLabel: string; icon: typeof Activity }[] = [
  { id: "all", label: "All", hindiLabel: "सभी", icon: Filter },
  { id: "bp", label: "BP", hindiLabel: "रक्तचाप", icon: HeartPulse },
  { id: "medicine", label: "Meds", hindiLabel: "दवाइयाँ", icon: Pill },
  { id: "food", label: "Food", hindiLabel: "भोजन", icon: Utensils },
  { id: "activity", label: "Steps", hindiLabel: "कदम", icon: Activity },
  { id: "sleep", label: "Sleep", hindiLabel: "नींद", icon: Moon },
  { id: "weight", label: "Weight", hindiLabel: "वजन", icon: Scale },
  { id: "alert", label: "Alerts", hindiLabel: "अलर्ट्स", icon: ShieldAlert },
];

export function TimelineView({ patientId }: TimelineViewProps) {
  const [dateScope, setDateScope] = useState<DateScope>("today");
  const [activeFilter, setActiveFilter] = useState<"all" | TimelineDomain>("all");
  const [groups, setGroups] = useState<TimelineGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [offset, setOffset] = useState(0);
  const [selectedEvent, setSelectedEvent] = useState<TimelineEvent | null>(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const LIMIT = 25;

  function loadEvents(scope: DateScope, domain: "all" | TimelineDomain) {
    setLoading(true);
    getHealthTimelineEvents(patientId, domain, scope, 0, LIMIT)
      .then((res) => {
        setGroups(res.groups);
        setHasMore(res.hasMore);
        setOffset(0);
      })
      .catch((err) => console.error("Timeline load error:", err))
      .finally(() => {
        setLoading(false);
      });
  }

  useEffect(() => {
    let active = true;

    getHealthTimelineEvents(patientId, activeFilter, dateScope, 0, LIMIT)
      .then((res) => {
        if (active) {
          setGroups(res.groups);
          setHasMore(res.hasMore);
          setOffset(0);
        }
      })
      .catch((err) => console.error("Timeline error:", err))
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [patientId, activeFilter, dateScope]);

  async function handleLoadMore() {
    setLoadingMore(true);
    const nextOffset = offset + LIMIT;
    try {
      const res = await getHealthTimelineEvents(patientId, activeFilter, dateScope, nextOffset, LIMIT);
      setGroups((prev) => {
        // Merge events, keyed by groupKey
        const newBuckets: Partial<Record<TimelineTimeGroup, TimelineEvent[]>> = {};
        const groupMeta: Partial<Record<TimelineTimeGroup, TimelineGroup>> = {};

        // Start from the groups already on screen
        prev.forEach((g) => {
          newBuckets[g.groupKey] = [...g.events];
          groupMeta[g.groupKey] = g;
        });

        // Merge in the new page's groups — the union of previously-seen keys
        // and this page's keys (e.g. "Older") is used below instead of only
        // iterating over this page, so previously-shown groups like "Today"
        // are never dropped from the UI on "Load More".
        res.groups.forEach((g) => {
          if (!newBuckets[g.groupKey]) {
            newBuckets[g.groupKey] = [];
          }
          groupMeta[g.groupKey] = g;
          g.events.forEach((ev) => {
            if (!newBuckets[g.groupKey]!.some((e) => e.id === ev.id)) {
              newBuckets[g.groupKey]!.push(ev);
            }
          });
        });

        return GROUP_ORDER.filter((key) => newBuckets[key]).map((key) => ({
          ...groupMeta[key]!,
          groupKey: key,
          events: newBuckets[key]!,
        }));
      });
      setOffset(nextOffset);
      setHasMore(res.hasMore);
    } catch (err) {
      console.error("Load more error:", err);
    } finally {
      setLoadingMore(false);
    }
  }

  return (
    <div className="space-y-4">
      {/* 1. DATE SCOPE SELECTOR (TODAY, YESTERDAY, 7D, 30D, ALL) */}
      <div className="flex items-center gap-1.5 p-1.5 bg-surface-sunken/90 rounded-card border border-line overflow-x-auto scrollbar-none">
        {dateScopeOptions.map((opt) => {
          const isActive = dateScope === opt.id;
          return (
            <button
              key={opt.id}
              type="button"
              onClick={() => {
                if (dateScope !== opt.id) {
                  setDateScope(opt.id);
                  loadEvents(opt.id, activeFilter);
                }
              }}
              className={cn(
                "px-3 py-1.5 rounded-control text-xs font-bold transition-all cursor-pointer shrink-0",
                isActive
                  ? "bg-surface text-ink shadow-e1 border border-line scale-[1.02]"
                  : "text-ink-muted hover:text-ink"
              )}
            >
              <span>{opt.hindiLabel}</span>
              <span className="text-2xs font-semibold opacity-75 ml-1">({opt.label})</span>
            </button>
          );
        })}
      </div>

      {/* 2. DOMAIN FILTER CHIPS */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
        {filterTabs.map((tab) => {
          const isActive = activeFilter === tab.id;
          const Icon = tab.icon;

          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => {
                if (activeFilter !== tab.id) {
                  setActiveFilter(tab.id);
                  loadEvents(dateScope, tab.id);
                }
              }}
              className={cn(
                "flex items-center gap-1.5 px-3 py-2 rounded-control text-xs font-bold transition-all cursor-pointer shrink-0 shadow-2xs",
                isActive
                  ? "bg-brand text-ink-inverse shadow-e1 scale-[1.02]"
                  : "bg-surface border-2 border-line text-ink-muted hover:border-brand-line hover:bg-brand-softer"
              )}
            >
              <Icon className="h-3.5 w-3.5" />
              <span>{tab.hindiLabel}</span>
            </button>
          );
        })}
      </div>

      {/* 3. TIMELINE EVENTS CONTENT */}
      {loading ? (
        <div className="space-y-3 animate-pulse pt-2">
          <div className="h-24 rounded-card bg-surface-sunken" />
          <div className="h-24 rounded-card bg-surface-sunken" />
          <div className="h-24 rounded-card bg-surface-sunken" />
        </div>
      ) : groups.length === 0 ? (
        <DepthCard depth={1} className="p-8 text-center bg-surface rounded-card border-2 border-line">
          <Calendar className="mx-auto h-10 w-10 text-ink-subtle mb-2" />
          <h4 className="text-base font-bold text-ink">कोई रिकॉर्ड नहीं मिला</h4>
          <p className="text-xs font-semibold text-ink-subtle mt-1">
            चुनी गई अवधि व श्रेणी के लिए अभी कोई इवेंट दर्ज नहीं है।
          </p>
        </DepthCard>
      ) : (
        <div className="space-y-6 pt-1">
          {groups.map((group) => {
            const isToday = group.groupKey === "Today";
            return (
              <section key={group.groupKey} className="space-y-3">
                {/* GROUP SECTION HEADER — the "today" marker is this screen's one gold moment */}
                <div className="flex items-center gap-2">
                  <span
                    className={cn(
                      "h-2.5 w-2.5 rounded-full shadow-2xs",
                      isToday ? "grad-spring" : "bg-brand",
                    )}
                  />
                  <h3 className="text-sm sm:text-base font-bold text-ink tracking-tight">
                    {group.groupLabelHi}
                  </h3>
                  {isToday ? (
                    <Badge variant="gold" className="text-2xs">आज · Today</Badge>
                  ) : null}
                  <span className="text-xs font-semibold text-ink-subtle">
                    · {group.events.length} रिकॉर्ड्स
                  </span>
                </div>

                {/* EVENTS LIST */}
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

          {/* PROGRESSIVE LOAD MORE BUTTON */}
          {hasMore && (
            <div className="pt-2 text-center">
              <button
                type="button"
                onClick={handleLoadMore}
                disabled={loadingMore}
                className="px-6 py-2.5 rounded-control bg-surface border-2 border-line hover:border-brand-line hover:bg-brand-softer active:scale-98 text-xs sm:text-sm font-bold text-ink-muted shadow-e1 cursor-pointer transition-all disabled:opacity-50"
              >
                {loadingMore ? "लोड हो रहा है..." : "पूर्व के और रिकॉर्ड्स देखें (Load More)"}
              </button>
            </div>
          )}
        </div>
      )}

      {/* EVENT DETAIL DIALOG (TAP TO VIEW DETAILS) */}
      <TimelineDetailDialog
        isOpen={isDetailOpen}
        onClose={() => setIsDetailOpen(false)}
        event={selectedEvent}
      />
    </div>
  );
}
