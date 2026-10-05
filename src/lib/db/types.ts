import type { Database } from "./database.types";

/**
 * Shared (browser + server) types for the data layer.
 *
 * The app talks to MySQL through ONE query interface (`DbClient`, ./builder.ts):
 *  - in the browser it serialises each query to JSON and POSTs it to /api/db,
 *    where the server authorises and runs it (the browser never reaches MySQL);
 *  - on the server (SOIE, e-mail jobs, API routes) the same builder runs the query
 *    in-process through ./server/executor.ts.
 * Either way the SAME authorisation rules apply (./server/policy.ts).
 */

export type Tables = Database["public"]["Tables"];
export type TableName = keyof Tables;
export type Functions = Database["public"]["Functions"];
export type FunctionName = keyof Functions;

/** Error shape callers branch on. `code` keeps the Postgres SQLSTATEs the services already understand. */
export interface DbError {
  message: string;
  code?: string;
  details?: string | null;
  hint?: string | null;
}

/**
 * Either data or an error, never both, so `if (error) throw ...` narrows `data` to `T`
 * (the same ergonomics the services had with the PostgREST client).
 */
export type DbResponse<T> = ({ data: T; error: null } | { data: null; error: DbError }) & { count: number | null };

export type FilterOp = "eq" | "neq" | "gt" | "gte" | "lt" | "lte" | "in" | "is";

export interface Filter {
  /** Negate the filter (`.not(col, op, value)`). */
  not?: boolean;
  op: FilterOp;
  col: string;
  /** For `in`: an array. For `is`: null | true | false. Otherwise a scalar. */
  val: unknown;
}

export interface OrderBy {
  col: string;
  asc: boolean;
}

export type QueryAction = "select" | "insert" | "update" | "delete" | "upsert";
export type ResultMode = "many" | "single" | "maybeSingle";

/** One query, as plain JSON. Nothing in here is trusted: the executor validates every part. */
export interface QuerySpec {
  table: string;
  action: QueryAction;
  /** Column list for a select, or for the `.select()` chained after a mutation. */
  select?: string;
  /** True when `.select()` was chained after insert/update/delete/upsert. */
  returning?: boolean;
  count?: "exact";
  head?: boolean;
  values?: Record<string, unknown> | Record<string, unknown>[];
  onConflict?: string;
  ignoreDuplicates?: boolean;
  filters: Filter[];
  order: OrderBy[];
  limit?: number;
  range?: [number, number];
  mode: ResultMode;
}

export interface RpcSpec {
  name: string;
  args: Record<string, unknown>;
}

/** What the browser POSTs to /api/db. */
export type GatewayRequest = { query: QuerySpec } | { rpc: RpcSpec };

export type QueryRunner = (spec: QuerySpec) => Promise<DbResponse<unknown>>;
export type RpcRunner = (spec: RpcSpec) => Promise<DbResponse<unknown>>;
