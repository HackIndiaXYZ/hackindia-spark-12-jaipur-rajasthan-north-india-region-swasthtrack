"use client";

import { useId, type CSSProperties } from "react";
import { CountUp } from "@/components/motion/primitives";
import { cn } from "@/lib/utils";

/**
 * The product's signature graphic: today's wellness score as a glowing arc.
 *
 * Built as two stacked strokes — a heavily blurred copy underneath supplies the
 * glow, the sharp copy on top supplies the reading. The arc sweeps from zero on
 * mount and the number counts with it, so the score reads as something that was
 * measured rather than printed.
 *
 * The whole thing is one SVG with no library, so it costs nothing on a phone.
 */
export function WellnessRing({
  score,
  size = 200,
  stroke = 16,
  label,
  hindiLabel,
  className,
  loading = false,
}: {
  /** 0–100. Pass `null` while the real score is still being calculated. */
  score: number | null;
  size?: number;
  stroke?: number;
  label?: string;
  hindiLabel?: string;
  className?: string;
  loading?: boolean;
}) {
  const gradientId = useId();
  const glowId = useId();

  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;

  // Leave a 68° gap at the bottom so the arc reads as a gauge, not a pie.
  const sweep = 0.81;
  const trackLength = circumference * sweep;
  const value = score ?? 0;
  const progress = trackLength * (Math.max(0, Math.min(100, value)) / 100);

  const arcStyle = {
    "--arc-from": `0 ${circumference}`,
    "--arc-to": `${progress} ${circumference}`,
  } as CSSProperties;

  return (
    <div
      className={cn("relative shrink-0", className)}
      style={{ width: size, height: size }}
      role="img"
      aria-label={
        score === null
          ? "Daily wellness score, still calculating"
          : `Daily wellness score ${score} out of 100`
      }
    >
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        // Rotated so the gap sits centred at the bottom.
        style={{ transform: "rotate(125deg)" }}
        aria-hidden
      >
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="var(--color-spring-1)" />
            <stop offset="55%" stopColor="var(--color-spring-2)" />
            <stop offset="100%" stopColor="var(--color-spring-3)" />
          </linearGradient>
          <filter id={glowId} x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation={stroke * 0.55} result="blur" />
            <feComposite in="blur" operator="over" />
          </filter>
        </defs>

        {/* Track */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="var(--color-surface-sunken)"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${trackLength} ${circumference}`}
        />

        {/* Glow copy, then the sharp copy on top. Both sweep via CSS so the
            arc always settles at its measured length. */}
        {score !== null ? (
          <>
            <circle
              className="arc-sweep"
              style={arcStyle}
              cx={size / 2}
              cy={size / 2}
              r={radius}
              fill="none"
              stroke={`url(#${gradientId})`}
              strokeWidth={stroke}
              strokeLinecap="round"
              filter={`url(#${glowId})`}
              opacity={0.5}
            />
            <circle
              className="arc-sweep"
              style={arcStyle}
              cx={size / 2}
              cy={size / 2}
              r={radius}
              fill="none"
              stroke={`url(#${gradientId})`}
              strokeWidth={stroke}
              strokeLinecap="round"
            />
          </>
        ) : null}
      </svg>

      {/* Centre readout */}
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        {loading || score === null ? (
          <>
            <span
              className="skeleton block rounded-md"
              style={{ width: size * 0.28, height: size * 0.22 }}
            />
            <span lang="hi" className="mt-2 text-2xs text-ink-subtle">
              गणना हो रही है…
            </span>
          </>
        ) : (
          <>
            <CountUp
              value={score}
              className="text-5xl font-semibold leading-none tracking-tight text-ink"
              format={(n) => String(Math.round(n))}
            />
            <span className="tabular mt-1 text-sm font-medium text-ink-subtle">
              / 100
            </span>
            {label ? (
              <span className="mt-2 text-xs font-semibold text-ink-muted">
                {label}
              </span>
            ) : null}
            {hindiLabel ? (
              <span lang="hi" className="text-2xs text-ink-subtle">
                {hindiLabel}
              </span>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}
