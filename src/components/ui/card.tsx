import type { ComponentProps, PropsWithChildren } from "react";
import { cn } from "@/lib/utils";

type CardTone = "default" | "sunken" | "raised" | "premium";

const toneClasses: Record<CardTone, string> = {
  // Champagne-gold polished metal: lit top reflection, specular streak and a
  // bronze rim (see `.gilt` in globals.css). Every routine content card.
  default: "gilt",
  // A well, not a card: warm recess for secondary content.
  sunken: "border border-line bg-surface-sunken shadow-none",
  // Frosted white glass with a metal rim — for a card that must sit quietly
  // beside a gilt neighbour (forms, menus).
  raised: "surface-lift",
  // Deeper gold — the hero-tier surface (score, snapshot, the one featured
  // card per screen).
  premium: "gilt-rich",
};

type CardProps = ComponentProps<"section"> & {
  tone?: CardTone;
  /** Remove the built-in padding when the card owns its own layout. */
  flush?: boolean;
};

/**
 * The single container surface used across the product. Everything that looks
 * like a card is this component, so radius, border and elevation stay
 * identical on every screen (§12, §14).
 */
export function Card({
  className,
  children,
  tone = "default",
  flush = false,
  ...props
}: CardProps) {
  return (
    <section
      className={cn(
        "rounded-card",
        toneClasses[tone],
        !flush && "p-4 sm:p-5",
        className,
      )}
      {...props}
    >
      {children}
    </section>
  );
}

export function CardHeader({
  className,
  children,
}: PropsWithChildren<{ className?: string }>) {
  return (
    <div
      className={cn(
        "mb-4 flex flex-wrap items-start justify-between gap-x-4 gap-y-2",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function CardTitle({
  children,
  className,
}: PropsWithChildren<{ className?: string }>) {
  return (
    <h2 className={cn("text-lg font-semibold text-ink", className)}>
      {children}
    </h2>
  );
}

export function CardDescription({
  children,
  className,
}: PropsWithChildren<{ className?: string }>) {
  return (
    <p className={cn("text-sm text-ink-muted", className)}>{children}</p>
  );
}

export type MetricTone =
  | "brand"
  | "bp"
  | "weight"
  | "food"
  | "meds"
  | "activity"
  | "sleep"
  | "neutral";

/**
 * Icon chip tones. Each vital owns one hue everywhere it appears (§25, §45).
 */
export const metricChipClasses: Record<MetricTone, string> = {
  brand: "bg-brand-soft text-brand-ink",
  bp: "bg-bp-soft text-bp",
  weight: "bg-weight-soft text-weight",
  food: "bg-food-soft text-food",
  meds: "bg-meds-soft text-meds",
  activity: "bg-activity-soft text-activity",
  sleep: "bg-sleep-soft text-sleep",
  neutral: "bg-surface-sunken text-ink-muted",
};
