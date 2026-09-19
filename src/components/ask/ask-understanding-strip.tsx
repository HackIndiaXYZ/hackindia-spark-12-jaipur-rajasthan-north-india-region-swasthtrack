"use client";

import { CheckCircle2, ChevronDown, ChevronUp, Edit3, HelpCircle } from "lucide-react";
import { useState } from "react";

type UnderstandingStripProps = {
  patientLabel: string;
  resolvedDate?: string;
  metricLabel: string;
  understandingConfidence: number; // 0.0 to 1.0
  onEditRequested?: () => void;
};

export function AskUnderstandingStrip({
  patientLabel,
  resolvedDate,
  metricLabel,
  understandingConfidence,
  onEditRequested,
}: UnderstandingStripProps) {
  const [isOpen, setIsOpen] = useState(false);
  const isHighConfidence = understandingConfidence >= 0.85;

  return (
    <div className="rounded-card border border-line/90 bg-surface-sunken/80 px-3 py-2 text-xs font-semibold text-ink-muted shadow-2xs">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 flex-wrap">
          {isHighConfidence ? (
            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
          ) : (
            <HelpCircle className="h-3.5 w-3.5 text-amber-600 shrink-0" />
          )}
          <span className="text-ink-subtle">समझा गया:</span>
          <span className="bg-surface px-2 py-0.5 rounded border border-line text-ink font-bold">
            मरीज़: {patientLabel}
          </span>
          {resolvedDate && (
            <span className="bg-surface px-2 py-0.5 rounded border border-line text-ink font-bold">
              तिथि: {resolvedDate}
            </span>
          )}
          <span className="bg-surface px-2 py-0.5 rounded border border-line text-ink font-bold">
            विषय: {metricLabel}
          </span>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          {onEditRequested && (
            <button
              type="button"
              onClick={onEditRequested}
              className="text-xs font-semibold text-purple-700 hover:text-purple-950 flex items-center gap-1 px-1.5 py-0.5 rounded hover:bg-purple-100 transition-colors cursor-pointer"
            >
              <Edit3 className="h-3 w-3" />
              <span>बदलें</span>
            </button>
          )}
          <button
            type="button"
            onClick={() => setIsOpen(!isOpen)}
            className="text-ink-subtle hover:text-ink-muted p-0.5 cursor-pointer"
          >
            {isOpen ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          </button>
        </div>
      </div>

      {isOpen && (
        <div className="mt-2 pt-2 border-t border-line text-xs text-ink-muted space-y-1">
          <p>
            • समझ का विश्वास (Understanding Score): <strong>{Math.round(understandingConfidence * 100)}%</strong>
          </p>
          <p>
            • यदि यह सही नहीं है, तो ऊपर <strong>&quot;बदलें&quot;</strong> पर क्लिक करके विवरण सही करें।
          </p>
        </div>
      )}
    </div>
  );
}
