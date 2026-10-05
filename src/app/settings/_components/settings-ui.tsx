"use client";

import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { Card, metricChipClasses, type MetricTone } from "@/components/ui/card";
import { cn } from "@/lib/utils";

/**
 * One titled card on the settings screen: an icon chip in the metric's own hue,
 * a title, a one-line explanation and an optional action on the right.
 */
export function SettingsCard({
  icon: Icon,
  tone = "brand",
  title,
  description,
  action,
  children,
  className,
}: {
  icon: LucideIcon;
  tone?: MetricTone;
  title: string;
  description?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Card className={cn("space-y-4", className)}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <span className={cn("grid h-9 w-9 shrink-0 place-items-center rounded-control", metricChipClasses[tone])}>
            <Icon aria-hidden className="h-[18px] w-[18px]" />
          </span>
          <div className="min-w-0">
            <h2 className="text-base font-semibold leading-snug text-ink">{title}</h2>
            {description ? <p className="mt-0.5 text-sm text-ink-muted">{description}</p> : null}
          </div>
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
      {children}
    </Card>
  );
}

/** Quick-pick values next to a number field. The picked one takes the gold-foil "active" look. */
export function PresetChips({
  values,
  current,
  onPick,
  disabled,
  format,
  label,
}: {
  values: number[];
  current: string;
  onPick: (value: string) => void;
  disabled: boolean;
  format: (value: number) => string;
  label: string;
}) {
  return (
    <div role="group" aria-label={label} className="flex flex-wrap gap-1.5">
      {values.map((preset) => {
        const active = Number(current) === preset && current.trim() !== "";
        return (
          <button
            key={preset}
            type="button"
            disabled={disabled}
            onClick={() => onPick(String(preset))}
            aria-pressed={active}
            className={cn(
              "pressable min-h-control-sm cursor-pointer rounded-control border px-3 text-xs font-semibold pointer-coarse:min-h-control",
              "disabled:cursor-not-allowed disabled:opacity-60",
              active
                ? "grad-gold-button border-gold-line text-gold-ink shadow-gold-button"
                : "border-line bg-surface/80 text-ink-muted shadow-e1 hover:border-gold-line hover:bg-surface hover:text-ink",
            )}
          >
            {format(preset)}
          </button>
        );
      })}
    </div>
  );
}

/**
 * A labelled on/off switch. A real checkbox underneath (`role="switch"`), so it
 * keeps native keyboard (Space), form and disabled behaviour; the whole row is
 * the tap target.
 */
export function ToggleRow({
  checked,
  onChange,
  disabled,
  title,
  hindiTitle,
  hint,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  title: string;
  hindiTitle: string;
  hint?: string;
}) {
  return (
    <label
      className={cn(
        "tile flex min-h-control cursor-pointer items-center justify-between gap-4 rounded-card px-3.5 py-3 transition-colors",
        "has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-brand",
        disabled ? "cursor-not-allowed opacity-70" : "hover:border-gold-line",
      )}
    >
      <span className="min-w-0">
        <span className="block text-sm font-semibold text-ink">
          <span lang="hi">{hindiTitle}</span>
        </span>
        <span className="block text-xs text-ink-muted">
          {title}
          {hint ? ` · ${hint}` : ""}
        </span>
      </span>
      <input
        type="checkbox"
        role="switch"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        className={cn(
          "relative h-6 w-11 shrink-0 cursor-pointer appearance-none rounded-full border border-line-strong bg-surface-sunken shadow-inset-field transition-colors",
          "before:absolute before:left-0.5 before:top-0.5 before:h-4.5 before:w-4.5 before:rounded-full before:bg-surface before:shadow-e1 before:transition-transform before:content-['']",
          "checked:border-brand checked:bg-brand checked:before:translate-x-5",
          "focus-visible:outline-none disabled:cursor-not-allowed",
        )}
      />
    </label>
  );
}

/** Two-line read-only fact tile (label, value, helper). */
export function FactTile({ label, value, helper }: { label: string; value: string; helper?: string }) {
  return (
    <div className="tile rounded-card p-3">
      <p className="text-2xs font-semibold uppercase tracking-wider text-ink-subtle">{label}</p>
      <p className="mt-0.5 text-sm font-semibold text-ink">{value}</p>
      {helper ? <p className="text-xs text-ink-muted">{helper}</p> : null}
    </div>
  );
}
