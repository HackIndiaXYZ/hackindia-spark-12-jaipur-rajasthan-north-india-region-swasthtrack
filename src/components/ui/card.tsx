import type { ComponentProps, PropsWithChildren, ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

type CardTone = "default" | "sunken" | "raised" | "premium";

const toneClasses: Record<CardTone, string> = {
  // Every card carries the same top highlight as the rest of the product, so
  // surfaces read as lit from one direction (§38).
  default: "bg-surface shadow-e2",
  sunken: "bg-surface-sunken shadow-none",
  raised: "surface-lift",
  // Gold hairline edge — the hero-tier surface (score, snapshot, the one
  // featured card per screen). Not for routine content cards.
  premium: "gold-edge",
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
        tone === "raised" || tone === "premium" ? "" : "border border-line",
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

/**
 * Card with the standard title row: icon chip, English title, Hindi subtitle,
 * optional badge and a right-aligned action.
 */
export function PanelCard({
  title,
  hindiTitle,
  icon: Icon,
  tone = "brand",
  badge,
  action,
  children,
  className,
  bodyClassName,
}: {
  title: string;
  hindiTitle?: string;
  icon?: LucideIcon;
  tone?: MetricTone;
  badge?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <Card className={className}>
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          {Icon ? (
            <span
              className={cn(
                "grid h-10 w-10 shrink-0 place-items-center rounded-control",
                metricChipClasses[tone],
              )}
            >
              <Icon aria-hidden className="h-5 w-5" />
            </span>
          ) : null}
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="truncate text-lg font-semibold text-ink">
                {title}
              </h2>
              {badge}
            </div>
            {hindiTitle ? (
              <p lang="hi" className="truncate text-xs text-ink-subtle">
                {hindiTitle}
              </p>
            ) : null}
          </div>
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
      <div className={bodyClassName}>{children}</div>
    </Card>
  );
}
