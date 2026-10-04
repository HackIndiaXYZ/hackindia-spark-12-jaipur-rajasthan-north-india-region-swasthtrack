import { createClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

export const isSupabaseConfigured = Boolean(
  supabaseUrl &&
    supabaseAnonKey &&
    supabaseUrl.startsWith("http") &&
    supabaseAnonKey.length > 5,
);

// When the env vars are missing the app shows a "Setup required" screen and
// never calls this client; the placeholders only keep module import from throwing.
export const supabase = createClient<Database>(
  supabaseUrl || "https://placeholder-project.supabase.co",
  supabaseAnonKey || "placeholder-anon-key",
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      // Sign-in is by emailed code, never by a magic link, so there is no token to read from the URL.
      detectSessionInUrl: false,
    },
  },
);
