import "dotenv/config";
import { GoogleGenAI } from "@google/genai";
import { getFormattedTranscript } from "./services/youtube/transcript.js";
import { TradeReport, parseTradeReportJson } from "./types/trade.js";

const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;

if (!apiKey) {
  console.error("❌ GEMINI_API_KEY is missing. Please set it in your .env file.");
  process.exit(1);
}

const ai = new GoogleGenAI({ apiKey });

async function main() {
  const videoUrl = process.argv[2] || "https://www.youtube.com/watch?v=XEtkxYOvnHo";

  let report: TradeReport;

  try {
    console.log("🤖 Attempting primary path: Gemini Video Processing (Agentic)...");
    const interaction = await ai.interactions.create({
      model: "gemini-3.8-flash",
      input: [
        {
          type: "text",
          text: `Please analyze the livestream session and extract all trades newly entered or executed live during this session.

IMPORTANT RULES:
- ONLY include trades that were actively opened/executed live during this stream session.
- EXCLUDE any pre-existing positions, swing trades held from earlier sessions, or trades that the host/streamer claims were already open before this stream began (e.g., existing swing positions opened prior to the stream).
- If no new trades were entered live during the stream, return an empty array: "trades": [].

You MUST output strictly a valid JSON object matching this schema:
{
  "trades": [
    {
      "symbol": "string (e.g. Gold / GC, BTC, NQ)",
      "side": "LONG" or "SHORT",
      "result": "TP", "SL", or "UNKNOWN",
      "important_timestamps": ["HH:MM:SS", ...],
      "entry_price": "optional string price",
      "exit_price": "optional string price",
      "notes": "optional brief notes/rationale"
    }
  ]
}
Only output pure JSON. Do not include introductory text or markdown formatting.`
        },
        {
          type: "video",
          uri: videoUrl,
          processing: "agentic"
        }
      ],
    });

    report = parseTradeReportJson(interaction.output_text || "{}");
    console.log("\n=================== STRUCTURED JSON REPORT (Gemini Video) ===================");
    console.log(JSON.stringify(report, null, 2));
    console.log("============================================================================\n");
  } catch (err: any) {
    console.warn(`\n⚠️ Primary Gemini Video processing failed: ${err.message || err}`);
    console.log("🔄 Switching to Fallback: Transcript Ingestion via OpenRouter (@openrouter/sdk)...\n");

    const { analyzeTranscriptWithOpenRouter } = await import("./services/analyzer/openrouter.js");

    console.log(`📥 Fetching transcript for: ${videoUrl}...`);
    const { totalChunks, formattedText } = await getFormattedTranscript(videoUrl);
    console.log(`✅ Loaded ${totalChunks} transcript segments (~${Math.round(formattedText.length / 4)} tokens estimated).\n`);

    console.log("🤖 Analyzing transcript with OpenRouter (Structured JSON)...");
    report = await analyzeTranscriptWithOpenRouter(formattedText);

    console.log("\n=================== STRUCTURED JSON REPORT (OpenRouter Transcript) ===================");
    console.log(JSON.stringify(report, null, 2));
    console.log("====================================================================================\n");
  }
}

main().catch((err) => {
  console.error("\n❌ Error executing analysis pipeline:", err);
  process.exit(1);
});
