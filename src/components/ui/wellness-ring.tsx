"use client";

import { useId, type CSSProperties } from "react";
import { CountUp } from "@/components/motion/primitives";
import { cn } from "@/lib/utils";

/**
 * The product's signature graphic: today's wellness score as a gold-foil arc
 * on a frosted dial.
 *
 * Built to sit on the deeper `.gilt-rich` hero surface, where a plain gold
 * stroke would vanish into the gold behind it. Three things keep it readable:
 *   - a frosted-white dial behind the arc, so the arc has a light ground,
 *   - the arc is a small metal tube — a bronze rim, a gold body and a thin
 *     champagne highlight — so its edge holds >= 3:1 against the dial,
 *   - a blurred gold copy underneath supplies the glow.
 * The arc sweeps from zero on mount and the number counts with it, so the score
 * reads as something that was measured rather than printed.
 *
 * One SVG, no library, so it costs nothing on a phone.
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
  const bodyId = useId();
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

  const center = size / 2;
  const bodyStroke = Math.max(stroke - 5, 4);
  const highlightStroke = Math.max(Math.round(stroke * 0.12), 1.5);
  const showArc = score !== null && !loading;

  // Type scales with the dial so a smaller ring never overflows its face.
  const scoreFont = Math.round(size * 0.27);
  const subFont = Math.max(Math.round(size * 0.07), 12);

  return (
    <div
      className={cn("relative shrink-0", className)}
      style={{ width: size, height: size }}
      role="img"
      aria-label={
        score === null
          ? "Daily wellness score, still calculating"
          : `Daily wellness score ${score} out of 100${label ? `, ${label}` : ""}`
      }
    >
      {/* Frosted dial: the arc's light ground, and the ring's ambient glow. */}
      <span
        aria-hidden
        className="absolute inset-0 rounded-full bg-surface/55 shadow-glow-gold ring-1 ring-inset ring-surface/70"
      />

      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        // Rotated so the gap sits centred at the bottom.
        style={{ transform: "rotate(125deg)" }}
        className="relative"
        aria-hidden
      >
        <defs>
          <linearGradient id={bodyId} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="var(--color-spring-1)" />
            <stop offset="55%" stopColor="var(--color-spring-2)" />
            <stop offset="100%" stopColor="var(--color-spring-2)" />
          </linearGradient>
          <filter id={glowId} x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation={stroke * 0.5} />
          </filter>
        </defs>

        {/* Track: a recessed champagne groove. */}
        <circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          stroke="var(--color-line-strong)"
          strokeOpacity={0.5}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${trackLength} ${circumference}`}
        />

        {showArc ? (
          <>
            {/* Glow */}
            <circle
              className="arc-sweep"
              style={arcStyle}
              cx={center}
              cy={center}
              r={radius}
              fill="none"
              stroke="var(--color-spring-2)"
              strokeWidth={stroke}
              strokeLinecap="round"
              filter={`url(#${glowId})`}
              opacity={0.65}
            />
            {/* Bronze rim */}
            <circle
              className="arc-sweep"
              style={arcStyle}
              cx={center}
              cy={center}
              r={radius}
              fill="none"
              stroke="var(--color-spring-3)"
              strokeWidth={stroke}
              strokeLinecap="round"
            />
            {/* Gold body */}
            <circle
              className="arc-sweep"
              style={arcStyle}
              cx={center}
              cy={center}
              r={radius}
              fill="none"
              stroke={`url(#${bodyId})`}
              strokeWidth={bodyStroke}
              strokeLinecap="round"
            />
            {/* Champagne highlight on the outer shoulder of the tube */}
            <circle
              className="arc-sweep"
              style={arcStyle}
              cx={center}
              cy={center}
              r={radius + bodyStroke * 0.22}
              fill="none"
              stroke="var(--color-gilt-1)"
              strokeOpacity={0.75}
              strokeWidth={highlightStroke}
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
            <span lang="hi" className="mt-2 text-2xs text-ink-muted">
              गणना हो रही है…
            </span>
          </>
        ) : (
          <>
            <span
              className="font-semibold leading-none tracking-tight text-ink"
              style={{ fontSize: scoreFont }}
            >
              <CountUp value={score} format={(n) => String(Math.round(n))} />
            </span>
            <span
              className="tabular mt-1 font-medium text-ink-muted"
              style={{ fontSize: subFont }}
            >
              / 100
            </span>
            {label ? (
              <span className="mt-1.5 max-w-[78%] text-center text-xs font-semibold leading-tight text-ink-muted">
                {label}
              </span>
            ) : null}
            {hindiLabel ? (
              <span lang="hi" className="max-w-[78%] text-center text-2xs leading-tight text-ink-muted">
                {hindiLabel}
              </span>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}
