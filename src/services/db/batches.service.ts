import { getSupabaseClient } from "../../db/supabase.js";
import { BatchInsert, BatchRow, BatchUpdate } from "../../types/database.js";
import { OpenRouterBatch } from "../../types/batch.js";

export async function recordBatchSubmission(
  batch: OpenRouterBatch
): Promise<BatchRow> {
  const supabase = getSupabaseClient();

  const insertData: BatchInsert = {
    id: batch.id,
    model: batch.model,
    status: batch.status,
    total_requests: batch.requestCounts.total,
    completed_requests: batch.requestCounts.completed,
    failed_requests: batch.requestCounts.failed,
    cost: batch.usage?.cost ?? null,
    submitted_at: new Date(batch.createdAt * 1000).toISOString(),
    finalized_at: batch.finalizedAt
      ? new Date(batch.finalizedAt * 1000).toISOString()
      : null,
    error: batch.error ?? null,
    metadata: {
      endpoint: batch.endpoint,
      completionWindow: batch.completionWindow,
    },
  };

  const { data, error } = await supabase
    .from("batches")
    .upsert(insertData, { onConflict: "id" })
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to record batch ${batch.id}: ${error.message}`);
  }

  return data;
}

export async function getActiveBatches(): Promise<BatchRow[]> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("batches")
    .select("*")
    .in("status", ["validating", "in_progress", "finalizing"])
    .order("created_at", { ascending: true });

  if (error) {
    throw new Error(`Failed to query active batches: ${error.message}`);
  }

  return data || [];
}

export async function updateBatchRecord(
  batchId: string,
  updates: BatchUpdate
): Promise<BatchRow> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("batches")
    .update(updates)
    .eq("id", batchId)
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to update batch ${batchId}: ${error.message}`);
  }

  return data;
}

export async function getBatchRecord(batchId: string): Promise<BatchRow | null> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("batches")
    .select("*")
    .eq("id", batchId)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to get batch ${batchId}: ${error.message}`);
  }

  return data;
}
