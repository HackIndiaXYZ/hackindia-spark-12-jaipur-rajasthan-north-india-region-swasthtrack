/**
 * Short-range forecast from recent history (pure). This is NOT a trained model:
 * it is a robust straight-line trend (Theil-Sen: the median of pairwise slopes,
 * so one odd reading cannot tilt it) projected a few days ahead, with a band that
 *   - never gets narrower than a physically meaningful minimum,
 *   - widens when there are few points or they scatter a lot, and
 *   - widens with the projection distance (slope uncertainty).
 * The result is a range to compare real readings against, not a diagnosis.
 */
import { median } from "../health-rules";

export interface ForecastPoint {
  /** Days since an arbitrary origin (use whole-day offsets). */
  x: number;
  y: number;
}

export type ForecastConfidence = "High" | "Medium" | "Low";

export interface ForecastResult {
  isAvailable: boolean;
  reason?: { en: string; hi: string };
  center: number;
  lower: number;
  upper: number;
  /** Units per day (robust slope). */
  slopePerDay: number;
  points: number;
  spanDays: number;
  confidence: ForecastConfidence;
  /** Half-width of the band actually used. */
  halfWidth: number;
}

export interface ForecastOptions {
  /** Days beyond the last data point (x) to project to. */
  horizonDays: number;
  /** Fewest points needed; below this nothing is forecast. */
  minPoints: number;
  /** Fewest days between first and last point. */
  minSpanDays: number;
  /** The band is never narrower than +/- this. */
  minHalfWidth: number;
  /** Relative half-width at/below which a good dataset may be called High confidence. */
  highConfidenceRelWidth: number;
  /** Optional hard floor for the lower bound (e.g. 20 kg). */
  floor?: number;
}

/** Median of pairwise slopes. Null when all x are equal. */
export function theilSenSlope(points: ForecastPoint[]): number | null {
  const slopes: number[] = [];
  for (let i = 0; i < points.length; i++) {
    for (let j = i + 1; j < points.length; j++) {
      const dx = points[j].x - points[i].x;
      if (dx !== 0) slopes.push((points[j].y - points[i].y) / dx);
    }
  }
  return median(slopes);
}

export function forecastRange(points: ForecastPoint[], opts: ForecastOptions): ForecastResult {
  const n = points.length;
  const sorted = [...points].sort((a, b) => a.x - b.x);
  const span = n > 0 ? sorted[n - 1].x - sorted[0].x : 0;

  const unavailable = (en: string, hi: string): ForecastResult => ({
    isAvailable: false,
    reason: { en, hi },
    center: 0,
    lower: 0,
    upper: 0,
    slopePerDay: 0,
    points: n,
    spanDays: span,
    confidence: "Low",
    halfWidth: 0,
  });

  if (n < opts.minPoints) {
    return unavailable(
      `At least ${opts.minPoints} readings are needed (have ${n}).`,
      `अनुमान के लिए कम से कम ${opts.minPoints} माप चाहिए (अभी ${n})।`,
    );
  }
  if (span < opts.minSpanDays) {
    return unavailable(
      `Readings must span at least ${opts.minSpanDays} days (they span ${span}).`,
      `माप कम से कम ${opts.minSpanDays} दिनों में फैले होने चाहिए (अभी ${span} दिन)।`,
    );
  }

  const slope = theilSenSlope(sorted) ?? 0;
  const intercept = median(sorted.map((p) => p.y - slope * p.x)) as number;
  const xh = sorted[n - 1].x + opts.horizonDays;
  const center = intercept + slope * xh;

  const residuals = sorted.map((p) => p.y - (intercept + slope * p.x));
  const mad = median(residuals.map((r) => Math.abs(r))) as number;
  const rawSigma = 1.4826 * mad;
  // Fewer points => the scatter we measured is itself less trustworthy.
  const inflate = n >= 12 ? 1 : n >= 8 ? 1.25 : n >= 5 ? 1.6 : 2.2;
  const sigma = Math.max(rawSigma, Math.sqrt(residuals.reduce((s, r) => s + r * r, 0) / n) * 0.5) * inflate;

  const mx = sorted.reduce((s, p) => s + p.x, 0) / n;
  const sxx = sorted.reduce((s, p) => s + (p.x - mx) ** 2, 0);
  const slopeSe = sxx > 0 ? sigma / Math.sqrt(sxx) : 0;
  const slopeTerm = slopeSe * Math.abs(xh - mx);

  const half = Math.max(opts.minHalfWidth, 1.28 * Math.sqrt(sigma ** 2 + slopeTerm ** 2));
  let lower = center - half;
  const upper = center + half;
  if (opts.floor !== undefined) lower = Math.max(opts.floor, lower);

  const rel = Math.abs(center) > 0 ? half / Math.abs(center) : 1;
  const confidence: ForecastConfidence =
    n >= 10 && span >= 14 && rel <= opts.highConfidenceRelWidth ? "High" : n >= 5 && span >= 7 ? "Medium" : "Low";

  return {
    isAvailable: true,
    center,
    lower,
    upper,
    slopePerDay: slope,
    points: n,
    spanDays: span,
    confidence,
    halfWidth: half,
  };
}
