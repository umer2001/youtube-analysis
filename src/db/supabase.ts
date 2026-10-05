import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { Database } from "../types/database.js";

let supabaseClient: SupabaseClient<Database> | null = null;

/**
 * Returns the configured Supabase client using SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_ANON_KEY).
 */
export function getSupabaseClient(): SupabaseClient<Database> {
  if (supabaseClient) {
    return supabaseClient;
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

  if (!supabaseUrl) {
    throw new Error(
      "SUPABASE_URL is not set in environment. Please update your .env file."
    );
  }

  if (!supabaseKey) {
    throw new Error(
      "Neither SUPABASE_SERVICE_ROLE_KEY nor SUPABASE_ANON_KEY is set in environment. Please set your Supabase API key in .env."
    );
  }

  supabaseClient = createClient<Database>(supabaseUrl, supabaseKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  return supabaseClient;
}
