import fs from "node:fs";
import mysql, { type Pool, type PoolConnection, type PoolOptions } from "mysql2/promise";
import type { DbError } from "../types";

/**
 * Server only. One shared MySQL connection pool.
 *
 *   DATABASE_URL=mysql://user:password@host:3306/swasthtrack
 *
 * Hosted MySQL (Aiven, TiDB Cloud, Railway, PlanetScale-compatible, RDS ...) needs TLS:
 * add `?ssl=true` to the URL (or set DATABASE_SSL=true). `DATABASE_SSL_CA` may hold a
 * CA certificate (PEM text, or a path to a file) when the host uses a private CA.
 *
 * Every connection is switched to UTC (`time_zone = '+00:00'`) so CURRENT_TIMESTAMP(3)
 * defaults and the DATETIME(3) values the app writes agree, whatever the host's default is.
 */

export function databaseUrl(): string | null {
  const url = (process.env.DATABASE_URL || process.env.MYSQL_URL || "").trim();
  return /^mysql2?:\/\//i.test(url) ? url : null;
}

export function isDatabaseConfigured(): boolean {
  return databaseUrl() !== null;
}

function truthy(value: string | null | undefined): boolean {
  return value !== null && value !== undefined && /^(1|true|yes|on|required|require|verify[-_]?(ca|full|identity))$/i.test(value);
}

function sslOptions(url: URL): PoolOptions["ssl"] | undefined {
  const fromUrl = url.searchParams.get("ssl") ?? url.searchParams.get("sslmode");
  const fromEnv = process.env.DATABASE_SSL;
  const explicit = fromUrl ?? fromEnv;
  const off = explicit !== null && explicit !== undefined && /^(0|false|no|off|disable|disabled)$/i.test(explicit);
  if (off || !truthy(explicit)) return undefined;

  const ssl: { minVersion: "TLSv1.2"; rejectUnauthorized: boolean; ca?: string } = {
    minVersion: "TLSv1.2",
    rejectUnauthorized: process.env.DATABASE_SSL_REJECT_UNAUTHORIZED !== "false",
  };
  const ca = process.env.DATABASE_SSL_CA?.trim();
  if (ca) ssl.ca = ca.includes("BEGIN CERTIFICATE") ? ca : fs.readFileSync(ca, "utf8");
  return ssl;
}

export function poolOptions(rawUrl: string): PoolOptions {
  const url = new URL(rawUrl);
  const database = decodeURIComponent(url.pathname.replace(/^\//, ""));
  if (!database) throw new Error("DATABASE_URL must name a database, e.g. mysql://user:pass@host:3306/swasthtrack");
  const size = Number(process.env.DATABASE_POOL_SIZE);
  return {
    host: url.hostname,
    port: url.port ? Number(url.port) : 3306,
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database,
    ssl: sslOptions(url),
    charset: "utf8mb4",
    // Values travel as strings/numbers only: dates stay "YYYY-MM-DD HH:MM:SS.mmm" strings
    // (converted explicitly in ./values.ts) and DECIMAL columns come back as JS numbers.
    dateStrings: true,
    decimalNumbers: true,
    timezone: "Z",
    waitForConnections: true,
    connectionLimit: Number.isFinite(size) && size > 0 ? Math.min(Math.floor(size), 50) : 5,
    queueLimit: 0,
    connectTimeout: 15_000,
    enableKeepAlive: true,
    multipleStatements: false,
  };
}

const globalForPool = globalThis as unknown as { __swasthtrackPool?: Pool; __swasthtrackPoolUrl?: string };

/** The shared pool (created on first use; reused across hot reloads in `next dev`). */
export function getPool(): Pool {
  const url = databaseUrl();
  if (!url) throw new DatabaseNotConfiguredServerError();
  if (globalForPool.__swasthtrackPool && globalForPool.__swasthtrackPoolUrl === url) return globalForPool.__swasthtrackPool;

  const pool = mysql.createPool(poolOptions(url));
  pool.pool.on("connection", (connection) => {
    connection.query("SET time_zone = '+00:00'");
  });
  globalForPool.__swasthtrackPool = pool;
  globalForPool.__swasthtrackPoolUrl = url;
  return pool;
}

export async function closePool(): Promise<void> {
  const pool = globalForPool.__swasthtrackPool;
  globalForPool.__swasthtrackPool = undefined;
  globalForPool.__swasthtrackPoolUrl = undefined;
  if (pool) await pool.end();
}

export class DatabaseNotConfiguredServerError extends Error {
  constructor() {
    super("DATABASE_URL is not set. Add a mysql:// connection string to .env.local.");
    this.name = "DatabaseNotConfiguredServerError";
  }
}

/** Run `fn` on one connection inside a transaction; rolls back on any throw. */
export async function withTransaction<T>(fn: (conn: PoolConnection) => Promise<T>): Promise<T> {
  const conn = await getPool().getConnection();
  try {
    await conn.beginTransaction();
    const result = await fn(conn);
    await conn.commit();
    return result;
  } catch (err) {
    try {
      await conn.rollback();
    } catch {
      // the original error is the one that matters
    }
    throw err;
  } finally {
    conn.release();
  }
}

// ---------------------------------------------------------------------------
// Errors: MySQL error numbers -> the Postgres SQLSTATEs the services branch on
// ---------------------------------------------------------------------------

const MYSQL_TO_SQLSTATE: Record<number, string> = {
  1062: "23505", // duplicate key
  1452: "23503", // child row: foreign key fails
  1451: "23503", // parent row: still referenced
  3819: "23514", // CHECK constraint violated (MySQL 8)
  4025: "23514", // CHECK constraint violated (MariaDB)
  1406: "22001", // data too long
  1264: "22003", // out of range
  1265: "22P02",
  1292: "22P02", // bad value for the column type
  1366: "22P02",
  1048: "23502", // NOT NULL violated
  1364: "23502",
};

export class QueryError extends Error {
  code: string;
  details: string | null;
  constructor(message: string, code: string, details: string | null = null) {
    super(message);
    this.name = "QueryError";
    this.code = code;
    this.details = details;
  }
}

export function toDbError(err: unknown): DbError {
  if (err instanceof QueryError) return { message: err.message, code: err.code, details: err.details };
  const e = err as { errno?: number; code?: string; sqlMessage?: string; message?: string } | null;
  if (e && typeof e.errno === "number" && MYSQL_TO_SQLSTATE[e.errno]) {
    return { message: e.sqlMessage || e.message || "Database error", code: MYSQL_TO_SQLSTATE[e.errno] };
  }
  if (e && (e.code === "ECONNREFUSED" || e.code === "ETIMEDOUT" || e.code === "ENOTFOUND" || e.code === "PROTOCOL_CONNECTION_LOST")) {
    return { message: "The database is not reachable right now.", code: "08006" };
  }
  if (err instanceof DatabaseNotConfiguredServerError) return { message: err.message, code: "DB_NOT_CONFIGURED" };
  console.error("Unexpected database error:", err);
  return { message: "Database request failed", code: "XX000" };
}
