/**
 * In-memory stand-in for the slice of the Supabase query builder that the SOIE
 * loaders use (select / eq / neq / gte / lte / in / not / order / range / limit /
 * maybeSingle / single / insert), with a configurable server-side max-rows cap
 * (PostgREST's default is 1000) so pagination bugs show up in tests.
 *
 * It does NOT model RLS; tests express "a different patient's rows are not
 * visible" by simply not putting them in the table.
 */

type Row = Record<string, unknown>;

export interface FakeDbOptions {
  /** Server-side cap on rows per response. */
  maxRows?: number;
  /** Tables whose reads fail. */
  failTables?: string[];
}

export class FakeDb {
  tables: Record<string, Row[]> = {};
  inserts: Array<{ table: string; row: Row }> = [];
  calls: Array<{ table: string; kind: string }> = [];
  private nextId = 1;
  opts: FakeDbOptions;
  constructor(opts: FakeDbOptions = {}) {
    this.opts = opts;
  }

  set(table: string, rows: Row[]): this {
    this.tables[table] = rows;
    return this;
  }

  from(table: string): FakeQuery {
    return new FakeQuery(this, table);
  }

  newId(): string {
    return `00000000-0000-4000-8000-${String(this.nextId++).padStart(12, "0")}`;
  }
}

class FakeQuery implements PromiseLike<{ data: unknown; error: { message: string } | null; count: number | null }> {
  private filters: Array<(r: Row) => boolean> = [];
  private orders: Array<{ col: string; asc: boolean }> = [];
  private rangeFrom: number | null = null;
  private rangeTo: number | null = null;
  private limitN: number | null = null;
  private wantCount = false;
  private head = false;
  private mode: "none" | "maybe" | "one" = "none";
  private inserted: Row | null = null;
  private updateValues: Row | null = null;

  private db: FakeDb;
  private table: string;
  constructor(db: FakeDb, table: string) {
    this.db = db;
    this.table = table;
  }

  select(_cols?: string, o?: { count?: string; head?: boolean }): this {
    void _cols;
    if (o?.count) this.wantCount = true;
    if (o?.head) this.head = true;
    return this;
  }
  insert(row: Row): this {
    this.inserted = { id: this.db.newId(), ...row };
    this.db.tables[this.table] = [...(this.db.tables[this.table] ?? []), this.inserted];
    this.db.inserts.push({ table: this.table, row: this.inserted });
    return this;
  }
  update(values: Row): this {
    this.updateValues = values;
    return this;
  }
  eq(col: string, v: unknown): this {
    this.filters.push((r) => r[col] === v);
    return this;
  }
  neq(col: string, v: unknown): this {
    this.filters.push((r) => r[col] !== v);
    return this;
  }
  gte(col: string, v: string | number): this {
    this.filters.push((r) => (r[col] as string | number) >= v);
    return this;
  }
  lte(col: string, v: string | number): this {
    this.filters.push((r) => (r[col] as string | number) <= v);
    return this;
  }
  in(col: string, vs: unknown[]): this {
    this.filters.push((r) => vs.includes(r[col]));
    return this;
  }
  not(col: string, op: string, v: unknown): this {
    if (op === "is" && v === null) this.filters.push((r) => r[col] !== null && r[col] !== undefined);
    return this;
  }
  order(col: string, o?: { ascending?: boolean }): this {
    this.orders.push({ col, asc: o?.ascending !== false });
    return this;
  }
  range(from: number, to: number): this {
    this.rangeFrom = from;
    this.rangeTo = to;
    return this;
  }
  limit(n: number): this {
    this.limitN = n;
    return this;
  }
  maybeSingle(): this {
    this.mode = "maybe";
    return this;
  }
  single(): this {
    this.mode = "one";
    return this;
  }

  then<T1 = unknown, T2 = never>(
    onfulfilled?: ((v: { data: unknown; error: { message: string } | null; count: number | null }) => T1 | PromiseLike<T1>) | null,
    onrejected?: ((reason: unknown) => T2 | PromiseLike<T2>) | null,
  ): PromiseLike<T1 | T2> {
    return Promise.resolve(this.exec()).then(onfulfilled, onrejected);
  }

  private exec(): { data: unknown; error: { message: string } | null; count: number | null } {
    this.db.calls.push({ table: this.table, kind: this.inserted ? "insert" : "select" });
    if (this.db.opts.failTables?.includes(this.table)) return { data: null, error: { message: "boom" }, count: null };
    if (this.inserted) return { data: this.mode === "none" ? [this.inserted] : this.inserted, error: null, count: null };
    if (this.updateValues) {
      const hit = (this.db.tables[this.table] ?? []).filter((r) => this.filters.every((f) => f(r)));
      for (const r of hit) Object.assign(r, this.updateValues);
      return { data: hit, error: null, count: null };
    }
    let rows = (this.db.tables[this.table] ?? []).filter((r) => this.filters.every((f) => f(r)));
    for (const o of [...this.orders].reverse()) {
      rows = [...rows].sort((a, b) => {
        const x = a[o.col] as string | number;
        const y = b[o.col] as string | number;
        return (x < y ? -1 : x > y ? 1 : 0) * (o.asc ? 1 : -1);
      });
    }
    const total = rows.length;
    if (this.rangeFrom !== null && this.rangeTo !== null) rows = rows.slice(this.rangeFrom, this.rangeTo + 1);
    if (this.limitN !== null) rows = rows.slice(0, this.limitN);
    if (this.db.opts.maxRows !== undefined) rows = rows.slice(0, this.db.opts.maxRows);
    const count = this.wantCount ? total : null;
    if (this.head) return { data: null, error: null, count };
    if (this.mode !== "none") return { data: rows[0] ?? null, error: null, count };
    return { data: rows, error: null, count };
  }
}
