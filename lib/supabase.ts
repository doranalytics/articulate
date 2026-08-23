// Browser-side Supabase client. Auth is magic-link only; the sole table is
// user_state (one jsonb row per user, RLS-scoped to auth.uid()).
//
// The URL and anon key are hardcoded deliberately: they are public client
// values (RLS is the security boundary), and this team's Vercel env vars
// default to "sensitive", which are excluded from builds — env-only wiring
// left NEXT_PUBLIC_* out of the client bundle and silently disabled auth.

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export const SUPABASE_URL = "https://xdrhjlzvyspszfrbmcmy.supabase.co";
export const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhkcmhqbHp2eXNwc3pmcmJtY215Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODc1MDk2MDksImV4cCI6MjEwMzA4NTYwOX0.UYtwSypuX_namsquRc5TtduJ4HuyQF112G7SBIAwD3w";

let client: SupabaseClient | null = null;

export function supabase(): SupabaseClient {
  if (!client) client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  return client;
}
