"use client";

import { Field, TextInput } from "@/components/ui/form-field";
import { istInstant, istMinutesOfDay, todayIST } from "@/lib/health-rules";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
/** A clock a few minutes fast must not make "now" look like the future. */
const FUTURE_SLACK_MS = 5 * 60_000;

const pad = (n: number) => String(n).padStart(2, "0");

/** Now as India date + "HH:MM": the default for every "when was this measured" field. */
export function nowIST(): { date: string; time: string } {
  const now = new Date();
  const minutes = istMinutesOfDay(now);
  return { date: todayIST(now), time: `${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}` };
}

/** Hour (0-23) of an "HH:MM" string, or null while it is incomplete. */
export function hourOfTime(time: string): number | null {
  return TIME_RE.test(time) ? Number(time.slice(0, 2)) : null;
}

/**
 * The instant for an India-time date + "HH:MM", or an error message (Hindi with
 * English helper) when it is missing, malformed or in the future.
 */
export function resolveMeasuredAt(date: string, time: string): { instant: Date; error?: undefined } | { instant: null; error: string } {
  if (!DATE_RE.test(date) || !TIME_RE.test(time)) {
    return { instant: null, error: "तारीख़ और समय चुनें (Choose a date and time)" };
  }
  const instant = istInstant(date, time);
  if (Number.isNaN(instant.getTime())) {
    return { instant: null, error: "तारीख़ और समय सही नहीं है (Invalid date or time)" };
  }
  if (instant.getTime() > Date.now() + FUTURE_SLACK_MS) {
    return { instant: null, error: "यह समय अभी से आगे का है (That time is in the future)" };
  }
  return { instant };
}

type MeasuredAtFieldsProps = {
  date: string;
  time: string;
  onDateChange: (value: string) => void;
  onTimeChange: (value: string) => void;
  error?: string;
  dateLabel?: string;
  timeLabel?: string;
};

/** Date + time pickers, India time, defaulting to now and editable. */
export function MeasuredAtFields({
  date,
  time,
  onDateChange,
  onTimeChange,
  error,
  dateLabel = "तारीख़ (Date)",
  timeLabel = "समय (Time)",
}: MeasuredAtFieldsProps) {
  return (
    <div className="grid grid-cols-2 gap-3">
      <Field label={dateLabel}>
        <TextInput type="date" value={date} max={todayIST()} onChange={(e) => onDateChange(e.target.value)} />
      </Field>
      <Field label={timeLabel} error={error}>
        <TextInput type="time" value={time} onChange={(e) => onTimeChange(e.target.value)} />
      </Field>
    </div>
  );
}
