import { randomUUID } from "node:crypto";
import type { PoolConnection } from "mysql2/promise";
import { DbClient } from "../builder";
import type { DbResponse, Filter, QuerySpec, RpcSpec } from "../types";
import { POLICIES, patientCondition, type CheckContext, type Policy, type Principal, type Sql } from "./policy";
import { QueryError, getPool, toDbError, withTransaction } from "./pool";
import { executeRpc } from "./rpc";
import { TABLES, tableDef, type ColType, type TableDef } from "./schema";
import { checkRule, fromDbValue, isUuid, toDbValue } from "./values";

/**
 * Server only. Runs one `QuerySpec` against MySQL, as one `Principal`.
 *
 * Nothing in a spec is trusted. Table and column names are looked up in the registry
 * (./schema.ts) and quoted from there; values are always bound parameters; the
 * authorisation conditions come from ./policy.ts and are ANDed into every statement.
 * The result has the same shape the services got from PostgREST, including the
 * Postgres SQLSTATE codes they branch on (42501, 23503, 23505, 23514, PGRST116 ...).
 */

const MAX_ROWS = 1000;
const MAX_WRITE_ROWS = 500;
const MAX_IN = 1000;

type Row = Record<string, unknown>;
type Runner = Pick<PoolConnection, "query">;

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

const q = (identifier: string): string => `\`${identifier.replace(/`/g, "")}\``;
const t = (identifier: string): string => `t.${q(identifier)}`;

function denied(table: string): QueryError {
  return new QueryError(`permission denied for table ${table}`, "42501");
}

function unknownColumn(table: string, col: string): QueryError {
  return new QueryError(`column "${col}" of table "${table}" does not exist`, "42703");
}

async function rowsOf(runner: Runner, query: string, params: unknown[] = []): Promise<Row[]> {
  const [rows] = await runner.query(query, params);
  return rows as Row[];
}

function resolveTable(name: string): { def: TableDef; policy: Policy } {
  const def = tableDef(name);
  const policy = Object.prototype.hasOwnProperty.call(POLICIES, name) ? POLICIES[name] : undefined;
  if (!def || !policy) throw new QueryError(`relation "${name}" does not exist`, "42P01");
  return { def, policy };
}

function colType(def: TableDef, table: string, col: string): ColType {
  if (!Object.prototype.hasOwnProperty.call(def.cols, col)) throw unknownColumn(table, col);
  return def.cols[col];
}

// ---------------------------------------------------------------------------
// select-list parsing: "*", "id,name", "role, created_at, patients(*)"
// ---------------------------------------------------------------------------

interface Embed {
  rel: string;
  cols: string;
}

interface Projection {
  cols: string[];
  embeds: Embed[];
}

const EMBEDS: Record<string, Record<string, { table: string; fk: string }>> = {
  patient_members: { patients: { table: "patients", fk: "patient_id" } },
  patient_food_favorites: { food_items: { table: "food_items", fk: "food_item_id" } },
};

function splitTopLevel(list: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let current = "";
  for (const ch of list) {
    if (ch === "(") depth++;
    if (ch === ")") depth--;
    if (ch === "," && depth === 0) {
      out.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  out.push(current);
  return out.map((s) => s.trim()).filter(Boolean);
}

function parseProjection(table: string, def: TableDef, list: string | undefined): Projection {
  const all = Object.keys(def.cols);
  const text = (list ?? "*").trim() || "*";
  const cols: string[] = [];
  const embeds: Embed[] = [];
  for (const token of splitTopLevel(text)) {
    if (token === "*") {
      for (const c of all) if (!cols.includes(c)) cols.push(c);
      continue;
    }
    const embed = /^([a-z_]+)\(\s*(.*)\)$/.exec(token);
    if (embed) {
      const relation = Object.prototype.hasOwnProperty.call(EMBEDS[table] ?? {}, embed[1]) ? EMBEDS[table][embed[1]] : undefined;
      if (!relation) throw new QueryError(`Could not find a relationship between "${table}" and "${embed[1]}"`, "PGRST200");
      embeds.push({ rel: embed[1], cols: embed[2].trim() || "*" });
      continue;
    }
    if (!/^[a-z_][a-z0-9_]*$/.test(token)) throw new QueryError(`unsupported select expression "${token}"`, "PGRST100");
    colType(def, table, token);
    if (!cols.includes(token)) cols.push(token);
  }
  return { cols, embeds };
}

// ---------------------------------------------------------------------------
// WHERE building
// ---------------------------------------------------------------------------

function buildFilter(def: TableDef, table: string, f: Filter): Sql {
  const type = colType(def, table, f.col);
  if (type === "json") throw new QueryError(`cannot filter on JSON column "${f.col}"`, "22P02");
  if (!("val" in f) || f.val === undefined) throw new QueryError(`missing value for filter on "${f.col}"`, "22P02");
  const col = t(f.col);
  const wrap = (cond: string, params: unknown[]): Sql => ({ sql: f.not ? `NOT (${cond})` : cond, params });

  switch (f.op) {
    case "is": {
      if (f.val === null) return { sql: `${col} IS ${f.not ? "NOT " : ""}NULL`, params: [] };
      if (f.val === true || f.val === false) return { sql: `${col} IS ${f.not ? "NOT " : ""}${f.val ? "TRUE" : "FALSE"}`, params: [] };
      throw new QueryError(`"is" accepts null, true or false`, "22P02");
    }
    case "in": {
      if (!Array.isArray(f.val)) throw new QueryError(`"in" needs a list`, "22P02");
      if (f.val.length > MAX_IN) throw new QueryError(`"in" list is too long`, "54000");
      if (f.val.length === 0) return { sql: f.not ? "1 = 1" : "1 = 0", params: [] };
      return wrap(`${col} IN (${f.val.map(() => "?").join(", ")})`, f.val.map((v) => toDbValue(type, v, f.col)));
    }
    case "eq":
    case "neq": {
      const negated = (f.op === "neq") !== Boolean(f.not);
      if (f.val === null) return { sql: `${col} IS ${negated ? "NOT " : ""}NULL`, params: [] };
      return { sql: `${col} ${negated ? "<>" : "="} ?`, params: [toDbValue(type, f.val, f.col)] };
    }
    case "gt":
    case "gte":
    case "lt":
    case "lte": {
      if (f.val === null) throw new QueryError(`cannot compare "${f.col}" with null`, "22P02");
      const symbol = { gt: ">", gte: ">=", lt: "<", lte: "<=" }[f.op];
      return wrap(`${col} ${symbol} ?`, [toDbValue(type, f.val, f.col)]);
    }
    default:
      throw new QueryError(`unsupported filter "${String((f as Filter).op)}"`, "PGRST100");
  }
}

function buildWhere(def: TableDef, table: string, filters: Filter[], access: Sql | null): { where: string; params: unknown[] } {
  if (!access) throw denied(table);
  const parts = [`(${access.sql})`];
  const params: unknown[] = [...access.params];
  for (const f of filters) {
    const built = buildFilter(def, table, f);
    parts.push(`(${built.sql})`);
    params.push(...built.params);
  }
  return { where: parts.join(" AND "), params };
}

function buildOrder(def: TableDef, table: string, spec: QuerySpec): string {
  if (!spec.order.length) return "";
  const parts = spec.order.map((o) => {
    colType(def, table, o.col);
    return `${t(o.col)} ${o.asc ? "ASC" : "DESC"}`;
  });
  return ` ORDER BY ${parts.join(", ")}`;
}

function buildLimit(spec: QuerySpec): string {
  let limit = MAX_ROWS;
  let offset = 0;
  if (spec.range) {
    const [from, to] = spec.range;
    if (!Number.isInteger(from) || !Number.isInteger(to) || from < 0 || to < from) throw new QueryError("invalid range", "22P02");
    offset = from;
    limit = Math.min(to - from + 1, MAX_ROWS);
  } else if (spec.limit !== undefined) {
    if (!Number.isInteger(spec.limit) || spec.limit < 0) throw new QueryError("invalid limit", "22P02");
    limit = Math.min(spec.limit, MAX_ROWS);
  }
  return ` LIMIT ${limit}${offset ? ` OFFSET ${offset}` : ""}`;
}

// ---------------------------------------------------------------------------
// Reading
// ---------------------------------------------------------------------------

function shapeRow(def: TableDef, cols: string[], raw: Row): Row {
  const out: Row = {};
  for (const col of cols) out[col] = fromDbValue(def.cols[col], raw[col]);
  return out;
}

async function attachEmbeds(runner: Runner, table: string, principal: Principal, embeds: Embed[], rows: Row[], hidden: Set<string>): Promise<void> {
  for (const embed of embeds) {
    const relation = EMBEDS[table][embed.rel];
    const target = resolveTable(relation.table);
    const proj = parseProjection(relation.table, target.def, embed.cols);
    const ids = Array.from(new Set(rows.map((r) => r[relation.fk]).filter((v): v is string => typeof v === "string")));
    const byId = new Map<string, Row>();
    if (ids.length) {
      const access = target.policy.select(principal);
      if (access) {
        const pk = target.def.pk;
        const cols = Array.from(new Set([pk, ...proj.cols]));
        const found = await rowsOf(
          runner,
          `SELECT ${cols.map(t).join(", ")} FROM ${q(relation.table)} t WHERE (${access.sql}) AND ${t(pk)} IN (${ids.map(() => "?").join(", ")})`,
          [...access.params, ...ids],
        );
        for (const raw of found) byId.set(String(raw[pk]), shapeRow(target.def, proj.cols, raw));
      }
    }
    for (const row of rows) row[embed.rel] = byId.get(String(row[relation.fk])) ?? null;
  }
  for (const key of hidden) for (const row of rows) delete row[key];
}

async function selectRows(
  runner: Runner,
  principal: Principal,
  table: string,
  spec: QuerySpec,
  extra: Filter[] = [],
): Promise<{ rows: Row[]; count: number | null }> {
  const { def, policy } = resolveTable(table);
  const proj = parseProjection(table, def, spec.select);
  const filters = [...spec.filters, ...extra];
  const { where, params } = buildWhere(def, table, filters, policy.select(principal));

  let count: number | null = null;
  if (spec.count === "exact") {
    const [counted] = await rowsOf(runner, `SELECT COUNT(*) AS n FROM ${q(table)} t WHERE ${where}`, params);
    count = Number(counted?.n ?? 0);
  }
  if (spec.head) return { rows: [], count };

  // Embeds need their foreign key in the row even when the caller did not select it.
  const hidden = new Set<string>();
  const cols = [...proj.cols];
  for (const embed of proj.embeds) {
    const fk = EMBEDS[table][embed.rel].fk;
    if (!cols.includes(fk)) {
      cols.push(fk);
      hidden.add(fk);
    }
  }
  const raw = await rowsOf(
    runner,
    `SELECT ${cols.map(t).join(", ")} FROM ${q(table)} t WHERE ${where}${buildOrder(def, table, spec)}${buildLimit(spec)}`,
    params,
  );
  const rows = raw.map((r) => shapeRow(def, cols, r));
  if (proj.embeds.length) await attachEmbeds(runner, table, principal, proj.embeds, rows, hidden);
  return { rows, count };
}

// ---------------------------------------------------------------------------
// Writing
// ---------------------------------------------------------------------------

function requireUser(principal: Principal, table: string): string {
  if (principal.kind !== "user") throw denied(table);
  return principal.userId;
}

function checkContext(runner: Runner, principal: Principal): CheckContext {
  const cache = new Map<string, boolean>();
  return {
    principal,
    async hasPatient(patientId, level) {
      if (!isUuid(patientId)) return false;
      const key = `${level}:${patientId}`;
      const hit = cache.get(key);
      if (hit !== undefined) return hit;
      const cond = patientCondition(principal, level, "?");
      let ok = false;
      if (cond) {
        // `? IN (...)` with the patient id bound first.
        const [found] = await rowsOf(runner, `SELECT 1 AS ok FROM DUAL WHERE ${cond.sql}`, [patientId, ...cond.params]);
        ok = Boolean(found);
      }
      cache.set(key, ok);
      return ok;
    },
    async exists(query, params) {
      if (params.some((p) => p === undefined || p === null)) return false;
      const [found] = await rowsOf(runner, query, params);
      return Boolean(found);
    },
  };
}

interface PreparedRow {
  cols: string[];
  values: Map<string, unknown>;
}

/** Validates one inbound row (columns, forced values, rules) and converts it for MySQL. */
function prepareRow(
  table: string,
  def: TableDef,
  policy: Policy,
  userId: string,
  input: Row,
  action: "insert" | "upsert",
): { raw: Row; prepared: PreparedRow } {
  if (typeof input !== "object" || input === null || Array.isArray(input)) throw new QueryError("rows must be objects", "22P02");
  const raw: Row = {};
  for (const [col, value] of Object.entries(input)) {
    colType(def, table, col);
    if (value !== undefined) raw[col] = value;
  }
  for (const col of policy.forced ?? []) raw[col] = userId;
  for (const [col, expected] of Object.entries(policy.require ?? {})) {
    if (raw[col] !== expected) throw new QueryError(`new row violates row-level security policy for table "${table}"`, "42501");
  }
  if (action === "upsert" && "id" in raw) {
    throw new QueryError("upsert rows must not set an id", "22P02");
  }
  if (def.genId && !("id" in raw)) raw.id = randomUUID();
  for (const [col, make] of Object.entries(def.defaults ?? {})) if (raw[col] === undefined) raw[col] = make();

  const values = new Map<string, unknown>();
  for (const [col, value] of Object.entries(raw)) {
    const rule = def.rules?.[col];
    if (rule) checkRule(col, rule, value);
    values.set(col, toDbValue(def.cols[col], value, col));
  }
  return { raw, prepared: { cols: Array.from(values.keys()), values } };
}

async function authorizeInsert(ctx: CheckContext, table: string, policy: Policy, raw: Row): Promise<void> {
  const rule = policy.insert;
  if (!rule) throw denied(table);
  const rls = (): QueryError => new QueryError(`new row violates row-level security policy for table "${table}"`, "42501");
  if (rule.level) {
    const scope = raw[rule.scopeCol ?? "patient_id"];
    if (typeof scope !== "string" || !(await ctx.hasPatient(scope, rule.level))) throw rls();
  }
  if (rule.check && !(await rule.check(ctx, raw))) throw rls();
}

function insertSql(table: string, rows: PreparedRow[]): { sql: string; params: unknown[]; cols: string[] } {
  const cols = Array.from(new Set(rows.flatMap((r) => r.cols)));
  const params: unknown[] = [];
  const tuples = rows.map((row) => {
    const cells = cols.map((col) => {
      if (!row.values.has(col)) return "DEFAULT";
      params.push(row.values.get(col));
      return "?";
    });
    return `(${cells.join(", ")})`;
  });
  return { sql: `INSERT INTO ${q(table)} (${cols.map(q).join(", ")}) VALUES ${tuples.join(", ")}`, params, cols };
}

function requireRows(spec: QuerySpec): Row[] {
  const values = spec.values;
  const rows = Array.isArray(values) ? values : values ? [values] : [];
  if (rows.length === 0) throw new QueryError("no rows to write", "22P02");
  if (rows.length > MAX_WRITE_ROWS) throw new QueryError("too many rows in one request", "54000");
  return rows as Row[];
}

async function readBack(runner: Runner, principal: Principal, table: string, spec: QuerySpec, filters: Filter[]): Promise<Row[]> {
  const { rows } = await selectRows(runner, principal, table, { ...spec, filters: [], order: [], count: undefined, head: false, limit: undefined, range: undefined }, filters);
  return rows;
}

async function runInsert(spec: QuerySpec, principal: Principal): Promise<Row[] | null> {
  const { def, policy } = resolveTable(spec.table);
  const userId = requireUser(principal, spec.table);
  const rows = requireRows(spec).map((r) => prepareRow(spec.table, def, policy, userId, r, "insert"));

  return withTransaction(async (conn) => {
    const ctx = checkContext(conn, principal);
    for (const row of rows) await authorizeInsert(ctx, spec.table, policy, row.raw);
    const built = insertSql(spec.table, rows.map((r) => r.prepared));
    await conn.query(built.sql, built.params);
    if (!spec.returning) return null;
    const pk = def.pk;
    return readBack(conn, principal, spec.table, spec, [{ op: "in", col: pk, val: rows.map((r) => r.raw[pk]) }]);
  });
}

async function runUpsert(spec: QuerySpec, principal: Principal): Promise<Row[] | null> {
  const { def, policy } = resolveTable(spec.table);
  const userId = requireUser(principal, spec.table);
  const rows = requireRows(spec).map((r) => prepareRow(spec.table, def, policy, userId, r, "upsert"));

  const conflict = (spec.onConflict ?? def.pk).split(",").map((c) => c.trim()).filter(Boolean);
  for (const col of conflict) colType(def, spec.table, col);
  const immutable = new Set([...(policy.immutable ?? []), def.pk, "created_at", ...conflict]);

  return withTransaction(async (conn) => {
    const ctx = checkContext(conn, principal);
    for (const row of rows) await authorizeInsert(ctx, spec.table, policy, row.raw);

    const built = insertSql(spec.table, rows.map((r) => r.prepared));
    const updatable = built.cols.filter((c) => !immutable.has(c));
    const onDup =
      spec.ignoreDuplicates || updatable.length === 0
        ? `${q(def.pk)} = ${q(def.pk)}`
        : updatable.map((c) => `${q(c)} = VALUES(${q(c)})`).join(", ");
    await conn.query(`${built.sql} ON DUPLICATE KEY UPDATE ${onDup}`, built.params);

    if (!spec.returning) return null;
    // Hand back the rows the upsert targeted, found by their conflict key.
    const out: Row[] = [];
    for (const row of rows) {
      const filters: Filter[] = conflict.map((col) => ({ op: "eq", col, val: row.raw[col] ?? null }));
      out.push(...(await readBack(conn, principal, spec.table, spec, filters)));
    }
    return out;
  });
}

async function runUpdate(spec: QuerySpec, principal: Principal): Promise<Row[] | null> {
  const { def, policy } = resolveTable(spec.table);
  requireUser(principal, spec.table);
  if (!spec.filters.length) throw new QueryError("UPDATE requires a filter", "21000");
  const input = spec.values;
  if (!input || Array.isArray(input) || typeof input !== "object" || Object.keys(input).length === 0) {
    throw new QueryError("nothing to update", "22P02");
  }

  const sets: string[] = [];
  const setParams: unknown[] = [];
  for (const [col, value] of Object.entries(input)) {
    if (value === undefined) continue;
    colType(def, spec.table, col);
    if (policy.updatable ? !policy.updatable.includes(col) : policy.immutable?.includes(col)) {
      throw new QueryError(`column "${col}" cannot be changed`, "42501");
    }
    const rule = def.rules?.[col];
    if (rule) checkRule(col, rule, value);
    sets.push(`${q(col)} = ?`);
    setParams.push(toDbValue(def.cols[col], value, col));
  }
  if (sets.length === 0) throw new QueryError("nothing to update", "22P02");

  return withTransaction(async (conn) => {
    const { where, params } = buildWhere(def, spec.table, spec.filters, policy.update ? policy.update(principal) : null);
    const targets = await rowsOf(conn, `SELECT ${t(def.pk)} AS pk FROM ${q(spec.table)} t WHERE ${where} FOR UPDATE`, params);
    const ids = targets.map((r) => r.pk);
    if (ids.length === 0) return spec.returning ? [] : null;
    await conn.query(
      `UPDATE ${q(spec.table)} SET ${sets.join(", ")} WHERE ${q(def.pk)} IN (${ids.map(() => "?").join(", ")})`,
      [...setParams, ...ids],
    );
    if (!spec.returning) return null;
    return readBack(conn, principal, spec.table, spec, [{ op: "in", col: def.pk, val: ids }]);
  });
}

async function runDelete(spec: QuerySpec, principal: Principal): Promise<Row[] | null> {
  const { def, policy } = resolveTable(spec.table);
  requireUser(principal, spec.table);
  if (!spec.filters.length) throw new QueryError("DELETE requires a filter", "21000");

  return withTransaction(async (conn) => {
    const { where, params } = buildWhere(def, spec.table, spec.filters, policy.delete ? policy.delete(principal) : null);
    const targets = await rowsOf(conn, `SELECT ${t(def.pk)} AS pk FROM ${q(spec.table)} t WHERE ${where} FOR UPDATE`, params);
    const ids = targets.map((r) => r.pk);
    if (ids.length === 0) return spec.returning ? [] : null;
    // Read the rows BEFORE deleting them: `.delete().select("patient_id")` returns what was removed.
    const before = spec.returning ? await readBack(conn, principal, spec.table, spec, [{ op: "in", col: def.pk, val: ids }]) : null;
    await conn.query(`DELETE FROM ${q(spec.table)} WHERE ${q(def.pk)} IN (${ids.map(() => "?").join(", ")})`, ids);
    return before;
  });
}

// ---------------------------------------------------------------------------
// Entry points
// ---------------------------------------------------------------------------

function shapeResult(spec: QuerySpec, rows: Row[] | null, count: number | null): DbResponse<unknown> {
  if (spec.mode === "many") return { data: rows, error: null, count };
  const list = rows ?? [];
  if (spec.mode === "maybeSingle" && list.length === 0) return { data: null, error: null, count };
  if (list.length === 1) return { data: list[0], error: null, count };
  return {
    data: null,
    error: {
      message: "JSON object requested, multiple (or no) rows returned",
      code: "PGRST116",
      details: `The result contains ${list.length} rows`,
    },
    count,
  };
}

export async function executeQuery(spec: QuerySpec, principal: Principal): Promise<DbResponse<unknown>> {
  try {
    if (!spec || typeof spec !== "object" || typeof spec.table !== "string") throw new QueryError("invalid query", "PGRST100");
    if (!Array.isArray(spec.filters) || !Array.isArray(spec.order)) throw new QueryError("invalid query", "PGRST100");
    resolveTable(spec.table);

    switch (spec.action) {
      case "select": {
        const { rows, count } = await selectRows(getPool(), principal, spec.table, spec);
        return shapeResult(spec, rows, count);
      }
      case "insert":
        return shapeResult(spec, await runInsert(spec, principal), null);
      case "upsert":
        return shapeResult(spec, await runUpsert(spec, principal), null);
      case "update":
        return shapeResult(spec, await runUpdate(spec, principal), null);
      case "delete":
        return shapeResult(spec, await runDelete(spec, principal), null);
      default:
        throw new QueryError("unsupported action", "PGRST100");
    }
  } catch (err) {
    return { data: null, error: toDbError(err), count: null };
  }
}

export async function executeRpcSafe(spec: RpcSpec, principal: Principal): Promise<DbResponse<unknown>> {
  try {
    return { data: await executeRpc(spec, principal), error: null, count: null };
  } catch (err) {
    return { data: null, error: toDbError(err), count: null };
  }
}

/** A query client that runs in-process as `principal` (SOIE, e-mail jobs, API routes). */
export function createDb(principal: Principal): DbClient {
  return new DbClient(
    (spec) => executeQuery(spec, principal),
    (spec) => executeRpcSafe(spec, principal),
  );
}

export { TABLES };
