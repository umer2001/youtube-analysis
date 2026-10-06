import { z } from "zod";

export const ExtractedTradeSchema = z.object({
  symbol: z.string().describe("The asset, pair, or ticker (e.g. Gold / GC, BTC, NQ)"),
  side: z.enum(["LONG", "SHORT"]).describe("Trade direction"),
  result: z.enum(["TP", "SL", "UNKNOWN"]).describe("Outcome of the trade"),
  important_timestamps: z
    .array(z.string())
    .describe("Key timestamps [HH:MM:SS] for entry, additions, exits, or key discussions"),
  entry_price: z.string().optional().describe("Entry price if mentioned"),
  exit_price: z.string().optional().describe("Exit price or stop out price if mentioned"),
  notes: z.string().optional().describe("Brief trade rationale or context"),
});

export const TradeReportSchema = z.object({
  trades: z.array(ExtractedTradeSchema).describe("List of trades executed in the session"),
});

export type ExtractedTrade = z.infer<typeof ExtractedTradeSchema>;
export type TradeItem = ExtractedTrade;
export type TradeReport = z.infer<typeof TradeReportSchema>;

/**
 * Safely parses JSON from raw LLM output, stripping markdown code fences if present.
 */
export function parseTradeReportJson(rawText: string): TradeReport {
  // Strip markdown code fences like ```json ... ``` or ``` ... ```
  let cleaned = rawText.trim();
  if (cleaned.startsWith("```")) {
    cleaned = cleaned.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  }

  const parsed = JSON.parse(cleaned);
  return TradeReportSchema.parse(parsed);
}
