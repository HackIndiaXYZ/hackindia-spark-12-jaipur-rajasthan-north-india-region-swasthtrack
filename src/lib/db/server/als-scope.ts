import { AsyncLocalStorage } from "node:async_hooks";
import type { DbClient } from "../builder";

/**
 * Server only (uses node:async_hooks, so it must never be imported by client code).
 *
 * Holds "the database client this request runs as". It is scoped to one async call
 * chain, so two requests handled at the same time — each with its own user — can
 * never see each other's client.
 */
const store = new AsyncLocalStorage<DbClient>();

export function runAsClient<T>(client: DbClient, fn: () => Promise<T>): Promise<T> {
  return store.run(client, fn);
}

export function scopedClient(): DbClient | undefined {
  return store.getStore();
}
