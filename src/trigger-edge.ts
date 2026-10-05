import "dotenv/config";

async function main() {
  const args = process.argv.slice(2);
  const actionIdx = args.indexOf("--action");
  const action = actionIdx !== -1 && args[actionIdx + 1] ? args[actionIdx + 1] : "all";

  const modelIdx = args.indexOf("--model");
  const model = modelIdx !== -1 && args[modelIdx + 1] ? args[modelIdx + 1] : undefined;

  const supabaseUrl = process.env.SUPABASE_URL || "https://REDACTED_SUPABASE_PROJECT_ID.supabase.co";
  const functionUrl = `${supabaseUrl}/functions/v1/daily-pipeline`;

  console.log(`\n🚀 Triggering Supabase Edge Function: ${functionUrl}`);
  console.log(`🎯 Action: ${action}${model ? ` | Model: ${model}` : ""}`);
  console.log(`⏳ Invoking cloud Edge Function...\n`);

  const response = await fetch(functionUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(process.env.SUPABASE_ANON_KEY
        ? { Authorization: `Bearer ${process.env.SUPABASE_ANON_KEY}` }
        : {}),
    },
    body: JSON.stringify({ action, model }),
  });

  const data = await response.json();

  if (!response.ok || !data.ok) {
    console.error(`❌ Edge Function returned error (${response.status}):`, data.error || data);
    process.exit(1);
  }

  console.log(`✅ Edge Function Execution Succeeded!`);
  console.log(JSON.stringify(data.report, null, 2));
}

main().catch((err) => {
  console.error("❌ Invocation error:", err.message || err);
  process.exit(1);
});
