import { randomUUID } from "node:crypto";
import type { PoolConnection } from "mysql2/promise";
import { getPool, withTransaction } from "@/lib/db/server/pool";
import { toMysqlTimestamp } from "@/lib/db/server/values";
import { renderConfirmSignupEmail, renderPasswordResetEmail, renderSignInCodeEmail } from "@/lib/email/templates";
import { sendMail } from "@/lib/email/mailer";
import {
  MAX_PASSWORD_LENGTH,
  MIN_PASSWORD_LENGTH,
  OTP_LENGTH,
  OTP_MAX_VERIFY_ATTEMPTS,
  OTP_VALID_MINUTES,
  SESSION_DAYS,
  type AuthErrorCode,
  type AuthUser,
  type UserProfile,
} from "./constants";
import { burnPasswordCheck, counterKey, hashPassword, newOtpCode, newSessionToken, otpHash, sameHash, tokenHash, verifyPassword } from "./crypto";

/**
 * Server only. Accounts, e-mail one-time codes and sessions, on MySQL.
 *
 * Replaces Supabase Auth with the same flows the app already has:
 *   sign up (password + e-mailed code), sign in (password), sign in with an e-mailed
 *   code, forgot password (e-mailed code), change password, sign out.
 *
 * Messages that would reveal whether an address has an account are avoided (resend,
 * sign-in code and reset all "succeed" quietly for unknown addresses). Wrong passwords
 * and wrong codes are rate limited (counters hold only keyed hashes, never addresses).
 */

export class AuthApiError extends Error {
  code: AuthErrorCode;
  status: number;
  constructor(code: AuthErrorCode, status: number, message?: string) {
    super(message ?? code);
    this.name = "AuthApiError";
    this.code = code;
    this.status = status;
  }
}

const err = (code: AuthErrorCode, status = 400): AuthApiError => new AuthApiError(code, status);

export interface RequestInfo {
  ip: string | null;
  userAgent: string | null;
}

export interface SessionResult {
  token: string;
  expiresAt: Date;
  user: AuthUser;
}

type Row = Record<string, unknown>;
type Queryable = Pick<PoolConnection, "query">;

const now = (): string => toMysqlTimestamp(new Date());
const minutesAgo = (m: number): string => toMysqlTimestamp(new Date(Date.now() - m * 60_000));

async function one(db: Queryable, sql: string, params: unknown[] = []): Promise<Row | null> {
  const [rows] = await db.query(sql, params);
  return (rows as Row[])[0] ?? null;
}

// ---------------------------------------------------------------------------
// Input checks
// ---------------------------------------------------------------------------

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function normalizeEmail(input: unknown): string {
  const email = typeof input === "string" ? input.trim().toLowerCase() : "";
  if (!EMAIL_RE.test(email) || email.length > 254) throw err("invalid_input");
  return email;
}

function checkPassword(password: unknown): string {
  if (typeof password !== "string") throw err("invalid_input");
  if (password.length < MIN_PASSWORD_LENGTH) throw err("weak_password");
  if (password.length > MAX_PASSWORD_LENGTH) throw err("invalid_input");
  return password;
}

function checkCode(code: unknown): string {
  if (typeof code !== "string" || !new RegExp(`^\\d{${OTP_LENGTH}}$`).test(code.trim())) throw err("invalid_code");
  return code.trim();
}

// ---------------------------------------------------------------------------
// Rate limits (auth_attempts)
// ---------------------------------------------------------------------------

type Limit = { kind: string; key: string; max: number; windowMin: number };

async function overLimit(limit: Limit): Promise<boolean> {
  const row = await one(getPool(), "SELECT COUNT(*) AS n FROM auth_attempts WHERE kind = ? AND key_hash = ? AND at > ?", [
    limit.kind,
    limit.key,
    minutesAgo(limit.windowMin),
  ]);
  return Number(row?.n ?? 0) >= limit.max;
}

async function record(kind: string, key: string): Promise<void> {
  await getPool().query("INSERT INTO auth_attempts (kind, key_hash) VALUES (?, ?)", [kind, key]);
  // Housekeeping, now and then: nothing here needs to live more than a day.
  if (Math.random() < 0.02) {
    await getPool().query("DELETE FROM auth_attempts WHERE at < ? LIMIT 500", [minutesAgo(24 * 60)]);
    await getPool().query("DELETE FROM auth_sessions WHERE expires_at < ? LIMIT 500", [now()]);
    await getPool().query("DELETE FROM auth_otps WHERE expires_at < ? LIMIT 500", [minutesAgo(60)]);
  }
}

const clear = async (kind: string, key: string): Promise<void> => {
  await getPool().query("DELETE FROM auth_attempts WHERE kind = ? AND key_hash = ?", [kind, key]);
};

// ---------------------------------------------------------------------------
// Sending codes
// ---------------------------------------------------------------------------

type Purpose = "signup" | "login" | "recovery";

export type CodeMailer = (to: string, purpose: Purpose, code: string) => Promise<{ ok: boolean; error?: string }>;

const defaultMailer: CodeMailer = async (to, purpose, code) => {
  const configured = Boolean(process.env.SMTP_PASS || process.env.RESEND_API_KEY);
  if (!configured) {
    if (process.env.NODE_ENV !== "production") {
      // Local development without SMTP: show the code where the developer can read it.
      console.warn(`[auth] SMTP is not configured; DEV ONLY code for ${to} (${purpose}): ${code}`);
      return { ok: true };
    }
    return { ok: false, error: "SMTP is not configured on the server" };
  }
  const data = { code, validMinutes: OTP_VALID_MINUTES };
  const mail = purpose === "signup" ? renderConfirmSignupEmail(data) : purpose === "login" ? renderSignInCodeEmail(data) : renderPasswordResetEmail(data);
  return sendMail([to], mail);
};

let mailer: CodeMailer = defaultMailer;

/** Tests swap this to read the code instead of e-mailing it. Pass null to restore. */
export function setCodeMailer(next: CodeMailer | null): void {
  mailer = next ?? defaultMailer;
}

const RESEND_COOLDOWN_SECONDS = 45;
const SENDS_PER_HOUR = 5;
const SENDS_PER_IP_HOUR = 30;

async function issueCode(email: string, purpose: Purpose, req: RequestInfo): Promise<void> {
  const pair = counterKey(`${email}|${purpose}`);
  const ip = req.ip ? counterKey(`ip|${req.ip}`) : null;
  if (await overLimit({ kind: "otp_send", key: pair, max: SENDS_PER_HOUR, windowMin: 60 })) throw err("rate_limited", 429);
  if (ip && (await overLimit({ kind: "otp_send_ip", key: ip, max: SENDS_PER_IP_HOUR, windowMin: 60 }))) throw err("rate_limited", 429);

  const last = await one(getPool(), "SELECT created_at FROM auth_otps WHERE email = ? AND purpose = ? ORDER BY created_at DESC LIMIT 1", [email, purpose]);
  if (last && new Date(`${String(last.created_at).replace(" ", "T")}Z`).getTime() > Date.now() - RESEND_COOLDOWN_SECONDS * 1000) {
    throw err("rate_limited", 429);
  }

  const code = newOtpCode();
  const id = randomUUID();
  await withTransaction(async (conn) => {
    await conn.query("UPDATE auth_otps SET consumed_at = ? WHERE email = ? AND purpose = ? AND consumed_at IS NULL", [now(), email, purpose]);
    await conn.query("INSERT INTO auth_otps (id, email, purpose, code_hash, expires_at) VALUES (?, ?, ?, ?, ?)", [
      id,
      email,
      purpose,
      otpHash(email, purpose, code),
      toMysqlTimestamp(new Date(Date.now() + OTP_VALID_MINUTES * 60_000)),
    ]);
  });
  await record("otp_send", pair);
  if (ip) await record("otp_send_ip", ip);

  const sent = await mailer(email, purpose, code);
  if (!sent.ok) {
    console.error(`[auth] could not e-mail a ${purpose} code:`, sent.error);
    await getPool().query("DELETE FROM auth_otps WHERE id = ?", [id]);
    throw err("email_failed", 502);
  }
}

/**
 * Checks `code` against the newest unused code for (email, purpose). A wrong guess is
 * COUNTED (and so persists even though the caller then throws). `beforeConsume` may veto
 * a correct code without using it up (e.g. new password equals the old one).
 */
async function checkCodeAndConsume(
  conn: Queryable,
  email: string,
  purpose: Purpose,
  code: string,
  beforeConsume?: () => Promise<AuthErrorCode | null>,
): Promise<AuthErrorCode | null> {
  const row = await one(
    conn,
    "SELECT id, code_hash, attempts, expires_at FROM auth_otps WHERE email = ? AND purpose = ? AND consumed_at IS NULL ORDER BY created_at DESC LIMIT 1 FOR UPDATE",
    [email, purpose],
  );
  if (!row) return "invalid_code";
  const expired = new Date(`${String(row.expires_at).replace(" ", "T")}Z`).getTime() < Date.now();
  if (expired || Number(row.attempts) >= OTP_MAX_VERIFY_ATTEMPTS) return "invalid_code";

  if (!sameHash(String(row.code_hash), otpHash(email, purpose, code))) {
    await conn.query("UPDATE auth_otps SET attempts = attempts + 1 WHERE id = ?", [row.id]);
    return "invalid_code";
  }
  const veto = beforeConsume ? await beforeConsume() : null;
  if (veto) return veto;
  await conn.query("UPDATE auth_otps SET consumed_at = ? WHERE id = ?", [now(), row.id]);
  return null;
}

/** Runs the check in its own transaction; throws AFTER commit so a wrong guess stays counted. */
async function verifyCode(email: string, purpose: Purpose, code: string, beforeConsume?: (conn: Queryable) => Promise<AuthErrorCode | null>): Promise<void> {
  const failure = await withTransaction((conn) =>
    checkCodeAndConsume(conn, email, purpose, code, beforeConsume ? () => beforeConsume(conn) : undefined),
  );
  if (failure) throw err(failure === "invalid_code" ? "invalid_code" : failure);
}

// ---------------------------------------------------------------------------
// Sessions
// ---------------------------------------------------------------------------

async function createSession(userId: string, email: string, req: RequestInfo): Promise<SessionResult> {
  const token = newSessionToken();
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 86_400_000);
  await getPool().query("INSERT INTO auth_sessions (id, user_id, token_hash, user_agent, expires_at) VALUES (?, ?, ?, ?, ?)", [
    randomUUID(),
    userId,
    tokenHash(token),
    req.userAgent ? req.userAgent.slice(0, 255) : null,
    toMysqlTimestamp(expiresAt),
  ]);
  await getPool().query("UPDATE auth_users SET last_sign_in_at = ? WHERE id = ?", [now(), userId]);
  return { token, expiresAt, user: { id: userId, email } };
}

export interface ResolvedSession {
  sessionId: string;
  user: AuthUser;
  profile: UserProfile;
}

/** The account behind a session cookie, or null (unknown, expired, or unverified). */
export async function lookupSession(token: string | null | undefined): Promise<ResolvedSession | null> {
  if (!token || token.length < 20 || token.length > 200) return null;
  const row = await one(
    getPool(),
    `SELECT s.id AS session_id, s.last_seen_at, u.id AS user_id, u.email, p.display_name, p.role
       FROM auth_sessions s
       JOIN auth_users u ON u.id = s.user_id
       LEFT JOIN profiles p ON p.id = u.id
      WHERE s.token_hash = ? AND s.expires_at > ? AND u.email_verified_at IS NOT NULL`,
    [tokenHash(token), now()],
  );
  if (!row) return null;

  // Sliding expiry, written at most once an hour.
  const seen = new Date(`${String(row.last_seen_at).replace(" ", "T")}Z`).getTime();
  if (Date.now() - seen > 3_600_000) {
    await getPool().query("UPDATE auth_sessions SET last_seen_at = ?, expires_at = ? WHERE id = ?", [
      now(),
      toMysqlTimestamp(new Date(Date.now() + SESSION_DAYS * 86_400_000)),
      row.session_id,
    ]);
  }
  const email = String(row.email);
  return {
    sessionId: String(row.session_id),
    user: { id: String(row.user_id), email },
    profile: {
      id: String(row.user_id),
      email,
      display_name: (row.display_name as string | null) ?? email.split("@")[0],
      role: row.role === "admin" ? "admin" : "member",
    },
  };
}

export async function endSession(token: string | null | undefined): Promise<void> {
  if (!token) return;
  await getPool().query("DELETE FROM auth_sessions WHERE token_hash = ?", [tokenHash(token)]);
}

async function endOtherSessions(userId: string, keepSessionId: string | null): Promise<void> {
  if (keepSessionId) await getPool().query("DELETE FROM auth_sessions WHERE user_id = ? AND id <> ?", [userId, keepSessionId]);
  else await getPool().query("DELETE FROM auth_sessions WHERE user_id = ?", [userId]);
}

// ---------------------------------------------------------------------------
// Flows
// ---------------------------------------------------------------------------

async function findUser(email: string): Promise<Row | null> {
  return one(getPool(), "SELECT id, email, password_hash, email_verified_at FROM auth_users WHERE email = ?", [email]);
}

/** New account (unverified) + a signup code. Sign-up on an unverified address just re-sends. */
export async function signUp(input: { email: unknown; password: unknown; displayName?: unknown }, req: RequestInfo): Promise<{ status: "verify" }> {
  const email = normalizeEmail(input.email);
  const password = checkPassword(input.password);
  const name = typeof input.displayName === "string" ? input.displayName.trim().slice(0, 120) : "";

  const existing = await findUser(email);
  if (existing?.email_verified_at) throw err("user_exists", 409);

  const hash = await hashPassword(password);
  if (existing) {
    // An earlier attempt never finished: the newest password and name win.
    await getPool().query("UPDATE auth_users SET password_hash = ? WHERE id = ?", [hash, existing.id]);
    if (name) await getPool().query("UPDATE profiles SET display_name = ? WHERE id = ?", [name, existing.id]);
  } else {
    const id = randomUUID();
    try {
      await withTransaction(async (conn) => {
        await conn.query("INSERT INTO auth_users (id, email, password_hash) VALUES (?, ?, ?)", [id, email, hash]);
        await conn.query("INSERT INTO profiles (id, email, display_name) VALUES (?, ?, ?)", [id, email, name || email.split("@")[0]]);
      });
    } catch (e) {
      if ((e as { errno?: number }).errno === 1062) throw err("user_exists", 409); // lost a race with another sign-up
      throw e;
    }
  }
  await issueCode(email, "signup", req);
  return { status: "verify" };
}

export async function resendSignupCode(emailInput: unknown, req: RequestInfo): Promise<void> {
  const email = normalizeEmail(emailInput);
  const user = await findUser(email);
  if (!user || user.email_verified_at) return; // quietly: never reveal which addresses exist
  await issueCode(email, "signup", req);
}

export async function verifySignupCode(emailInput: unknown, codeInput: unknown, req: RequestInfo): Promise<SessionResult> {
  const email = normalizeEmail(emailInput);
  const code = checkCode(codeInput);
  const user = await findUser(email);
  if (!user) throw err("invalid_code");
  await verifyCode(email, "signup", code);
  await getPool().query("UPDATE auth_users SET email_verified_at = COALESCE(email_verified_at, ?) WHERE id = ?", [now(), user.id]);
  return createSession(String(user.id), email, req);
}

export async function signInWithPassword(emailInput: unknown, passwordInput: unknown, req: RequestInfo): Promise<SessionResult> {
  const email = normalizeEmail(emailInput);
  const password = typeof passwordInput === "string" ? passwordInput : "";
  if (!password || password.length > MAX_PASSWORD_LENGTH) throw err("invalid_credentials", 401);

  const byEmail = counterKey(`login|${email}`);
  const byIp = req.ip ? counterKey(`login-ip|${req.ip}`) : null;
  if (await overLimit({ kind: "login_fail", key: byEmail, max: 8, windowMin: 15 })) throw err("rate_limited", 429);
  if (byIp && (await overLimit({ kind: "login_fail_ip", key: byIp, max: 40, windowMin: 15 }))) throw err("rate_limited", 429);

  const user = await findUser(email);
  const ok = user ? await verifyPassword(password, String(user.password_hash)) : (await burnPasswordCheck(password), false);
  if (!user || !ok) {
    await record("login_fail", byEmail);
    if (byIp) await record("login_fail_ip", byIp);
    throw err("invalid_credentials", 401);
  }
  if (!user.email_verified_at) throw err("email_not_confirmed", 403);
  await clear("login_fail", byEmail);
  return createSession(String(user.id), email, req);
}

export async function sendLoginCode(emailInput: unknown, req: RequestInfo): Promise<void> {
  const email = normalizeEmail(emailInput);
  const user = await findUser(email);
  if (!user?.email_verified_at) return; // quietly
  await issueCode(email, "login", req);
}

export async function verifyLoginCode(emailInput: unknown, codeInput: unknown, req: RequestInfo): Promise<SessionResult> {
  const email = normalizeEmail(emailInput);
  const code = checkCode(codeInput);
  const user = await findUser(email);
  if (!user?.email_verified_at) throw err("invalid_code");
  await verifyCode(email, "login", code);
  return createSession(String(user.id), email, req);
}

export async function sendPasswordResetCode(emailInput: unknown, req: RequestInfo): Promise<void> {
  const email = normalizeEmail(emailInput);
  const user = await findUser(email);
  if (!user) return; // quietly
  await issueCode(email, "recovery", req);
}

/** Code + new password. The e-mailed code proves ownership, so this also verifies the address. */
export async function resetPasswordWithCode(emailInput: unknown, codeInput: unknown, newPassword: unknown, req: RequestInfo): Promise<SessionResult> {
  const email = normalizeEmail(emailInput);
  const code = checkCode(codeInput);
  const password = checkPassword(newPassword);
  const user = await findUser(email);
  if (!user) throw err("invalid_code");

  await verifyCode(email, "recovery", code, async () => ((await verifyPassword(password, String(user.password_hash))) ? "same_password" : null));
  await getPool().query("UPDATE auth_users SET password_hash = ?, email_verified_at = COALESCE(email_verified_at, ?) WHERE id = ?", [
    await hashPassword(password),
    now(),
    user.id,
  ]);
  await endOtherSessions(String(user.id), null); // a reset signs out every other device
  return createSession(String(user.id), email, req);
}

export async function changePassword(userId: string, sessionId: string, newPassword: unknown): Promise<void> {
  const password = checkPassword(newPassword);
  const user = await one(getPool(), "SELECT password_hash FROM auth_users WHERE id = ?", [userId]);
  if (!user) throw err("not_signed_in", 401);
  if (await verifyPassword(password, String(user.password_hash))) throw err("same_password");
  await getPool().query("UPDATE auth_users SET password_hash = ? WHERE id = ?", [await hashPassword(password), userId]);
  await endOtherSessions(userId, sessionId);
}

export async function updateDisplayName(userId: string, nameInput: unknown): Promise<void> {
  const name = typeof nameInput === "string" ? nameInput.trim().slice(0, 120) : "";
  if (!name) throw err("invalid_input");
  await getPool().query("UPDATE profiles SET display_name = ? WHERE id = ?", [name, userId]);
}
