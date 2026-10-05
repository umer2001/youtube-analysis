import { OpenRouter } from "@openrouter/sdk";
import type {
  BatchObject,
  BatchSubmitBody,
} from "@openrouter/sdk/models";
import { getFormattedTranscript } from "../youtube/transcript.js";
import { LiveSession } from "../../types/stream.js";
import {
  BatchRequestItem,
  ListBatchesOutput,
  OpenRouterBatch,
  PrepareBatchResult,
  StreamBatchResult,
} from "../../types/batch.js";
import { parseTradeReportJson } from "../../types/trade.js";

let cachedClient: OpenRouter | null = null;

/**
 * Retrieves and validates the OpenRouter API key.
 */
export function getOpenRouterApiKey(): string {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new Error(
      "OPENROUTER_API_KEY is not configured. Please set it in your .env file to use OpenRouter Batch processing."
    );
  }
  return apiKey;
}

/**
 * Returns an instantiated OpenRouter SDK client.
 */
export function getOpenRouterClient(): OpenRouter {
  const apiKey = getOpenRouterApiKey();
  if (!cachedClient) {
    cachedClient = new OpenRouter({ apiKey });
  }
  return cachedClient;
}

/**
 * Builds the structured trade extraction prompt matching project schema.
 */
export function buildTradeExtractionPrompt(formattedTranscript: string): {
  systemPrompt: string;
  userPrompt: string;
} {
  const systemPrompt = `You are an expert financial market analyst. Analyze the following trading livestream transcript and extract all trades newly entered or executed live during this session.

IMPORTANT RULES:
- ONLY include trades that were actively opened/executed live during this stream session.
- EXCLUDE any pre-existing positions, swing trades held from earlier sessions, or trades that the host/streamer claims were already open before this stream began.
- If no new trades were entered live during the stream, return an empty array: "trades": [].

You MUST output strictly a valid JSON object matching this schema:
{
  "trades": [
    {
      "symbol": "string (e.g. Gold / GC, BTC, NQ, EURUSD)",
      "side": "LONG" or "SHORT",
      "result": "TP", "SL", or "UNKNOWN",
      "important_timestamps": ["HH:MM:SS", ...],
      "entry_price": "optional string price",
      "exit_price": "optional string price",
      "notes": "optional brief notes/rationale"
    }
  ]
}
Only output pure JSON. Do not include markdown fences or explanation.`;

  const userPrompt = `Here is the formatted transcript with timestamps:

${formattedTranscript}`;

  return { systemPrompt, userPrompt };
}

/**
 * Fetches transcripts for a list of livestream sessions and prepares batch request items.
 */
export async function prepareTranscriptBatchRequests(
  streams: LiveSession[]
): Promise<PrepareBatchResult> {
  const requests: BatchRequestItem[] = [];
  const validStreams: LiveSession[] = [];
  const skippedStreams: Array<{ stream: LiveSession; reason: string }> = [];

  for (const stream of streams) {
    try {
      const { formattedText, totalChunks } = await getFormattedTranscript(stream.videoId);

      if (!formattedText || totalChunks === 0) {
        skippedStreams.push({ stream, reason: "Transcript is empty or unavailable." });
        continue;
      }

      const { systemPrompt, userPrompt } = buildTradeExtractionPrompt(formattedText);

      requests.push({
        customId: stream.videoId,
        body: {
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
          ],
          response_format: { type: "json_object" },
        },
      });

      validStreams.push(stream);
    } catch (err: any) {
      skippedStreams.push({
        stream,
        reason: err.message || "Failed to fetch transcript (captions might be disabled).",
      });
    }
  }

  return { requests, validStreams, skippedStreams };
}

export interface CreateBatchOptions {
  model?: string;
  providerOnly?: string[];
}

/**
 * Submits a new batch of requests using the official @openrouter/sdk.
 */
export async function createOpenRouterBatch(
  requests: BatchRequestItem[],
  options: CreateBatchOptions = {}
): Promise<OpenRouterBatch> {
  const client = getOpenRouterClient();

  if (requests.length === 0) {
    throw new Error("Cannot create batch: requests array is empty.");
  }

  // Default to a reliable batch-enabled model
  const model =
    options.model ||
    process.env.OPENROUTER_BATCH_MODEL ||
    "google/gemini-2.5-flash";

  const batchSubmitBody: BatchSubmitBody = {
    endpoint: "/v1/chat/completions",
    model,
    completionWindow: "24h",
    requests: requests as any,
  };

  if (options.providerOnly && options.providerOnly.length > 0) {
    batchSubmitBody.provider = { only: options.providerOnly };
  }

  return await client.batch.createBatches({ batchSubmitBody });
}

/**
 * Retrieves the current status and results of a batch using @openrouter/sdk.
 */
export async function getOpenRouterBatch(batchId: string): Promise<OpenRouterBatch> {
  const client = getOpenRouterClient();
  return await client.batch.getBatches({ id: batchId });
}

/**
 * Lists batches in the authenticating workspace using @openrouter/sdk.
 */
export async function listOpenRouterBatches(options: {
  limit?: number;
  status?: string;
  after?: string;
} = {}): Promise<ListBatchesOutput> {
  const client = getOpenRouterClient();
  const pages = await client.batch.list({
    limit: options.limit,
    status: options.status ? [options.status as any] : undefined,
    after: options.after,
  });

  for await (const page of pages) {
    return {
      data: page.result.data,
      hasMore: page.result.hasMore,
      firstId: page.result.firstId,
      lastId: page.result.lastId,
    };
  }

  return { data: [], hasMore: false };
}

/**
 * Deletes a completed/terminal batch to purge stored artifacts using @openrouter/sdk.
 */
export async function deleteOpenRouterBatch(batchId: string): Promise<any> {
  const client = getOpenRouterClient();
  return await client.batch.delete({ id: batchId });
}

/**
 * Parses completed batch results into structured StreamBatchResult objects.
 */
export function parseBatchResults(
  batch: OpenRouterBatch,
  streamsMap: Map<string, LiveSession> = new Map()
): StreamBatchResult[] {
  if (!batch.results || batch.results.length === 0) {
    return [];
  }

  return batch.results.map((item) => {
    const videoId = item.customId;
    const session = streamsMap.get(videoId);
    const title = session?.title || `Stream ${videoId}`;
    const url = session?.url || `https://www.youtube.com/watch?v=${videoId}`;
    const channelTitle = session?.channelTitle || "Unknown Channel";

    if (item.error) {
      return {
        videoId,
        url,
        title,
        channelTitle,
        status: "failed",
        error: typeof item.error === "string" ? item.error : (item.error as any).message || JSON.stringify(item.error),
      };
    }

    const body = item.response?.body as any;
    const choice = body?.choices?.[0];
    const rawContent = choice?.message?.content;

    if (!rawContent) {
      return {
        videoId,
        url,
        title,
        channelTitle,
        status: "failed",
        error: "Batch result response body had no content choices.",
      };
    }

    try {
      const report = parseTradeReportJson(rawContent);
      return {
        videoId,
        url,
        title,
        channelTitle,
        status: "completed",
        report,
        rawOutput: rawContent,
      };
    } catch (parseErr: any) {
      return {
        videoId,
        url,
        title,
        channelTitle,
        status: "failed",
        rawOutput: rawContent,
        error: `Failed to parse trade JSON schema: ${parseErr.message || parseErr}`,
      };
    }
  });
}
