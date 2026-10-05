import { getSupabaseClient } from "../../db/supabase.js";
import { TradeInsert, TradeRow } from "../../types/database.js";
import { TradeItem } from "../../types/trade.js";

export async function saveExtractedTrades(
  streamId: string,
  channelId: string,
  trades: TradeItem[]
): Promise<TradeRow[]> {
  if (trades.length === 0) return [];
  const supabase = getSupabaseClient();

  const tradeInserts: TradeInsert[] = trades.map((t) => ({
    stream_id: streamId,
    channel_id: channelId,
    symbol: t.symbol,
    side: t.side,
    result: t.result,
    entry_price: t.entry_price ?? null,
    exit_price: t.exit_price ?? null,
    important_timestamps: t.important_timestamps ?? [],
    notes: t.notes ?? null,
    raw_data: t,
  }));

  const { data, error } = await supabase
    .from("trades")
    .insert(tradeInserts)
    .select();

  if (error) {
    throw new Error(`Failed to save extracted trades for stream ${streamId}: ${error.message}`);
  }

  return data || [];
}

export async function getTradesForStream(streamId: string): Promise<TradeRow[]> {
  const supabase = getSupabaseClient();

  const { data, error } = await supabase
    .from("trades")
    .select("*")
    .eq("stream_id", streamId)
    .order("created_at", { ascending: true });

  if (error) {
    throw new Error(`Failed to query trades for stream ${streamId}: ${error.message}`);
  }

  return data || [];
}

export async function getTradesForChannel(channelId: string): Promise<TradeRow[]> {
  const supabase = getSupabaseClient();

  const { data, error } = await supabase
    .from("trades")
    .select("*")
    .eq("channel_id", channelId)
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(`Failed to query trades for channel ${channelId}: ${error.message}`);
  }

  return data || [];
}
