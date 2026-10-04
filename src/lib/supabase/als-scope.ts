import { AsyncLocalStorage } from "node:async_hooks";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";

type Db = SupabaseClient<Database>;

/**
 * Server only (uses node:async_hooks, so it must never be imported by client code).
 *
 * Holds "the Supabase client this request runs as". It is scoped to one async call
 * chain, so two requests handled at the same time — each with its own user — can
 * never see each other's client.
 */
const store = new AsyncLocalStorage<Db>();

export function runAsClient<T>(client: Db, fn: () => Promise<T>): Promise<T> {
  return store.run(client, fn);
}

export function scopedClient(): Db | undefined {
  return store.getStore();
}
