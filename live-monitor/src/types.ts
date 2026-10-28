import { z } from "zod";

export const LiveTradeActionSchema = z.enum([
  "NEW_ENTRY",
  "PENDING_ORDER",
  "SL_TP_UPDATE",
  "EXIT",
  "NONE",
]);

export const LiveTradeConfidenceSchema = z.enum(["HIGH", "MEDIUM", "LOW"]);

export const LiveTradeSignalSchema = z.object({
  symbol: z.string().describe("Asset, ticker, or currency pair (e.g., XAUUSD, BTC, NQ, ES, EURUSD)"),
  side: z.enum(["LONG", "SHORT"]).nullable().describe("Trade direction if known"),
  action: LiveTradeActionSchema.describe("Nature of trade event"),
  entry_price: z.string().optional().describe("Entry price level or limit price"),
  stop_loss: z.string().optional().describe("Stop loss price level or points"),
  take_profit: z.string().optional().describe("Take profit target price or points"),
  risk_reward: z.string().optional().describe("Risk to reward ratio (e.g., 1:2.5)"),
  rationale: z.string().optional().describe("Strategy context, indicator, or rationale mentioned"),
  confidence: LiveTradeConfidenceSchema.describe("Confidence that this was a real active trade execution"),
  verbatim_quote: z.string().optional().describe("Direct quote spoken by the streamer"),
  stream_time: z.string().optional().describe("Estimated timestamp in the stream (e.g. 01:23:45)"),
  detected_at: z.string().optional().describe("ISO timestamp when detected"),
});

export type LiveTradeAction = z.infer<typeof LiveTradeActionSchema>;
export type LiveTradeConfidence = z.infer<typeof LiveTradeConfidenceSchema>;
export type LiveTradeSignal = z.infer<typeof LiveTradeSignalSchema>;

export interface ActiveTradeState {
  symbol: string;
  side: "LONG" | "SHORT" | null;
  entry_price?: string;
  stop_loss?: string;
  take_profit?: string;
  last_action: LiveTradeAction;
  first_detected_at: number;
  last_updated_at: number;
  alert_count: number;
}

export interface DeduplicationDecision {
  shouldAlert: boolean;
  alertType: "NEW" | "UPDATE" | "EXIT" | "SUPPRESSED";
  reason?: string;
  state: ActiveTradeState;
}

export type WorkerStatus =
  | "idle"
  | "resolving"
  | "connecting"
  | "streaming"
  | "ended"
  | "error";

export interface WorkerMetrics {
  status: WorkerStatus;
  videoId?: string;
  channelId?: string;
  channelTitle: string;
  streamUrl: string;
  uptimeSeconds: number;
  totalBytesIngested: number;
  megabytesIngested: number;
  signalsDetected: number;
  lastSignalAt: string | null;
  errorMessage: string | null;
}

export interface ChannelRecord {
  id: string;
  channel_id: string | null;
  channel_url: string;
  title: string | null;
  description: string | null;
  thumbnail_url: string | null;
  is_active: boolean;
  last_checked_at: string | null;
}

export interface LiveStreamCandidate {
  videoId: string;
  channelDbId: string;
  channelTitle: string;
  channelUrl: string;
  streamUrl: string;
  title: string;
  status: "live" | "upcoming" | "completed";
}
