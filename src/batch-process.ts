import "dotenv/config";
import fs from "node:fs/promises";
import path from "node:path";
import {
  listChannelLiveStreams,
  scrapeChannelStreamsTab,
  getValidYouTubeApiKey,
} from "./services/youtube/streams.js";
import {
  createOpenRouterBatch,
  getOpenRouterBatch,
  listOpenRouterBatches,
  parseBatchResults,
  prepareTranscriptBatchRequests,
} from "./services/analyzer/batch.js";
import { LiveSession } from "./types/stream.js";
import { OpenRouterBatch, StreamBatchResult } from "./types/batch.js";
import { extractVideoId } from "./services/youtube/transcript.js";

function printHelp() {
  console.log(`
============================================================================
📦 OPENROUTER BATCH LIVESTREAM ANALYZER
============================================================================
Analyze multiple past trading livestreams asynchronously at 50% discount.

USAGE:
  pnpm batch-process [options]

COMMANDS & OPTIONS:
  --channel <url|handle>    YouTube channel to ingest past streams from (default: @TradeLikeMalika)
  --videos <url1> <url2>..  Direct list of YouTube video URLs or IDs to batch analyze
  --max <number>            Max number of past completed livestreams to process (default: 5)
  --model <model-slug>      OpenRouter model (default: google/gemini-2.5-flash or OPENROUTER_MODEL)
  --submit-only             Submit batch and exit immediately with Batch ID (no waiting)
  --status <batchId>        Check status of a running or completed batch
  --retrieve <batchId>      Retrieve and parse completed trades from a batch
  --list                    List recent batches in your workspace
  --json                    Output structured JSON output only
  --help                    Show this help message

EXAMPLES:
  pnpm batch-process --channel @TradeLikeMalika --max 3
  pnpm batch-process --videos https://www.youtube.com/watch?v=HX3IEaRCeDE https://www.youtube.com/watch?v=x2AJRXIJQVA
  pnpm batch-process --status batch-1791187335-VZ78mVUF0cylKoFS7i8z
  pnpm batch-process --retrieve batch-1791187335-VZ78mVUF0cylKoFS7i8z
============================================================================
`);
}

async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function saveResultsToFile(batchId: string, data: any) {
  try {
    const dir = path.resolve(process.cwd(), "batches");
    await fs.mkdir(dir, { recursive: true });
    const filePath = path.join(dir, `${batchId}.json`);
    await fs.writeFile(filePath, JSON.stringify(data, null, 2), "utf-8");
    return filePath;
  } catch (err: any) {
    console.warn(`Could not save batch to file: ${err.message}`);
    return null;
  }
}

function displayResults(summary: {
  batch: OpenRouterBatch;
  results: StreamBatchResult[];
  savedFilePath?: string | null;
}) {
  console.log("\n============================================================================");
  console.log("📊 BATCH ANALYSIS COMPLETE & PARSED");
  console.log(`🆔 Batch ID: ${summary.batch.id}`);
  console.log(`🤖 Model:    ${summary.batch.model}`);
  console.log(`💰 Cost:     $${summary.batch.usage?.cost?.toFixed(6) || "0.000000"}`);
  console.log(`📈 Streams:  ${summary.results.length} processed`);
  if (summary.savedFilePath) {
    console.log(`💾 Saved to: ${summary.savedFilePath}`);
  }
  console.log("============================================================================\n");

  summary.results.forEach((item, index) => {
    console.log(`----------------------------------------------------------------------------`);
    console.log(`[${index + 1}] Stream: ${item.title}`);
    console.log(`    🔗 URL:     ${item.url}`);
    console.log(`    Status:     ${item.status === "completed" ? "✅ SUCCESS" : "❌ FAILED"}`);

    if (item.error) {
      console.log(`    ⚠️  Error:   ${item.error}`);
    }

    if (item.report) {
      const trades = item.report.trades || [];
      console.log(`    📋 Extracted Trades: ${trades.length}`);

      if (trades.length === 0) {
        console.log(`       ℹ️ No new trades were opened/executed live in this session.`);
      } else {
        trades.forEach((t, tIdx) => {
          const badge = t.side === "LONG" ? "🟢 LONG" : "🔴 SHORT";
          const resBadge = t.result === "TP" ? "🎯 TP" : t.result === "SL" ? "🛑 SL" : "❓ UNKNOWN";
          console.log(`       (${tIdx + 1}) ${badge} ${t.symbol} | Result: ${resBadge}`);
          if (t.entry_price) console.log(`           Entry: ${t.entry_price}`);
          if (t.exit_price) console.log(`           Exit:  ${t.exit_price}`);
          if (t.important_timestamps && t.important_timestamps.length > 0) {
            console.log(`           Timestamps: ${t.important_timestamps.join(", ")}`);
          }
          if (t.notes) {
            console.log(`           Notes: ${t.notes}`);
          }
        });
      }
    }
    console.log("");
  });
}

async function handleList(isJson: boolean) {
  const list = await listOpenRouterBatches({ limit: 10 });
  if (isJson) {
    console.log(JSON.stringify(list, null, 2));
    return;
  }

  console.log("\n============================================================================");
  console.log("📋 RECENT OPENROUTER BATCHES IN WORKSPACE");
  console.log("============================================================================\n");

  if (!list.data || list.data.length === 0) {
    console.log("No batches found in workspace.");
    return;
  }

  list.data.forEach((b, i) => {
    console.log(`[${i + 1}] ID: ${b.id}`);
    console.log(`    Model:   ${b.model}`);
    console.log(`    Status:  ${b.status}`);
    console.log(`    Created: ${new Date(b.createdAt * 1000).toLocaleString()}`);
    console.log(
      `    Counts:  Total: ${b.requestCounts.total} | Completed: ${b.requestCounts.completed} | Failed: ${b.requestCounts.failed}`
    );
    if (b.usage?.cost) {
      console.log(`    Cost:    $${b.usage.cost.toFixed(6)}`);
    }
    console.log("");
  });
}

async function handleStatus(batchId: string, isJson: boolean) {
  const batch = await getOpenRouterBatch(batchId);
  if (isJson) {
    console.log(JSON.stringify(batch, null, 2));
    return;
  }

  console.log("\n============================================================================");
  console.log(`🔍 BATCH STATUS: ${batch.id}`);
  console.log("============================================================================");
  console.log(`Model:     ${batch.model}`);
  console.log(`Status:    ${batch.status.toUpperCase()}`);
  console.log(`Created:   ${new Date(batch.createdAt * 1000).toLocaleString()}`);
  if (batch.finalizedAt) {
    console.log(`Finalized: ${new Date(batch.finalizedAt * 1000).toLocaleString()}`);
  }
  console.log(
    `Requests:  Total: ${batch.requestCounts.total} | Completed: ${batch.requestCounts.completed} | Failed: ${batch.requestCounts.failed}`
  );
  if (batch.usage?.cost !== undefined && batch.usage?.cost !== null) {
    console.log(`Cost:      $${batch.usage.cost.toFixed(6)}`);
  }
  if (batch.error) {
    console.log(`Error:     ${JSON.stringify(batch.error)}`);
  }
  console.log("============================================================================\n");

  if (batch.status === "completed") {
    console.log(`💡 To parse and view trade reports for this batch, run:`);
    console.log(`   pnpm batch-process --retrieve ${batch.id}\n`);
  }
}

async function handleRetrieve(batchId: string, isJson: boolean) {
  const batch = await getOpenRouterBatch(batchId);

  if (batch.status !== "completed") {
    console.warn(`⚠️ Batch ${batchId} is not completed yet (current status: ${batch.status}).`);
    if (batch.status === "failed") {
      console.error("Batch failure details:", batch.error);
    }
    return;
  }

  const results = parseBatchResults(batch);
  const filePath = await saveResultsToFile(batchId, { batch, results });

  if (isJson) {
    console.log(JSON.stringify({ batch, results }, null, 2));
    return;
  }

  displayResults({ batch, results, savedFilePath: filePath });
}

async function main() {
  const args = process.argv.slice(2);

  if (args.includes("--help") || args.includes("-h")) {
    printHelp();
    return;
  }

  const isJson = args.includes("--json");
  const isSubmitOnly = args.includes("--submit-only");

  // Check for --list
  if (args.includes("--list")) {
    await handleList(isJson);
    return;
  }

  // Check for --status
  const statusIdx = args.indexOf("--status");
  if (statusIdx !== -1 && args[statusIdx + 1]) {
    await handleStatus(args[statusIdx + 1], isJson);
    return;
  }

  // Check for --retrieve
  const retrieveIdx = args.indexOf("--retrieve");
  if (retrieveIdx !== -1 && args[retrieveIdx + 1]) {
    await handleRetrieve(args[retrieveIdx + 1], isJson);
    return;
  }

  // Determine target model
  const modelIdx = args.indexOf("--model");
  const requestedModel =
    modelIdx !== -1 && args[modelIdx + 1]
      ? args[modelIdx + 1]
      : process.env.OPENROUTER_BATCH_MODEL || "google/gemini-2.5-flash";

  // Determine max streams
  const maxIdx = args.indexOf("--max");
  const maxStreams = maxIdx !== -1 && args[maxIdx + 1] ? parseInt(args[maxIdx + 1], 10) : 5;

  let candidateSessions: LiveSession[] = [];

  // Check if direct --videos provided
  const videosIdx = args.indexOf("--videos");
  if (videosIdx !== -1) {
    const videoInputs = args.slice(videosIdx + 1).filter((a) => !a.startsWith("--"));
    if (videoInputs.length === 0) {
      console.error("❌ Please provide at least one video URL or ID after --videos.");
      process.exit(1);
    }

    candidateSessions = videoInputs.map((input) => {
      const vId = extractVideoId(input);
      return {
        videoId: vId,
        url: `https://www.youtube.com/watch?v=${vId}`,
        title: `Video ${vId}`,
        description: "",
        channelId: "",
        channelTitle: "",
        status: "completed",
      };
    });
  } else {
    // Ingest past streams from Channel
    const channelIdx = args.indexOf("--channel");
    const channelInput =
      channelIdx !== -1 && args[channelIdx + 1]
        ? args[channelIdx + 1]
        : "https://www.youtube.com/@TradeLikeMalika";

    if (!isJson) {
      console.log("============================================================================");
      console.log("📦 OPENROUTER BATCH LIVESTREAM ANALYZER");
      console.log(`🎯 Channel: ${channelInput}`);
      console.log(`🤖 Model:   ${requestedModel} (50% Batch Discount)`);
      console.log(`🔢 Max:     ${maxStreams} past streams`);
      console.log("============================================================================\n");
      console.log("🔍 Fetching past completed streams from channel...");
    }

    const hasApiKey = Boolean(getValidYouTubeApiKey());
    let fetchResult;

    try {
      if (hasApiKey) {
        fetchResult = await listChannelLiveStreams(channelInput, {
          eventType: "completed",
          maxResults: maxStreams * 2,
        });
      } else {
        fetchResult = await scrapeChannelStreamsTab(channelInput, {
          maxResults: maxStreams * 2,
        });
      }
    } catch (err: any) {
      if (!isJson) {
        console.warn(`Primary fetch error: ${err.message || err}. Attempting scraper fallback...`);
      }
      fetchResult = await scrapeChannelStreamsTab(channelInput, {
        maxResults: maxStreams * 2,
      });
    }

    // Filter strictly to completed livestream sessions
    const completedStreams = fetchResult.sessions.filter((s) => s.status === "completed");
    candidateSessions = completedStreams.slice(0, maxStreams);

    if (candidateSessions.length === 0) {
      console.log("ℹ️ No past completed streams found for this channel.");
      return;
    }

    if (!isJson) {
      console.log(`✅ Found ${candidateSessions.length} completed stream(s) to analyze.\n`);
    }
  }

  // Map for session lookup
  const streamsMap = new Map<string, LiveSession>();
  candidateSessions.forEach((s) => streamsMap.set(s.videoId, s));

  // Step 2: Fetch transcripts and prepare batch requests
  if (!isJson) {
    console.log("📥 Ingesting transcripts for past streams...");
  }

  const { requests, validStreams, skippedStreams } = await prepareTranscriptBatchRequests(
    candidateSessions
  );

  if (!isJson) {
    validStreams.forEach((s) => console.log(`   ✅ Loaded transcript for: "${s.title}"`));
    skippedStreams.forEach((item) =>
      console.log(`   ⚠️ Skipped "${item.stream.title}": ${item.reason}`)
    );
    console.log(`\n📦 Prepared ${requests.length} stream transcript(s) for OpenRouter batch submission.\n`);
  }

  if (requests.length === 0) {
    console.error("❌ No transcripts could be retrieved for the specified streams. Aborting batch submission.");
    process.exit(1);
  }

  // Step 3: Submit batch to OpenRouter
  if (!isJson) {
    console.log(`🚀 Submitting batch to OpenRouter (${requestedModel})...`);
  }

  const initialBatch = await createOpenRouterBatch(requests, { model: requestedModel });

  if (!isJson) {
    console.log("----------------------------------------------------------------------------");
    console.log(`🎉 Batch successfully created!`);
    console.log(`🆔 Batch ID:    ${initialBatch.id}`);
    console.log(`⏳ Status:      ${initialBatch.status}`);
    console.log(`📊 Total items: ${initialBatch.requestCounts.total}`);
    console.log(`🕒 Window:      ${initialBatch.completionWindow}`);
    console.log("----------------------------------------------------------------------------\n");
  }

  if (isSubmitOnly) {
    if (isJson) {
      console.log(JSON.stringify(initialBatch, null, 2));
    } else {
      console.log(`💡 Check status anytime with:`);
      console.log(`   pnpm batch-process --status ${initialBatch.id}`);
      console.log(`💡 Retrieve parsed trade results when complete with:`);
      console.log(`   pnpm batch-process --retrieve ${initialBatch.id}\n`);
    }
    return;
  }

  // Step 4: Poll until completed (or until user stops)
  if (!isJson) {
    console.log("⏳ Waiting / polling for batch completion (Press Ctrl+C anytime to resume later)...");
  }

  let currentBatch = initialBatch;
  let pollCount = 0;
  const maxPolls = 60; // poll for up to ~10 minutes in interactive session

  while (
    currentBatch.status !== "completed" &&
    currentBatch.status !== "failed" &&
    currentBatch.status !== "expired" &&
    currentBatch.status !== "cancelled" &&
    pollCount < maxPolls
  ) {
    await sleep(10000); // 10s interval
    pollCount++;

    try {
      currentBatch = await getOpenRouterBatch(initialBatch.id);
      if (!isJson) {
        process.stdout.write(
          `\r⏱️  [${new Date().toLocaleTimeString()}] Status: ${currentBatch.status.toUpperCase()} | Completed: ${currentBatch.requestCounts.completed}/${currentBatch.requestCounts.total} (poll #${pollCount})`
        );
      }
    } catch (pollErr: any) {
      if (!isJson) {
        console.warn(`\n⚠️ Poll warning: ${pollErr.message}`);
      }
    }
  }

  if (!isJson) {
    console.log("\n");
  }

  if (currentBatch.status === "completed") {
    const results = parseBatchResults(currentBatch, streamsMap);
    const savedFilePath = await saveResultsToFile(currentBatch.id, {
      batch: currentBatch,
      results,
    });

    if (isJson) {
      console.log(JSON.stringify({ batch: currentBatch, results }, null, 2));
    } else {
      displayResults({ batch: currentBatch, results, savedFilePath });
    }
  } else if (currentBatch.status === "failed") {
    console.error(`❌ Batch failed:`, currentBatch.error);
    process.exit(1);
  } else {
    // Still in progress after interactive polling window
    console.log("ℹ️  Batch is still processing in the background on OpenRouter.");
    console.log(`   Current Status: ${currentBatch.status}`);
    console.log(`   Progress:       ${currentBatch.requestCounts.completed}/${currentBatch.requestCounts.total}`);
    console.log(`\n💡 You can check its progress anytime with:`);
    console.log(`   pnpm batch-process --status ${currentBatch.id}`);
    console.log(`💡 And retrieve the parsed trades when done with:`);
    console.log(`   pnpm batch-process --retrieve ${currentBatch.id}\n`);
  }
}

main().catch((err) => {
  console.error("\n❌ Batch pipeline error:", err);
  process.exit(1);
});
