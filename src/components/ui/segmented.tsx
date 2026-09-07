"use client";

import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export type SegmentedOption<T extends string> = {
  value: T;
  label: string;
  hindiLabel?: string;
  icon?: LucideIcon;
  count?: number;
};

/**
 * The one tab / filter control in the product. Options never wrap: on narrow
 * screens the strip scrolls horizontally inside itself, which keeps the page
 * from scrolling sideways (§8) and keeps every tab the same height.
 */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  ariaLabel,
  size = "md",
  className,
}: {
  options: SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
  ariaLabel: string;
  size?: "sm" | "md";
  className?: string;
}) {
  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className={cn(
        "scroll-x -mx-1 flex items-center gap-1.5 px-1 py-1",
        className,
      )}
    >
      {options.map((option) => {
        const active = option.value === value;
        const Icon = option.icon;

        return (
          <button
            key={option.value}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(option.value)}
            className={cn(
              "pressable flex shrink-0 cursor-pointer items-center gap-1.5 rounded-control",
              "whitespace-nowrap border font-semibold snap-start",
              size === "sm"
                ? "min-h-control-sm px-3 text-xs"
                : "min-h-control px-3.5 text-sm",
              active
                ? "border-brand bg-brand text-ink-inverse shadow-e1"
                : "border-line bg-surface text-ink-muted hover:border-brand-line hover:text-ink",
            )}
          >
            {Icon ? <Icon aria-hidden className="h-4 w-4 shrink-0" /> : null}
            <span>{option.label}</span>
            {option.hindiLabel ? (
              <span
                lang="hi"
                className={cn(
                  "text-xs font-normal",
                  active ? "text-ink-inverse/80" : "text-ink-subtle",
                )}
              >
                {option.hindiLabel}
              </span>
            ) : null}
            {typeof option.count === "number" ? (
              <span
                className={cn(
                  "tabular ml-0.5 rounded-full px-1.5 text-2xs font-semibold",
                  active
                    ? "bg-white/20 text-ink-inverse"
                    : "bg-surface-sunken text-ink-subtle",
                )}
              >
                {option.count}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
