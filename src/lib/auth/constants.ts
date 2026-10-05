/** Shared (browser + server) authentication constants. */

export const MIN_PASSWORD_LENGTH = 8;
export const MAX_PASSWORD_LENGTH = 200;
export const OTP_LENGTH = 6;
/** How long an e-mailed code works. The mail text reads this too. */
export const OTP_VALID_MINUTES = 10;
export const OTP_MAX_VERIFY_ATTEMPTS = 5;

/** HttpOnly cookie that carries the opaque session token. */
export const SESSION_COOKIE = "st_session";
export const SESSION_DAYS = 30;

export type AuthErrorCode =
  | "invalid_credentials"
  | "email_not_confirmed"
  | "rate_limited"
  | "weak_password"
  | "user_exists"
  | "invalid_code"
  | "invalid_input"
  | "same_password"
  | "not_signed_in"
  | "email_failed"
  | "network"
  | "unknown";

export type UserRole = "member" | "admin";

/** The signed-in account, as the browser sees it. */
export interface AuthUser {
  id: string;
  email: string;
}

export interface UserProfile {
  id: string;
  email: string | null;
  display_name: string | null;
  role: UserRole;
}

/** Body of GET /api/auth/session. */
export interface SessionPayload {
  /** False when the server has no DATABASE_URL: the app shows its setup screen. */
  configured: boolean;
  user: AuthUser | null;
  profile: UserProfile | null;
}
