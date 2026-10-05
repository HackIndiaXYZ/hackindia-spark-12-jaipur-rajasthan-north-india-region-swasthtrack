"use client";

import { useRef } from "react";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { Button, IconButton } from "@/components/ui/button";
import { fmtDateStrFull, fmtDateStrWeekday, relativeDayLabel } from "@/components/health/format";
import { addDaysIST, todayIST } from "@/lib/health-rules";
import { cn } from "@/lib/utils";

type DayStepperProps = {
  /** The IST date being viewed, "YYYY-MM-DD". */
  date: string;
  onChange: (date: string) => void;
  /** Today in IST (passed in so a parent that re-renders at midnight stays consistent). */
  today?: string;
  className?: string;
};

/**
 * Previous day / pick a date / next day / back to today. Shared by the Food and
 * Medicines pages so history is navigated the same way in both. The future is
 * never selectable: nothing can have been eaten or taken yet.
 */
export function DayStepper({ date, onChange, today = todayIST(), className }: DayStepperProps) {
  const pickerRef = useRef<HTMLInputElement>(null);
  const isToday = date >= today;

  function openPicker() {
    const input = pickerRef.current;
    if (!input) return;
    try {
      input.showPicker();
    } catch {
      // Older browsers: focusing the (visually hidden) input is the best we can do.
      input.focus();
      input.click();
    }
  }

  return (
    <div className={cn("flex items-center gap-1.5 sm:gap-2", className)}>
      <IconButton variant="secondary" aria-label="पिछला दिन (Previous day)" onClick={() => onChange(addDaysIST(date, -1))}>
        <ChevronLeft aria-hidden className="h-5 w-5" />
      </IconButton>

      <div className="relative min-w-0 flex-1">
        <button
          type="button"
          onClick={openPicker}
          aria-label={`तारीख़ चुनें (Pick a date). अभी: ${fmtDateStrFull(date)}`}
          className="pressable surface-lift flex min-h-control w-full cursor-pointer items-center justify-center gap-2 rounded-control px-3 text-left"
        >
          <CalendarDays aria-hidden className="h-4 w-4 shrink-0 text-brand-ink" />
          <span className="min-w-0 text-center leading-tight">
            <span lang="hi" className="block truncate text-sm font-semibold text-ink">
              {relativeDayLabel(date, today)}
            </span>
            <span className="block truncate text-2xs text-ink-muted">{fmtDateStrWeekday(date)}</span>
          </span>
        </button>
        {/* The native picker, anchored under the button. Not focusable by Tab: the button above is the control. */}
        <input
          ref={pickerRef}
          type="date"
          tabIndex={-1}
          aria-hidden
          max={today}
          value={date}
          onChange={(e) => {
            const next = e.target.value;
            if (/^\d{4}-\d{2}-\d{2}$/.test(next) && next <= today) onChange(next);
          }}
          className="pointer-events-none absolute inset-0 h-full w-full opacity-0"
        />
      </div>

      <IconButton
        variant="secondary"
        aria-label="अगला दिन (Next day)"
        disabled={isToday}
        onClick={() => onChange(addDaysIST(date, 1))}
      >
        <ChevronRight aria-hidden className="h-5 w-5" />
      </IconButton>

      {!isToday ? (
        <Button variant="primary" onClick={() => onChange(today)} className="shrink-0">
          <span lang="hi">आज</span>
        </Button>
      ) : null}
    </div>
  );
}
