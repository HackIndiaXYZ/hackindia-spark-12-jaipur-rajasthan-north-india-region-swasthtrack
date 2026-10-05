import { createHash, createHmac, randomBytes, randomInt, scrypt, timingSafeEqual, type ScryptOptions } from "node:crypto";

/**
 * Server only. Password hashing, one-time codes and session tokens.
 *
 *  - Passwords: scrypt (memory-hard, built into Node), a random 16-byte salt per user,
 *    stored as `scrypt$N$r$p$salt$hash`. Parameters live in the string, so they can be raised later.
 *  - One-time codes: 6 digits from a CSPRNG, stored only as an HMAC (keyed with AUTH_SECRET).
 *  - Session tokens: 32 random bytes in an HttpOnly cookie; only their SHA-256 is stored.
 */

const N = 32768;
const R = 8;
const P = 1;
const KEYLEN = 64;
const MAXMEM = 128 * 1024 * 1024;

function derive(password: string, salt: Buffer, n: number, r: number, p: number, keylen: number): Promise<Buffer> {
  const options: ScryptOptions = { N: n, r, p, maxmem: MAXMEM };
  return new Promise((resolve, reject) => {
    scrypt(password.normalize("NFKC"), salt, keylen, options, (err, key) => (err ? reject(err) : resolve(key)));
  });
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await derive(password, salt, N, R, P, KEYLEN);
  return `scrypt$${N}$${R}$${P}$${salt.toString("base64")}$${key.toString("base64")}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;
  const [, n, r, p, saltB64, hashB64] = parts;
  const expected = Buffer.from(hashB64, "base64");
  const actual = await derive(password, Buffer.from(saltB64, "base64"), Number(n), Number(r), Number(p), expected.length);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

let dummyHash: Promise<string> | null = null;

/** Spend the same time as a real check, so "no such account" and "wrong password" look alike. */
export async function burnPasswordCheck(password: string): Promise<void> {
  dummyHash ??= hashPassword("swasthtrack-no-such-account");
  await verifyPassword(password, await dummyHash);
}

export function authSecret(): string {
  const secret = process.env.AUTH_SECRET?.trim();
  if (secret && secret.length >= 16) return secret;
  if (process.env.NODE_ENV === "production") {
    throw new Error("AUTH_SECRET is not set. Use a random string of 32+ characters (see .env.example).");
  }
  return "swasthtrack-dev-only-secret-do-not-use-in-production";
}

const hmac = (value: string): string => createHmac("sha256", authSecret()).update(value).digest("hex");

export const newOtpCode = (): string => String(randomInt(0, 1_000_000)).padStart(6, "0");

export const otpHash = (email: string, purpose: string, code: string): string => hmac(`otp|${email}|${purpose}|${code}`);

export function sameHash(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/** A stable, non-reversible key for rate-limit counters (no e-mail or IP is stored). */
export const counterKey = (value: string): string => hmac(`key|${value}`);

export const newSessionToken = (): string => randomBytes(32).toString("base64url");

export const tokenHash = (token: string): string => createHash("sha256").update(token).digest("hex");
