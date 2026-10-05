import type { ComponentProps } from "react";
import { LoaderCircle } from "lucide-react";
import { cn } from "@/lib/utils";

type ButtonVariant =
  | "primary"
  | "secondary"
  | "ghost"
  | "danger"
  | "destructive"
  | "quiet";

type ButtonSize = "sm" | "md" | "lg";

/**
 * One button system for the whole product (§45). A given action always looks
 * the same: Save is `primary`, Cancel is `secondary`, Delete is `danger`
 * (soft, turns solid on hover) or `destructive` (solid, for the confirm step
 * of an irreversible action).
 */
const variantClasses: Record<ButtonVariant, string> = {
  // Gold gradient plus a top inner highlight: the button reads as a lit,
  // raised surface rather than a flat fill. This uses `.grad-gold-button`
  // (spring-1 -> gold-line), an AA-safe subset of the signature gradient —
  // the full grad-spring range dips as low as ~1.8:1 contrast against
  // gold-ink on its darker (bronze) stop, which a full-width label can sit
  // on top of. Dark ink text so it carries AA contrast against the gold
  // foil, and a single light sweep on hover/focus is the product's one
  // "premium shine" gesture. Gold buttons are always this variant; nobody
  // hand-rolls `shine-sweep grad-spring`.
  primary:
    "shine-sweep grad-gold-button text-gold-ink shadow-gold-button " +
    "hover:brightness-105 hover:shadow-gold-button-hover active:brightness-95",
  secondary:
    "surface-lift text-ink hover:[--lift-fill:var(--color-gilt-1)] " +
    "active:[--lift-fill:var(--color-gilt-2)]",
  ghost:
    "text-ink-muted hover:bg-gold-soft hover:text-ink active:bg-gilt-3",
  quiet:
    "border border-line bg-surface-sunken text-ink-muted hover:bg-surface hover:text-ink active:bg-line",
  danger:
    "border border-critical-line bg-critical-soft text-critical shadow-e1 " +
    "hover:bg-critical hover:text-ink-inverse active:brightness-95",
  destructive:
    "border border-critical bg-critical text-ink-inverse shadow-e1 " +
    "hover:brightness-95 active:brightness-90",
};

// `sm` is 36px for dense desktop rows; on touch screens every size is lifted
// to the 44px floor (§44).
const sizeClasses: Record<ButtonSize, string> = {
  sm: "min-h-control-sm px-3 text-xs gap-1.5 pointer-coarse:min-h-control",
  md: "min-h-control px-4 text-sm gap-2",
  lg: "min-h-control-lg px-5 text-base gap-2",
};

type ButtonProps = ComponentProps<"button"> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Stretch to the container width — the default on mobile forms. */
  block?: boolean;
  /**
   * Shows a spinner, sets `aria-busy` and blocks further presses (so a slow
   * Save cannot be submitted twice). The label stays so the width does not jump.
   */
  loading?: boolean;
};

/**
 * The Button look as a class string, for the cases where the element must be a
 * link (`<Link className={buttonClasses({ variant: "primary" })}>`) rather than
 * a `<button>`. Keeps links that act as buttons identical to real ones.
 */
export function buttonClasses({
  variant = "secondary",
  size = "md",
  block = false,
  loading = false,
  className,
}: {
  variant?: ButtonVariant;
  size?: ButtonSize;
  block?: boolean;
  loading?: boolean;
  className?: string;
} = {}) {
  return cn(
    // `whitespace-nowrap` is deliberate: bilingual labels used to wrap to
    // three lines inside fixed-height buttons.
    "pressable inline-flex shrink-0 cursor-pointer select-none items-center justify-center",
    "whitespace-nowrap rounded-control font-semibold leading-none",
    "transition-[transform,box-shadow,background-color,border-color,filter]",
    "disabled:pointer-events-none disabled:shadow-none",
    loading ? "disabled:opacity-90" : "disabled:opacity-50",
    sizeClasses[size],
    variantClasses[variant],
    block && "w-full",
    className,
  );
}

export function Button({
  className,
  variant = "secondary",
  size = "md",
  block = false,
  loading = false,
  disabled,
  type = "button",
  children,
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={buttonClasses({ variant, size, block, loading, className })}
      {...props}
    >
      {loading ? (
        <LoaderCircle aria-hidden className="st-spinner h-4 w-4 shrink-0" />
      ) : null}
      {children}
    </button>
  );
}

/**
 * Square icon-only button. Always needs an aria-label.
 */
export function IconButton({
  className,
  variant = "quiet",
  size = "md",
  loading = false,
  disabled,
  type = "button",
  children,
  ...props
}: Omit<ButtonProps, "block">) {
  const box =
    size === "sm"
      ? "h-9 w-9 pointer-coarse:h-11 pointer-coarse:w-11"
      : size === "lg"
        ? "h-13 w-13"
        : "h-11 w-11";

  return (
    <button
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cn(
        "pressable inline-flex shrink-0 cursor-pointer items-center justify-center",
        "rounded-control disabled:pointer-events-none disabled:shadow-none",
        loading ? "disabled:opacity-90" : "disabled:opacity-50",
        box,
        variantClasses[variant],
        className,
      )}
      {...props}
    >
      {loading ? (
        <LoaderCircle aria-hidden className="st-spinner h-4 w-4" />
      ) : (
        children
      )}
    </button>
  );
}
