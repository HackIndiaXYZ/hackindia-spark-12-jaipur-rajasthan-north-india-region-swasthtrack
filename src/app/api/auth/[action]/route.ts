import {
  assertSameOrigin,
  authErrorResponse,
  clearSessionCookie,
  readCookie,
  requestInfo,
  requireUser,
  sessionCookie,
} from "@/lib/auth/request";
import { SESSION_COOKIE, type SessionPayload } from "@/lib/auth/constants";
import {
  changePassword,
  endSession,
  lookupSession,
  resendSignupCode,
  resetPasswordWithCode,
  sendLoginCode,
  sendPasswordResetCode,
  signInWithPassword,
  signUp,
  updateDisplayName,
  verifyLoginCode,
  verifySignupCode,
  type SessionResult,
} from "@/lib/auth/service";
import { isDatabaseConfigured } from "@/lib/db/server/pool";
import { HttpError } from "@/lib/db/server/http";

export const runtime = "nodejs";

const NO_STORE = { "Cache-Control": "no-store" };

/**
 * Authentication API (replaces Supabase Auth). One catch-all route:
 *
 *   GET  /api/auth/session         who is signed in (and whether the database is configured)
 *   POST /api/auth/signup          { email, password, displayName? }  -> e-mails a 6-digit code
 *   POST /api/auth/verify-signup   { email, code }                    -> signed in
 *   POST /api/auth/resend-signup   { email }
 *   POST /api/auth/login           { email, password }                -> signed in
 *   POST /api/auth/login-code      { email }                          -> e-mails a sign-in code
 *   POST /api/auth/login-verify    { email, code }                    -> signed in
 *   POST /api/auth/reset-code      { email }                          -> e-mails a reset code
 *   POST /api/auth/reset-confirm   { email, code, newPassword }       -> password changed, signed in
 *   POST /api/auth/password        { newPassword }                    (signed in)
 *   POST /api/auth/profile         { displayName }                    (signed in)
 *   POST /api/auth/logout
 *
 * The session is an opaque random token in an HttpOnly, SameSite=Lax cookie; only its
 * SHA-256 is stored. Errors are `{ error: { code } }` with the codes in src/lib/auth/constants.ts.
 */

function withSession(request: Request, result: SessionResult): Response {
  const body = { user: result.user };
  return Response.json(body, {
    headers: { ...NO_STORE, "Set-Cookie": sessionCookie(request, result.token, result.expiresAt) },
  });
}

async function readBody(request: Request): Promise<Record<string, unknown>> {
  try {
    const body = (await request.json()) as unknown;
    return body && typeof body === "object" && !Array.isArray(body) ? (body as Record<string, unknown>) : {};
  } catch {
    throw new HttpError(400, "Invalid JSON body");
  }
}

export async function GET(request: Request, ctx: { params: Promise<{ action: string }> }) {
  const { action } = await ctx.params;
  if (action !== "session") return Response.json({ error: { code: "unknown" } }, { status: 404 });
  try {
    if (!isDatabaseConfigured()) {
      const payload: SessionPayload = { configured: false, user: null, profile: null };
      return Response.json(payload, { headers: NO_STORE });
    }
    const session = await lookupSession(readCookie(request, SESSION_COOKIE));
    const payload: SessionPayload = { configured: true, user: session?.user ?? null, profile: session?.profile ?? null };
    return Response.json(payload, { headers: NO_STORE });
  } catch (err) {
    return authErrorResponse(err);
  }
}

export async function POST(request: Request, ctx: { params: Promise<{ action: string }> }) {
  const { action } = await ctx.params;
  try {
    if (!isDatabaseConfigured()) throw new HttpError(503, "The database is not configured on the server");
    assertSameOrigin(request);
    const info = requestInfo(request);

    switch (action) {
      case "signup": {
        const b = await readBody(request);
        return Response.json(await signUp({ email: b.email, password: b.password, displayName: b.displayName }, info), { headers: NO_STORE });
      }
      case "verify-signup": {
        const b = await readBody(request);
        return withSession(request, await verifySignupCode(b.email, b.code, info));
      }
      case "resend-signup": {
        const b = await readBody(request);
        await resendSignupCode(b.email, info);
        return Response.json({ ok: true }, { headers: NO_STORE });
      }
      case "login": {
        const b = await readBody(request);
        return withSession(request, await signInWithPassword(b.email, b.password, info));
      }
      case "login-code": {
        const b = await readBody(request);
        await sendLoginCode(b.email, info);
        return Response.json({ ok: true }, { headers: NO_STORE });
      }
      case "login-verify": {
        const b = await readBody(request);
        return withSession(request, await verifyLoginCode(b.email, b.code, info));
      }
      case "reset-code": {
        const b = await readBody(request);
        await sendPasswordResetCode(b.email, info);
        return Response.json({ ok: true }, { headers: NO_STORE });
      }
      case "reset-confirm": {
        const b = await readBody(request);
        return withSession(request, await resetPasswordWithCode(b.email, b.code, b.newPassword, info));
      }
      case "password": {
        const { user, sessionId } = await requireUser(request);
        const b = await readBody(request);
        await changePassword(user.id, sessionId, b.newPassword);
        return Response.json({ ok: true }, { headers: NO_STORE });
      }
      case "profile": {
        const { user } = await requireUser(request);
        const b = await readBody(request);
        await updateDisplayName(user.id, b.displayName);
        return Response.json({ ok: true }, { headers: NO_STORE });
      }
      case "logout": {
        await endSession(readCookie(request, SESSION_COOKIE));
        return Response.json({ ok: true }, { headers: { ...NO_STORE, "Set-Cookie": clearSessionCookie(request) } });
      }
      default:
        return Response.json({ error: { code: "unknown" } }, { status: 404 });
    }
  } catch (err) {
    return authErrorResponse(err);
  }
}
