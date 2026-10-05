import { cn } from "@/lib/utils";

type ProgressBarProps = {
  value: number;
  max?: number;
  label?: string;
  /** Accessible name when there is no visible `label`. */
  ariaLabel?: string;
  /** `sm` is a hairline bar for dense tiles. */
  size?: "md" | "sm";
  className?: string;
};

/**
 * A recessed champagne groove with a gold-foil fill. The fill starts at the
 * mid gold stop (not the pale highlight) so its leading edge never dissolves
 * into the track, and carries a thin lit top edge like the rest of the gilt.
 */
export function ProgressBar({
  value,
  max = 100,
  label,
  ariaLabel,
  size = "md",
  className,
}: ProgressBarProps) {
  const percentage = max > 0 ? Math.min(100, Math.max(0, (value / max) * 100)) : 0;

  return (
    <div className={className}>
      {label ? (
        <div className="mb-2 flex items-center justify-between gap-3 text-xs font-medium text-ink-muted">
          <span>{label}</span>
          <span className="tabular shrink-0 font-semibold text-ink">{Math.round(percentage)}%</span>
        </div>
      ) : null}
      <div
        role="progressbar"
        aria-label={label ?? ariaLabel ?? "Progress — प्रगति"}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(percentage)}
        className={cn(
          "overflow-hidden rounded-full border border-line bg-surface-sunken shadow-inset-field",
          size === "sm" ? "h-1.5" : "h-2.5",
        )}
      >
        <div
          className="h-full rounded-full transition-[width] duration-500 ease-out"
          style={{
            width: `${percentage}%`,
            backgroundImage:
              "linear-gradient(180deg, rgba(255,255,255,0.45), rgba(255,255,255,0) 55%), linear-gradient(90deg, var(--color-spring-2), var(--color-spring-3))",
            boxShadow: "inset 0 -1px 0 color-mix(in srgb, var(--color-spring-3) 55%, transparent)",
          }}
        />
      </div>
    </div>
  );
}
