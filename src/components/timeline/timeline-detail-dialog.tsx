"use client";

import type { ReactNode } from "react";
import { Calendar, Clock, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { cn } from "@/lib/utils";
import { fmtDateStrWeekday } from "@/components/health/format";
import { domainIcons, domainStyles } from "@/components/timeline/timeline-event-card";
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
    <div className="flex items-center justify-between gap-3 rounded-control border border-line bg-surface p-2.5 text-sm">
      <span className="flex items-center gap-1.5 text-ink-subtle">
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

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={event.titleHi}
      description={event.title}
      size="sm"
      footer={
        <Button variant="secondary" block onClick={onClose}>
          बंद करें (Close)
        </Button>
      }
    >
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <span className={cn("grid h-12 w-12 shrink-0 place-items-center rounded-card border", style.iconBg)}>
            <Icon aria-hidden className="h-6 w-6" />
          </span>
          <div className="min-w-0 flex-1 rounded-card border border-line bg-surface-sunken p-3 text-center">
            <p className="text-xs font-medium text-ink-subtle">दर्ज माप (Recorded value)</p>
            <p className="tabular mt-0.5 text-2xl font-semibold text-ink">{event.value || "—"}</p>
            {event.statusText ? <p className="mt-0.5 text-xs text-ink-muted">{event.statusText}</p> : null}
          </div>
        </div>

        <div className="space-y-2">
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

        {event.detailNote ? (
          <div className="rounded-control border border-line bg-surface-sunken p-3 text-sm text-ink-muted">
            <p className="mb-0.5 text-xs font-semibold text-ink">टिप्पणी (Notes)</p>
            {event.detailNote}
          </div>
        ) : null}
      </div>
    </Modal>
  );
}
