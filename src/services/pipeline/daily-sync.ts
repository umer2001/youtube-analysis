import {
  listChannels,
  updateChannelLastChecked,
} from "../db/channels.service.js";
import {
  upsertStreams,
  getUnprocessedCompletedStreams,
  getStreamsByBatchId,
  updateStreamByVideoId,
  assignStreamsToBatch,
} from "../db/streams.service.js";
import {
  getActiveBatches,
  recordBatchSubmission,
  updateBatchRecord,
} from "../db/batches.service.js";
import { saveExtractedTrades } from "../db/trades.service.js";
import {
  listChannelLiveStreams,
  scrapeChannelStreamsTab,
  getValidYouTubeApiKey,
} from "../youtube/streams.js";
import {
  createOpenRouterBatch,
  getOpenRouterBatch,
  parseBatchResults,
  prepareTranscriptBatchRequests,
} from "../analyzer/batch.js";
import { StreamInsert } from "../../types/database.js";
import { LiveSession } from "../../types/stream.js";

export interface SyncChannelsResult {
  channelsCount: number;
  newStreamsFound: number;
  errors: Array<{ channelUrl: string; error: string }>;
}

export interface SubmitBatchResult {
  batchId?: string;
  submittedCount: number;
  skippedCount: number;
  status: "submitted" | "no_streams" | "no_transcripts" | "failed";
  error?: string;
}

export interface HarvestBatchesResult {
  checkedBatchesCount: number;
  completedBatchesCount: number;
  totalTradesExtracted: number;
  processedStreamsCount: number;
}

export interface DailyPipelineReport {
  timestamp: string;
  sync: SyncChannelsResult;
  submit: SubmitBatchResult;
  harvest: HarvestBatchesResult;
}

/**
 * Syncs all active channels, querying recent completed livestreams and upserting into the DB.
 */
export async function syncTrackedChannelsStreams(options: {
  maxStreamsPerChannel?: number;
} = {}): Promise<SyncChannelsResult> {
  const maxStreams = options.maxStreamsPerChannel || 10;
  const channels = await listChannels(true);

  let newStreamsFound = 0;
  const errors: Array<{ channelUrl: string; error: string }> = [];
  const hasApiKey = Boolean(getValidYouTubeApiKey());

  for (const channel of channels) {
    try {
      let fetchResult;
      try {
        if (hasApiKey) {
          fetchResult = await listChannelLiveStreams(channel.channel_url, {
            eventType: "completed",
            maxResults: maxStreams,
          });
        } else {
          fetchResult = await scrapeChannelStreamsTab(channel.channel_url, {
            maxResults: maxStreams,
          });
        }
      } catch (primaryErr: any) {
        // Fallback to scraping
        fetchResult = await scrapeChannelStreamsTab(channel.channel_url, {
          maxResults: maxStreams,
        });
      }

      const completedSessions = fetchResult.sessions.filter((s) => s.status === "completed");

      if (completedSessions.length > 0) {
        const streamInserts: StreamInsert[] = completedSessions.map((s) => ({
          channel_id: channel.id,
          video_id: s.videoId,
          title: s.title,
          description: s.description || null,
          published_at: s.scheduledStartTime || null,
          stream_url: s.url,
          stream_status: "completed",
          processing_status: "unprocessed",
          batch_id: null,
          error_message: null,
        }));

        const upserted = await upsertStreams(streamInserts);
        newStreamsFound += upserted.length;
      }

      await updateChannelLastChecked(channel.id);
    } catch (err: any) {
      errors.push({
        channelUrl: channel.channel_url,
        error: err.message || String(err),
      });
    }
  }

  return {
    channelsCount: channels.length,
    newStreamsFound,
    errors,
  };
}

/**
 * Ingests transcripts for unprocessed streams and submits a new OpenRouter Batch job.
 */
export async function submitUnprocessedStreamsBatch(options: {
  maxBatchSize?: number;
  model?: string;
} = {}): Promise<SubmitBatchResult> {
  const maxBatchSize = options.maxBatchSize || 15;
  const unprocessedRows = await getUnprocessedCompletedStreams(maxBatchSize);

  if (unprocessedRows.length === 0) {
    return {
      submittedCount: 0,
      skippedCount: 0,
      status: "no_streams",
    };
  }

  // Convert to LiveSession domain models for transcript fetching
  const candidateSessions: LiveSession[] = unprocessedRows.map((row) => ({
    videoId: row.video_id,
    title: row.title,
    description: row.description || "",
    channelId: row.channel_id,
    channelTitle: "",
    status: "completed",
    url: row.stream_url,
  }));

  const { requests, validStreams, skippedStreams } =
    await prepareTranscriptBatchRequests(candidateSessions);

  // Mark skipped streams as no_transcript
  for (const skipped of skippedStreams) {
    await updateStreamByVideoId(skipped.stream.videoId, {
      processing_status: "no_transcript",
      error_message: skipped.reason,
    });
  }

  if (requests.length === 0) {
    return {
      submittedCount: 0,
      skippedCount: skippedStreams.length,
      status: "no_transcripts",
    };
  }

  try {
    const model =
      options.model ||
      process.env.OPENROUTER_BATCH_MODEL ||
      "google/gemini-2.5-flash";

    const batch = await createOpenRouterBatch(requests, { model });
    await recordBatchSubmission(batch);

    // Link stream records to the new batch
    const submittedVideoIds = validStreams.map((s) => s.videoId);
    await assignStreamsToBatch(submittedVideoIds, batch.id);

    return {
      batchId: batch.id,
      submittedCount: requests.length,
      skippedCount: skippedStreams.length,
      status: "submitted",
    };
  } catch (err: any) {
    return {
      submittedCount: 0,
      skippedCount: skippedStreams.length,
      status: "failed",
      error: err.message || String(err),
    };
  }
}

/**
 * Polls active batches from DB, updates their status, and ingests trade results when completed.
 */
export async function harvestCompletedBatches(): Promise<HarvestBatchesResult> {
  const activeBatches = await getActiveBatches();

  let completedBatchesCount = 0;
  let totalTradesExtracted = 0;
  let processedStreamsCount = 0;

  for (const dbBatch of activeBatches) {
    try {
      const openRouterBatch = await getOpenRouterBatch(dbBatch.id);

      // Update batch record in DB with latest counts and cost
      await updateBatchRecord(dbBatch.id, {
        status: openRouterBatch.status,
        completed_requests: openRouterBatch.requestCounts.completed,
        failed_requests: openRouterBatch.requestCounts.failed,
        total_requests: openRouterBatch.requestCounts.total,
        cost: openRouterBatch.usage?.cost ?? null,
        finalized_at: openRouterBatch.finalizedAt
          ? new Date(openRouterBatch.finalizedAt * 1000).toISOString()
          : null,
        error: openRouterBatch.error ?? null,
      });

      if (openRouterBatch.status === "completed") {
        completedBatchesCount++;

        // Fetch streams belonging to this batch
        const streams = await getStreamsByBatchId(dbBatch.id);
        const streamsMap = new Map<string, LiveSession>();
        const streamRowMap = new Map<string, (typeof streams)[0]>();

        for (const s of streams) {
          streamsMap.set(s.video_id, {
            videoId: s.video_id,
            title: s.title,
            description: s.description || "",
            channelId: s.channel_id,
            channelTitle: "",
            status: "completed",
            url: s.stream_url,
          });
          streamRowMap.set(s.video_id, s);
        }

        const parsedResults = parseBatchResults(openRouterBatch, streamsMap);

        for (const item of parsedResults) {
          processedStreamsCount++;
          const streamRow = streamRowMap.get(item.videoId);

          if (!streamRow) continue;

          if (item.status === "completed" && item.report) {
            const trades = item.report.trades || [];
            if (trades.length > 0) {
              await saveExtractedTrades(streamRow.id, streamRow.channel_id, trades);
              totalTradesExtracted += trades.length;
            }

            await updateStreamByVideoId(item.videoId, {
              processing_status: "completed",
              error_message: null,
            });
          } else {
            await updateStreamByVideoId(item.videoId, {
              processing_status: "failed",
              error_message: item.error || "Batch item execution failed.",
            });
          }
        }
      } else if (openRouterBatch.status === "failed") {
        // Mark all streams in this batch as failed
        const streams = await getStreamsByBatchId(dbBatch.id);
        for (const s of streams) {
          await updateStreamByVideoId(s.video_id, {
            processing_status: "failed",
            error_message:
              typeof openRouterBatch.error === "string"
                ? openRouterBatch.error
                : JSON.stringify(openRouterBatch.error || "Batch processing failed on OpenRouter"),
          });
        }
      }
    } catch (err: any) {
      console.warn(`Error harvesting batch ${dbBatch.id}: ${err.message}`);
    }
  }

  return {
    checkedBatchesCount: activeBatches.length,
    completedBatchesCount,
    totalTradesExtracted,
    processedStreamsCount,
  };
}

/**
 * Runs the full automated daily cycle:
 * 1. Sync tracked channels & discover new completed streams
 * 2. Submit unprocessed streams to OpenRouter Batch
 * 3. Harvest completed batch results and write trades to Supabase
 */
export async function runDailyPipelineCycle(options: {
  maxBatchSize?: number;
  model?: string;
} = {}): Promise<DailyPipelineReport> {
  const sync = await syncTrackedChannelsStreams();
  const submit = await submitUnprocessedStreamsBatch(options);
  const harvest = await harvestCompletedBatches();

  return {
    timestamp: new Date().toISOString(),
    sync,
    submit,
    harvest,
  };
}
