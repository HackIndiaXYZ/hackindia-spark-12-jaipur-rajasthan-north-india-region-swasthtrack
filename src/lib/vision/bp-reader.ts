/**
 * Turns the rows of digits read from a photo of a blood-pressure monitor into a
 * systolic / diastolic / pulse suggestion. Monitors print the three numbers top
 * to bottom (SYS largest, DIA, then PULSE, often smaller), or SYS and DIA side by
 * side with the pulse below. Dates and times on the panel are small and carry
 * "-" or ":" between the digits, so they fall out of the running.
 */
import type { Box } from "./gray";
import type { SevenSegmentResult } from "./seven-segment";

export interface BPReading {
  systolic: number;
  diastolic: number;
  pulse: number | null;
  /** 0..1, the weakest digit among the numbers used. */
  confidence: number;
  /** Ranking score across all the passes (bigger is better). */
  rank: number;
  polarity: "dark" | "light";
  /** Degrees the image was turned to level the rows; the boxes are in that turned frame. */
  rotation: number;
  boxes: { systolic: Box; diastolic: Box; pulse: Box | null };
  /** Coordinate space of the boxes. */
  width: number;
  height: number;
  /** Why the confidence is what it is, in Hindi, for the confirmation screen. */
  notes: string[];
}

interface Candidate {
  value: number;
  confidence: number;
  box: Box;
  digitHeight: number;
  /** Row index, top to bottom. */
  row: number;
  cx: number;
}

/** Below this the digits were not read clearly enough to suggest a reading at all. */
export const MIN_READING_CONFIDENCE = 0.4;
const SYS = { min: 60, max: 260 };
const DIA = { min: 30, max: 160 };
const PULSE = { min: 30, max: 200 };

const inRange = (v: number, r: { min: number; max: number }) => Number.isInteger(v) && v >= r.min && v <= r.max;

function candidates(result: SevenSegmentResult): Candidate[] {
  const out: Candidate[] = [];
  const rows = [...result.rows].sort((a, b) => a.box.y0 - b.box.y0);
  rows.forEach((row, index) => {
    for (const n of row.numbers) {
      if (n.text.includes(".")) continue;
      if (n.text.length < 2 || n.text.length > 3) continue;
      out.push({ value: n.value, confidence: n.confidence, box: n.box, digitHeight: row.digitHeight, row: index, cx: (n.box.x0 + n.box.x1) / 2 });
    }
  });
  return out;
}

/**
 * The passes (threshold windows, polarities) read the same panel with different
 * strengths: one gets the top row, another the bottom. Numbers from every pass of
 * one polarity are pooled; where two readings occupy the same spot the surer one
 * (a longer number of fair confidence first) is kept. Row order is then rebuilt
 * from the positions.
 */
function fuse(results: SevenSegmentResult[]): SevenSegmentResult | null {
  if (results.length === 0) return null;
  type Pooled = Candidate & { kept: boolean };
  const pool: Pooled[] = [];
  for (const r of results) for (const c of candidates(r)) pool.push({ ...c, kept: true });
  const digits = (c: Candidate) => String(c.value).length;
  const quality = (c: Candidate) => (digits(c) >= 3 && c.confidence >= 0.3 ? 1 : 0) + c.confidence;
  pool.sort((a, b) => quality(b) - quality(a));
  const chosen: Pooled[] = [];
  for (const c of pool) {
    const h = c.digitHeight;
    const cy = (c.box.y0 + c.box.y1) / 2;
    const clash = chosen.some((k) => {
      const ky = (k.box.y0 + k.box.y1) / 2;
      const xOverlap = Math.min(k.box.x1, c.box.x1) - Math.max(k.box.x0, c.box.x0);
      return Math.abs(ky - cy) < 0.5 * Math.max(h, k.digitHeight) && xOverlap > 0.3 * Math.min(k.box.x1 - k.box.x0, c.box.x1 - c.box.x0);
    });
    if (!clash) chosen.push(c);
  }
  // Rebuild rows from vertical position.
  chosen.sort((a, b) => (a.box.y0 + a.box.y1) / 2 - (b.box.y0 + b.box.y1) / 2);
  const rows: Array<{ cy: number; h: number; items: Pooled[] }> = [];
  for (const c of chosen) {
    const cy = (c.box.y0 + c.box.y1) / 2;
    const row = rows.find((r) => Math.abs(r.cy - cy) < 0.5 * Math.max(r.h, c.digitHeight));
    if (row) row.items.push(c);
    else rows.push({ cy, h: c.digitHeight, items: [c] });
  }
  const base = results[0];
  return {
    ...base,
    rows: rows.map((r) => ({
      tokens: [],
      box: { x0: Math.min(...r.items.map((i) => i.box.x0)), y0: Math.min(...r.items.map((i) => i.box.y0)), x1: Math.max(...r.items.map((i) => i.box.x1)), y1: Math.max(...r.items.map((i) => i.box.y1)) },
      digitHeight: Math.max(...r.items.map((i) => i.digitHeight)),
      numbers: r.items.sort((a, b) => a.cx - b.cx).map((i) => ({ text: String(i.value), value: i.value, confidence: i.confidence, box: i.box })),
    })),
  };
}

function pick(result: SevenSegmentResult): BPReading | null {
  const all = candidates(result);
  if (all.length < 2) return null;
  const tallest = Math.max(...all.map((c) => c.digitHeight));
  // The readings are the big digits; the clock and date are much smaller.
  // Reading order: row by row from the top, left to right within a row.
  const big = all.filter((c) => c.digitHeight >= tallest * 0.5).sort((a, b) => a.row - b.row || a.cx - b.cx);

  // Reading order: top to bottom, left to right. Try every ordered triple/pair that
  // respects it and keep the first valid one, preferring three numbers over two.
  const tryAssign = (sys: Candidate, dia: Candidate, pulse: Candidate | null): BPReading | null => {
    if (!inRange(sys.value, SYS) || !inRange(dia.value, DIA)) return null;
    if (sys.value <= dia.value) return null;
    if (pulse && !inRange(pulse.value, PULSE)) return null;
    const notes: string[] = [];
    const confidence = Math.min(sys.confidence, dia.confidence, pulse ? pulse.confidence : 1);
    if (sys.value - dia.value < 15) notes.push("ऊपर और नीचे वाले अंक बहुत पास हैं, एक बार मशीन से मिला लें।");
    if (!pulse) notes.push("नब्ज़ फोटो में नहीं पढ़ी जा सकी।");
    // Plausibility: a pulse read too, three digits of systolic, both numbers in the same
    // font size and (on a stacked panel) sharing a right edge, and sure digits.
    let rank = confidence * 2 + (pulse ? 1.5 : 0) + (sys.value >= 100 ? 0.5 : 0);
    const sizeRatio = sys.digitHeight / dia.digitHeight;
    if (sizeRatio >= 0.8 && sizeRatio <= 1.25) rank += 0.5;
    const sameRow = sys.row === dia.row;
    if (!sameRow && Math.abs(sys.box.x1 - dia.box.x1) <= sys.digitHeight * 0.35) rank += 0.5;
    if (pulse && pulse.digitHeight < sys.digitHeight * 0.5) rank -= 0.5;
    return {
      systolic: sys.value,
      diastolic: dia.value,
      pulse: pulse ? pulse.value : null,
      confidence,
      rank,
      polarity: result.polarity,
      rotation: result.rotation,
      boxes: { systolic: sys.box, diastolic: dia.box, pulse: pulse ? pulse.box : null },
      width: result.width,
      height: result.height,
      notes,
    };
  };

  let best: BPReading | null = null;
  const consider = (r: BPReading | null) => {
    if (!r) return;
    if (!best || r.rank > best.rank) best = r;
  };
  for (let i = 0; i < big.length; i++) {
    for (let j = i + 1; j < big.length; j++) {
      for (let k = j + 1; k < big.length; k++) consider(tryAssign(big[i], big[j], big[k]));
      consider(tryAssign(big[i], big[j], null));
    }
  }
  return best;
}

/** The best blood-pressure interpretation across every pass, or null when none is plausible. */
export function interpretBP(results: SevenSegmentResult[]): BPReading | null {
  let best: BPReading | null = null;
  const consider = (result: SevenSegmentResult | null) => {
    if (!result) return;
    const r = pick(result);
    if (r && (!best || r.rank > best.rank)) best = r;
  };
  for (const result of results) consider(result);
  // Fused readings per polarity and levelling angle (the passes complement each other,
  // and boxes are only comparable within one angle); they rank a little below a single
  // clean pass with the same numbers, so a clean pass still wins ties.
  const groups = new Map<string, SevenSegmentResult[]>();
  for (const r of results) {
    const key = `${r.polarity}@${r.rotation}`;
    groups.set(key, [...(groups.get(key) ?? []), r]);
  }
  for (const group of groups.values()) {
    if (group.length < 2) continue;
    const fused = fuse(group);
    const r = fused ? pick(fused) : null;
    if (r) {
      r.rank -= 0.1;
      if (!best || r.rank > best.rank) best = r;
    }
  }
  const final: BPReading | null = best;
  return final && final.confidence >= MIN_READING_CONFIDENCE ? final : null;
}
