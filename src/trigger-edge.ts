import "dotenv/config";

function printHelp() {
  console.log(`
============================================================================
⚡ SUPABASE EDGE FUNCTION TRIGGER
============================================================================
Remotely invokes the cloud 'daily-pipeline' Edge Function on Supabase.

USAGE:
  pnpm trigger-edge [options]

ACTIONS & SHORTCUTS:
  --action <action>         Specify the action to run (sync, submit, harvest, all, debug_transcript, debug_proxy)
  --sync                    Shortcut for --action sync (discover and upsert new livestreams)
  --submit                  Shortcut for --action submit (ingest transcripts & create OpenRouter batch)
  --harvest                 Shortcut for --action harvest (check active batches & save trades)
  --all                     Shortcut for --action all (run sync -> submit -> harvest)
  --debug-transcript        Shortcut for --action debug_transcript (test transcript extraction)
  --debug-proxy             Shortcut for --action debug_proxy (test Webshare proxy connectivity)

OPTIONS:
  --limit <number>          Maximum streams to process for transcripts per run (default: 2)
  --model <model-slug>      OpenRouter model override for new batches (e.g. google/gemini-2.5-flash)
  --videoId <videoId>       YouTube video ID to test with debug_transcript
  --help, -h                Show this help message

EXAMPLES:
  pnpm trigger-edge --help
  pnpm trigger-edge --harvest
  pnpm trigger-edge --sync
  pnpm trigger-edge --submit --limit 2
  pnpm trigger-edge --all --limit 3
  pnpm trigger-edge --action debug_transcript --videoId HX3IEaRCeDE
============================================================================
`);
}

async function main() {
  const args = process.argv.slice(2);

  if (args.includes("--help") || args.includes("-h") || args.length === 0) {
    printHelp();
    return;
  }

  // Parse action from flags or shortcuts
  let action = "all";
  const actionIdx = args.indexOf("--action");
  if (actionIdx !== -1 && args[actionIdx + 1]) {
    action = args[actionIdx + 1];
  } else if (args.includes("--sync")) {
    action = "sync";
  } else if (args.includes("--submit")) {
    action = "submit";
  } else if (args.includes("--harvest")) {
    action = "harvest";
  } else if (args.includes("--all")) {
    action = "all";
  } else if (args.includes("--debug-transcript")) {
    action = "debug_transcript";
  } else if (args.includes("--debug-proxy")) {
    action = "debug_proxy";
  }

  const limitIdx = args.indexOf("--limit");
  const maxBatchIdx = args.indexOf("--max-batch");
  const limit =
    limitIdx !== -1 && args[limitIdx + 1]
      ? parseInt(args[limitIdx + 1], 10)
      : maxBatchIdx !== -1 && args[maxBatchIdx + 1]
      ? parseInt(args[maxBatchIdx + 1], 10)
      : 2;

  const modelIdx = args.indexOf("--model");
  const model = modelIdx !== -1 && args[modelIdx + 1] ? args[modelIdx + 1] : undefined;

  const videoIdIdx = args.indexOf("--videoId");
  const videoId = videoIdIdx !== -1 && args[videoIdIdx + 1] ? args[videoIdIdx + 1] : undefined;

  const supabaseUrl = process.env.SUPABASE_URL || "https://REDACTED_SUPABASE_PROJECT_ID.supabase.co";
  const params = new URLSearchParams();
  if (action) params.set("action", action);
  if (limit) params.set("limit", limit.toString());
  if (model) params.set("model", model);
  if (videoId) params.set("videoId", videoId);

  const functionUrl = `${supabaseUrl}/functions/v1/daily-pipeline?${params.toString()}`;

  console.log(`\n🚀 Triggering Supabase Edge Function: ${supabaseUrl}/functions/v1/daily-pipeline`);
  console.log(`🎯 Action: ${action} | Limit: ${limit}${model ? ` | Model: ${model}` : ""}${videoId ? ` | VideoId: ${videoId}` : ""}`);
  console.log(`⏳ Invoking cloud Edge Function...\n`);

  const response = await fetch(functionUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(process.env.SUPABASE_ANON_KEY
        ? { Authorization: `Bearer ${process.env.SUPABASE_ANON_KEY}` }
        : {}),
    },
    body: JSON.stringify({ action, limit, model, videoId }),
  });

  const data = await response.json().catch(() => null);

  if (!response.ok || (data && data.ok === false)) {
    console.error(`❌ Edge Function returned error (${response.status}):`, data?.error || data);
    if (data?.code === "WORKER_RESOURCE_LIMIT" || response.status === 546) {
      console.error("\n💡 Note: The Edge Function hit compute/memory limits (150MB Deno isolate).");
      console.error("   - For transcript extraction & batching of large backlogs, run individual steps (e.g. --sync, --harvest).");
      console.error("   - Or execute the full pipeline locally with: pnpm pipeline --all\n");
    }
    process.exit(1);
  }

  console.log(`✅ Edge Function Execution Succeeded!`);
  console.log(JSON.stringify(data?.report || data, null, 2));
}

main().catch((err) => {
  console.error("❌ Invocation error:", err.message || err);
  process.exit(1);
});
