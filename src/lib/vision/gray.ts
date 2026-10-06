/**
 * Small, dependency-free image primitives for the on-device readers: 8-bit grey
 * images, binary ink masks, local (Sauvola) thresholding, rotation and shear by
 * nearest neighbour, projections and connected components. Everything works on
 * flat typed arrays so it runs the same in the browser, in a worker and in the
 * Node evaluation scripts.
 */

export interface GrayImage {
  width: number;
  height: number;
  /** Row-major, 0 (black) to 255 (white). */
  data: Uint8Array;
}

export interface BinaryMask {
  width: number;
  height: number;
  /** Row-major, 1 = ink (a lit / dark segment), 0 = background. */
  data: Uint8Array;
}

export interface Box {
  x0: number;
  y0: number;
  /** Inclusive. */
  x1: number;
  y1: number;
}

export interface Component extends Box {
  area: number;
  /** Mean of (local background - pixel) over the component: how strongly it stands out. */
  strength: number;
  /** Pixels with a 4-neighbour outside the component. */
  perimeter: number;
  /** Approximate stroke thickness: 2 x area / perimeter (a square blob gives half its side). */
  thickness: number;
}

export const boxWidth = (b: Box): number => b.x1 - b.x0 + 1;
export const boxHeight = (b: Box): number => b.y1 - b.y0 + 1;

/** RGBA pixels (canvas ImageData) to grey with the Rec. 601 luma weights. */
export function grayFromRGBA(rgba: Uint8ClampedArray | Uint8Array, width: number, height: number): GrayImage {
  const data = new Uint8Array(width * height);
  for (let i = 0, j = 0; i < data.length; i++, j += 4) {
    data[i] = (rgba[j] * 77 + rgba[j + 1] * 150 + rgba[j + 2] * 29) >> 8;
  }
  return { width, height, data };
}

export function invert(img: GrayImage): GrayImage {
  const data = new Uint8Array(img.data.length);
  for (let i = 0; i < data.length; i++) data[i] = 255 - img.data[i];
  return { width: img.width, height: img.height, data };
}

/** Nearest-neighbour downscale so the longer side is at most `maxSide`. Returns the input when it already fits. */
export function downscale(img: GrayImage, maxSide: number): GrayImage {
  const longest = Math.max(img.width, img.height);
  if (longest <= maxSide) return img;
  const scale = maxSide / longest;
  const width = Math.max(1, Math.round(img.width * scale));
  const height = Math.max(1, Math.round(img.height * scale));
  const data = new Uint8Array(width * height);
  // Box-average the source pixels each target pixel covers, so thin strokes do not vanish.
  for (let y = 0; y < height; y++) {
    const sy0 = Math.floor(y / scale);
    const sy1 = Math.min(img.height, Math.max(sy0 + 1, Math.floor((y + 1) / scale)));
    for (let x = 0; x < width; x++) {
      const sx0 = Math.floor(x / scale);
      const sx1 = Math.min(img.width, Math.max(sx0 + 1, Math.floor((x + 1) / scale)));
      let sum = 0;
      let n = 0;
      for (let sy = sy0; sy < sy1; sy++) {
        const row = sy * img.width;
        for (let sx = sx0; sx < sx1; sx++) {
          sum += img.data[row + sx];
          n++;
        }
      }
      data[y * width + x] = n ? Math.round(sum / n) : 0;
    }
  }
  return { width, height, data };
}

/** Bilinear enlargement by `factor` (> 1). */
export function upscale(img: GrayImage, factor: number): GrayImage {
  const width = Math.round(img.width * factor);
  const height = Math.round(img.height * factor);
  const data = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) {
    const sy = Math.min(img.height - 1, (y + 0.5) / factor - 0.5);
    const y0 = Math.max(0, Math.floor(sy));
    const y1 = Math.min(img.height - 1, y0 + 1);
    const fy = sy - y0;
    for (let x = 0; x < width; x++) {
      const sx = Math.min(img.width - 1, (x + 0.5) / factor - 0.5);
      const x0 = Math.max(0, Math.floor(sx));
      const x1 = Math.min(img.width - 1, x0 + 1);
      const fx = sx - x0;
      const top = img.data[y0 * img.width + x0] * (1 - fx) + img.data[y0 * img.width + x1] * fx;
      const bottom = img.data[y1 * img.width + x0] * (1 - fx) + img.data[y1 * img.width + x1] * fx;
      data[y * width + x] = Math.round(top * (1 - fy) + bottom * fy);
    }
  }
  return { width, height, data };
}

/** 3x3 box blur; takes the edge off sensor noise before thresholding. */
export function blur3(img: GrayImage): GrayImage {
  const { width, height } = img;
  const src = img.data;
  const tmp = new Uint16Array(width * height);
  const data = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) {
    const row = y * width;
    for (let x = 0; x < width; x++) {
      const l = src[row + Math.max(0, x - 1)];
      const c = src[row + x];
      const r = src[row + Math.min(width - 1, x + 1)];
      tmp[row + x] = l + c + r;
    }
  }
  for (let y = 0; y < height; y++) {
    const up = Math.max(0, y - 1) * width;
    const row = y * width;
    const down = Math.min(height - 1, y + 1) * width;
    for (let x = 0; x < width; x++) {
      data[row + x] = Math.round((tmp[up + x] + tmp[row + x] + tmp[down + x]) / 9);
    }
  }
  return { width, height, data };
}

/** Summed-area tables of the values and the squared values ((w+1) x (h+1), row-major). */
export function integralImages(img: GrayImage): { sum: Float64Array; sq: Float64Array } {
  const { width, height, data } = img;
  const w1 = width + 1;
  const sum = new Float64Array(w1 * (height + 1));
  const sq = new Float64Array(w1 * (height + 1));
  for (let y = 1; y <= height; y++) {
    let rowSum = 0;
    let rowSq = 0;
    const srcRow = (y - 1) * width;
    const row = y * w1;
    const prev = (y - 1) * w1;
    for (let x = 1; x <= width; x++) {
      const v = data[srcRow + x - 1];
      rowSum += v;
      rowSq += v * v;
      sum[row + x] = sum[prev + x] + rowSum;
      sq[row + x] = sq[prev + x] + rowSq;
    }
  }
  return { sum, sq };
}

/** Sliding-window minimum along rows then columns (van Herk / Gil-Werman, O(n)). */
export function localMinimum(img: GrayImage, window: number): Uint8Array {
  const { width, height, data } = img;
  const k = Math.max(1, window | 1);
  const half = k >> 1;
  const tmp = new Uint8Array(width * height);
  const out = new Uint8Array(width * height);
  const line = (src: (i: number) => number, n: number, dst: (i: number, v: number) => void) => {
    const prefix = new Uint8Array(n);
    const suffix = new Uint8Array(n);
    for (let i = 0; i < n; i++) prefix[i] = i % k === 0 ? src(i) : Math.min(prefix[i - 1], src(i));
    for (let i = n - 1; i >= 0; i--) suffix[i] = i === n - 1 || (i + 1) % k === 0 ? src(i) : Math.min(suffix[i + 1], src(i));
    for (let i = 0; i < n; i++) {
      const a = Math.max(0, i - half);
      const b = Math.min(n - 1, i + half);
      dst(i, Math.min(suffix[a], prefix[b]));
    }
  };
  for (let y = 0; y < height; y++) {
    const row = y * width;
    line((i) => data[row + i], width, (i, v) => {
      tmp[row + i] = v;
    });
  }
  for (let x = 0; x < width; x++) {
    line((i) => tmp[i * width + x], height, (i, v) => {
      out[i * width + x] = v;
    });
  }
  return out;
}

export interface SauvolaOptions {
  /** Odd window size in pixels; must be a few times the stroke width. */
  window: number;
  /** Sauvola's k (0.2 - 0.5). Higher = stricter (less ink). */
  k?: number;
  /** Dynamic range of the standard deviation (128 for 8-bit). */
  r?: number;
  /** Windows whose standard deviation is below this are flat: never ink. */
  minStd?: number;
  /** A pixel must also be at least this much darker than its local mean. */
  minContrast?: number;
  /**
   * A pixel must be at least this fraction of the way from the local mean down to the
   * local minimum. Keeps the faint unlit "ghost" segments of an LCD (10-25 % of the
   * contrast of a lit one) out of the mask. 0 disables the test.
   */
  minContrastRatio?: number;
}

/**
 * Local threshold for dark ink on a lighter background (invert the image first for
 * lit segments on a dark display). Also returns the local mean so callers can
 * measure how strongly each blob stands out from its own surroundings.
 */
export function sauvola(img: GrayImage, opts: SauvolaOptions): { mask: BinaryMask; localMean: Float32Array } {
  const { width, height, data } = img;
  const half = Math.max(1, Math.floor(opts.window / 2));
  const k = opts.k ?? 0.25;
  const r = opts.r ?? 128;
  const minStd = opts.minStd ?? 6;
  const minContrast = opts.minContrast ?? 8;
  const minRatio = opts.minContrastRatio ?? 0;
  const { sum, sq } = integralImages(img);
  const darkest = minRatio > 0 ? localMinimum(img, opts.window) : null;
  const w1 = width + 1;
  const mask = new Uint8Array(width * height);
  const localMean = new Float32Array(width * height);
  for (let y = 0; y < height; y++) {
    const ya = Math.max(0, y - half);
    const yb = Math.min(height, y + half + 1);
    for (let x = 0; x < width; x++) {
      const xa = Math.max(0, x - half);
      const xb = Math.min(width, x + half + 1);
      const n = (yb - ya) * (xb - xa);
      const s = sum[yb * w1 + xb] - sum[ya * w1 + xb] - sum[yb * w1 + xa] + sum[ya * w1 + xa];
      const s2 = sq[yb * w1 + xb] - sq[ya * w1 + xb] - sq[yb * w1 + xa] + sq[ya * w1 + xa];
      const mean = s / n;
      const variance = Math.max(0, s2 / n - mean * mean);
      const std = Math.sqrt(variance);
      const i = y * width + x;
      localMean[i] = mean;
      if (std < minStd) continue;
      const threshold = mean * (1 + k * (std / r - 1));
      const v = data[i];
      if (v >= threshold || mean - v < minContrast) continue;
      if (darkest && mean - v < minRatio * (mean - darkest[i])) continue;
      mask[i] = 1;
    }
  }
  return { mask: { width, height, data: mask }, localMean };
}

/** Rotate a mask about its centre (degrees, positive = counter-clockwise on screen), nearest neighbour. */
export function rotateMask(mask: BinaryMask, degrees: number): BinaryMask {
  if (degrees === 0) return mask;
  const { width, height, data } = mask;
  const out = new Uint8Array(width * height);
  const rad = (degrees * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const cx = (width - 1) / 2;
  const cy = (height - 1) / 2;
  for (let y = 0; y < height; y++) {
    const dy = y - cy;
    for (let x = 0; x < width; x++) {
      const dx = x - cx;
      // inverse mapping: where did this output pixel come from?
      const sx = Math.round(cx + dx * cos + dy * sin);
      const sy = Math.round(cy - dx * sin + dy * cos);
      if (sx >= 0 && sx < width && sy >= 0 && sy < height) out[y * width + x] = data[sy * width + sx];
    }
  }
  return { width, height, data: out };
}

/** Rotate a grey image the same way rotateMask does. */
export function rotateGray(img: GrayImage, degrees: number): GrayImage {
  if (degrees === 0) return img;
  const rotated = rotateMask({ width: img.width, height: img.height, data: img.data }, degrees);
  return { width: img.width, height: img.height, data: rotated.data };
}

/** Rotate a per-pixel float map (e.g. the local mean) the same way rotateMask does. */
export function rotateFloat(map: Float32Array, width: number, height: number, degrees: number): Float32Array {
  if (degrees === 0) return map;
  const out = new Float32Array(width * height);
  const rad = (degrees * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const cx = (width - 1) / 2;
  const cy = (height - 1) / 2;
  for (let y = 0; y < height; y++) {
    const dy = y - cy;
    for (let x = 0; x < width; x++) {
      const dx = x - cx;
      const sx = Math.round(cx + dx * cos + dy * sin);
      const sy = Math.round(cy - dx * sin + dy * cos);
      if (sx >= 0 && sx < width && sy >= 0 && sy < height) out[y * width + x] = map[sy * width + sx];
    }
  }
  return out;
}

/**
 * Shear a band horizontally: output(x, y) = input(x + shear * (y - yRef), y).
 * A positive `shear` straightens italic digits that lean to the right.
 */
export function shearMask(mask: BinaryMask, shear: number, yRef: number): BinaryMask {
  if (shear === 0) return mask;
  const { width, height, data } = mask;
  const out = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) {
    const offset = Math.round(shear * (y - yRef));
    const row = y * width;
    for (let x = 0; x < width; x++) {
      const sx = x + offset;
      if (sx >= 0 && sx < width) out[row + x] = data[row + sx];
    }
  }
  return { width, height, data: out };
}

/** Ink count per row (optionally only between two columns). */
export function rowProjection(mask: BinaryMask, x0 = 0, x1 = mask.width - 1): Uint32Array {
  const out = new Uint32Array(mask.height);
  for (let y = 0; y < mask.height; y++) {
    const row = y * mask.width;
    let n = 0;
    for (let x = x0; x <= x1; x++) n += mask.data[row + x];
    out[y] = n;
  }
  return out;
}

/** Ink count per column between two rows (inclusive). */
export function colProjection(mask: BinaryMask, y0 = 0, y1 = mask.height - 1): Uint32Array {
  const out = new Uint32Array(mask.width);
  for (let y = y0; y <= y1; y++) {
    const row = y * mask.width;
    for (let x = 0; x < mask.width; x++) out[x] += mask.data[row + x];
  }
  return out;
}

/** Maximal runs where `profile[i] > threshold`, bridging gaps shorter than `bridge`. */
export function runsAbove(profile: ArrayLike<number>, threshold: number, bridge = 0, minLength = 1): Array<[number, number]> {
  const runs: Array<[number, number]> = [];
  let start = -1;
  let lastAbove = -1;
  for (let i = 0; i < profile.length; i++) {
    if (profile[i] > threshold) {
      if (start < 0) start = i;
      lastAbove = i;
    } else if (start >= 0 && i - lastAbove > bridge) {
      if (lastAbove - start + 1 >= minLength) runs.push([start, lastAbove]);
      start = -1;
    }
  }
  if (start >= 0 && lastAbove - start + 1 >= minLength) runs.push([start, lastAbove]);
  return runs;
}

/**
 * 8-connected components of the ink. `localMean` (from sauvola) and the grey image
 * give each blob a strength, so faint "ghost" segments can be told from lit ones.
 */
export function connectedComponents(mask: BinaryMask, gray?: GrayImage, localMean?: Float32Array): Component[] {
  const { width, height, data } = mask;
  const labels = new Int32Array(width * height);
  const components: Component[] = [];
  const stack = new Int32Array(width * height);
  let next = 1;
  for (let start = 0; start < data.length; start++) {
    if (!data[start] || labels[start]) continue;
    const label = next++;
    let top = 0;
    stack[top++] = start;
    labels[start] = label;
    let x0 = width;
    let y0 = height;
    let x1 = -1;
    let y1 = -1;
    let area = 0;
    let contrast = 0;
    let perimeter = 0;
    while (top > 0) {
      const i = stack[--top];
      const y = (i / width) | 0;
      const x = i - y * width;
      area++;
      if (gray && localMean) contrast += localMean[i] - gray.data[i];
      if (x === 0 || y === 0 || x === width - 1 || y === height - 1 || !data[i - 1] || !data[i + 1] || !data[i - width] || !data[i + width]) perimeter++;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
      const ya = y > 0 ? y - 1 : 0;
      const yb = y < height - 1 ? y + 1 : height - 1;
      const xa = x > 0 ? x - 1 : 0;
      const xb = x < width - 1 ? x + 1 : width - 1;
      for (let ny = ya; ny <= yb; ny++) {
        const row = ny * width;
        for (let nx = xa; nx <= xb; nx++) {
          const j = row + nx;
          if (data[j] && !labels[j]) {
            labels[j] = label;
            stack[top++] = j;
          }
        }
      }
    }
    components.push({ x0, y0, x1, y1, area, strength: area ? contrast / area : 0, perimeter, thickness: perimeter ? (2 * area) / perimeter : 1 });
  }
  return components;
}

/** A mask containing only the given components' pixels. */
export function maskFromComponents(mask: BinaryMask, keep: Component[]): BinaryMask {
  // Re-label by flood fill from each kept component's first pixel would be exact; a
  // bounding-box copy is enough here because kept blobs rarely overlap in their boxes,
  // and any overlap only re-adds ink that is already ink.
  const out = new Uint8Array(mask.width * mask.height);
  for (const c of keep) {
    for (let y = c.y0; y <= c.y1; y++) {
      const row = y * mask.width;
      for (let x = c.x0; x <= c.x1; x++) if (mask.data[row + x]) out[row + x] = 1;
    }
  }
  return { width: mask.width, height: mask.height, data: out };
}

/** Sum of ink inside a box (inclusive edges), clipped to the mask. */
export function inkInBox(mask: BinaryMask, x0: number, y0: number, x1: number, y1: number): number {
  const xa = Math.max(0, Math.floor(x0));
  const ya = Math.max(0, Math.floor(y0));
  const xb = Math.min(mask.width - 1, Math.ceil(x1));
  const yb = Math.min(mask.height - 1, Math.ceil(y1));
  let n = 0;
  for (let y = ya; y <= yb; y++) {
    const row = y * mask.width;
    for (let x = xa; x <= xb; x++) n += mask.data[row + x];
  }
  return n;
}

export const median = (values: number[]): number => {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};
