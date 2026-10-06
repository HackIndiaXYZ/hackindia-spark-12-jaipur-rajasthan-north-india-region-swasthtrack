/// <reference lib="webworker" />
/**
 * Web Worker: reads a display photo off the main thread. See display-reader.ts.
 */
import { readDisplay, type WorkerRequest, type WorkerResponse } from "./display-reader";

const scope = self as unknown as DedicatedWorkerGlobalScope;

scope.onmessage = (event: MessageEvent<WorkerRequest>) => {
  const { id, kind, width, height, data } = event.data;
  try {
    const result = readDisplay(kind, { width, height, data: new Uint8Array(data) });
    const reply: WorkerResponse = { id, ok: true, result };
    scope.postMessage(reply);
  } catch (err) {
    const reply: WorkerResponse = { id, ok: false, error: err instanceof Error ? err.message : String(err) };
    scope.postMessage(reply);
  }
};
