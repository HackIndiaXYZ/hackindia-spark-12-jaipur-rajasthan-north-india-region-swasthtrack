"use client";

import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/utils";

export type DepthLevel = 1 | 2 | 3;

export interface DepthCardProps extends ComponentProps<"div"> {
  depth?: DepthLevel;
  interactive?: boolean;
  /** Gold hairline across the top — pairs with `glow="gold"` for the one hero card on a screen. */
  highlight?: boolean;
  /** `gold` is the premium option; everything else stays on the neutral elevation scale. */
  glow?: "gold" | "none";
  surface?: "white" | "slate" | "gradient" | "glass";
  className?: string;
  children: ReactNode;
}

// Depth reuses the product's own elevation scale (globals.css) instead of
// composing ad hoc shadows, so a "3D" card sits at the same lit angle as
// every other surface in the product.
const depthStyles: Record<DepthLevel, string> = {
  1: "border-line shadow-e1",
  2: "border-line shadow-e2",
  3: "border-line-strong shadow-e3 ring-1 ring-ink/[0.02]",
};

const surfaceStyles: Record<NonNullable<DepthCardProps["surface"]>, string> = {
  white: "bg-surface",
  slate: "bg-surface-sunken/80",
  gradient: "bg-gradient-to-b from-surface to-surface-sunken/60",
  glass: "bg-surface/95 backdrop-blur-sm",
};

/**
 * Card with tactile press interactions and a subtle elevation step. Prefer
 * `Card` for ordinary content; use this where a screen needs a second
 * elevation level or the gold hero treatment.
 */
export function DepthCard({
  depth = 2,
  interactive = false,
  highlight = false,
  glow = "none",
  surface = "white",
  className,
  children,
  ...props
}: DepthCardProps) {
  const gold = glow === "gold";

  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-card border transition-[box-shadow,transform,border-color] duration-150",
        gold ? "border-gold-line shadow-glow-gold" : depthStyles[depth],
        surfaceStyles[surface],
        highlight &&
          "before:absolute before:inset-x-0 before:top-0 before:h-1 before:grad-spring",
        interactive &&
          "cursor-pointer select-none hover:border-line-strong hover:shadow-e3 active:translate-y-0.5 active:scale-[0.985]",
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}
