export interface Channel {
  id: string;
  channel_id: string | null;
  channel_url: string;
  title: string | null;
  description: string | null;
  thumbnail_url: string | null;
  is_active: boolean;
  last_checked_at: string | null;
  created_at: string;
  updated_at: string;
}

export type StreamStatus = "completed" | "live" | "upcoming";
export type ProcessingStatus =
  | "unprocessed"
  | "batch_submitted"
  | "completed"
  | "failed"
  | "no_transcript";

export interface Stream {
  id: string;
  channel_id: string;
  video_id: string;
  title: string;
  description: string | null;
  published_at: string | null;
  stream_url: string;
  stream_status: StreamStatus | string;
  processing_status: ProcessingStatus | string;
  batch_id: string | null;
  error_message: string | null;
  created_at: string;
  updated_at: string;
  channels?: Channel | null;
  trades?: { count: number }[] | null;
}

export type TradeSide = "LONG" | "SHORT";
export type TradeResult = "TP" | "SL" | "UNKNOWN";

export interface Trade {
  id: string;
  stream_id: string;
  channel_id: string;
  symbol: string;
  side: TradeSide;
  result: TradeResult;
  entry_price: string | null;
  exit_price: string | null;
  important_timestamps: string[];
  notes: string | null;
  raw_data?: Record<string, unknown> | null;
  created_at: string;
}
