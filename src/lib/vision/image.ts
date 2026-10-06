/**
 * Browser-side photo handling for the camera features: decode a captured file
 * with its EXIF orientation applied, scale it, crop it, turn it into the grey
 * buffer the display reader works on, and make the tiny thumbnail that is kept
 * for a learned meal photo. Nothing here touches the network.
 */
import { grayFromRGBA, type GrayImage } from "./gray";

export interface CropBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

function canvasOf(width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(width));
  canvas.height = Math.max(1, Math.round(height));
  return canvas;
}

function context(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("इस ब्राउज़र में फोटो प्रोसेस नहीं हो सकती (canvas unavailable)");
  return ctx;
}

function fitScale(width: number, height: number, maxSide: number): number {
  const longest = Math.max(width, height);
  return longest > maxSide ? maxSide / longest : 1;
}

/**
 * Decodes a photo file into a canvas no larger than `maxSide`, the way the camera
 * saw it (EXIF rotation applied). Phones store photos sideways with an orientation
 * tag; `createImageBitmap` honours it, and so does an <img> in every current browser.
 */
export async function decodePhoto(file: Blob, maxSide = 1600): Promise<HTMLCanvasElement> {
  let source: ImageBitmap | HTMLImageElement;
  let width: number;
  let height: number;
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    source = bitmap;
    width = bitmap.width;
    height = bitmap.height;
  } catch {
    const url = URL.createObjectURL(file);
    try {
      source = await new Promise<HTMLImageElement>((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error("फोटो खोली नहीं जा सकी (unsupported image)"));
        img.src = url;
      });
      width = source.naturalWidth;
      height = source.naturalHeight;
    } finally {
      // The image is drawn synchronously below before the URL is released.
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
  }
  const scale = fitScale(width, height, maxSide);
  const canvas = canvasOf(width * scale, height * scale);
  context(canvas).drawImage(source, 0, 0, canvas.width, canvas.height);
  if ("close" in source) source.close();
  return canvas;
}

/** A copy of part of a canvas (box in the canvas's own pixels). */
export function cropCanvas(canvas: HTMLCanvasElement, box: CropBox): HTMLCanvasElement {
  const x = Math.max(0, Math.floor(box.x));
  const y = Math.max(0, Math.floor(box.y));
  const w = Math.min(canvas.width - x, Math.ceil(box.width));
  const h = Math.min(canvas.height - y, Math.ceil(box.height));
  const out = canvasOf(w, h);
  context(out).drawImage(canvas, x, y, w, h, 0, 0, w, h);
  return out;
}

/** The grey buffer the display reader takes (longest side at most `maxSide`). */
export function canvasToGray(canvas: HTMLCanvasElement, maxSide = 1100): GrayImage {
  const scale = fitScale(canvas.width, canvas.height, maxSide);
  let source = canvas;
  if (scale < 1) {
    source = canvasOf(canvas.width * scale, canvas.height * scale);
    context(source).drawImage(canvas, 0, 0, source.width, source.height);
  }
  const { data } = context(source).getImageData(0, 0, source.width, source.height);
  return grayFromRGBA(data, source.width, source.height);
}

/** A small JPEG data URL (default 64 px on the longer side) for lists and the learned-photo store. */
export function thumbnailDataUrl(canvas: HTMLCanvasElement, maxSide = 64, quality = 0.6): string {
  const scale = fitScale(canvas.width, canvas.height, maxSide);
  const out = canvasOf(canvas.width * scale, canvas.height * scale);
  context(out).drawImage(canvas, 0, 0, out.width, out.height);
  return out.toDataURL("image/jpeg", quality);
}

/** A data URL of the canvas for an <img> preview (JPEG, modest quality). */
export function previewDataUrl(canvas: HTMLCanvasElement, maxSide = 1200, quality = 0.82): string {
  const scale = fitScale(canvas.width, canvas.height, maxSide);
  if (scale >= 1) return canvas.toDataURL("image/jpeg", quality);
  const out = canvasOf(canvas.width * scale, canvas.height * scale);
  context(out).drawImage(canvas, 0, 0, out.width, out.height);
  return out.toDataURL("image/jpeg", quality);
}
