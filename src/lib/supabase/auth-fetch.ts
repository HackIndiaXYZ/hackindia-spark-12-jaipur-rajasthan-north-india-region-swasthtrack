import { supabase } from "./client";

/**
 * `fetch` for our own API routes: attaches the current Supabase access token so
 * the route can verify who is asking (see ./server.ts `requireUser`).
 */
export async function authFetch(input: string, init: RequestInit = {}): Promise<Response> {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  const headers = new Headers(init.headers);
  if (session?.access_token) {
    headers.set("Authorization", `Bearer ${session.access_token}`);
  }
  if (init.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  return fetch(input, { ...init, headers });
}
