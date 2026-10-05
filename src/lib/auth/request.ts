import { createDb } from "@/lib/db/server/executor";
import { HttpError } from "@/lib/db/server/http";
import type { DbClient } from "@/lib/db/builder";
import { isDatabaseConfigured } from "@/lib/db/server/pool";
import { SESSION_COOKIE, SESSION_DAYS, type AuthUser, type UserProfile } from "./constants";
import { AuthApiError, lookupSession, type RequestInfo } from "./service";

/**
 * Server only. Everything a Route Handler needs to know about WHO is calling:
 * the session cookie, the caller's address, a same-origin check for state-changing
 * requests, and the cookie that carries a new session.
 */

export function readCookie(request: Request, name: string): string | null {
  const header = request.headers.get("cookie");
  if (!header) return null;
  for (const part of header.split(";")) {
    const eq = part.indexOf("=");
    if (eq < 0) continue;
    if (part.slice(0, eq).trim() === name) {
      try {
        return decodeURIComponent(part.slice(eq + 1).trim());
      } catch {
        return null;
      }
    }
  }
  return null;
}

export function requestInfo(request: Request): RequestInfo {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const ip = forwarded || request.headers.get("x-real-ip")?.trim() || null;
  return { ip: ip ? ip.slice(0, 64) : null, userAgent: request.headers.get("user-agent") };
}

/**
 * Cookies ride along on cross-site requests, so every state-changing call must come
 * from this site. Modern browsers send `Origin`/`Sec-Fetch-Site`; a request with neither
 * is accepted only when it is JSON (a cross-site page cannot send that without a CORS preflight).
 */
export function assertSameOrigin(request: Request): void {
  if (request.method === "GET" || request.method === "HEAD" || request.method === "OPTIONS") return;
  const site = request.headers.get("sec-fetch-site");
  if (site) {
    if (site === "same-origin" || site === "none") return;
    throw new HttpError(403, "Cross-site request refused");
  }
  const origin = request.headers.get("origin");
  if (origin) {
    const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
    try {
      if (new URL(origin).host === host) return;
    } catch {
      // fall through to the refusal
    }
    throw new HttpError(403, "Cross-site request refused");
  }
  if (!(request.headers.get("content-type") ?? "").toLowerCase().startsWith("application/json")) {
    throw new HttpError(403, "Cross-site request refused");
  }
}

function isSecure(request: Request): boolean {
  const proto = request.headers.get("x-forwarded-proto");
  if (proto) return proto.split(",")[0].trim() === "https";
  try {
    return new URL(request.url).protocol === "https:";
  } catch {
    return false;
  }
}

export function sessionCookie(request: Request, token: string, expiresAt: Date): string {
  const maxAge = Math.max(0, Math.floor((expiresAt.getTime() - Date.now()) / 1000));
  return [
    `${SESSION_COOKIE}=${encodeURIComponent(token)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${maxAge || SESSION_DAYS * 86_400}`,
    isSecure(request) ? "Secure" : "",
  ]
    .filter(Boolean)
    .join("; ");
}

export function clearSessionCookie(request: Request): string {
  return [`${SESSION_COOKIE}=`, "Path=/", "HttpOnly", "SameSite=Lax", "Max-Age=0", isSecure(request) ? "Secure" : ""].filter(Boolean).join("; ");
}

export interface AuthedRequest {
  user: AuthUser;
  profile: UserProfile;
  sessionId: string;
  token: string;
  /** Query client that runs as this user (the same access rules the browser gets). */
  db: DbClient;
}

/** The signed-in caller, or HttpError(401/503). Also enforces same-origin on writes. */
export async function requireUser(request: Request): Promise<AuthedRequest> {
  if (!isDatabaseConfigured()) throw new HttpError(503, "The database is not configured on the server");
  assertSameOrigin(request);
  const token = readCookie(request, SESSION_COOKIE);
  const session = await lookupSession(token);
  if (!session || !token) throw new HttpError(401, "Sign in required");
  return {
    user: session.user,
    profile: session.profile,
    sessionId: session.sessionId,
    token,
    db: createDb({ kind: "user", userId: session.user.id }),
  };
}

/** Map an AuthApiError (or anything else) to the JSON body the browser expects. */
export function authErrorResponse(err: unknown): Response {
  if (err instanceof AuthApiError) {
    return Response.json({ error: { code: err.code } }, { status: err.status });
  }
  if (err instanceof HttpError) {
    return Response.json({ error: { code: err.status === 401 ? "not_signed_in" : "unknown", message: err.message } }, { status: err.status });
  }
  console.error("Unhandled auth error:", err);
  return Response.json({ error: { code: "unknown" } }, { status: 500 });
}
