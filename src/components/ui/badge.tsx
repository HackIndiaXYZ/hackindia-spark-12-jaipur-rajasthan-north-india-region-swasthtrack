import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

/**
 * `green | blue | amber | red | neutral` are the historical names kept for the
 * ~30 call sites that already use them; the semantic names below are what new
 * code should use, so a colour always carries the same meaning (§34, §45).
 */
type BadgeVariant =
  | "green"
  | "blue"
  | "amber"
  | "red"
  | "neutral"
  | "positive"
  | "info"
  | "attention"
  | "critical"
  | "brand"
  | "gold";

const variantClasses: Record<BadgeVariant, string> = {
  green: "border-positive-line bg-positive-soft text-positive",
  positive: "border-positive-line bg-positive-soft text-positive",
  blue: "border-info-line bg-info-soft text-info",
  info: "border-info-line bg-info-soft text-info",
  amber: "border-attention-line bg-attention-soft text-attention",
  attention: "border-attention-line bg-attention-soft text-attention",
  red: "border-critical-line bg-critical-soft text-critical",
  critical: "border-critical-line bg-critical-soft text-critical",
  brand: "border-brand-line bg-brand-soft text-brand-ink",
  // Premium / achievement label — a streak, a milestone, an admin-only tag.
  // Kept rare on purpose (§ premium accent rule in globals.css).
  gold: "border-gold-line bg-gold-soft text-gold-ink",
  neutral: "border-line bg-surface-sunken text-ink-muted",
};

type BadgeProps = ComponentProps<"span"> & {
  variant?: BadgeVariant;
};

export function Badge({
  className,
  variant = "neutral",
  ...props
}: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex max-w-full items-center gap-1 truncate rounded-full border",
        "px-2.5 py-0.5 text-xs font-medium",
        variantClasses[variant],
        className,
      )}
      {...props}
    />
  );
}

/**
 * Provenance label (§43). Says where a number came from so an estimate is
 * never mistaken for a measurement.
 */
export function SourceBadge({
  source,
  className,
}: {
  source: "recorded" | "synced" | "estimated" | "calculated" | "imported";
  className?: string;
}) {
  const label: Record<typeof source, string> = {
    recorded: "Recorded · दर्ज",
    synced: "Synced · सिंक",
    estimated: "Estimated · अनुमान",
    calculated: "Calculated · गणना",
    imported: "Imported · आयातित",
  };

  // Estimates are visually distinct from measurements on purpose.
  const tone =
    source === "estimated"
      ? "border-attention-line bg-attention-soft text-attention"
      : source === "calculated"
        ? "border-info-line bg-info-soft text-info"
        : "border-line bg-surface-sunken text-ink-subtle";

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2 py-0.5",
        "text-2xs font-medium whitespace-nowrap",
        tone,
        className,
      )}
    >
      {label[source]}
    </span>
  );
}
