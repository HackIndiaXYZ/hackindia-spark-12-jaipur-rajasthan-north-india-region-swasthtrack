"use client";

import type { ReactNode } from "react";
import { Calendar, Clock, Info } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { langOf } from "@/components/ui/lang";
import { Modal } from "@/components/ui/modal";
import { cn } from "@/lib/utils";
import { fmtDateStrWeekday } from "@/components/health/format";
import { domainIcons, domainLabels, domainStyles } from "@/components/timeline/timeline-event-card";
import type { TimelineEvent } from "@/services/timeline-service";

type TimelineDetailDialogProps = {
  isOpen: boolean;
  onClose: () => void;
  event: TimelineEvent | null;
};

const CONFIDENCE_LABEL: Record<NonNullable<TimelineEvent["confidence"]>, string> = {
  High: "उच्च (High)",
  Medium: "मध्यम (Medium)",
  Low: "सीमित (Low)",
};

const SOURCE_LABEL: Record<TimelineEvent["source"], string> = {
  Manual: "दर्ज किया गया (Manual)",
  Calculated: "गणना से (Calculated)",
  Estimated: "अनुमान (Estimated)",
  Imported: "आयातित (Imported)",
};

function Row({ icon: Icon, label, children }: { icon?: typeof Clock; label: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-line py-2.5 text-sm last:border-b-0">
      <span className="flex shrink-0 items-center gap-1.5 text-ink-muted">
        {Icon ? <Icon aria-hidden className="h-3.5 w-3.5" /> : null}
        {label}
      </span>
      <span className="text-right font-semibold text-ink">{children}</span>
    </div>
  );
}

export function TimelineDetailDialog({ isOpen, onClose, event }: TimelineDetailDialogProps) {
  if (!event) return null;
  const Icon = domainIcons[event.domain];
  const style = domainStyles[event.domain];
  const domain = domainLabels[event.domain];
  const note = event.detailNoteHi || event.detailNote;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={event.titleHi}
      description={`${domain.en} · ${fmtDateStrWeekday(event.dateStr)}`}
      size="sm"
      footer={
        <Button variant="secondary" block onClick={onClose}>
          बंद करें (Close)
        </Button>
      }
    >
      <div className="space-y-4">
        <div className="flex items-start gap-3">
          <span className={cn("grid h-12 w-12 shrink-0 place-items-center rounded-card border", style.iconBg)}>
            <Icon aria-hidden className="h-6 w-6" />
          </span>
          <div className="tile min-w-0 flex-1 rounded-card p-3 text-center">
            <p className="text-xs font-medium text-ink-muted">दर्ज माप (Recorded value)</p>
            <p lang={langOf(event.value || "")} className="tabular mt-0.5 text-2xl font-semibold text-ink">
              {event.value || "—"}
            </p>
            {event.statusBadge || event.statusText ? (
              <div className="mt-1.5 flex flex-wrap items-center justify-center gap-1.5">
                {event.statusBadge ? <Badge variant={event.statusBadgeTone || "neutral"}>{event.statusBadge}</Badge> : null}
                {event.statusText ? (
                  <span lang={langOf(event.statusText)} className="text-xs text-ink-muted">
                    {event.statusText}
                  </span>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>

        <div className="tile rounded-card px-3.5">
          <Row icon={Calendar} label="तारीख (Date)">
            {fmtDateStrWeekday(event.dateStr)}
          </Row>
          <Row icon={Clock} label="समय (Time)">
            {event.isDateOnly ? "पूरे दिन का (समय दर्ज नहीं)" : `${event.displayTime} IST`}
          </Row>
          <Row icon={Info} label="स्रोत (Source)">
            {SOURCE_LABEL[event.source]}
          </Row>
          {event.calculationStatus ? <Row label="गणना की स्थिति">{event.calculationStatus}</Row> : null}
          {event.confidence ? <Row label="भरोसा (Confidence)">{CONFIDENCE_LABEL[event.confidence]}</Row> : null}
        </div>

        {note ? (
          <div className="rounded-card border border-line bg-surface-sunken p-3 text-sm text-ink-muted">
            <p className="mb-0.5 text-xs font-semibold text-ink">टिप्पणी (Notes)</p>
            <p lang={langOf(note)}>{note}</p>
          </div>
        ) : null}
      </div>
    </Modal>
  );
}
