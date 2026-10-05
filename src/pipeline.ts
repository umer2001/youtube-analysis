import "dotenv/config";
import {
  syncTrackedChannelsStreams,
  submitUnprocessedStreamsBatch,
  harvestCompletedBatches,
  runDailyPipelineCycle,
} from "./services/pipeline/daily-sync.js";

function printHelp() {
  console.log(`
============================================================================
⚙️ PRODUCTION PIPELINE ORCHESTRATOR
============================================================================
Runs the automated daily pipeline for YouTube livestream tracking, OpenRouter
batch submission, and Supabase trade persistence.

USAGE:
  pnpm pipeline [command|options]

COMMANDS & OPTIONS:
  --all                     Run the complete cycle (Sync Channels -> Submit Batch -> Harvest Trades) [default]
  --sync                    Only discover and upsert new completed streams from tracked channels
  --submit                  Only ingest transcripts and submit unprocessed streams into OpenRouter batch
  --harvest                 Only check active batches on OpenRouter and persist completed trades
  --model <model-slug>      OpenRouter model override for new batches
  --max-batch <number>      Maximum streams to package in a single batch (default: 15)
  --json                    Output machine-readable JSON summary only
  --help                    Show this help message

EXAMPLES:
  pnpm pipeline --all
  pnpm pipeline --sync
  pnpm pipeline --submit --model google/gemini-2.5-flash
  pnpm pipeline --harvest
============================================================================
`);
}

async function main() {
  const args = process.argv.slice(2);

  if (args.includes("--help") || args.includes("-h")) {
    printHelp();
    return;
  }

  const isJson = args.includes("--json");
  const modelIdx = args.indexOf("--model");
  const model = modelIdx !== -1 && args[modelIdx + 1] ? args[modelIdx + 1] : undefined;

  const maxBatchIdx = args.indexOf("--max-batch");
  const maxBatchSize =
    maxBatchIdx !== -1 && args[maxBatchIdx + 1] ? parseInt(args[maxBatchIdx + 1], 10) : undefined;

  // 1. Only Sync
  if (args.includes("--sync")) {
    if (!isJson) console.log("\n🔄 Step: Syncing tracked channels and discovering streams...");
    const syncResult = await syncTrackedChannelsStreams();
    if (isJson) {
      console.log(JSON.stringify(syncResult, null, 2));
    } else {
      console.log(`✅ Synced ${syncResult.channelsCount} channel(s). Discovered/upserted ${syncResult.newStreamsFound} stream(s).`);
      if (syncResult.errors.length > 0) {
        console.warn(`⚠️ Errors encountered in ${syncResult.errors.length} channel(s):`, syncResult.errors);
      }
    }
    return;
  }

  // 2. Only Submit
  if (args.includes("--submit")) {
    if (!isJson) console.log("\n📦 Step: Ingesting transcripts & submitting unprocessed streams to OpenRouter Batch...");
    const submitResult = await submitUnprocessedStreamsBatch({ model, maxBatchSize });
    if (isJson) {
      console.log(JSON.stringify(submitResult, null, 2));
    } else {
      console.log(`Status: ${submitResult.status.toUpperCase()}`);
      if (submitResult.batchId) {
        console.log(`🎉 Batch Created: ${submitResult.batchId}`);
        console.log(`   Submitted items: ${submitResult.submittedCount}`);
      } else {
        console.log(`   Message: No pending streams ready for batching (skipped: ${submitResult.skippedCount}).`);
      }
      if (submitResult.error) {
        console.error(`❌ Batch error: ${submitResult.error}`);
      }
    }
    return;
  }

  // 3. Only Harvest
  if (args.includes("--harvest")) {
    if (!isJson) console.log("\n🌾 Step: Harvesting active OpenRouter batches and saving trades to Supabase...");
    const harvestResult = await harvestCompletedBatches();
    if (isJson) {
      console.log(JSON.stringify(harvestResult, null, 2));
    } else {
      console.log(`Checked Batches:   ${harvestResult.checkedBatchesCount}`);
      console.log(`Completed Batches: ${harvestResult.completedBatchesCount}`);
      console.log(`Streams Processed: ${harvestResult.processedStreamsCount}`);
      console.log(`Trades Extracted:  ${harvestResult.totalTradesExtracted}`);
    }
    return;
  }

  // Default: Run full daily cycle
  if (!isJson) {
    console.log("============================================================================");
    console.log("🚀 STARTING DAILY LIVESTREAM TRACKING & TRADE HARVESTING PIPELINE");
    console.log("============================================================================\n");
  }

  const report = await runDailyPipelineCycle({ model, maxBatchSize });

  if (isJson) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  console.log("\n============================================================================");
  console.log("🏁 PIPELINE CYCLE SUMMARY REPORT");
  console.log("============================================================================");
  console.log(`⏰ Executed At:       ${new Date(report.timestamp).toLocaleString()}`);
  console.log(`📺 Tracked Channels:  ${report.sync.channelsCount} synced`);
  console.log(`🎬 Streams Ingested:  ${report.sync.newStreamsFound} stream(s)`);
  console.log(`📦 Batch Submission:  ${report.submit.status.toUpperCase()} (${report.submit.submittedCount} items submitted${report.submit.batchId ? `, ID: ${report.submit.batchId}` : ""})`);
  console.log(`🌾 Batches Checked:   ${report.harvest.checkedBatchesCount} (${report.harvest.completedBatchesCount} newly completed)`);
  console.log(`📈 Trades Persisted:  ${report.harvest.totalTradesExtracted} trade(s) saved to Supabase`);
  console.log("============================================================================\n");
}

main().catch((err) => {
  console.error("\n❌ Pipeline error:", err.message || err);
  process.exit(1);
});
