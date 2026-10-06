/**
 * Synthetic photos of seven-segment displays for the reader's evaluation: digits
 * drawn as the classic hexagonal segments, with italic slant, image rotation,
 * uneven lighting, a glare patch, sensor noise, faint ghost segments, labels and
 * a bezel around the panel, in both polarities. Deterministic per seed.
 */
import type { GrayImage } from "../gray";

export interface SynthOptions {
  seed: number;
  layout: "bp-stacked" | "bp-side" | "scale";
  width?: number;
  height?: number;
}

export interface SynthCase {
  image: GrayImage;
  truth: { systolic?: number; diastolic?: number; pulse?: number | null; kg?: number };
  params: Record<string, number | string | boolean>;
}

/** mulberry32 */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Point = [number, number];
type Polygon = Point[];

/** Digit cell is 10 wide x 18 tall in local units; stroke `t`. Segment ends are chamfered like a real LCD, not drawn to a long point. */
function segmentPolygons(t: number, gap: number): Record<string, Polygon> {
  const W = 10;
  const H = 18;
  const h = t / 2;
  const tip = h * 0.6;
  const horizontal = (yc: number): Polygon => {
    const xa = h + gap;
    const xb = W - h - gap;
    return [
      [xa, yc],
      [xa + tip, yc - h],
      [xb - tip, yc - h],
      [xb, yc],
      [xb - tip, yc + h],
      [xa + tip, yc + h],
    ];
  };
  const vertical = (xc: number, ya: number, yb: number): Polygon => {
    ya += gap;
    yb -= gap;
    return [
      [xc, ya],
      [xc + h, ya + tip],
      [xc + h, yb - tip],
      [xc, yb],
      [xc - h, yb - tip],
      [xc - h, ya + tip],
    ];
  };
  return {
    a: horizontal(h),
    g: horizontal(H / 2),
    d: horizontal(H - h),
    f: vertical(h, h, H / 2),
    b: vertical(W - h, h, H / 2),
    e: vertical(h, H / 2, H - h),
    c: vertical(W - h, H / 2, H - h),
  };
}

const DIGIT_SEGMENTS: Record<string, string> = {
  "0": "abcdef",
  "1": "bc",
  "2": "abdeg",
  "3": "abcdg",
  "4": "bcfg",
  "5": "acdfg",
  "6": "acdefg",
  "7": "abc",
  "8": "abcdefg",
  "9": "abcdfg",
};

function pointInPolygon(x: number, y: number, poly: Polygon): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** Accumulate anti-aliased coverage (2x2 samples) of a polygon into `layer`. */
function fillPolygon(layer: Float32Array, width: number, height: number, poly: Polygon, value: number) {
  const xs = poly.map((p) => p[0]);
  const ys = poly.map((p) => p[1]);
  const x0 = Math.max(0, Math.floor(Math.min(...xs)));
  const x1 = Math.min(width - 1, Math.ceil(Math.max(...xs)));
  const y0 = Math.max(0, Math.floor(Math.min(...ys)));
  const y1 = Math.min(height - 1, Math.ceil(Math.max(...ys)));
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      let hits = 0;
      for (const [sx, sy] of [
        [0.25, 0.25],
        [0.75, 0.25],
        [0.25, 0.75],
        [0.75, 0.75],
      ]) {
        if (pointInPolygon(x + sx, y + sy, poly)) hits++;
      }
      if (hits) {
        const i = y * width + x;
        layer[i] = Math.max(layer[i], (hits / 4) * value);
      }
    }
  }
}

interface Scene {
  width: number;
  height: number;
  ink: Float32Array; // 0..1 lit segments
  ghost: Float32Array; // 0..1 unlit segments
}

interface Font {
  stroke: number; // in local units
  slant: number; // x shift per unit y (lean right)
  gap: number;
  advance: number; // slot advance in local units (10 = touching)
}

/** Draw a string of digits (with optional ".") at a position; returns the x after the last slot. */
function drawText(
  scene: Scene,
  text: string,
  originX: number,
  originY: number,
  scale: number,
  font: Font,
  rotate: (p: Point) => Point,
  drawGhost: boolean,
): void {
  const polys = segmentPolygons(font.stroke, font.gap);
  let slot = 0;
  const place = (p: Point): Point => {
    const [lx, ly] = p;
    const sx = originX + (slot * font.advance + lx + font.slant * (18 - ly)) * scale;
    const sy = originY + ly * scale;
    return rotate([sx, sy]);
  };
  for (const ch of text) {
    if (ch === ".") {
      // the point sits in the gap after the previous slot, on the baseline
      const t = font.stroke;
      const px = slot * font.advance - (font.advance - 10) / 2 - t / 2;
      const squareCorners: Point[] = [
        [px, 18 - t],
        [px + t, 18 - t],
        [px + t, 18],
        [px, 18],
      ];
      const square: Polygon = squareCorners.map(([lx, ly]) => {
        const sx = originX + (lx + font.slant * (18 - ly)) * scale;
        const sy = originY + ly * scale;
        return rotate([sx, sy]);
      });
      fillPolygon(scene.ink, scene.width, scene.height, square, 1);
      continue;
    }
    if (ch === " ") {
      if (drawGhost) for (const seg of "abcdefg") fillPolygon(scene.ghost, scene.width, scene.height, polys[seg].map(place), 1);
      slot++;
      continue;
    }
    const lit = DIGIT_SEGMENTS[ch] ?? "";
    for (const seg of "abcdefg") {
      const poly = polys[seg].map(place);
      if (lit.includes(seg)) fillPolygon(scene.ink, scene.width, scene.height, poly, 1);
      else if (drawGhost) fillPolygon(scene.ghost, scene.width, scene.height, poly, 1);
    }
    slot++;
  }
}

function rect(scene: Scene, layer: Float32Array, x0: number, y0: number, x1: number, y1: number, rotate: (p: Point) => Point, value = 1) {
  const corners: Point[] = [
    [x0, y0],
    [x1, y0],
    [x1, y1],
    [x0, y1],
  ];
  const poly: Polygon = corners.map(rotate);
  fillPolygon(layer, scene.width, scene.height, poly, value);
}

export function synthesize(opts: SynthOptions): SynthCase {
  const random = rng(opts.seed);
  const width = opts.width ?? 800;
  const height = opts.height ?? 600;
  const ink = new Float32Array(width * height);
  const ghost = new Float32Array(width * height);
  const scene: Scene = { width, height, ink, ghost };

  const lightOnDark = random() < 0.3;
  const rotationDeg = (random() - 0.5) * 12; // -6..6
  const rad = (rotationDeg * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const cx = width / 2;
  const cy = height / 2;
  const rotate = ([x, y]: Point): Point => [cx + (x - cx) * cos - (y - cy) * sin, cy + (x - cx) * sin + (y - cy) * cos];

  const font: Font = {
    stroke: 1.6 + random() * 1.8,
    slant: random() < 0.5 ? 0 : random() * 0.2,
    gap: 0.1 + random() * 0.25,
    advance: 12.5 + random() * 3,
  };
  const ghostOn = !lightOnDark && random() < 0.6;
  const params: Record<string, number | string | boolean> = { lightOnDark, rotationDeg: Math.round(rotationDeg * 10) / 10, slant: font.slant, stroke: font.stroke, ghost: ghostOn, layout: opts.layout };

  const truth: SynthCase["truth"] = {};
  // Panel (display) area, as a bezel rectangle with a small margin.
  const panelX0 = 40 + random() * 80;
  const panelY0 = 30 + random() * 60;
  const panelX1 = width - 40 - random() * 80;
  const panelY1 = height - 30 - random() * 60;
  const panelW = panelX1 - panelX0;
  const panelH = panelY1 - panelY0;
  const bezel = new Float32Array(width * height);
  const bezelT = 6 + random() * 12;
  rect(scene, bezel, panelX0 - bezelT, panelY0 - bezelT, panelX1 + bezelT, panelY0, rotate);
  rect(scene, bezel, panelX0 - bezelT, panelY1, panelX1 + bezelT, panelY1 + bezelT, rotate);
  rect(scene, bezel, panelX0 - bezelT, panelY0, panelX0, panelY1, rotate);
  rect(scene, bezel, panelX1, panelY0, panelX1 + bezelT, panelY1, rotate);

  const labels: Array<[number, number, number, number]> = [];
  const label = (x: number, y: number, h: number) => {
    // three little glyph-like blocks ("SYS")
    let px = x;
    for (let i = 0; i < 3; i++) {
      labels.push([px, y, px + h * 0.6, y + h]);
      px += h * 0.85;
    }
  };

  if (opts.layout === "scale") {
    const kg = Math.round((35 + random() * 90) * 10) / 10;
    const withDecimal = random() < 0.8;
    const text = withDecimal ? kg.toFixed(1) : String(Math.round(kg));
    truth.kg = withDecimal ? kg : Math.round(kg);
    const digitH = Math.min(panelH * (0.45 + random() * 0.35), (panelW * 0.8) / ((text.length + 0.5) * 1.5) / (10 / 18));
    const scale = digitH / 18;
    const textW = (text.replace(".", "").length * font.advance + 2) * scale;
    const ox = panelX0 + (panelW - textW) / 2;
    const oy = panelY0 + (panelH - digitH) / 2;
    drawText(scene, text, ox, oy, scale, font, rotate, ghostOn);
    const labelH = digitH * 0.18;
    label(Math.min(panelX1 - 3 * labelH, ox + textW + digitH * 0.25), oy + digitH * 0.7, labelH); // "kg"
  } else {
    const systolic = 85 + Math.floor(random() * 110);
    const diastolic = Math.max(40, Math.min(systolic - 15, 45 + Math.floor(random() * 70)));
    const pulse = 48 + Math.floor(random() * 70);
    truth.systolic = systolic;
    truth.diastolic = diastolic;
    truth.pulse = pulse;
    const pad = (n: number) => String(n).padStart(3, " ");
    const rowGap = 0.3 + random() * 0.4;
    if (opts.layout === "bp-stacked") {
      const sizes = [1, 0.85 + random() * 0.15, 0.6 + random() * 0.35];
      const digitH = Math.min(panelH / (sizes[0] + sizes[1] + sizes[2] + 2 * rowGap + 0.4), (panelW * 0.75) / (3 * 1.6) / (10 / 18));
      let y = panelY0 + panelH * 0.08;
      const texts = [pad(systolic), pad(diastolic), pad(pulse)];
      const rightAlign = random() < 0.7;
      for (let r = 0; r < 3; r++) {
        const h = digitH * sizes[r];
        const scale = h / 18;
        const textW = 3 * font.advance * scale;
        const ox = rightAlign ? panelX1 - panelW * 0.08 - textW : panelX0 + panelW * 0.3;
        drawText(scene, texts[r], ox, y, scale, font, rotate, ghostOn);
        label(panelX0 + panelW * 0.05, y + h * 0.15, h * 0.17);
        y += h + digitH * rowGap;
      }
    } else {
      const digitH = Math.min(panelH * 0.42, (panelW * 0.8) / (7 * 1.5) / (10 / 18));
      const scale = digitH / 18;
      const textW = 3 * font.advance * scale;
      const y = panelY0 + panelH * 0.12;
      drawText(scene, pad(systolic), panelX0 + panelW * 0.08, y, scale, font, rotate, ghostOn);
      drawText(scene, pad(diastolic), panelX0 + panelW * 0.08 + textW + digitH * 0.9, y, scale, font, rotate, ghostOn);
      const ph = digitH * (0.6 + random() * 0.3);
      drawText(scene, pad(pulse), panelX1 - panelW * 0.08 - 3 * font.advance * (ph / 18), y + digitH + digitH * rowGap, ph / 18, font, rotate, ghostOn);
      label(panelX0 + panelW * 0.08, y + digitH + digitH * rowGap + ph * 0.2, ph * 0.2);
    }
    if (random() < 0.4) {
      // a vertical level indicator bar at the left
      rect(scene, ink, panelX0 + panelW * 0.015, panelY0 + panelH * 0.1, panelX0 + panelW * 0.035, panelY1 - panelH * 0.1, rotate);
    }
  }
  for (const [x0, y0, x1, y1] of labels) rect(scene, ink, x0, y0, x1, y1, rotate);

  // Compose.
  const data = new Uint8Array(width * height);
  const bgBase = lightOnDark ? 28 + random() * 25 : 150 + random() * 70;
  const fg = lightOnDark ? 215 + random() * 40 : 20 + random() * 45;
  const gradX = (random() - 0.5) * 60;
  const gradY = (random() - 0.5) * 60;
  const glareX = panelX0 + random() * panelW;
  const glareY = panelY0 + random() * panelH;
  const glareR = panelW * (0.1 + random() * 0.25);
  const glareStrength = random() < 0.6 ? 20 + random() * 50 : 0;
  const noise = 2 + random() * 7;
  const ghostContrast = 0.08 + random() * 0.14;
  const outside = lightOnDark ? 60 : 90;
  let g1 = 0;
  let g2 = 0;
  let hasSpare = false;
  const gauss = () => {
    if (hasSpare) {
      hasSpare = false;
      return g2;
    }
    let u = 0;
    let v = 0;
    while (u === 0) u = random();
    while (v === 0) v = random();
    const m = Math.sqrt(-2 * Math.log(u));
    g1 = m * Math.cos(2 * Math.PI * v);
    g2 = m * Math.sin(2 * Math.PI * v);
    hasSpare = true;
    return g1;
  };
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      // is this pixel inside the (rotated) panel?
      const ux = cx + (x - cx) * cos + (y - cy) * sin;
      const uy = cy - (x - cx) * sin + (y - cy) * cos;
      const inPanel = ux >= panelX0 && ux <= panelX1 && uy >= panelY0 && uy <= panelY1;
      let bg = inPanel ? bgBase + ((x - cx) / width) * gradX + ((y - cy) / height) * gradY : outside + ((x - cx) / width) * gradX;
      if (glareStrength && inPanel) {
        const d = Math.hypot(x - glareX, y - glareY) / glareR;
        if (d < 1) bg += glareStrength * (1 - d) * (1 - d);
      }
      let v = bg;
      if (bezel[i] > 0) v = bg + (lightOnDark ? 10 - bg : 25 - bg) * bezel[i];
      if (ghost[i] > 0) v = v + (fg - v) * ghost[i] * ghostContrast;
      if (ink[i] > 0) v = v + (fg - v) * ink[i];
      v += gauss() * noise;
      data[i] = Math.max(0, Math.min(255, Math.round(v)));
    }
  }
  return { image: { width, height, data }, truth, params };
}
