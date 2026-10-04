import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";
import type { Database } from "./database.types";

/**
 * Server-only Supabase helpers for Route Handlers.
 *
 * Auth model: the browser keeps the Supabase session (supabase-js, localStorage)
 * and sends `Authorization: Bearer <access_token>` to our API routes (see
 * `authFetch` in ./auth-fetch.ts). The route verifies the token with Supabase
 * and then builds a client that carries the SAME token, so every query runs as
 * the signed-in user and Row Level Security — not application code — decides
 * which patients' rows are visible. There is deliberately no service-role key
 * anywhere in the request path.
 */

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = "HttpError";
  }
}

function env() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) {
    throw new HttpError(503, "Supabase is not configured on the server");
  }
  return { url, key };
}

/** A Supabase client that acts as the user who owns `accessToken`. */
export function createUserClient(accessToken: string): SupabaseClient<Database> {
  const { url, key } = env();
  return createClient<Database>(url, key, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

export interface AuthedRequest {
  user: User;
  token: string;
  supabase: SupabaseClient<Database>;
}

/** Verify the bearer token and return a user-scoped client. Throws HttpError(401). */
export async function requireUser(request: Request): Promise<AuthedRequest> {
  const header = request.headers.get("authorization") ?? "";
  const token = /^Bearer\s+(.+)$/i.exec(header)?.[1]?.trim();
  if (!token) throw new HttpError(401, "Sign in required");

  const supabase = createUserClient(token);
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) throw new HttpError(401, "Session expired — please sign in again");
  return { user: data.user, token, supabase };
}

/**
 * Confirm the signed-in user is an active member of `patientId` (and, when
 * `write` is set, an owner/editor). RLS already hides other patients' rows;
 * this gives a clean 403 instead of an empty result.
 */
export async function requirePatientAccess(
  supabase: SupabaseClient<Database>,
  userId: string,
  patientId: string,
  write = false,
): Promise<{ role: "owner" | "editor" | "viewer" }> {
  if (!patientId || !/^[0-9a-f-]{36}$/i.test(patientId)) {
    throw new HttpError(400, "A valid patientId is required");
  }
  const { data, error } = await (supabase as SupabaseClient)
    .from("patient_members")
    .select("role,status")
    .eq("patient_id", patientId)
    .eq("user_id", userId)
    .eq("status", "active")
    .maybeSingle();
  if (error) throw new HttpError(500, "Could not verify patient access");
  if (!data) throw new HttpError(403, "You do not have access to this patient");
  const role = data.role as "owner" | "editor" | "viewer";
  if (write && role === "viewer") throw new HttpError(403, "View-only access");
  return { role };
}

/** Turn any thrown value into a JSON Response with a safe message. */
export function errorResponse(err: unknown): Response {
  if (err instanceof HttpError) {
    return Response.json({ error: err.message }, { status: err.status });
  }
  console.error("Unhandled API error:", err);
  return Response.json({ error: "Something went wrong on the server" }, { status: 500 });
}
