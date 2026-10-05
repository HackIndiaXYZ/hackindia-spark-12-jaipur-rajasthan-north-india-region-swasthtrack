import type {
  DbResponse,
  Filter,
  FilterOp,
  FunctionName,
  Functions,
  QueryAction,
  QueryRunner,
  QuerySpec,
  RpcRunner,
  TableName,
  Tables,
} from "./types";

/**
 * A small, typed query builder with the call shape the services were written
 * against (`from().select().eq().order().range()`, `.single()`, `.maybeSingle()`,
 * `upsert`, `rpc`). It only COLLECTS the query; a `QueryRunner` decides where it
 * runs (fetch to /api/db in the browser, the executor on the server).
 *
 * Isomorphic on purpose: no Node, no mysql2, no secrets in this file.
 */

// Selected columns and embedded relations make exact row types impractical, so rows
// are the table's Row plus an open index (callers only read what they selected).
/* eslint-disable @typescript-eslint/no-explicit-any */
type Open<R> = R & { [key: string]: any };

type Many<R> = Open<R>[];

export class QueryBuilder<R, I, U, Result> implements PromiseLike<DbResponse<Result>> {
  private spec: QuerySpec;
  private runner: QueryRunner;

  constructor(runner: QueryRunner, table: string) {
    this.runner = runner;
    this.spec = { table, action: "select", filters: [], order: [], mode: "many" };
  }

  // ----- what to do -----------------------------------------------------

  /** Columns to read; after insert/update/delete/upsert it asks for the written rows back. */
  select(columns = "*", options?: { count?: "exact"; head?: boolean }): QueryBuilder<R, I, U, Many<R>> {
    this.spec.select = columns;
    if (this.spec.action !== "select") this.spec.returning = true;
    if (options?.count) this.spec.count = options.count;
    if (options?.head) this.spec.head = true;
    return this as unknown as QueryBuilder<R, I, U, Many<R>>;
  }

  insert(values: I | I[]): QueryBuilder<R, I, U, null> {
    return this.mutate("insert", values);
  }

  update(values: U): QueryBuilder<R, I, U, null> {
    return this.mutate("update", values);
  }

  upsert(
    values: I | I[],
    options?: { onConflict?: string; ignoreDuplicates?: boolean },
  ): QueryBuilder<R, I, U, null> {
    if (options?.onConflict) this.spec.onConflict = options.onConflict;
    if (options?.ignoreDuplicates) this.spec.ignoreDuplicates = true;
    return this.mutate("upsert", values);
  }

  delete(): QueryBuilder<R, I, U, null> {
    return this.mutate("delete");
  }

  private mutate(action: QueryAction, values?: unknown): QueryBuilder<R, I, U, null> {
    this.spec.action = action;
    this.spec.returning = false;
    if (values !== undefined) this.spec.values = values as QuerySpec["values"];
    return this as unknown as QueryBuilder<R, I, U, null>;
  }

  // ----- filters --------------------------------------------------------

  private where(op: FilterOp, col: string, val: unknown, not = false): this {
    const filter: Filter = { op, col, val };
    if (not) filter.not = true;
    this.spec.filters.push(filter);
    return this;
  }

  eq(col: string, val: unknown): this {
    return this.where("eq", col, val);
  }
  neq(col: string, val: unknown): this {
    return this.where("neq", col, val);
  }
  gt(col: string, val: string | number): this {
    return this.where("gt", col, val);
  }
  gte(col: string, val: string | number): this {
    return this.where("gte", col, val);
  }
  lt(col: string, val: string | number): this {
    return this.where("lt", col, val);
  }
  lte(col: string, val: string | number): this {
    return this.where("lte", col, val);
  }
  in(col: string, vals: readonly unknown[]): this {
    return this.where("in", col, [...vals]);
  }
  is(col: string, val: null | boolean): this {
    return this.where("is", col, val);
  }
  /** `.not("comment", "is", null)` */
  not(col: string, op: FilterOp, val: unknown): this {
    return this.where(op, col, val, true);
  }
  match(query: Record<string, unknown>): this {
    for (const [col, val] of Object.entries(query)) this.where("eq", col, val);
    return this;
  }

  // ----- shape ----------------------------------------------------------

  order(col: string, options?: { ascending?: boolean }): this {
    this.spec.order.push({ col, asc: options?.ascending !== false });
    return this;
  }
  limit(count: number): this {
    this.spec.limit = count;
    return this;
  }
  range(from: number, to: number): this {
    this.spec.range = [from, to];
    return this;
  }
  /** Exactly one row, or an error (PGRST116). */
  single(): QueryBuilder<R, I, U, Open<R>> {
    this.spec.mode = "single";
    return this as unknown as QueryBuilder<R, I, U, Open<R>>;
  }
  /** One row or null; more than one row is an error. */
  maybeSingle(): QueryBuilder<R, I, U, Open<R> | null> {
    this.spec.mode = "maybeSingle";
    return this as unknown as QueryBuilder<R, I, U, Open<R> | null>;
  }

  // ----- run ------------------------------------------------------------

  /** The query as plain JSON (what the browser sends to /api/db). */
  toSpec(): QuerySpec {
    return JSON.parse(JSON.stringify(this.spec)) as QuerySpec;
  }

  then<T1 = DbResponse<Result>, T2 = never>(
    onfulfilled?: ((value: DbResponse<Result>) => T1 | PromiseLike<T1>) | null,
    onrejected?: ((reason: unknown) => T2 | PromiseLike<T2>) | null,
  ): PromiseLike<T1 | T2> {
    return (this.runner(this.toSpec()) as Promise<DbResponse<Result>>).then(onfulfilled, onrejected);
  }
}

export type TableBuilder<T extends TableName> = QueryBuilder<
  Tables[T]["Row"],
  Tables[T]["Insert"],
  Tables[T]["Update"],
  Many<Tables[T]["Row"]>
>;

export class DbClient {
  private run: QueryRunner;
  private runRpc: RpcRunner;

  constructor(run: QueryRunner, runRpc: RpcRunner) {
    this.run = run;
    this.runRpc = runRpc;
  }

  from<T extends TableName>(table: T): TableBuilder<T> {
    return new QueryBuilder(this.run, table) as unknown as TableBuilder<T>;
  }

  rpc<F extends FunctionName>(
    name: F,
    args?: Functions[F]["Args"],
  ): PromiseLike<DbResponse<Functions[F]["Returns"]>> {
    return this.runRpc({ name, args: (args ?? {}) as Record<string, unknown> }) as Promise<
      DbResponse<Functions[F]["Returns"]>
    >;
  }
}
