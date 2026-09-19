import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

type ButtonVariant =
  | "primary"
  | "secondary"
  | "ghost"
  | "danger"
  | "quiet";

type ButtonSize = "sm" | "md" | "lg";

/**
 * One button system for the whole product (§45). A given action always looks
 * the same: Save is `primary`, Cancel is `secondary`, Delete is `danger`.
 */
const variantClasses: Record<ButtonVariant, string> = {
  // The signature gold gradient plus a top inner highlight: the button reads
  // as a lit, raised surface rather than a flat fill. Dark ink text (not
  // white) so it carries AA contrast against the gold foil, and a single
  // light sweep on hover/focus is the product's one "premium shine" gesture.
  primary:
    "shine-sweep grad-spring text-gold-ink shadow-[0_1px_2px_rgba(16,32,28,.12),0_6px_16px_-6px_rgba(156,109,30,.5),inset_0_1px_0_rgba(255,255,255,.5)] " +
    "hover:brightness-105 hover:shadow-glow-gold active:brightness-95",
  secondary:
    "surface-lift text-ink hover:border-brand-line hover:bg-brand-softer",
  ghost:
    "text-ink-muted hover:bg-surface-sunken hover:text-ink",
  quiet:
    "border border-line bg-surface-sunken text-ink-muted hover:bg-surface hover:text-ink",
  danger:
    "border border-critical-line bg-critical-soft text-critical shadow-e1 hover:bg-critical hover:text-ink-inverse",
};

const sizeClasses: Record<ButtonSize, string> = {
  sm: "min-h-control-sm px-3 text-xs gap-1.5",
  md: "min-h-control px-4 text-sm gap-2",
  lg: "min-h-control-lg px-5 text-base gap-2",
};

type ButtonProps = ComponentProps<"button"> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Stretch to the container width — the default on mobile forms. */
  block?: boolean;
};

export function Button({
  className,
  variant = "secondary",
  size = "md",
  block = false,
  type = "button",
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      className={cn(
        // `whitespace-nowrap` is deliberate: bilingual labels used to wrap to
        // three lines inside fixed-height buttons.
        "pressable inline-flex shrink-0 cursor-pointer items-center justify-center",
        "whitespace-nowrap rounded-control font-semibold leading-none",
        "transition-[transform,box-shadow,background-color,border-color,filter]",
        "disabled:pointer-events-none disabled:opacity-50",
        sizeClasses[size],
        variantClasses[variant],
        block && "w-full",
        className,
      )}
      {...props}
    />
  );
}

/**
 * Square icon-only button. Always needs an aria-label.
 */
export function IconButton({
  className,
  variant = "quiet",
  size = "md",
  type = "button",
  ...props
}: Omit<ButtonProps, "block">) {
  const box = size === "sm" ? "h-9 w-9" : size === "lg" ? "h-13 w-13" : "h-11 w-11";

  return (
    <button
      type={type}
      className={cn(
        "pressable inline-flex shrink-0 cursor-pointer items-center justify-center",
        "rounded-control disabled:pointer-events-none disabled:opacity-50",
        box,
        variantClasses[variant],
        className,
      )}
      {...props}
    />
  );
}
