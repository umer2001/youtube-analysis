import type {
  BatchObject,
  BatchListItem,
  BatchObjectStatus,
} from "@openrouter/sdk/models";
import { TradeReport } from "./trade.js";
import { LiveSession } from "./stream.js";

export type BatchStatus = BatchObjectStatus;
export type OpenRouterBatch = BatchObject;

export interface BatchRequestItem {
  customId: string; // YouTube videoId
  body: {
    messages: Array<{
      role: "system" | "user" | "assistant";
      content: string;
    }>;
    response_format?: {
      type: "json_object";
    };
    [key: string]: any;
  };
}

export interface StreamBatchResult {
  videoId: string;
  url: string;
  title: string;
  channelTitle: string;
  status: "completed" | "failed" | "no_transcript";
  report?: TradeReport;
  rawOutput?: string;
  error?: string;
}

export interface BatchProcessingSummary {
  batchId: string;
  model: string;
  status: string;
  createdAt: string;
  finalizedAt?: string;
  totalStreams: number;
  completedStreams: number;
  failedStreams: number;
  cost?: number;
  results: StreamBatchResult[];
}

export interface PrepareBatchResult {
  requests: BatchRequestItem[];
  validStreams: LiveSession[];
  skippedStreams: Array<{
    stream: LiveSession;
    reason: string;
  }>;
}

export interface ListBatchesOutput {
  data: BatchListItem[];
  hasMore: boolean;
  firstId?: string | null;
  lastId?: string | null;
}
