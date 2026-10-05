import type { User } from "@supabase/supabase-js";
import { setActivePatientId } from "@/lib/active-patient";
import { isSupabaseConfigured, supabase } from "@/lib/supabase/client";
import type { MemberRole } from "@/lib/supabase/database.types";
import {
  SupabaseNotConfiguredError,
  clearAllPatientCaches,
  invalidatePatientCache,
  type PatientProfile,
} from "./patient-service";

/**
 * Authentication and caregiver membership, on top of Supabase Auth.
 *
 *  - email + password, with a 6-digit email OTP (sent by Supabase) to verify the
 *    address at sign-up;
 *  - password reset by emailed code;
 *  - optional passwordless "sign in with email code".
 *
 * There are no accounts, password hashes, OTPs or memberships in localStorage.
 * Who may see which patient is decided by Postgres Row Level Security
 * (supabase/migrations/20261004000000_secure_auth_rls_soie.sql); this file only
 * calls the RPCs and tables that migration defines.
 */

export const MIN_PASSWORD_LENGTH = 8;
export const OTP_LENGTH = 6;

export type UserRole = "member" | "admin";

export interface UserProfile {
  id: string;
  email: string | null;
  display_name: string | null;
  role: UserRole;
}

/** A patient the signed-in user is an active member of, with their role on it. */
export type AuthorizedPatient = PatientProfile & { member_role: MemberRole };

export interface CaregiverInvitation {
  id: string;
  patient_id: string;
  invite_code: string;
  role: "editor" | "viewer";
  status: "pending" | "accepted" | "expired" | "cancelled";
  expires_at: string;
  created_at: string;
}

/** One row of a patient's roster (owner-only view). */
export interface AuthorizedCaregiver {
  member_id: string;
  user_id: string;
  email: string | null;
  display_name: string | null;
  role: MemberRole;
  status: "active" | "revoked";
  added_at: string;
}

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

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
  | "network"
  | "unknown";

/** Carries a stable `code` so the UI can branch (e.g. send the user to the code step). */
export class AuthServiceError extends Error {
  constructor(
    public code: AuthErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "AuthServiceError";
  }
}

const MESSAGES: Record<AuthErrorCode, string> = {
  invalid_credentials: "ईमेल या पासवर्ड गलत है। (Incorrect email or password.)",
  email_not_confirmed:
    "आपका ईमेल अभी सत्यापित नहीं है। हमने एक कोड भेजा है, उसे दर्ज करें। (Email not verified yet: enter the code we emailed you.)",
  rate_limited:
    "बहुत ज़्यादा कोशिशें हो गईं। कुछ मिनट रुककर फिर कोशिश करें। (Too many attempts. Please wait a few minutes.)",
  weak_password: `पासवर्ड कम से कम ${MIN_PASSWORD_LENGTH} अक्षरों का होना चाहिए। (Password must be at least ${MIN_PASSWORD_LENGTH} characters.)`,
  user_exists:
    "इस ईमेल से खाता पहले से है। लॉगिन करें, या 'पासवर्ड भूल गए' चुनें। (An account with this email already exists. Sign in or reset your password.)",
  invalid_code: "कोड गलत है या समाप्त हो चुका है। नया कोड मंगाएं। (The code is wrong or has expired. Request a new one.)",
  invalid_input: "कृपया जानकारी जांचें। (Please check your details.)",
  same_password: "नया पासवर्ड पुराने से अलग रखें। (Choose a password different from the old one.)",
  not_signed_in: "कृपया पहले लॉगिन करें। (Please sign in first.)",
  network: "इंटरनेट कनेक्शन जांचें और फिर कोशिश करें। (Check your connection and try again.)",
  unknown: "कुछ गड़बड़ हो गई। कृपया फिर कोशिश करें। (Something went wrong. Please try again.)",
};

function authError(code: AuthErrorCode, message?: string): AuthServiceError {
  return new AuthServiceError(code, message ?? MESSAGES[code]);
}

type SupabaseAuthLike = { code?: string; message?: string; status?: number; name?: string };

function mapAuthError(error: SupabaseAuthLike): AuthServiceError {
  const code = error.code ?? "";
  const text = error.message ?? "";

  if (code === "invalid_credentials" || /invalid login credentials/i.test(text)) return authError("invalid_credentials");
  if (code === "email_not_confirmed" || /email not confirmed/i.test(text)) return authError("email_not_confirmed");
  if (
    code === "over_email_send_rate_limit" ||
    code === "over_request_rate_limit" ||
    code === "over_sms_send_rate_limit" ||
    error.status === 429 ||
    /rate limit|too many requests|after \d+ seconds|security purposes/i.test(text)
  ) {
    return authError("rate_limited");
  }
  if (code === "weak_password" || /password should be at least|weak password/i.test(text)) return authError("weak_password");
  if (code === "user_already_exists" || code === "email_exists" || /already registered|already exists/i.test(text)) {
    return authError("user_exists");
  }
  if (code === "same_password" || /different from the old password/i.test(text)) return authError("same_password");
  if (code === "otp_expired" || code === "validation_failed" || /token has expired|otp.*(expired|invalid)|invalid.*token/i.test(text)) {
    return authError("invalid_code");
  }
  if (code === "session_not_found" || code === "refresh_token_not_found" || /auth session missing/i.test(text)) {
    return authError("not_signed_in");
  }
  if (/failed to fetch|networkerror|load failed|fetch failed/i.test(text)) return authError("network");
  return authError("unknown");
}

function requireConfigured(): void {
  if (!isSupabaseConfigured) throw new SupabaseNotConfiguredError();
}

// ---------------------------------------------------------------------------
// Input checks
// ---------------------------------------------------------------------------

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function normalizeEmail(input: string): string {
  return input.trim().toLowerCase();
}

function requireEmail(input: string): string {
  const email = normalizeEmail(input);
  if (!EMAIL_RE.test(email)) {
    throw authError("invalid_input", "कृपया सही ईमेल पता दर्ज करें। (Enter a valid email address.)");
  }
  return email;
}

function requirePassword(password: string): void {
  if (password.length < MIN_PASSWORD_LENGTH) throw authError("weak_password");
}

function requireCode(input: string): string {
  const code = input.replace(/\s+/g, "");
  if (!new RegExp(`^\\d{${OTP_LENGTH}}$`).test(code)) {
    throw authError("invalid_code", `कृपया ${OTP_LENGTH} अंकों का कोड दर्ज करें। (Enter the ${OTP_LENGTH}-digit code.)`);
  }
  return code;
}

// ---------------------------------------------------------------------------
// Sign up / sign in
// ---------------------------------------------------------------------------

/**
 * Create an account. Supabase emails a 6-digit code (the "Confirm signup"
 * template must contain `{{ .Token }}`); the account cannot sign in until it is
 * verified with `verifySignupOtp`.
 */
export async function signUpWithEmail(
  email: string,
  password: string,
  displayName?: string,
): Promise<{ status: "verify" | "signed_in" }> {
  requireConfigured();
  const cleanEmail = requireEmail(email);
  requirePassword(password);

  const name = displayName?.trim();
  const { data, error } = await supabase.auth.signUp({
    email: cleanEmail,
    password,
    options: name ? { data: { display_name: name } } : undefined,
  });
  if (error) throw mapAuthError(error);

  // Supabase hides "already registered" by returning a user with no identities.
  if (data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) {
    throw authError("user_exists");
  }
  // "Confirm email" switched off in the dashboard: the account is live immediately.
  return { status: data.session ? "signed_in" : "verify" };
}

export async function verifySignupOtp(email: string, code: string): Promise<void> {
  requireConfigured();
  const { error } = await supabase.auth.verifyOtp({ email: requireEmail(email), token: requireCode(code), type: "signup" });
  if (error) throw mapAuthError(error);
}

export async function resendSignupOtp(email: string): Promise<void> {
  requireConfigured();
  const { error } = await supabase.auth.resend({ type: "signup", email: requireEmail(email) });
  if (error) throw mapAuthError(error);
}

export async function signInWithPassword(email: string, password: string): Promise<void> {
  requireConfigured();
  const cleanEmail = requireEmail(email);
  if (!password) throw authError("invalid_credentials");
  const { error } = await supabase.auth.signInWithPassword({ email: cleanEmail, password });
  if (error) throw mapAuthError(error);
}

// Errors that only say "this email has no account". The caller must not learn that.
function isUnknownAccountError(error: SupabaseAuthLike): boolean {
  return (
    error.code === "otp_disabled" ||
    error.code === "signup_disabled" ||
    error.code === "user_not_found" ||
    /signups not allowed|user not found/i.test(error.message ?? "")
  );
}

/** Passwordless sign-in: emails a code. Succeeds quietly for unknown addresses. */
export async function sendLoginCode(email: string): Promise<void> {
  requireConfigured();
  const { error } = await supabase.auth.signInWithOtp({
    email: requireEmail(email),
    options: { shouldCreateUser: false },
  });
  if (error && !isUnknownAccountError(error)) throw mapAuthError(error);
}

export async function verifyLoginCode(email: string, code: string): Promise<void> {
  requireConfigured();
  const { error } = await supabase.auth.verifyOtp({ email: requireEmail(email), token: requireCode(code), type: "email" });
  if (error) throw mapAuthError(error);
}

// ---------------------------------------------------------------------------
// Password reset / change
// ---------------------------------------------------------------------------

/** Emails a recovery code. Always looks successful, so it never reveals whether an account exists. */
export async function sendPasswordResetCode(email: string): Promise<void> {
  requireConfigured();
  const { error } = await supabase.auth.resetPasswordForEmail(requireEmail(email));
  if (error && !isUnknownAccountError(error)) throw mapAuthError(error);
}

/**
 * Verifying a recovery code signs the user in *before* the new password is set.
 * While that is in flight the login screen must stay mounted: if the guard
 * redirected a "signed-in" visitor to the dashboard, a rejected password
 * (same as the old one, too weak, offline) would have nowhere to show its error
 * and the user would just bounce back to an empty login form.
 * `AuthGuard` subscribes to this.
 */
let pendingSessionFlows = 0;
const holdListeners = new Set<() => void>();

function setHold(delta: 1 | -1): void {
  pendingSessionFlows = Math.max(0, pendingSessionFlows + delta);
  holdListeners.forEach((listener) => listener());
}

export function subscribeAuthFlowHold(listener: () => void): () => void {
  holdListeners.add(listener);
  return () => {
    holdListeners.delete(listener);
  };
}

/** True while a multi-step auth flow has a session that is not yet complete. */
export function isAuthFlowHeld(): boolean {
  return pendingSessionFlows > 0;
}

/** Verify the emailed code, then set the new password. The user ends up signed in. */
export async function resetPasswordWithCode(email: string, code: string, newPassword: string): Promise<void> {
  requireConfigured();
  const cleanEmail = requireEmail(email);
  const token = requireCode(code);
  requirePassword(newPassword);

  setHold(1);
  try {
    const { error: verifyError } = await supabase.auth.verifyOtp({ email: cleanEmail, token, type: "recovery" });
    if (verifyError) throw mapAuthError(verifyError);

    const { error: updateError } = await supabase.auth.updateUser({ password: newPassword });
    if (updateError) {
      // Do not leave a half-finished recovery session behind (this device only).
      await supabase.auth.signOut({ scope: "local" });
      throw mapAuthError(updateError);
    }
  } finally {
    setHold(-1);
  }
}

/** Change the password of the signed-in user. */
export async function updatePassword(newPassword: string): Promise<void> {
  requireConfigured();
  requirePassword(newPassword);
  const { error } = await supabase.auth.updateUser({ password: newPassword });
  if (error) throw mapAuthError(error);
}

// ---------------------------------------------------------------------------
// Session + profile
// ---------------------------------------------------------------------------

export async function getProfile(user?: User | null): Promise<UserProfile | null> {
  requireConfigured();
  const authUser = user ?? (await supabase.auth.getSession()).data.session?.user ?? null;
  if (!authUser) return null;

  const { data, error } = await supabase
    .from("profiles")
    .select("id,email,display_name,role")
    .eq("id", authUser.id)
    .maybeSingle();
  if (error) throw authError("unknown", error.message);

  if (data) return data;
  // The sign-up trigger creates this row; until it exists, describe the user from Auth itself.
  const metaName = (authUser.user_metadata as { display_name?: string } | undefined)?.display_name;
  return {
    id: authUser.id,
    email: authUser.email ?? null,
    display_name: metaName || (authUser.email ? authUser.email.split("@")[0] : null),
    role: "member",
  };
}

export async function getCurrentAuthSession(): Promise<{ user: User | null; profile: UserProfile | null }> {
  if (!isSupabaseConfigured) return { user: null, profile: null };
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.user) return { user: null, profile: null };
  return { user: session.user, profile: await getProfile(session.user) };
}

export async function updateDisplayName(userId: string, displayName: string): Promise<void> {
  requireConfigured();
  const name = displayName.trim();
  if (!name) throw authError("invalid_input", "नाम खाली नहीं हो सकता। (Name cannot be empty.)");
  const { error } = await supabase.from("profiles").update({ display_name: name }).eq("id", userId);
  if (error) throw authError("unknown", error.message);
}

/**
 * Forget everything this browser holds about the user: in-memory data caches,
 * `swasthtrack_*` preferences, Cache Storage and the service worker's cache.
 * Called on every sign-out (including a sign-out from another tab).
 */
export async function clearLocalUserData(): Promise<void> {
  clearAllPatientCaches();
  setActivePatientId(null);
  if (typeof window === "undefined") return;

  try {
    for (const store of [localStorage, sessionStorage]) {
      const doomed: string[] = [];
      for (let i = 0; i < store.length; i++) {
        const key = store.key(i);
        if (key && key.startsWith("swasthtrack_")) doomed.push(key);
      }
      doomed.forEach((key) => store.removeItem(key));
    }
  } catch {
    // storage blocked: nothing was stored
  }

  try {
    if ("caches" in window) {
      const names = await caches.keys();
      await Promise.all(names.map((name) => caches.delete(name)));
    }
  } catch {
    // Cache Storage unavailable
  }

  try {
    navigator.serviceWorker?.controller?.postMessage({ type: "CLEAR_CACHES" });
  } catch {
    // no service worker
  }
}

export async function signOut(): Promise<void> {
  try {
    // `local`: sign out THIS device. The default (`global`) revokes every session
    // of the account, so a caregiver leaving the laptop would log the parent out
    // of their own phone.
    if (isSupabaseConfigured) await supabase.auth.signOut({ scope: "local" });
  } finally {
    await clearLocalUserData();
  }
}

// ---------------------------------------------------------------------------
// Patients, invites and caregivers (RLS + RPCs)
// ---------------------------------------------------------------------------

function friendlyRpcError(error: { message: string; code?: string }): Error {
  const text = error.message;
  if (error.code === "PGRST202" || /could not find the function/i.test(text)) {
    return new Error(
      "डेटाबेस अपडेट अधूरा है। Supabase में नया migration चलाएं (see docs/auth-setup.md). (Database migration not applied yet.)",
    );
  }
  if (/invalid or already used invite code/i.test(text)) {
    return new Error("यह कोड गलत है या पहले इस्तेमाल हो चुका है। (Invalid or already used invite code.)");
  }
  if (/invite code has expired/i.test(text)) {
    return new Error("यह कोड समाप्त हो चुका है। मरीज़ के मालिक से नया कोड मांगें। (This invite code has expired. Ask for a new one.)");
  }
  if (/too many attempts/i.test(text) || error.code === "54000") {
    return new Error("बहुत ज़्यादा कोशिशें। 15 मिनट बाद फिर कोशिश करें। (Too many attempts; try again in 15 minutes.)");
  }
  if (/only the patient owner/i.test(text) || error.code === "42501") {
    return new Error("यह काम सिर्फ़ मरीज़ का मालिक (owner) कर सकता है। (Only the patient owner can do this.)");
  }
  if (/cannot change your own membership/i.test(text)) {
    return new Error("आप अपना खुद का एक्सेस नहीं बदल सकते। (You cannot change your own access.)");
  }
  if (/not authenticated/i.test(text) || error.code === "28000") return authError("not_signed_in");
  if (/patient name is required/i.test(text)) return new Error("मरीज़ का नाम ज़रूरी है। (Patient name is required.)");
  if (/failed to fetch|networkerror|load failed/i.test(text)) return authError("network");
  console.error("Supabase RPC error:", error);
  return new Error(text || MESSAGES.unknown);
}

async function currentUserId(): Promise<string> {
  requireConfigured();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.user) throw authError("not_signed_in");
  return session.user.id;
}

/**
 * Every patient the user is an active member of (Postgres RLS decides; this just
 * reads the memberships), oldest membership first, each with the user's role.
 */
export async function getAuthorizedPatients(): Promise<AuthorizedPatient[]> {
  if (!isSupabaseConfigured) return [];
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.user) return [];

  const { data, error } = await supabase
    .from("patient_members")
    .select("role, created_at, patients(*)")
    .eq("user_id", session.user.id)
    .eq("status", "active")
    .order("created_at", { ascending: true });
  if (error) throw friendlyRpcError(error);

  const out: AuthorizedPatient[] = [];
  for (const row of data ?? []) {
    const patient = row.patients as PatientProfile | null;
    if (patient) out.push({ ...patient, member_role: row.role });
  }
  return out;
}

export interface NewPatientInput {
  name: string;
  age?: number | null;
  gender?: string | null;
  height_cm?: number | null;
  current_weight_kg?: number | null;
  target_weight_kg?: number | null;
  daily_calorie_target?: number | null;
}

/** Create a patient; the database makes the caller its owner in the same transaction. */
export async function createPatientForCurrentUser(input: NewPatientInput): Promise<PatientProfile> {
  await currentUserId();
  const name = input.name.trim();
  if (!name) throw new Error("मरीज़ का नाम ज़रूरी है। (Patient name is required.)");

  // Only send what was actually entered; the database applies its own defaults for the rest.
  const { data, error } = await supabase.rpc("create_patient", {
    p_name: name,
    ...(input.age != null ? { p_age: input.age } : {}),
    ...(input.gender ? { p_gender: input.gender } : {}),
    ...(input.height_cm != null ? { p_height_cm: input.height_cm } : {}),
    ...(input.current_weight_kg != null ? { p_current_weight_kg: input.current_weight_kg } : {}),
    ...(input.target_weight_kg != null ? { p_target_weight_kg: input.target_weight_kg } : {}),
    ...(input.daily_calorie_target != null ? { p_daily_calorie_target: input.daily_calorie_target } : {}),
  });
  if (error) throw friendlyRpcError(error);
  invalidatePatientCache(data.id);
  return data;
}

/** Owner only. Creates a fresh 15-minute code (any earlier pending code is cancelled). */
export async function generateCaregiverInviteCode(
  patientId: string,
  role: "editor" | "viewer" = "viewer",
): Promise<CaregiverInvitation> {
  await currentUserId();
  const { data, error } = await supabase.rpc("create_caregiver_invite", { p_patient: patientId, p_role: role });
  if (error) throw friendlyRpcError(error);
  return {
    id: data.id,
    patient_id: data.patient_id,
    invite_code: data.code,
    role: data.role,
    status: data.status,
    expires_at: data.expires_at,
    created_at: data.created_at,
  };
}

/** Redeem an 8-character code. Resolves with the id of the patient just joined. */
export async function acceptCaregiverInviteCode(
  inviteCode: string,
): Promise<{ success: true; patientId: string; message: string }> {
  await currentUserId();
  const code = inviteCode.replace(/[\s-]+/g, "").toUpperCase();
  if (!/^[A-HJ-NP-Z2-9]{8}$/.test(code)) {
    throw new Error("कृपया पूरा 8 अक्षरों का कोड दर्ज करें। (Enter the full 8-character code.)");
  }
  const { data, error } = await supabase.rpc("accept_caregiver_invite", { p_code: code });
  if (error) throw friendlyRpcError(error);
  invalidatePatientCache(data);
  return {
    success: true,
    patientId: data,
    message: "मरीज़ का एक्सेस मिल गया है! (You now have access to this patient.)",
  };
}

/** Owner only: the patient's whole roster (active and revoked), oldest first. */
export async function getAuthorizedCaregivers(patientId: string): Promise<AuthorizedCaregiver[]> {
  await currentUserId();
  const { data, error } = await supabase.rpc("list_patient_members", { p_patient: patientId });
  if (error) throw friendlyRpcError(error);
  return (data ?? []).map((m) => ({
    member_id: m.member_id,
    user_id: m.user_id,
    email: m.email,
    display_name: m.display_name,
    role: m.role,
    status: m.status,
    added_at: m.created_at,
  }));
}

/** Owner only: remove someone's access immediately. */
export async function revokeCaregiverAccess(memberId: string): Promise<void> {
  await currentUserId();
  const { error } = await supabase.rpc("set_patient_member", { p_member: memberId, p_status: "revoked" });
  if (error) throw friendlyRpcError(error);
}

/** Owner only: change a member between viewer and editor. */
export async function setCaregiverRole(memberId: string, role: "editor" | "viewer"): Promise<void> {
  await currentUserId();
  const { error } = await supabase.rpc("set_patient_member", { p_member: memberId, p_role: role });
  if (error) throw friendlyRpcError(error);
}
