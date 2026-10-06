"use client";

/**
 * Runs the display reader in a Web Worker (created on first use, kept for the
 * page's life). If the worker cannot be created or dies, every waiting request
 * is answered on the main thread instead and the worker is not tried again.
 */
import { useCallback, useEffect, useRef } from "react";
import type { GrayImage } from "./gray";
import { readDisplay, type DisplayKind, type DisplayReadResult, type WorkerRequest, type WorkerResponse } from "./display-reader";

type Pending = { kind: DisplayKind; image: GrayImage; resolve: (r: DisplayReadResult) => void; reject: (e: Error) => void };

export function useDisplayReader() {
  const workerRef = useRef<Worker | null>(null);
  const workerBroken = useRef(false);
  const pending = useRef(new Map<number, Pending>());
  const seq = useRef(0);

  useEffect(() => {
    const waiting = pending.current;
    return () => {
      workerRef.current?.terminate();
      workerRef.current = null;
      for (const p of waiting.values()) p.reject(new Error("cancelled"));
      waiting.clear();
    };
  }, []);

  const read = useCallback((kind: DisplayKind, image: GrayImage): Promise<DisplayReadResult> => {
    const onMainThread = () => new Promise<DisplayReadResult>((resolve, reject) => {
      // Let the "reading…" state paint before the main thread is busy for a moment.
      setTimeout(() => {
        try {
          resolve(readDisplay(kind, image));
        } catch (err) {
          reject(err instanceof Error ? err : new Error(String(err)));
        }
      }, 30);
    });
    if (typeof Worker === "undefined" || workerBroken.current) return onMainThread();

    if (!workerRef.current) {
      try {
        const worker = new Worker(new URL("./ocr.worker.ts", import.meta.url));
        worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
          const entry = pending.current.get(event.data.id);
          if (!entry) return;
          pending.current.delete(event.data.id);
          if (event.data.ok) entry.resolve(event.data.result);
          else entry.reject(new Error(event.data.error));
        };
        worker.onerror = () => {
          // The worker script could not load or crashed: finish the waiting reads here, once.
          workerBroken.current = true;
          worker.terminate();
          workerRef.current = null;
          const waiting = [...pending.current.values()];
          pending.current.clear();
          for (const p of waiting) {
            try {
              p.resolve(readDisplay(p.kind, p.image));
            } catch (err) {
              p.reject(err instanceof Error ? err : new Error(String(err)));
            }
          }
        };
        workerRef.current = worker;
      } catch {
        workerBroken.current = true;
        return onMainThread();
      }
    }
    const id = ++seq.current;
    // The worker gets its own copy; the original stays with the caller (and with us, for the fallback).
    const copy = image.data.slice().buffer;
    const request: WorkerRequest = { id, kind, width: image.width, height: image.height, data: copy };
    return new Promise<DisplayReadResult>((resolve, reject) => {
      pending.current.set(id, { kind, image, resolve, reject });
      workerRef.current!.postMessage(request, [copy]);
    });
  }, []);

  return read;
}
