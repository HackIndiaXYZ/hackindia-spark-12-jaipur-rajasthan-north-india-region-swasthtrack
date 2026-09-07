"use client";

import { useId } from "react";
import { cn } from "@/lib/utils";

const toneVar: Record<string, string> = {
  bp: "var(--color-bp)",
  weight: "var(--color-weight)",
  food: "var(--color-food)",
  meds: "var(--color-meds)",
  activity: "var(--color-activity)",
  sleep: "var(--color-sleep)",
  brand: "var(--color-brand)",
  neutral: "var(--color-ink-subtle)",
};

/**
 * Trailing series for a vital, drawn as a filled sparkline with an emphasised
 * endpoint.
 *
 * It plots only real readings — the caller filters out days with no record
 * rather than interpolating them — so the line never implies a measurement
 * that was not taken (§43). Below two points there is nothing to draw and the
 * component renders nothing rather than a misleading flat line.
 */
export function Sparkline({
  values,
  tone = "brand",
  width = 92,
  height = 26,
  className,
  label,
}: {
  values: number[];
  tone?: keyof typeof toneVar;
  width?: number;
  height?: number;
  className?: string;
  label?: string;
}) {
  const gradientId = useId();

  if (!values || values.length < 2) return null;

  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;

  // Inset by the endpoint halo radius so nothing is drawn outside the box.
  const pad = 5;
  const w = width - pad * 2;
  const h = height - pad * 2;

  const points = values.map((v, i) => {
    const x = pad + (i / (values.length - 1)) * w;
    const y = pad + h - ((v - min) / span) * h;
    return [x, y] as const;
  });

  const line = points.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const area = `${line} L${(pad + w).toFixed(1)},${height} L${pad},${height} Z`;
  const [lastX, lastY] = points[points.length - 1];
  const stroke = toneVar[tone] ?? toneVar.brand;

  return (
    <span
      className={cn("relative block", className)}
      style={{ height }}
      role={label ? "img" : "presentation"}
      aria-label={label}
    >
      <svg
        viewBox={`0 0 ${width} ${height}`}
        width="100%"
        height={height}
        // The box is stretched to the tile width; `non-scaling-stroke` below
        // keeps the line an even weight, and the endpoint is a DOM element so
        // it stays a circle instead of being squashed into an ellipse.
        preserveAspectRatio="none"
        className="block"
        aria-hidden
      >
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={stroke} stopOpacity="0.2" />
            <stop offset="100%" stopColor={stroke} stopOpacity="0" />
          </linearGradient>
        </defs>

        <path d={area} fill={`url(#${gradientId})`} stroke="none" />
        <path
          d={line}
          fill="none"
          stroke={stroke}
          strokeWidth="1.75"
          strokeLinecap="round"
          strokeLinejoin="round"
          opacity="0.9"
          vectorEffect="non-scaling-stroke"
        />
      </svg>

      {/* Where the series is now. */}
      <span
        aria-hidden
        className="absolute h-1.5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full"
        style={{
          left: `${(lastX / width) * 100}%`,
          top: `${(lastY / height) * 100}%`,
          background: stroke,
          boxShadow: `0 0 0 3px color-mix(in srgb, ${stroke} 22%, transparent)`,
        }}
      />
    </span>
  );
}
