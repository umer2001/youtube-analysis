import { OpenRouter } from "@openrouter/sdk";
import { TradeReport, parseTradeReportJson } from "../../types/trade.js";

export interface OpenRouterAnalysisOptions {
  model?: string;
  customPrompt?: string;
}

/**
 * Analyzes a transcript using OpenRouter SDK as a provider-agnostic fallback, returning structured JSON.
 */
export async function analyzeTranscriptWithOpenRouter(
  formattedTranscript: string,
  options: OpenRouterAnalysisOptions = {}
): Promise<TradeReport> {
  const apiKey = process.env.OPENROUTER_API_KEY;

  if (!apiKey) {
    throw new Error(
      "OPENROUTER_API_KEY is not set. Please set it in your .env file to enable the OpenRouter fallback."
    );
  }

  const model = options.model || process.env.OPENROUTER_MODEL || "deepseek/deepseek-chat";

  const prompt = `You are a financial market analyst. Analyze the following trading livestream transcript and extract all trades newly entered or executed live during this session.

IMPORTANT RULES:
- ONLY include trades that were actively opened/executed live during this stream session.
- EXCLUDE any pre-existing positions, swing trades held from earlier sessions, or trades that the host/streamer claims were already open before this stream began (e.g., existing swing positions opened prior to the stream).
- If no new trades were entered live during the stream, return an empty array: "trades": [].

You MUST respond strictly with a valid JSON object matching this schema:
{
  "trades": [
    {
      "symbol": "Asset / Ticker / Pair (e.g. Gold / GC, BTC, NQ)",
      "side": "LONG" or "SHORT",
      "result": "TP", "SL", or "UNKNOWN",
      "important_timestamps": ["01:10:52", "01:29:53", ...],
      "entry_price": "optional string price",
      "exit_price": "optional string price",
      "notes": "optional brief rationale or outcome"
    }
  ]
}

Only return pure JSON. Do not include introductory text or markdown formatting outside the JSON.

Transcript:
${formattedTranscript}`;

  const openrouter = new OpenRouter({ apiKey });

  const response = await openrouter.chat.send({
    chatRequest: {
      model,
      responseFormat: {
        type: "json_object",
      },
      messages: [
        {
          role: "user",
          content: prompt,
        },
      ],
    },
  });

  if ("choices" in response && response.choices && response.choices.length > 0) {
    const rawContent = response.choices[0].message?.content;
    if (typeof rawContent === "string") {
      return parseTradeReportJson(rawContent);
    }
  }

  throw new Error("No valid response choices returned from OpenRouter.");
}
