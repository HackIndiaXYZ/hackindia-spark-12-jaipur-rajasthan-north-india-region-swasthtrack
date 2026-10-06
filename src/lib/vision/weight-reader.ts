/**
 * Turns the rows of digits read from a photo of a weighing scale into a weight
 * in kg. The reading is the largest number on the panel, usually with one
 * decimal ("72.5"). Scales do not print the unit in a readable size, so kg is
 * assumed and the person confirms.
 */
import type { Box } from "./gray";
import type { SevenSegmentResult } from "./seven-segment";

export interface WeightReading {
  kg: number;
  /** 0..1, the weakest digit of the number. */
  confidence: number;
  polarity: "dark" | "light";
  /** Degrees the image was turned to level the rows; the box is in that turned frame. */
  rotation: number;
  box: Box;
  width: number;
  height: number;
  /** True when no decimal point was seen and one was inferred ("725" -> 72.5). */
  decimalAssumed: boolean;
  notes: string[];
}

const MIN_KG = 10;
const MAX_KG = 300;
/** Below this the digits were not read clearly enough to suggest a weight at all. */
export const MIN_READING_CONFIDENCE = 0.4;

export interface DisplayNumber {
  text: string;
  value: number;
  confidence: number;
  polarity: "dark" | "light";
  box: Box;
  digitHeight: number;
}

/**
 * The number a scale is showing, whatever its unit: the most prominent run of
 * digits (two or more, tallest first, then the surest). Used by the weight
 * interpretation and by the evaluation of kitchen scales reading grams.
 */
export function pickDisplayNumber(results: SevenSegmentResult[]): DisplayNumber | null {
  let best: DisplayNumber | null = null;
  let bestScore = -Infinity;
  for (const result of results) {
    for (const row of result.rows) {
      const digitTokens = row.tokens.filter((t) => t.kind === "digit").length;
      const unknowns = row.tokens.filter((t) => t.kind === "unknown").length;
      // A reading sits in a clean row; clutter yields rows full of unreadable cells.
      const cleanliness = digitTokens / Math.max(1, digitTokens + unknowns);
      for (const n of row.numbers) {
        const digits = n.text.replace(".", "").length;
        if (digits > 5) continue;
        // One lone digit is more often a stray blob than a reading; prefer longer numbers, then taller, surer, cleaner ones.
        const score = (digits >= 2 ? 1000 : 0) + row.digitHeight * (0.5 + n.confidence) * (0.3 + 0.7 * cleanliness);
        if (score > bestScore) {
          bestScore = score;
          best = { text: n.text, value: n.value, confidence: n.confidence, polarity: result.polarity, box: n.box, digitHeight: row.digitHeight };
        }
      }
    }
  }
  return best;
}

export function interpretWeight(results: SevenSegmentResult[]): WeightReading | null {
  let best: WeightReading | null = null;
  const consider = (r: WeightReading, rank: number) => {
    const score = rank + r.confidence;
    const bestScore = best ? (best as WeightReading & { rank: number }).rank + best.confidence : -1;
    if (!best || score > bestScore) best = Object.assign(r, { rank });
  };
  for (const result of results) {
    const tallest = Math.max(0, ...result.rows.map((r) => r.digitHeight));
    for (const row of result.rows) {
      if (row.digitHeight < tallest * 0.6) continue; // the reading is the big number
      for (const n of row.numbers) {
        const digits = n.text.replace(".", "");
        if (digits.length < 2 || digits.length > 5) continue;
        const base = { confidence: n.confidence, polarity: result.polarity, rotation: result.rotation, box: n.box, width: result.width, height: result.height };
        if (n.text.includes(".")) {
          if (n.value >= MIN_KG && n.value <= MAX_KG) consider({ ...base, kg: n.value, decimalAssumed: false, notes: [] }, 2);
          continue;
        }
        if (n.value >= MIN_KG && n.value <= MAX_KG) consider({ ...base, kg: n.value, decimalAssumed: false, notes: [] }, 1);
        // "725" is almost always 72.5 with the point lost to glare.
        const tenth = n.value / 10;
        if (digits.length >= 3 && tenth >= 25 && tenth <= 200) {
          consider(
            { ...base, kg: Math.round(tenth * 10) / 10, confidence: n.confidence * 0.7, decimalAssumed: true, notes: ["दशमलव का बिंदु फोटो में साफ़ नहीं दिखा; वजन जाँच लें।"] },
            0.5,
          );
        }
      }
    }
  }
  if (!best) return null;
  const { rank: _rank, ...reading } = best as WeightReading & { rank: number };
  void _rank;
  return reading.confidence >= MIN_READING_CONFIDENCE ? reading : null;
}
