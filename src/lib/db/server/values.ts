import { QueryError } from "./pool";
import type { ColType, Rule } from "./schema";

/**
 * Server only. Converts values between what the app speaks (ISO timestamps, booleans,
 * parsed JSON, numbers) and what MySQL stores (UTC "YYYY-MM-DD HH:MM:SS.mmm", 0/1, JSON text).
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d(\.\d{1,6})?)?$/;
const HAS_ZONE_RE = /(Z|[+-]\d{2}(:?\d{2})?)$/i;
const MYSQL_TS_RE = /^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}:\d{2})(?:\.(\d{1,6}))?$/;

export const isUuid = (value: unknown): value is string => typeof value === "string" && UUID_RE.test(value);

function bad(col: string, why: string): never {
  throw new QueryError(`invalid input for column "${col}": ${why}`, "22P02");
}

/** "2026-10-05T08:29:05.271+05:30" | Date | epoch ms -> "2026-10-05 02:59:05.271" (UTC). */
export function toMysqlTimestamp(value: unknown, col = "timestamp"): string {
  let date: Date;
  if (value instanceof Date) {
    date = value;
  } else if (typeof value === "number" && Number.isFinite(value)) {
    date = new Date(value);
  } else if (typeof value === "string" && value.trim()) {
    const text = value.trim();
    const match = MYSQL_TS_RE.exec(text);
    // A timestamp with no zone designator is read as UTC (the database session is UTC too).
    date = new Date(match ? `${match[1]}T${match[2]}${match[3] ? `.${match[3].padEnd(3, "0").slice(0, 3)}` : ".000"}Z` : HAS_ZONE_RE.test(text) ? text : `${text}Z`);
  } else {
    return bad(col, "not a timestamp");
  }
  if (Number.isNaN(date.getTime())) return bad(col, "not a valid timestamp");
  return date.toISOString().replace("T", " ").replace("Z", "");
}

/** "2026-10-05 02:59:05.271" -> "2026-10-05T02:59:05.271Z" */
export function fromMysqlTimestamp(value: string): string {
  const match = MYSQL_TS_RE.exec(value);
  if (!match) return value;
  return `${match[1]}T${match[2]}.${(match[3] ?? "").padEnd(3, "0").slice(0, 3)}Z`;
}

/** App value -> a MySQL parameter. Throws QueryError(22P02) for a value the column cannot hold. */
export function toDbValue(type: ColType, value: unknown, col: string): unknown {
  if (value === null || value === undefined) return null;
  switch (type) {
    case "uuid":
      if (!isUuid(value)) return bad(col, "not a UUID");
      return value.toLowerCase();
    case "text":
      if (typeof value === "string") return value;
      if (typeof value === "number" || typeof value === "boolean") return String(value);
      return bad(col, "not text");
    case "int": {
      const n = typeof value === "string" && value.trim() !== "" ? Number(value) : value;
      if (typeof n !== "number" || !Number.isInteger(n)) return bad(col, "not an integer");
      return n;
    }
    case "num": {
      const n = typeof value === "string" && value.trim() !== "" ? Number(value) : value;
      if (typeof n !== "number" || !Number.isFinite(n)) return bad(col, "not a number");
      return n;
    }
    case "bool":
      if (typeof value === "boolean") return value ? 1 : 0;
      if (value === "true" || value === 1) return 1;
      if (value === "false" || value === 0) return 0;
      return bad(col, "not a boolean");
    case "json":
      return JSON.stringify(value);
    case "date":
      if (typeof value !== "string" || !DATE_RE.test(value)) return bad(col, "expected YYYY-MM-DD");
      return value;
    case "time":
      if (typeof value !== "string" || !TIME_RE.test(value)) return bad(col, "expected HH:MM[:SS]");
      return value;
    case "ts":
      return toMysqlTimestamp(value, col);
  }
}

/** MySQL value -> what the app expects (matches what PostgREST used to return). */
export function fromDbValue(type: ColType, value: unknown): unknown {
  if (value === null || value === undefined) return null;
  switch (type) {
    case "bool":
      return value === true || value === 1 || value === "1";
    case "ts":
      return typeof value === "string" ? fromMysqlTimestamp(value) : value instanceof Date ? value.toISOString() : value;
    case "json":
      if (typeof value === "string") {
        try {
          return JSON.parse(value);
        } catch {
          return value;
        }
      }
      return value;
    case "int":
    case "num":
      return typeof value === "string" ? Number(value) : value;
    default:
      return value;
  }
}

/** Mirrors the SQL CHECK constraints. `value` is the app-side value (before toDbValue). */
export function checkRule(col: string, rule: Rule, value: unknown): void {
  if (value === null || value === undefined) return;
  const fail = (): never => {
    throw new QueryError(`new row violates check constraint on "${col}"`, "23514");
  };
  if (typeof value === "number" || (typeof value === "string" && rule.oneOf === undefined && rule.maxLen === undefined)) {
    const n = Number(value);
    if (Number.isNaN(n)) throw new QueryError(`invalid input for column "${col}": not a number`, "22P02");
    if (rule.gt !== undefined && !(n > rule.gt)) fail();
    if (rule.gte !== undefined && !(n >= rule.gte)) fail();
    if (rule.lt !== undefined && !(n < rule.lt)) fail();
    if (rule.lte !== undefined && !(n <= rule.lte)) fail();
  }
  if (rule.oneOf && !rule.oneOf.includes(String(value))) fail();
  if (rule.maxLen !== undefined && String(value).length > rule.maxLen) fail();
}
