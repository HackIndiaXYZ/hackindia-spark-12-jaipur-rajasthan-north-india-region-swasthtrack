import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";

/**
 * Server only. The Supabase client the scheduled e-mail jobs run as.
 *
 * Cron has no signed-in user, and a service-role key is not allowed in this app
 * (docs/deployment.md). Instead the jobs sign in as an ordinary account — the
 * "notifier" — that the patient's owner has added as a viewer caregiver, so Row
 * Level Security still decides what it can read (only that patient, read-only).
 *
 * Returns null when NOTIFY_USER_EMAIL / NOTIFY_USER_PASSWORD are not set. The jobs
 * then fall back to the anonymous client, which only sees data while the database
 * still has the old open policies (i.e. before the RLS migration).
 */
export async function getNotifierClient(): Promise<SupabaseClient<Database> | null> {
  const email = process.env.NOTIFY_USER_EMAIL?.trim();
  const password = process.env.NOTIFY_USER_PASSWORD;
  if (!email || !password) return null;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) throw new Error("Supabase is not configured on the server");

  const client = createClient<Database>(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw new Error(`Notifier account could not sign in: ${error.message}`);
  return client;
}
