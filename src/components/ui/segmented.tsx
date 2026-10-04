"use client";

import { useId, useRef, type KeyboardEvent } from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export type SegmentedOption<T extends string> = {
  value: T;
  label: string;
  hindiLabel?: string;
  icon?: LucideIcon;
  count?: number;
};

/** Id of the tab button for `value` when `mode="tabs"`. */
export const segmentedTabId = (idPrefix: string, value: string) =>
  `${idPrefix}-tab-${value}`;

/** Id the matching `role="tabpanel"` must carry when `mode="tabs"`. */
export const segmentedPanelId = (idPrefix: string, value: string) =>
  `${idPrefix}-panel-${value}`;

/**
 * The one tab / filter control in the product. Options never wrap: on narrow
 * screens the strip scrolls horizontally inside itself, which keeps the page
 * from scrolling sideways (§8) and keeps every tab the same height.
 *
 * Two correct semantics, chosen by `mode`:
 *  - `"radio"` (default): a filter / single choice. `radiogroup` + `radio`,
 *    no tabpanel needed. Use this when the control only changes what a list
 *    shows.
 *  - `"tabs"`: it switches between panels. `tablist` + `tab` with
 *    `aria-controls`; give the visible panel `role="tabpanel"`,
 *    `id={segmentedPanelId(idPrefix, value)}` and
 *    `aria-labelledby={segmentedTabId(idPrefix, value)}`, and pass the same
 *    `idPrefix` here.
 *
 * Either way it is one tab stop (roving tabindex): the selected option takes
 * focus, Left/Right/Up/Down move between options, Home/End jump to the ends,
 * and selection follows focus.
 */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  ariaLabel,
  size = "md",
  mode = "radio",
  idPrefix,
  className,
}: {
  options: SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
  ariaLabel: string;
  size?: "sm" | "md";
  mode?: "radio" | "tabs";
  idPrefix?: string;
  className?: string;
}) {
  const generatedId = useId();
  const prefix = idPrefix ?? generatedId;
  const buttons = useRef<Array<HTMLButtonElement | null>>([]);
  const isTabs = mode === "tabs";

  // If `value` matches nothing (still loading), the first option stays
  // reachable by keyboard.
  const selectedIndex = Math.max(
    0,
    options.findIndex((option) => option.value === value),
  );

  const move = (event: KeyboardEvent<HTMLButtonElement>, from: number) => {
    const last = options.length - 1;
    let next = from;

    switch (event.key) {
      case "ArrowRight":
      case "ArrowDown":
        next = from === last ? 0 : from + 1;
        break;
      case "ArrowLeft":
      case "ArrowUp":
        next = from === 0 ? last : from - 1;
        break;
      case "Home":
        next = 0;
        break;
      case "End":
        next = last;
        break;
      default:
        return;
    }

    event.preventDefault();
    const target = buttons.current[next];
    target?.focus();
    target?.scrollIntoView({ block: "nearest", inline: "nearest" });
    onChange(options[next].value);
  };

  return (
    <div
      role={isTabs ? "tablist" : "radiogroup"}
      aria-label={ariaLabel}
      className={cn(
        "scroll-x -mx-1 flex items-center gap-1.5 px-1 py-1",
        className,
      )}
    >
      {options.map((option, index) => {
        const active = option.value === value;
        const Icon = option.icon;

        return (
          <button
            key={option.value}
            ref={(node) => {
              buttons.current[index] = node;
            }}
            type="button"
            {...(isTabs
              ? {
                  role: "tab",
                  id: segmentedTabId(prefix, option.value),
                  "aria-selected": active,
                  "aria-controls": segmentedPanelId(prefix, option.value),
                }
              : { role: "radio", "aria-checked": active })}
            tabIndex={index === selectedIndex ? 0 : -1}
            onClick={() => onChange(option.value)}
            onKeyDown={(event) => move(event, index)}
            className={cn(
              "pressable flex shrink-0 cursor-pointer items-center gap-1.5 rounded-control",
              "whitespace-nowrap border font-semibold snap-start",
              size === "sm"
                ? "min-h-control-sm px-3 text-xs pointer-coarse:min-h-control"
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
                  active ? "text-ink-inverse" : "text-ink-subtle",
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
                    ? "bg-brand-strong text-ink-inverse"
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
