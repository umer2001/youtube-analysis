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

export async function getStreamsForBatchSubmission(
  limit = 15
): Promise<StreamRow[]> {
  const supabase = getSupabaseClient();

  // 1. Prioritize fresh 'unprocessed' completed streams first
  const { data: unprocessed, error: unprocErr } = await supabase
    .from("streams")
    .select("*")
    .eq("stream_status", "completed")
    .eq("processing_status", "unprocessed")
    .order("published_at", { ascending: false, nullsFirst: false })
    .limit(limit);

  if (unprocErr) {
    throw new Error(`Failed to query unprocessed streams: ${unprocErr.message}`);
  }

  let candidates: StreamRow[] = unprocessed || [];

  // 2. If slots remain, fill with 'transcript_pending' streams (least recently checked first)
  if (candidates.length < limit) {
    const remainingLimit = limit - candidates.length;
    const { data: pending, error: pendErr } = await supabase
      .from("streams")
      .select("*")
      .eq("stream_status", "completed")
      .eq("processing_status", "transcript_pending")
      .order("updated_at", { ascending: true })
      .limit(remainingLimit);

    if (pendErr) {
      throw new Error(`Failed to query pending transcript streams: ${pendErr.message}`);
    }

    if (pending && pending.length > 0) {
      candidates = [...candidates, ...pending];
    }
  }

  return candidates;
}

export async function getUnprocessedCompletedStreams(
  limit = 50
): Promise<StreamRow[]> {
  return getStreamsForBatchSubmission(limit);
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
