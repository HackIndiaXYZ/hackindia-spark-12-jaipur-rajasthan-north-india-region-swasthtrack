"use client";

import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import type { CropBox } from "@/lib/vision/image";
import { cn } from "@/lib/utils";

type CropEditorProps = {
  /** Data URL of the photo. */
  src: string;
  /** Pixel size of the photo the box refers to. */
  naturalWidth: number;
  naturalHeight: number;
  box: CropBox;
  onChange: (box: CropBox) => void;
  label: string;
};

type Drag = { mode: "move" | "nw" | "ne" | "sw" | "se"; startX: number; startY: number; box: CropBox };

const MIN_SIDE_PX = 24;

/**
 * A photo with one adjustable rectangle over it: drag inside to move, drag a
 * corner to resize. Everything outside the rectangle is dimmed, so it is obvious
 * that only the inside is read. Works with a finger (44 px handles) or a mouse.
 */
export function CropEditor({ src, naturalWidth, naturalHeight, box, onChange, label }: CropEditorProps) {
  const imgRef = useRef<HTMLImageElement>(null);
  const [scale, setScale] = useState(1);
  const drag = useRef<Drag | null>(null);

  // The photo is shown no taller than about half the screen, so on a phone the whole
  // picture and all four corner handles sit above the dialog's pinned buttons.
  const measure = useCallback(() => {
    const el = imgRef.current;
    if (!el || !el.clientWidth) return;
    setScale(el.clientWidth / naturalWidth);
  }, [naturalWidth]);

  useEffect(() => {
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [measure]);

  const clamp = (b: CropBox): CropBox => {
    const width = Math.max(MIN_SIDE_PX / scale, Math.min(naturalWidth, b.width));
    const height = Math.max(MIN_SIDE_PX / scale, Math.min(naturalHeight, b.height));
    const x = Math.max(0, Math.min(naturalWidth - width, b.x));
    const y = Math.max(0, Math.min(naturalHeight - height, b.y));
    return { x, y, width, height };
  };

  function begin(e: ReactPointerEvent<HTMLElement>, mode: Drag["mode"]) {
    e.preventDefault();
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { mode, startX: e.clientX, startY: e.clientY, box };
  }

  function move(e: ReactPointerEvent<HTMLElement>) {
    const d = drag.current;
    if (!d) return;
    const dx = (e.clientX - d.startX) / scale;
    const dy = (e.clientY - d.startY) / scale;
    const b = d.box;
    let next: CropBox;
    switch (d.mode) {
      case "move":
        next = { ...b, x: b.x + dx, y: b.y + dy };
        break;
      case "nw":
        next = { x: b.x + dx, y: b.y + dy, width: b.width - dx, height: b.height - dy };
        break;
      case "ne":
        next = { x: b.x, y: b.y + dy, width: b.width + dx, height: b.height - dy };
        break;
      case "sw":
        next = { x: b.x + dx, y: b.y, width: b.width - dx, height: b.height + dy };
        break;
      default:
        next = { x: b.x, y: b.y, width: b.width + dx, height: b.height + dy };
    }
    onChange(clamp(next));
  }

  function end(e: ReactPointerEvent<HTMLElement>) {
    if (drag.current) {
      drag.current = null;
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {
        // already released
      }
    }
  }

  const left = box.x * scale;
  const top = box.y * scale;
  const width = box.width * scale;
  const height = box.height * scale;
  const handle = "absolute h-11 w-11 -m-[22px] cursor-pointer touch-none before:absolute before:left-1/2 before:top-1/2 before:h-5 before:w-5 before:-translate-x-1/2 before:-translate-y-1/2 before:rounded-full before:border-2 before:border-ink before:bg-surface before:shadow-e1";

  return (
    <div className="flex justify-center">
      <div className="relative inline-block max-w-full select-none overflow-hidden rounded-card bg-ink leading-none" role="group" aria-label={label}>
        {/* eslint-disable-next-line @next/next/no-img-element -- a data URL of the just-taken photo */}
        <img ref={imgRef} src={src} alt="" className="block h-auto max-h-[50dvh] w-auto max-w-full" draggable={false} onLoad={measure} />
      <div
        className="absolute touch-none cursor-move rounded-sm border-2 border-gold-line shadow-[0_0_0_9999px_rgba(29,26,18,0.55)]"
        style={{ left, top, width, height }}
        onPointerDown={(e) => begin(e, "move")}
        onPointerMove={move}
        onPointerUp={end}
        onPointerCancel={end}
      >
        <span aria-hidden className="absolute inset-0 border border-dashed border-surface/70" />
        {(["nw", "ne", "sw", "se"] as const).map((corner) => (
          <span
            key={corner}
            role="presentation"
            className={cn(handle, corner === "nw" && "left-0 top-0", corner === "ne" && "right-0 top-0", corner === "sw" && "bottom-0 left-0", corner === "se" && "bottom-0 right-0")}
            onPointerDown={(e) => begin(e, corner)}
            onPointerMove={move}
            onPointerUp={end}
            onPointerCancel={end}
          />
        ))}
        </div>
      </div>
    </div>
  );
}
