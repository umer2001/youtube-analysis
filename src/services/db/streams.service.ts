import { getSupabaseClient } from "../../db/supabase.js";
import { StreamInsert, StreamRow, StreamUpdate } from "../../types/database.js";

export async function upsertStreams(streams: StreamInsert[]): Promise<StreamRow[]> {
  if (streams.length === 0) return [];
  const supabase = getSupabaseClient();

  const { data, error } = await supabase
    .from("streams")
    .upsert(streams, { onConflict: "video_id", ignoreDuplicates: false })
    .select();

  if (error) {
    throw new Error(`Failed to upsert streams: ${error.message}`);
  }

  return data || [];
}

export async function getUnprocessedCompletedStreams(
  limit = 50
): Promise<StreamRow[]> {
  const supabase = getSupabaseClient();

  const { data, error } = await supabase
    .from("streams")
    .select("*")
    .eq("stream_status", "completed")
    .eq("processing_status", "unprocessed")
    .order("published_at", { ascending: false, nullsFirst: false })
    .limit(limit);

  if (error) {
    throw new Error(`Failed to query unprocessed streams: ${error.message}`);
  }

  return data || [];
}

export async function getStreamsByBatchId(batchId: string): Promise<StreamRow[]> {
  const supabase = getSupabaseClient();

  const { data, error } = await supabase
    .from("streams")
    .select("*")
    .eq("batch_id", batchId);

  if (error) {
    throw new Error(`Failed to query streams for batch ${batchId}: ${error.message}`);
  }

  return data || [];
}

export async function updateStreamByVideoId(
  videoId: string,
  updates: StreamUpdate
): Promise<StreamRow> {
  const supabase = getSupabaseClient();

  const { data, error } = await supabase
    .from("streams")
    .update(updates)
    .eq("video_id", videoId)
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to update stream ${videoId}: ${error.message}`);
  }

  return data;
}

export async function assignStreamsToBatch(
  videoIds: string[],
  batchId: string
): Promise<void> {
  if (videoIds.length === 0) return;
  const supabase = getSupabaseClient();

  const { error } = await supabase
    .from("streams")
    .update({
      batch_id: batchId,
      processing_status: "batch_submitted",
    })
    .in("video_id", videoIds);

  if (error) {
    throw new Error(`Failed to link streams to batch ${batchId}: ${error.message}`);
  }
}
