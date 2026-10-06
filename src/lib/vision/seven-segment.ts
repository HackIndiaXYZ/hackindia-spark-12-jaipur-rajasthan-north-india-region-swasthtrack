/**
 * Seven-segment display reader. Pure TypeScript, no model download: a photo of a
 * blood-pressure monitor or a weighing scale is turned into the rows of digits
 * the display shows, each with a confidence, so the form can be pre-filled and
 * the person only has to confirm.
 *
 * How it works, in order:
 *   1. local (Sauvola) threshold -> ink mask, for dark-on-light LCD digits; the
 *      caller runs it again on the inverted image for lit digits on a dark panel;
 *   2. drop blobs that cannot be segments (bezel edges, bar indicators, specks,
 *      faint "ghost" segments of an LCD);
 *   3. straighten: pick the rotation whose row profile is sharpest (the photo is
 *      rarely perfectly level);
 *   4. cut the mask into text rows, and every row into digit boxes (column gaps),
 *      after un-slanting italic fonts with a small shear search;
 *   5. sample the seven segment zones of every box and match the on/off pattern
 *      against the digit table (one wrong segment allowed, at a lower confidence);
 *   6. small blobs become "." / ":" / "-" so "72.5", "12:30" and "10-06" stay apart.
 *
 * Nothing here knows about blood pressure; see bp-reader.ts and weight-reader.ts.
 */
import {
  blur3,
  upscale,
  boxHeight,
  boxWidth,
  colProjection,
  connectedComponents,
  downscale,
  inkInBox,
  invert,
  maskFromComponents,
  median,
  rotateFloat,
  rotateGray,
  rotateMask,
  rowProjection,
  runsAbove,
  sauvola,
  shearMask,
  type BinaryMask,
  type Box,
  type Component,
  type GrayImage,
} from "./gray";

export type Token = {
  kind: "digit" | "dot" | "colon" | "dash" | "unknown";
  /** "0".."9" for a digit. */
  text: string;
  /** 0..1; digits only (others are 1 when clearly that shape). */
  confidence: number;
  box: Box;
};

export interface DigitRow {
  /** Tokens left to right. */
  tokens: Token[];
  /** Box around the row's digits (in the straightened image's coordinates). */
  box: Box;
  /** Height of the digits in this row, px. */
  digitHeight: number;
  /** Each maximal run of digits (with at most one embedded dot) as a number string, e.g. "128", "72.5". */
  numbers: Array<{ text: string; value: number; confidence: number; box: Box }>;
}

export interface SevenSegmentResult {
  /** "dark" = dark digits on a light LCD, "light" = lit digits on a dark panel. */
  polarity: "dark" | "light";
  /** Degrees the image was rotated to level the rows. */
  rotation: number;
  rows: DigitRow[];
  /** Width/height of the (downscaled) image the boxes refer to. */
  width: number;
  height: number;
  /** Sum over rows of digits x confidence; used to pick the better polarity. */
  score: number;
  /** Threshold window (px) of the pass that produced this result. */
  window?: number;
}

/** What the reader saw, band by band and cell by cell; for the evaluation script. */
export type TraceEvent =
  | { type: "band"; polarity: "dark" | "light"; y0: number; y1: number; cells: number; shear: number; kept: boolean; raw?: string }
  | {
      type: "cell";
      polarity: "dark" | "light";
      /** Cell box in the straightened, un-slanted band's coordinates. */
      box: Box;
      rowHeight: number;
      shear: number;
      densities: number[] | null;
      scores: Array<[string, number]> | null;
      result: string;
    };

export interface ReadOptions {
  /** Longest side the image is reduced to before reading (speed vs. detail). */
  maxSide?: number;
  /** Receives one event per cell examined. */
  trace?: (event: TraceEvent) => void;
  /** Try the inverted image too and keep the better parse. Default true. */
  bothPolarities?: boolean;
  /** Try to level the image. Default true. */
  deskew?: boolean;
}

const MIN_DIGIT_HEIGHT = 12;
/** Segment pattern per digit, bits a b c d e f g (a = MSB). */
const DIGIT_PATTERNS: Array<{ digit: string; bits: number }> = [
  { digit: "0", bits: 0b1111110 },
  { digit: "1", bits: 0b0110000 },
  { digit: "2", bits: 0b1101101 },
  { digit: "3", bits: 0b1111001 },
  { digit: "4", bits: 0b0110011 },
  { digit: "5", bits: 0b1011011 },
  { digit: "6", bits: 0b1011111 },
  { digit: "7", bits: 0b1110000 },
  { digit: "8", bits: 0b1111111 },
  { digit: "9", bits: 0b1111011 },
];
/** Font variants some displays use. */
const DIGIT_VARIANTS: Array<{ digit: string; bits: number }> = [
  { digit: "6", bits: 0b0011111 }, // six without the top bar
  { digit: "7", bits: 0b1110010 }, // seven with the upper-left bar
  { digit: "9", bits: 0b1110011 }, // nine without the bottom bar
];

/* ------------------------------------------------------------------ blobs */

/** Keep blobs that could be a segment or a digit; drop frames, bars, fat blobs and specks. */
function plausibleComponents(all: Component[], width: number, height: number): Component[] {
  const kept = all.filter((c) => {
    const w = boxWidth(c);
    const h = boxHeight(c);
    if (c.area < 4) return false;
    if (w > width * 0.92 || h > height * 0.92) return false; // bezel edge, cable: a reading never fills the frame
    // A long thin line (an indicator bar, a separator, the edge of the panel) is not a stroke.
    if (h / w > 12 || (h / w > 7 && h > height * 0.3)) return false;
    if (w / h > 14 || (w / h > 8 && w > width * 0.3)) return false;
    // A stroke fills a fair part of its box; a thin diagonal line (frame corner, shadow edge) does not.
    const fill = c.area / (w * h);
    if (fill < 0.12) return false;
    // Segments are thin for their length. A shadow, a hand, a fruit on the scale, the
    // dark panel of a small display: fat blobs, far thicker than a stroke. Tiny blobs
    // (decimal points, colons) are exempt.
    const longest = Math.max(w, h);
    const shortSide = Math.min(width, height);
    const dotLike = w / h > 0.55 && w / h < 1.8 && longest <= shortSide * 0.08;
    if (c.area > 60 && !dotLike && c.thickness > 0.36 * longest) return false;
    // A hollow rectangle (a bezel or panel edge marked by the threshold) is big and mostly empty.
    if (fill < 0.3 && w > width * 0.12 && h > height * 0.12) return false;
    return true;
  });
  if (kept.length === 0) return kept;
  const strong = kept.filter((c) => c.area >= 12).map((c) => c.strength);
  if (strong.length === 0) return kept;
  // Only the faintest blobs go here; lit-versus-ghost is judged row by row later.
  const reference = quantile(strong, 0.9);
  return kept.filter((c) => c.strength >= reference * 0.12);
}

function quantile(values: number[], q: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  const pos = Math.min(sorted.length - 1, Math.max(0, Math.round((sorted.length - 1) * q)));
  return sorted[pos];
}

/* ----------------------------------------------------------------- deskew */

/** How peaked a projection is: rows of ink separated by clean gaps score high. */
function sharpness(profile: Uint32Array): number {
  let sum = 0;
  let sumSq = 0;
  for (let i = 0; i < profile.length; i++) {
    sum += profile[i];
    sumSq += profile[i] * profile[i];
  }
  return sum > 0 ? sumSq / sum : 0;
}

function bestRotation(mask: BinaryMask): number {
  let best = 0;
  let bestScore = sharpness(rowProjection(mask));
  // A rotation must pay for itself clearly: with few blobs the measure is noisy and a
  // wrong turn costs more than a slight tilt.
  const tryAngle = (deg: number) => {
    const s = sharpness(rowProjection(rotateMask(mask, deg)));
    if (s > bestScore * 1.12 || (s > bestScore * 1.02 && Math.abs(deg) < Math.abs(best))) {
      bestScore = s;
      best = deg;
    }
  };
  for (const deg of [-10, -7.5, -5, -2.5, 2.5, 5, 7.5, 10]) tryAngle(deg);
  for (const deg of [best - 1.25, best + 1.25]) if (deg !== 0) tryAngle(deg);
  return best;
}

/* ------------------------------------------------------------------- rows */

interface Band {
  y0: number;
  y1: number;
}

function findBands(mask: BinaryMask): Band[] {
  const profile = rowProjection(mask);
  let max = 0;
  for (let i = 0; i < profile.length; i++) if (profile[i] > max) max = profile[i];
  if (max === 0) return [];
  const threshold = Math.max(1, max * 0.015);
  // Atomic pieces: any gap of 3+ blank rows ends a piece. A row made only of digits
  // without a middle bar ("1", "0", "7") is two pieces, upper and lower segments: two
  // halves of similar height, a small gap apart, with the same digits (so the same
  // column runs) in each half. Only such pairs are joined; two rows of readings differ
  // in height, in column layout, or sit further apart.
  const pieces = runsAbove(profile, threshold, 2, 3).map(([y0, y1]) => ({ y0, y1 }));
  const bands: Band[] = [];
  for (const piece of pieces) {
    const last = bands[bands.length - 1];
    if (last) {
      const gap = piece.y0 - last.y1 - 1;
      const hA = last.y1 - last.y0 + 1;
      const hB = piece.y1 - piece.y0 + 1;
      const bigger = Math.max(hA, hB);
      if (gap <= 0.25 * bigger && Math.abs(hA - hB) <= 0.35 * bigger && columnsAlign(mask, last, piece)) {
        last.y1 = piece.y1;
        continue;
      }
    }
    bands.push({ ...piece });
  }
  return bands.filter((b) => b.y1 - b.y0 + 1 >= MIN_DIGIT_HEIGHT);
}

/** True when most column runs of one band have a matching run in the other (same digits above and below). */
function columnsAlign(mask: BinaryMask, a: Band, b: Band): boolean {
  const runsOf = (band: Band) => {
    const h = band.y1 - band.y0 + 1;
    return runsAbove(colProjection(mask, band.y0, band.y1), 0, Math.max(1, Math.round(h * 0.08)), 2);
  };
  const ra = runsOf(a);
  const rb = runsOf(b);
  if (ra.length === 0 || rb.length === 0) return false;
  const overlaps = (x: [number, number], y: [number, number]) => {
    const o = Math.min(x[1], y[1]) - Math.max(x[0], y[0]) + 1;
    return o > 0 && o >= 0.5 * Math.min(x[1] - x[0] + 1, y[1] - y[0] + 1);
  };
  const [more, fewer] = ra.length >= rb.length ? [ra, rb] : [rb, ra];
  const matched = fewer.filter((r) => more.some((m) => overlaps(r, m))).length;
  return matched >= Math.ceil(fewer.length * 0.6) && fewer.length >= Math.ceil(more.length * 0.4);
}

/** Trim a band to the rows that actually hold ink. */
function tightenBand(mask: BinaryMask, band: Band): Band | null {
  const profile = rowProjection(mask);
  let y0 = band.y0;
  let y1 = band.y1;
  while (y0 <= y1 && profile[y0] === 0) y0++;
  while (y1 >= y0 && profile[y1] === 0) y1--;
  return y1 - y0 + 1 >= MIN_DIGIT_HEIGHT ? { y0, y1 } : null;
}

/* ------------------------------------------------------------------ digits */

/**
 * Shear (x per y, applied with the band's bottom as reference) that makes the row's
 * digits upright. Italic seven-segment fonts lean to the right: every vertical
 * stroke has the same slope, so the slope of the tall, narrow blobs (least squares
 * of x on y) is the slant. When no stroke stands alone (thick, connected digits),
 * the shear with the sharpest column profile is used instead.
 */
function bestShear(mask: BinaryMask, band: Band): number {
  const only = bandOnly(mask, band);
  const bandHeight = band.y1 - band.y0 + 1;
  const slopes: number[] = [];
  for (const c of connectedComponents(only)) {
    const h = boxHeight(c);
    const w = boxWidth(c);
    // Only a lone stroke tells the slant; a whole digit's ink is lopsided and misleads.
    if (h < bandHeight * 0.25 || w > h * 0.35) continue;
    // Least-squares slope of the ink's x against y inside this blob.
    let n = 0;
    let sx = 0;
    let sy = 0;
    for (let y = c.y0; y <= c.y1; y++) {
      const row = y * only.width;
      for (let x = c.x0; x <= c.x1; x++) {
        if (!only.data[row + x]) continue;
        n++;
        sx += x;
        sy += y;
      }
    }
    if (n < 8) continue;
    const mx = sx / n;
    const my = sy / n;
    let sxy = 0;
    let syy = 0;
    for (let y = c.y0; y <= c.y1; y++) {
      const row = y * only.width;
      for (let x = c.x0; x <= c.x1; x++) {
        if (!only.data[row + x]) continue;
        sxy += (x - mx) * (y - my);
        syy += (y - my) * (y - my);
      }
    }
    if (syy > 0) slopes.push(sxy / syy);
  }
  if (slopes.length >= 2) {
    const slope = median(slopes);
    return Math.abs(slope) < 0.03 ? 0 : Math.max(-0.45, Math.min(0.45, slope));
  }
  // No strokes to measure: a shear is only worth applying when it clearly sharpens the columns.
  const yRef = band.y1;
  let best = 0;
  let bestScore = sharpness(colProjection(only, band.y0, band.y1));
  for (const s of [-0.05, -0.1, -0.15, -0.2, -0.25, -0.3, 0.05, 0.1, 0.15]) {
    const score = sharpness(colProjection(shearMask(only, s, yRef), band.y0, band.y1));
    if (score > bestScore * 1.08) {
      bestScore = score;
      best = s;
    }
  }
  return best;
}

/** A copy of the mask that is blank outside the band (keeps shearing cheap and local). */
function bandOnly(mask: BinaryMask, band: Band): BinaryMask {
  const out = new Uint8Array(mask.width * mask.height);
  out.set(mask.data.subarray(band.y0 * mask.width, (band.y1 + 1) * mask.width), band.y0 * mask.width);
  return { width: mask.width, height: mask.height, data: out };
}

interface Cell extends Box {
  ink: number;
}

/**
 * The rows of cells of a band.
 *
 * Blobs that share columns are grouped: the segments of one digit, the two pieces
 * of a "1" or a "7", but also digits of different rows printed one above the other.
 * Within a row, the tallest piece of ink is about a digit high; a digit's own pieces
 * are a hairline to a tenth of that apart, two rows of digits are further apart. So
 * groups are cut at gaps of a tenth of the row's tallest piece, rows are re-clustered
 * and the cut repeated until nothing changes.
 */
function bandRows(mask: BinaryMask, band: Band): Cell[][] {
  const bandHeight = band.y1 - band.y0 + 1;
  const blobs = connectedComponents(bandOnly(mask, band)).filter((c) => c.y0 >= band.y0 && c.y1 <= band.y1);
  if (blobs.length === 0) return [];
  type Group = { box: Box; pieces: Array<[number, number]> };
  let groups: Group[] = [];
  for (const g of groupByOverlap(blobs)) {
    const box = tightenBox(mask, union(g));
    if (box) groups.push({ box, pieces: inkSegments(mask, box) });
  }

  for (let round = 0; round < 4; round++) {
    const rows = clusterRows(groups.map((g) => ({ ...g.box, ink: 0 })));
    let changed = false;
    const next: Group[] = [];
    for (const row of rows) {
      const members = row.map((cell) => groups.find((g) => g.box.x0 === cell.x0 && g.box.y0 === cell.y0 && g.box.x1 === cell.x1 && g.box.y1 === cell.y1)!);
      let tallest = 0;
      for (const g of members) for (const [a, b] of g.pieces) tallest = Math.max(tallest, b - a + 1);
      const limit = Math.max(3, tallest * 0.1);
      for (const g of members) {
        let start = 0;
        const parts: Array<[number, number]> = [];
        for (let i = 1; i < g.pieces.length; i++) {
          if (g.pieces[i][0] - g.pieces[i - 1][1] - 1 >= limit) {
            parts.push([start, i - 1]);
            start = i;
          }
        }
        parts.push([start, g.pieces.length - 1]);
        if (parts.length === 1) {
          next.push(g);
          continue;
        }
        changed = true;
        for (const [a, b] of parts) {
          const box = tightenBox(mask, { x0: g.box.x0, y0: g.pieces[a][0], x1: g.box.x1, y1: g.pieces[b][1] });
          if (box) next.push({ box, pieces: g.pieces.slice(a, b + 1) });
        }
      }
    }
    groups = next;
    if (!changed) break;
  }

  const cells: Cell[] = [];
  for (const g of groups) {
    const box = tightenBox(mask, g.box);
    if (box) cells.push(...splitOffPoints(mask, box, bandHeight));
  }
  return clusterRows(cells);
}

/** Vertical ink runs of a box (absolute rows), a blank row of two or more pixels ending a run. */
function inkSegments(mask: BinaryMask, box: Box): Array<[number, number]> {
  const h = boxHeight(box);
  const profile = new Uint32Array(h);
  for (let y = box.y0; y <= box.y1; y++) {
    const row = y * mask.width;
    let n = 0;
    for (let x = box.x0; x <= box.x1; x++) n += mask.data[row + x];
    profile[y - box.y0] = n;
  }
  return runsAbove(profile, 0, 1, 1).map(([a, b]) => [box.y0 + a, box.y0 + b]);
}

/** Group cells into rows: two cells share a row when their heights overlap by half of the smaller one. */
function clusterRows(cells: Cell[]): Cell[][] {
  const groups: Array<{ y0: number; y1: number; cells: Cell[] }> = [];
  for (const cell of [...cells].sort((a, b) => boxHeight(b) - boxHeight(a))) {
    const h = boxHeight(cell);
    let home: (typeof groups)[number] | null = null;
    let bestOverlap = 0;
    for (const g of groups) {
      const overlap = Math.min(g.y1, cell.y1) - Math.max(g.y0, cell.y0) + 1;
      const need = 0.5 * Math.min(h, g.y1 - g.y0 + 1);
      if (overlap >= need && overlap > bestOverlap) {
        bestOverlap = overlap;
        home = g;
      }
    }
    if (home) {
      home.cells.push(cell);
      home.y0 = Math.min(home.y0, cell.y0);
      home.y1 = Math.max(home.y1, cell.y1);
    } else {
      groups.push({ y0: cell.y0, y1: cell.y1, cells: [cell] });
    }
  }
  return groups.sort((a, b) => a.y0 - b.y0).map((g) => g.cells.sort((a, b) => a.x0 - b.x0));
}

function union(list: Component[]): Box {
  return {
    x0: Math.min(...list.map((c) => c.x0)),
    y0: Math.min(...list.map((c) => c.y0)),
    x1: Math.max(...list.map((c) => c.x1)),
    y1: Math.max(...list.map((c) => c.y1)),
  };
}

/** Union-find over horizontal overlap: blobs that share a quarter of the narrower one's columns belong together. */
function groupByOverlap(blobs: Component[]): Component[][] {
  const parent = blobs.map((_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  for (let i = 0; i < blobs.length; i++) {
    for (let j = i + 1; j < blobs.length; j++) {
      const a = blobs[i];
      const b = blobs[j];
      const overlap = Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0) + 1;
      const narrower = Math.min(boxWidth(a), boxWidth(b));
      if (overlap >= Math.max(1, narrower * 0.25)) parent[find(i)] = find(j);
    }
  }
  const groups = new Map<number, Component[]>();
  blobs.forEach((c, i) => {
    const root = find(i);
    const list = groups.get(root);
    if (list) list.push(c);
    else groups.set(root, [c]);
  });
  return [...groups.values()];
}

/**
 * A decimal point (or a colon) often touches its neighbour's column run, which can
 * also glue two digits together ("1.9" becomes one run). Inside a cell, small blobs
 * low in the row are taken out as points, and the rest is cut into digits again.
 */
function splitOffPoints(mask: BinaryMask, cell: Cell, bandHeight: number): Cell[] {
  const w = boxWidth(cell);
  const h = boxHeight(cell);
  if (h < bandHeight * 0.5 || w < bandHeight * 0.3) return [cell];
  const local = cropMask(mask, cell);
  const parts = connectedComponents(local);
  if (parts.length < 2) return [cell];
  const small = parts.filter((p) => boxHeight(p) <= bandHeight * 0.32 && boxWidth(p) <= bandHeight * 0.36 && p.y0 >= h * 0.55);
  if (small.length === 0 || small.length === parts.length) return [cell];

  // Blank the small blobs, then cut what is left into column runs again.
  const body: BinaryMask = { width: local.width, height: local.height, data: new Uint8Array(local.data) };
  for (const p of small) {
    for (let y = p.y0; y <= p.y1; y++) body.data.fill(0, y * body.width + p.x0, y * body.width + p.x1 + 1);
  }
  const profile = colProjection(body);
  const bridge = Math.max(1, Math.round(bandHeight * 0.04));
  const runs = runsAbove(profile, 0, bridge, 1);
  const cells: Cell[] = [];
  for (const [a, b] of runs) {
    const box = tightenBox(body, { x0: a, y0: 0, x1: b, y1: body.height - 1 });
    if (box) cells.push({ x0: cell.x0 + box.x0, y0: cell.y0 + box.y0, x1: cell.x0 + box.x1, y1: cell.y0 + box.y1, ink: box.ink });
  }
  for (const p of small) {
    const global: Cell = { x0: cell.x0 + p.x0, y0: cell.y0 + p.y0, x1: cell.x0 + p.x1, y1: cell.y0 + p.y1, ink: p.area };
    // A blob that sits under a digit (inside its columns) is a piece of that digit, not a point.
    const owner = cells.find((c) => Math.min(c.x1, global.x1) - Math.max(c.x0, global.x0) + 1 > boxWidth(global) * 0.5);
    if (owner) {
      owner.x0 = Math.min(owner.x0, global.x0);
      owner.x1 = Math.max(owner.x1, global.x1);
      owner.y0 = Math.min(owner.y0, global.y0);
      owner.y1 = Math.max(owner.y1, global.y1);
      owner.ink += global.ink;
    } else {
      cells.push(global);
    }
  }
  return cells.sort((a, b) => a.x0 - b.x0);
}

function cropMask(mask: BinaryMask, box: Box): BinaryMask {
  const width = boxWidth(box);
  const height = boxHeight(box);
  const data = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) {
    data.set(mask.data.subarray((box.y0 + y) * mask.width + box.x0, (box.y0 + y) * mask.width + box.x1 + 1), y * width);
  }
  return { width, height, data };
}

/** Shrink a box to its ink; null when empty. */
function tightenBox(mask: BinaryMask, box: Box): Cell | null {
  let x0 = mask.width;
  let y0 = mask.height;
  let x1 = -1;
  let y1 = -1;
  let ink = 0;
  for (let y = box.y0; y <= box.y1; y++) {
    const row = y * mask.width;
    for (let x = box.x0; x <= box.x1; x++) {
      if (!mask.data[row + x]) continue;
      ink++;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    }
  }
  return ink ? { x0, y0, x1, y1, ink } : null;
}

/**
 * A decimal point that touches its digit widens that one cell. When a cell is
 * clearly wider than the row's other digits and the extra strip on one side holds
 * ink only near the baseline, that strip becomes a point of its own.
 */
function trimAttachedPoints(mask: BinaryMask, cells: Cell[], rowHeight: number): Cell[] {
  const wide = cells.filter((c) => boxHeight(c) >= rowHeight * 0.62 && boxWidth(c) >= rowHeight * 0.4);
  if (wide.length < 2) return cells;
  const typical = median(wide.map(boxWidth));
  const out: Cell[] = [];
  for (const cell of cells) {
    const w = boxWidth(cell);
    const h = boxHeight(cell);
    if (!wide.includes(cell) || w < typical * 1.15) {
      out.push(cell);
      continue;
    }
    const extra = Math.round(w - typical);
    const yTop = cell.y0 + Math.round(h * 0.6);
    const stripIsPoint = (x0: number, x1: number): boolean => {
      const above = inkInBox(mask, x0, cell.y0, x1, yTop - 1);
      const below = inkInBox(mask, x0, yTop, x1, cell.y1);
      return above === 0 && below > 0;
    };
    if (stripIsPoint(cell.x1 - extra + 1, cell.x1)) {
      const dot = tightenBox(mask, { x0: cell.x1 - extra + 1, y0: yTop, x1: cell.x1, y1: cell.y1 });
      const digit = tightenBox(mask, { x0: cell.x0, y0: cell.y0, x1: cell.x1 - extra, y1: cell.y1 });
      if (dot && digit) {
        out.push(digit, dot);
        continue;
      }
    }
    if (stripIsPoint(cell.x0, cell.x0 + extra - 1)) {
      const dot = tightenBox(mask, { x0: cell.x0, y0: yTop, x1: cell.x0 + extra - 1, y1: cell.y1 });
      const digit = tightenBox(mask, { x0: cell.x0 + extra, y0: cell.y0, x1: cell.x1, y1: cell.y1 });
      if (dot && digit) {
        out.push(dot, digit);
        continue;
      }
    }
    out.push(cell);
  }
  return out;
}

/* ----------------------------------------------------------- classification */

/** Density of ink in each of the seven segment zones of an upright digit box. */
function zoneDensities(mask: BinaryMask, box: Box): number[] {
  const w = boxWidth(box);
  const h = boxHeight(box);
  const zone = (fx0: number, fy0: number, fx1: number, fy1: number): number => {
    const x0 = box.x0 + fx0 * (w - 1);
    const x1 = box.x0 + fx1 * (w - 1);
    const y0 = box.y0 + fy0 * (h - 1);
    const y1 = box.y0 + fy1 * (h - 1);
    const area = (Math.ceil(x1) - Math.floor(x0) + 1) * (Math.ceil(y1) - Math.floor(y0) + 1);
    return inkInBox(mask, x0, y0, x1, y1) / Math.max(1, area);
  };
  return [
    zone(0.22, 0.0, 0.78, 0.17), // a  top
    zone(0.68, 0.12, 1.0, 0.44), // b  upper right
    zone(0.68, 0.56, 1.0, 0.88), // c  lower right
    zone(0.22, 0.83, 0.78, 1.0), // d  bottom
    zone(0.0, 0.56, 0.32, 0.88), // e  lower left
    zone(0.0, 0.12, 0.32, 0.44), // f  upper left
    zone(0.22, 0.42, 0.78, 0.58), // g  middle
  ];
}

/** Score of a segment pattern against normalised zone densities: 7 = perfect. */
function patternScore(bits: number, n: number[]): number {
  let score = 0;
  for (let i = 0; i < 7; i++) {
    const on = (bits >> (6 - i)) & 1;
    score += on ? n[i] : 1 - n[i];
  }
  return score;
}

interface DigitTrace {
  densities?: number[];
  scores?: Array<[string, number]>;
}

/** Typical horizontal run length of the ink in a box: the stroke width of a digit, the width of a "1". */
function strokeWidth(mask: BinaryMask, box: Box): number {
  const runs: number[] = [];
  for (let y = box.y0; y <= box.y1; y++) {
    const row = y * mask.width;
    let run = 0;
    for (let x = box.x0; x <= box.x1 + 1; x++) {
      if (x <= box.x1 && mask.data[row + x]) run++;
      else if (run) {
        runs.push(run);
        run = 0;
      }
    }
  }
  return median(runs);
}

function classifyDigit(mask: BinaryMask, box: Box, rowHeight: number, trace?: DigitTrace, rowStroke?: number): { text: string; confidence: number } | null {
  const w = boxWidth(box);
  const h = boxHeight(box);
  if (h < rowHeight * 0.62) return null;
  const aspect = w / h;
  if (aspect > 1.05) return null;

  // A "1" is only the two right-hand segments: a narrow, tall, well-filled box about
  // one stroke wide. Thin lines (edges, hairs, reflections) and fatter blobs are not.
  if (aspect < 0.38) {
    if (aspect < 0.07 || h < rowHeight * 0.82) return null;
    const fill = inkInBox(mask, box.x0, box.y0, box.x1, box.y1) / (w * h);
    if (fill < 0.4) return null;
    if (rowStroke && (w < rowStroke * 0.6 || w > rowStroke * 2.2 + 2)) return null;
    return { text: "1", confidence: Math.min(0.85, 0.4 + fill * 0.45) };
  }

  const d = zoneDensities(mask, box);
  if (trace) trace.densities = d;
  const max = Math.max(...d);
  if (max < 0.2) return null;
  // Soft on/off per zone: a lit segment fills most of its zone, an unlit one almost none.
  const n = d.map((v) => Math.max(0, Math.min(1, (v - 0.06) / (0.72 * max - 0.06))));

  let best: { digit: string; score: number } | null = null;
  let second = 0;
  const scores: Array<[string, number]> = [];
  for (const p of [...DIGIT_PATTERNS, ...DIGIT_VARIANTS]) {
    const score = patternScore(p.bits, n);
    scores.push([p.digit, score]);
    if (!best || score > best.score) {
      if (best && best.digit !== p.digit) second = best.score;
      best = { digit: p.digit, score };
    } else if (p.digit !== best.digit && score > second) {
      second = score;
    }
  }
  if (trace) trace.scores = scores.sort((a, b) => b[1] - a[1]).slice(0, 3);
  if (!best || best.score < 5.4) return null;

  const margin = best.score - second; // 0 = a coin toss, 1+ = one whole segment of evidence
  let confidence = Math.max(0.1, Math.min(1, 0.25 + margin * 0.5)) * Math.min(1, best.score / 6.6);
  if (best.digit === "1" && aspect > 0.55) confidence *= 0.6;
  return { text: best.digit, confidence };
}

/** Exposed for the evaluation script's debug output. */
export function digitZoneDensities(mask: BinaryMask, box: Box): number[] {
  return zoneDensities(mask, box);
}

function classifyCell(mask: BinaryMask, cell: Cell, rowBox: Box, rowHeight: number, trace?: DigitTrace, rowStroke?: number): Token {
  const w = boxWidth(cell);
  const h = boxHeight(cell);
  const small = h < rowHeight * 0.34;
  if (small) {
    const nearBottom = cell.y1 >= rowBox.y1 - rowHeight * 0.3;
    const squarish = w <= rowHeight * 0.36 && h <= rowHeight * 0.3 && w / Math.max(1, h) < 2.2;
    if (squarish && nearBottom) return { kind: "dot", text: ".", confidence: 1, box: cell };
    if (w > h * 1.8 && h <= rowHeight * 0.26) return { kind: "dash", text: "-", confidence: 1, box: cell };
    return { kind: "unknown", text: "?", confidence: 0, box: cell };
  }
  // Two stacked dots: a thin cell with an empty middle.
  if (w <= rowHeight * 0.3 && h >= rowHeight * 0.4) {
    const midInk = inkInBox(mask, cell.x0, cell.y0 + h * 0.4, cell.x1, cell.y0 + h * 0.6);
    const totalInk = cell.ink;
    if (midInk === 0 && totalInk < w * h * 0.6) return { kind: "colon", text: ":", confidence: 1, box: cell };
  }
  const digit = classifyDigit(mask, cell, rowHeight, trace, rowStroke);
  if (digit) return { kind: "digit", text: digit.text, confidence: digit.confidence, box: cell };
  return { kind: "unknown", text: "?", confidence: 0, box: cell };
}

/* ------------------------------------------------------------------ rows -> numbers */

function rowNumbers(tokens: Token[], rowHeight: number): DigitRow["numbers"] {
  const numbers: DigitRow["numbers"] = [];
  let run: Token[] = [];
  const flush = () => {
    const digits = run.filter((t) => t.kind === "digit");
    if (digits.length > 0) {
      // Keep at most one dot, and only between digits.
      let text = "";
      let dotUsed = false;
      for (let i = 0; i < run.length; i++) {
        const t = run[i];
        if (t.kind === "digit") text += t.text;
        else if (t.kind === "dot" && !dotUsed && i > 0 && i < run.length - 1 && run[i - 1].kind === "digit" && run[i + 1].kind === "digit") {
          text += ".";
          dotUsed = true;
        }
      }
      const value = Number(text);
      const confidence = Math.min(...digits.map((t) => t.confidence));
      numbers.push({
        text,
        value,
        confidence,
        box: { x0: run[0].box.x0, y0: Math.min(...run.map((t) => t.box.y0)), x1: run[run.length - 1].box.x1, y1: Math.max(...run.map((t) => t.box.y1)) },
      });
    }
    run = [];
  };
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    const prev = tokens[i - 1];
    // A wide gap separates two numbers on one line (SYS and DIA side by side).
    if (prev && t.box.x0 - prev.box.x1 > rowHeight * 0.9) flush();
    if (t.kind === "digit" || t.kind === "dot") run.push(t);
    else flush();
  }
  flush();
  return numbers;
}

/* ------------------------------------------------------------------- main */

/** Mean contrast (local background minus pixel) of the ink inside a box. */
function cellStrength(mask: BinaryMask, gray: GrayImage, localMean: Float32Array, box: Box): number {
  let sum = 0;
  let n = 0;
  for (let y = box.y0; y <= box.y1; y++) {
    const row = y * mask.width;
    for (let x = box.x0; x <= box.x1; x++) {
      if (!mask.data[row + x]) continue;
      sum += localMean[row + x] - gray.data[row + x];
      n++;
    }
  }
  return n ? sum / n : 0;
}

function readMask(
  mask: BinaryMask,
  polarity: "dark" | "light",
  contrast: { gray: GrayImage; localMean: Float32Array } | null,
  onTrace?: (event: TraceEvent) => void,
): { rows: DigitRow[]; score: number } {
  const rows: DigitRow[] = [];
  let score = 0;
  for (const rawBand of findBands(mask)) {
    const band = tightenBand(mask, rawBand);
    if (!band) {
      onTrace?.({ type: "band", polarity, y0: rawBand.y0, y1: rawBand.y1, cells: 0, shear: 0, kept: false });
      continue;
    }
    const shear = bestShear(mask, band);
    const local = shear ? shearMask(bandOnly(mask, band), shear, band.y1) : mask;
    const rowsOfBand = bandRows(local, band);
    onTrace?.({ type: "band", polarity, y0: band.y0, y1: band.y1, cells: rowsOfBand.reduce((n, r) => n + r.length, 0), shear, kept: rowsOfBand.length > 0, raw: rowsOfBand.map((r) => r.map((c) => `${c.x0}-${c.x1}x${c.y0}-${c.y1}`).join(" ")).join(" || ") });
    if (rowsOfBand.length === 0) continue;

    for (let cells of rowsOfBand) {
      // Ghost segments (the unlit ones an LCD shows faintly) and reflections are far
      // weaker than the lit digits of the same row: drop cells well below the row's best.
      // Printed labels beside the digits are often blacker than the LCD itself, so the
      // comparison is made among digit-sized cells only, and only those can be dropped.
      if (contrast) {
        const tallestCell = Math.max(...cells.map(boxHeight));
        const digitSized = cells.map((c) => boxHeight(c) >= tallestCell * 0.6);
        // The grey image is not sheared, so the cell is measured where it really is.
        const strengths = cells.map((c) => cellStrength(mask, contrast.gray, contrast.localMean, shear ? unshearBox(c, shear, band.y1) : c));
        const best = Math.max(...strengths.filter((_, i) => digitSized[i]));
        cells = cells.filter((_, i) => !digitSized[i] || strengths[i] >= best * 0.4);
        if (cells.length === 0) continue;
      }
      // The digits of a row share one height. Icons and labels in the same row can be
      // taller or shorter, so the height comes from the cells that already read as a
      // digit on their own; failing that, from the tallest cells.
      const heights = cells.map(boxHeight);
      const tallest = Math.max(...heights);
      cells = trimAttachedPoints(local, cells, tallest);
      const firstPass = cells.map((c) => {
        const h = boxHeight(c);
        if (h < tallest * 0.45) return null;
        const probe: Box = { x0: c.x0, y0: Math.min(...cells.filter((o) => Math.abs(boxHeight(o) - h) <= h * 0.2).map((o) => o.y0)), x1: c.x1, y1: Math.max(...cells.filter((o) => Math.abs(boxHeight(o) - h) <= h * 0.2).map((o) => o.y1)) };
        const d = classifyDigit(local, { ...c, y0: Math.min(c.y0, probe.y0), y1: Math.max(c.y1, probe.y1) }, h, undefined);
        return d && d.confidence >= 0.45 ? c : null;
      });
      const sure = firstPass.filter((c): c is Cell => c !== null);
      const tall = sure.length >= 1 ? sure : cells.filter((c) => boxHeight(c) >= tallest * 0.72);
      const rowHeight = median(tall.map(boxHeight));
      if (rowHeight < MIN_DIGIT_HEIGHT) continue;
      const rowBox: Box = {
        x0: Math.min(...tall.map((c) => c.x0)),
        y0: Math.round(median(tall.map((c) => c.y0))),
        x1: Math.max(...tall.map((c) => c.x1)),
        y1: Math.round(median(tall.map((c) => c.y1))),
      };
      // The stroke width of the row's wide digits, for judging narrow cells as "1".
      const wideCells = tall.filter((c) => boxWidth(c) >= boxHeight(c) * 0.4);
      const rowStroke = wideCells.length ? median(wideCells.map((c) => strokeWidth(local, c))) : undefined;
      const tokens: Token[] = [];
      for (const cell of cells) {
        // Digits are sampled over the row's common top and bottom, so a segment lost to
        // glare does not shift the zones of that one digit.
        const h = boxHeight(cell);
        const aligned: Cell = h >= rowHeight * 0.62 ? { ...cell, y0: Math.min(cell.y0, rowBox.y0), y1: Math.max(cell.y1, rowBox.y1) } : cell;
        const dt: DigitTrace = {};
        const token = classifyCell(local, aligned, rowBox, rowHeight, dt, rowStroke);
        onTrace?.({ type: "cell", polarity, box: { x0: aligned.x0, y0: aligned.y0, x1: aligned.x1, y1: aligned.y1 }, rowHeight, shear, densities: dt.densities ?? null, scores: dt.scores ?? null, result: token.text });
        if (shear) token.box = unshearBox(token.box, shear, band.y1);
        tokens.push(token);
      }
      // Digits of one display share a width (bar "1" and the narrower "3"/"7"): a cell far
      // off that width is an icon or a label, however digit-like its segments look.
      const wide = tokens.filter((t) => t.kind === "digit" && t.text !== "1" && t.text !== "7" && t.text !== "3").map((t) => boxWidth(t.box));
      if (wide.length >= 2) {
        const typical = median(wide);
        for (const t of tokens) {
          if (t.kind !== "digit") continue;
          const w = boxWidth(t.box);
          if (t.text === "1" ? w > typical * 0.6 : w < typical * 0.55 || w > typical * 1.5) {
            t.kind = "unknown";
            t.text = "?";
            t.confidence = 0;
          }
        }
      }
      const digitCount = tokens.filter((t) => t.kind === "digit").length;
      if (digitCount === 0) continue;
      const numbers = rowNumbers(tokens, rowHeight);
      for (const n of numbers) score += n.text.replace(".", "").length * n.confidence;
      rows.push({ tokens, box: rowBox, digitHeight: rowHeight, numbers });
    }
  }
  return { rows, score };
}

function unshearBox(box: Box, shear: number, yRef: number): Box {
  const dx0 = Math.round(shear * (box.y0 - yRef));
  const dx1 = Math.round(shear * (box.y1 - yRef));
  return { x0: box.x0 + Math.min(dx0, dx1), y0: box.y0, x1: box.x1 + Math.max(dx0, dx1), y1: box.y1 };
}

/** A tight crop of a small display is enlarged so strokes and gaps are more than a pixel or two. */
const MIN_LONG_SIDE = 700;

function normaliseSize(input: GrayImage, maxSide: number): GrayImage {
  const longSide = Math.max(input.width, input.height);
  if (longSide > maxSide) return downscale(input, maxSide);
  if (longSide >= MIN_LONG_SIDE) return input;
  return upscale(input, MIN_LONG_SIDE / longSide);
}

/** Threshold windows tried, as fractions of the longer side: large digits need a wide window, a small display a narrow one. */
const WINDOW_FRACTIONS = [1 / 8, 1 / 18, 1 / 36];

function readAtWindow(gray: GrayImage, polarity: "dark" | "light", fraction: number, deskew: boolean, onTrace?: (event: TraceEvent) => void): SevenSegmentResult {
  const img = polarity === "light" ? invert(gray) : gray;
  const longSide = Math.max(img.width, img.height);
  const window = Math.max(15, Math.round(longSide * fraction) | 1);
  const { mask, localMean } = sauvola(img, { window, k: 0.14, minStd: 6, minContrast: 9 });
  const components = plausibleComponents(connectedComponents(mask, img, localMean), img.width, img.height);
  let clean = maskFromComponents(mask, components);
  const rotation = deskew ? bestRotation(clean) : 0;
  let contrast = { gray: img, localMean };
  if (rotation) {
    clean = rotateMask(clean, rotation);
    contrast = { gray: rotateGray(img, rotation), localMean: rotateFloat(localMean, img.width, img.height, rotation) };
  }
  const { rows, score } = readMask(clean, polarity, contrast, onTrace);
  return { polarity, rotation, rows, width: gray.width, height: gray.height, score, window };
}

function readPolarity(gray: GrayImage, polarity: "dark" | "light", deskew: boolean, onTrace?: (event: TraceEvent) => void): SevenSegmentResult[] {
  return WINDOW_FRACTIONS.map((fraction) => readAtWindow(gray, polarity, fraction, deskew, onTrace));
}

/** For the evaluation script: the cleaned, levelled masks the reader classified. */
export function debugMasks(input: GrayImage, opts: ReadOptions & { windowFraction?: number; raw?: boolean } = {}): Array<{ polarity: "dark" | "light"; rotation: number; mask: BinaryMask; window: number }> {
  const gray = blur3(normaliseSize(input, opts.maxSide ?? 900));
  const out: Array<{ polarity: "dark" | "light"; rotation: number; mask: BinaryMask; window: number }> = [];
  for (const polarity of ["dark", "light"] as const) {
    const img = polarity === "light" ? invert(gray) : gray;
    const longSide = Math.max(img.width, img.height);
    const fraction = opts.windowFraction ?? WINDOW_FRACTIONS[0];
    const window = Math.max(15, Math.round(longSide * fraction) | 1);
    const { mask, localMean } = sauvola(img, { window, k: 0.14, minStd: 6, minContrast: 9 });
    const all = connectedComponents(mask, img, localMean);
    const components = opts.raw ? all : plausibleComponents(all, img.width, img.height);
    let clean = maskFromComponents(mask, components);
    const rotation = opts.deskew ?? true ? bestRotation(clean) : 0;
    if (rotation) clean = rotateMask(clean, rotation);
    out.push({ polarity, rotation, mask: clean, window });
  }
  return out;
}

/**
 * Reads every row of seven-segment digits in a grey photo. One result per pass
 * (polarity x threshold window), best score first; the interpreters (bp-reader,
 * weight-reader) look through all of them for the most plausible reading.
 */
export function readSevenSegment(input: GrayImage, opts: ReadOptions = {}): SevenSegmentResult[] {
  const gray = blur3(normaliseSize(input, opts.maxSide ?? 900));
  const results = readPolarity(gray, "dark", opts.deskew ?? true, opts.trace);
  if (opts.bothPolarities ?? true) results.push(...readPolarity(gray, "light", opts.deskew ?? true, opts.trace));
  results.sort((a, b) => b.score - a.score);
  return results;
}

/** Test-only access to the row/cell helpers (the evaluation scripts exercise them on real masks). */
export const __internals = { bandRows, findBands, bestShear };
