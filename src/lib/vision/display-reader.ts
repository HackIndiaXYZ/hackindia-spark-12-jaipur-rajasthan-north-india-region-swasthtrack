/**
 * One call for the camera dialogs: reads a grey photo of a blood-pressure monitor
 * or a weighing scale. Runs inside the Web Worker (./ocr.worker.ts) so a slow
 * phone keeps its screen responsive, but it is plain code and works anywhere.
 */
import { interpretBP, type BPReading } from "./bp-reader";
import type { GrayImage } from "./gray";
import { readSevenSegment } from "./seven-segment";
import { interpretWeight, type WeightReading } from "./weight-reader";

export type DisplayKind = "bp" | "weight";

export type DisplayReadResult =
  | { kind: "bp"; reading: BPReading | null; ms: number }
  | { kind: "weight"; reading: WeightReading | null; ms: number };

export function readDisplay(kind: DisplayKind, image: GrayImage): DisplayReadResult {
  const started = Date.now();
  const results = readSevenSegment(image);
  const ms = Date.now() - started;
  if (kind === "bp") return { kind, reading: interpretBP(results), ms };
  return { kind, reading: interpretWeight(results), ms };
}

export interface WorkerRequest {
  id: number;
  kind: DisplayKind;
  width: number;
  height: number;
  /** Grey pixels, transferred. */
  data: ArrayBuffer;
}

export type WorkerResponse = { id: number; ok: true; result: DisplayReadResult } | { id: number; ok: false; error: string };
