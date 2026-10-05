import { getSupabaseClient } from "../../db/supabase.js";
import { ChannelInsert, ChannelRow, ChannelUpdate } from "../../types/database.js";

export async function addChannel(data: ChannelInsert): Promise<ChannelRow> {
  const supabase = getSupabaseClient();

  const { data: channel, error } = await supabase
    .from("channels")
    .upsert(
      {
        channel_url: data.channel_url,
        title: data.title ?? null,
        description: data.description ?? null,
        thumbnail_url: data.thumbnail_url ?? null,
        channel_id: data.channel_id ?? null,
        is_active: data.is_active ?? true,
      },
      { onConflict: "channel_url" }
    )
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to add/upsert channel: ${error.message}`);
  }

  return channel;
}

export async function listChannels(activeOnly = true): Promise<ChannelRow[]> {
  const supabase = getSupabaseClient();
  let query = supabase.from("channels").select("*").order("created_at", { ascending: false });

  if (activeOnly) {
    query = query.eq("is_active", true);
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(`Failed to list channels: ${error.message}`);
  }

  return data || [];
}

export async function getChannelByUrl(channelUrl: string): Promise<ChannelRow | null> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("channels")
    .select("*")
    .eq("channel_url", channelUrl)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to get channel: ${error.message}`);
  }

  return data;
}

export async function updateChannel(
  id: string,
  updates: ChannelUpdate
): Promise<ChannelRow> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("channels")
    .update(updates)
    .eq("id", id)
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to update channel ${id}: ${error.message}`);
  }

  return data;
}

export async function updateChannelLastChecked(id: string): Promise<void> {
  const supabase = getSupabaseClient();
  const { error } = await supabase
    .from("channels")
    .update({ last_checked_at: new Date().toISOString() })
    .eq("id", id);

  if (error) {
    throw new Error(`Failed to update last_checked_at for channel ${id}: ${error.message}`);
  }
}
