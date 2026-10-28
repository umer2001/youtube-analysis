import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { ServerConfig } from "./config.js";
import { ChannelRecord } from "./types.js";

let supabaseClient: SupabaseClient | null = null;

export function initSupabase(config: ServerConfig): SupabaseClient {
  if (!supabaseClient) {
    // Both ANON key and SERVICE_ROLE key work because this subproject is strictly READ-ONLY.
    supabaseClient = createClient(config.supabaseUrl, config.supabaseKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return supabaseClient;
}

export function getDb(): SupabaseClient {
  if (!supabaseClient) {
    throw new Error("Supabase client has not been initialized. Call initSupabase() first.");
  }
  return supabaseClient;
}

/**
 * Strictly READ-ONLY: Lists all active channels configured in Supabase.
 * Performs zero INSERT, UPDATE, or DELETE operations.
 */
export async function getActiveChannels(): Promise<ChannelRecord[]> {
  const supabase = getDb();
  const { data, error } = await supabase
    .from("channels")
    .select("id, channel_id, channel_url, title, description, thumbnail_url, is_active, last_checked_at")
    .eq("is_active", true)
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(`Failed to query active channels: ${error.message}`);
  }

  return (data || []) as ChannelRecord[];
}
