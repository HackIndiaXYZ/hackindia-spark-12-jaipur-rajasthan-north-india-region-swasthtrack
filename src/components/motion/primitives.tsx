"use client";

import { useEffect, useRef, type CSSProperties, type ReactNode } from "react";
import {
  animate,
  motion,
  useMotionValue,
  useReducedMotion,
  type Transition,
} from "motion/react";
import { cn } from "@/lib/utils";

/**
 * Motion vocabulary for SwasthTrack.
 *
 * The split is deliberate:
 *
 *  - **Entrance and reveal run on CSS**, with `animation-fill-mode: both`. A
 *    compositor-driven keyframe still finishes when the main thread is busy,
 *    the tab is backgrounded, or the device is in low-power mode. A
 *    JS-driven `opacity: 0 → 1` does not, and leaves the screen washed out.
 *  - **Motion drives interaction** — press springs, the wellness arc, layout
 *    transitions. These are triggered by the user and physics is the point.
 *
 *  Nothing exceeds ~450ms, and `prefers-reduced-motion` removes all of it.
 */

export const SPRING: Transition = {
  type: "spring",
  stiffness: 380,
  damping: 30,
  mass: 0.7,
};

/**
 * Staggered entrance container. Sets `--stagger-base` for its children.
 */
export function Stagger({
  children,
  className,
  delay = 0,
}: {
  children: ReactNode;
  className?: string;
  delay?: number;
}) {
  return (
    <div
      className={className}
      style={{ "--stagger-base": `${delay}ms` } as CSSProperties}
    >
      {children}
    </div>
  );
}

/**
 * One revealed element. `index` positions it in the parent's stagger.
 */
export function Reveal({
  children,
  className,
  index = 0,
  as: Tag = "div",
}: {
  children: ReactNode;
  className?: string;
  index?: number;
  as?: "div" | "li" | "section" | "header";
}) {
  return (
    <Tag
      className={cn("reveal", className)}
      style={{ "--stagger-i": index } as CSSProperties}
    >
      {children}
    </Tag>
  );
}

/**
 * Tactile press. Scales and sinks slightly, springs back — the feedback that
 * makes a large tap target feel like a button rather than a coloured rectangle.
 */
export function Pressable({
  children,
  className,
  onClick,
  ariaLabel,
  disabled,
  lift = true,
}: {
  children: ReactNode;
  className?: string;
  onClick?: () => void;
  ariaLabel?: string;
  disabled?: boolean;
  lift?: boolean;
}) {
  const reduced = useReducedMotion();

  return (
    <motion.button
      type="button"
      onClick={onClick}
      aria-label={ariaLabel}
      disabled={disabled}
      className={cn("cursor-pointer text-left disabled:cursor-not-allowed", className)}
      whileTap={reduced ? undefined : { scale: 0.975, y: 1 }}
      whileHover={reduced || !lift ? undefined : { y: -2 }}
      transition={SPRING}
    >
      {children}
    </motion.button>
  );
}

/**
 * Counts a derived value up to its target.
 *
 * Deliberately **not** used for recorded health measurements. A count-up that
 * stalls — a busy main thread, a throttled background tab — leaves a real
 * number frozen at a wrong one, and "10.0 kg" where the record says 81.9 kg is
 * exactly the class of defect this product cannot afford (§43). It is used for
 * the wellness score, which is an index the ring is visibly filling, and for
 * goal percentages.
 *
 * Even there, the exact target is written on completion and on unmount, so the
 * displayed value always settles on the real one.
 */
export function CountUp({
  value,
  decimals = 0,
  duration = 0.9,
  className,
  format,
}: {
  value: number;
  decimals?: number;
  duration?: number;
  className?: string;
  format?: (n: number) => string;
}) {
  const reduced = useReducedMotion();
  const ref = useRef<HTMLSpanElement>(null);
  const mv = useMotionValue(value);

  // Rendered as children first, so the correct number is in the DOM before
  // hydration and stays there if JavaScript never runs.
  const render = (n: number) => (format ? format(n) : n.toFixed(decimals));

  useEffect(() => {
    const node = ref.current;
    if (!node) return;

    // Writing through the DOM node rather than React state: no re-render per
    // frame, and no setState inside the effect body.
    const paint = (n: number) => {
      node.textContent = format ? format(n) : n.toFixed(decimals);
    };

    const unsubscribe = mv.on("change", paint);

    if (reduced) {
      mv.jump(value);
      return unsubscribe;
    }

    mv.jump(0);
    const controls = animate(mv, value, {
      duration,
      ease: [0.22, 0.61, 0.36, 1],
    });

    // If the animation never receives frames — backgrounded tab, throttled
    // device — land on the real value anyway rather than leaving a partial
    // number on screen.
    const guard = setTimeout(
      () => mv.jump(value),
      duration * 1000 + 400,
    );

    return () => {
      controls.stop();
      clearTimeout(guard);
      mv.jump(value);
      unsubscribe();
    };
    // `format` is intentionally excluded: call sites pass an inline arrow, and
    // its identity changing every render would restart the count.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, reduced, duration, decimals, mv]);

  return (
    <span ref={ref} className={cn("tabular", className)}>
      {render(value)}
    </span>
  );
}

/**
 * Horizontal bar that fills from zero. Used for goal progress and macro
 * splits, where the fill length is the information. CSS-driven for the same
 * reason as `Reveal`.
 */
export function GrowBar({
  percent,
  className,
  barClassName,
  delay = 0,
  label,
}: {
  percent: number;
  className?: string;
  barClassName?: string;
  delay?: number;
  label?: string;
}) {
  const clamped = Math.max(0, Math.min(100, percent));

  return (
    <div
      className={cn(
        "h-2 w-full overflow-hidden rounded-full bg-surface-sunken",
        className,
      )}
      role={label ? "img" : "presentation"}
      aria-label={label}
    >
      <div
        className={cn("grow-bar h-full rounded-full grad-spring", barClassName)}
        style={
          {
            "--grow-to": `${clamped}%`,
            animationDelay: `${delay}ms`,
          } as CSSProperties
        }
      />
    </div>
  );
}

export { motion };
