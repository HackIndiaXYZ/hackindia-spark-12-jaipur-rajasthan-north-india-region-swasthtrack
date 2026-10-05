/**
 * Shared by the scripts in this folder: loads `.env.local` (then `.env`) into process.env
 * WITHOUT overriding variables that are already set, and builds a mysql2 connection config
 * from DATABASE_URL (with the same TLS rules as the app, see src/lib/db/server/pool.ts).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import mysql from "mysql2/promise";

export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

export function loadEnv() {
  for (const name of [".env.local", ".env"]) {
    const file = path.join(root, name);
    if (!fs.existsSync(file)) continue;
    for (const raw of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
      const line = raw.trim();
      if (!line || line.startsWith("#")) continue;
      const eq = line.indexOf("=");
      if (eq < 0) continue;
      const key = line.slice(0, eq).trim();
      let value = line.slice(eq + 1).trim();
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
      if (process.env[key] === undefined) process.env[key] = value;
    }
  }
}

/** Connection options for a one-off script connection (multi-statement allowed: schema files). */
export async function connectionOptions(url = process.env.DATABASE_URL, { multipleStatements = false } = {}) {
  if (!url || !/^mysql2?:\/\//i.test(url)) {
    console.error("DATABASE_URL is not set (expected mysql://user:password@host:3306/database). Put it in .env.local.");
    process.exit(2);
  }
  // Reuse the app's own option builder so scripts and the server agree on TLS and charset.
  const { src } = await import("../soie-node-hooks.mjs");
  const { poolOptions } = await import(src("lib/db/server/pool.ts"));
  return { ...poolOptions(url), multipleStatements, dateStrings: true };
}

export function describeTarget(url) {
  const u = new URL(url);
  return `${u.hostname}:${u.port || 3306}/${decodeURIComponent(u.pathname.slice(1))}`;
}

/** What most likely went wrong, in words, for the errors a first hosted-database setup runs into. */
function connectionHint(err) {
  const text = `${err.code ?? ""} ${err.message ?? ""}`;
  if (err.code === "HANDSHAKE_SSL_ERROR" || /certificate|self.signed|unable to verify/i.test(text)) {
    return "The database's TLS certificate is not trusted. Download the CA certificate your provider gives you and set\n  DATABASE_SSL_CA=/path/to/ca.pem (or paste the PEM text). Do not switch verification off for a real database.";
  }
  if (err.code === "ER_ACCESS_DENIED_ERROR") {
    return "Wrong user or password, OR the user is set to require TLS and the URL has no ?ssl=true (MySQL answers both the same way).\n  Try adding ?ssl=true to DATABASE_URL. A password with @ : / # ? must be URL-encoded (@ -> %40).";
  }
  if (err.code === "ER_SECURE_TRANSPORT_REQUIRED" || /insecure transport|secure connection|require_secure/i.test(text)) {
    return "This server only accepts TLS connections: add ?ssl=true to DATABASE_URL (or set DATABASE_SSL=true).";
  }
  if (err.code === "ER_BAD_DB_ERROR") {
    return "That database does not exist yet. Create it once, then run this again:\n  CREATE DATABASE <name> CHARACTER SET utf8mb4;";
  }
  if (["ECONNREFUSED", "ENOTFOUND", "ETIMEDOUT", "EHOSTUNREACH", "ECONNRESET", "EAI_AGAIN"].includes(err.code)) {
    return "The host or port cannot be reached. Check the host name and port in DATABASE_URL, and that the provider allows\n  connections from this computer (many hosted databases have an IP allow-list).";
  }
  return null;
}

/** Opens a connection; on failure says what to check instead of dumping a stack trace. */
export async function connect(options) {
  try {
    return await mysql.createConnection(options);
  } catch (err) {
    console.error(`\nCould not connect to the database: ${err.code ? `${err.code}: ` : ""}${err.sqlMessage || err.message}`);
    const hint = connectionHint(err);
    if (hint) console.error(`\n  ${hint}`);
    process.exit(1);
  }
}
