import { TradeItem } from "./trade.js";

export type StreamStatus = "completed" | "live" | "upcoming";
export type StreamProcessingStatus =
  | "unprocessed"
  | "transcript_pending"
  | "batch_submitted"
  | "completed"
  | "failed"
  | "no_transcript";

export type ChannelRow = {
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
};

export type ChannelInsert = {
  id?: string;
  channel_id?: string | null;
  channel_url: string;
  title?: string | null;
  description?: string | null;
  thumbnail_url?: string | null;
  is_active?: boolean;
  last_checked_at?: string | null;
  created_at?: string;
  updated_at?: string;
};

export type ChannelUpdate = {
  channel_id?: string | null;
  channel_url?: string;
  title?: string | null;
  description?: string | null;
  thumbnail_url?: string | null;
  is_active?: boolean;
  last_checked_at?: string | null;
  updated_at?: string;
};

export type BatchRow = {
  id: string; // OpenRouter batch ID (e.g. batch-179...)
  model: string;
  status: string;
  total_requests: number;
  completed_requests: number;
  failed_requests: number;
  cost: number | null;
  submitted_at: string;
  finalized_at: string | null;
  error: any | null;
  metadata: Record<string, any>;
  created_at: string;
  updated_at: string;
};

export type BatchInsert = {
  id: string;
  model: string;
  status?: string;
  total_requests?: number;
  completed_requests?: number;
  failed_requests?: number;
  cost?: number | null;
  submitted_at?: string;
  finalized_at?: string | null;
  error?: any | null;
  metadata?: Record<string, any>;
  created_at?: string;
  updated_at?: string;
};

export type BatchUpdate = {
  model?: string;
  status?: string;
  total_requests?: number;
  completed_requests?: number;
  failed_requests?: number;
  cost?: number | null;
  finalized_at?: string | null;
  error?: any | null;
  metadata?: Record<string, any>;
  updated_at?: string;
};

export type StreamRow = {
  id: string;
  channel_id: string;
  video_id: string;
  title: string;
  description: string | null;
  published_at: string | null;
  stream_url: string;
  stream_status: StreamStatus;
  processing_status: StreamProcessingStatus;
  batch_id: string | null;
  error_message: string | null;
  created_at: string;
  updated_at: string;
};

export type StreamInsert = {
  id?: string;
  channel_id: string;
  video_id: string;
  title: string;
  description?: string | null;
  published_at?: string | null;
  stream_url: string;
  stream_status?: StreamStatus;
  processing_status?: StreamProcessingStatus;
  batch_id?: string | null;
  error_message?: string | null;
  created_at?: string;
  updated_at?: string;
};

export type StreamUpdate = {
  channel_id?: string;
  video_id?: string;
  title?: string;
  description?: string | null;
  published_at?: string | null;
  stream_url?: string;
  stream_status?: StreamStatus;
  processing_status?: StreamProcessingStatus;
  batch_id?: string | null;
  error_message?: string | null;
  updated_at?: string;
};

export type TradeRow = {
  id: string;
  stream_id: string;
  channel_id: string;
  symbol: string;
  side: "LONG" | "SHORT";
  result: "TP" | "SL" | "UNKNOWN";
  entry_price: string | null;
  exit_price: string | null;
  important_timestamps: string[];
  notes: string | null;
  raw_data: TradeItem | null;
  created_at: string;
};

export type TradeInsert = {
  id?: string;
  stream_id: string;
  channel_id: string;
  symbol: string;
  side: "LONG" | "SHORT";
  result: "TP" | "SL" | "UNKNOWN";
  entry_price?: string | null;
  exit_price?: string | null;
  important_timestamps?: string[];
  notes?: string | null;
  raw_data?: TradeItem | null;
  created_at?: string;
};

export type Database = {
  __InternalSupabase: {
    PostgrestVersion: "14.18";
  };
  public: {
    Tables: {
      channels: {
        Row: ChannelRow;
        Insert: ChannelInsert;
        Update: ChannelUpdate;
        Relationships: [];
      };
      batches: {
        Row: BatchRow;
        Insert: BatchInsert;
        Update: BatchUpdate;
        Relationships: [];
      };
      streams: {
        Row: StreamRow;
        Insert: StreamInsert;
        Update: StreamUpdate;
        Relationships: [];
      };
      trades: {
        Row: TradeRow;
        Insert: TradeInsert;
        Update: Partial<TradeInsert>;
        Relationships: [];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      [_ in never]: never;
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};
