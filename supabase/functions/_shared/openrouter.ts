const OPENROUTER_BATCH_URL = "https://openrouter.ai/api/v1/batches";

export interface BatchRequestItem {
  custom_id: string; // Sanitized identifier matching [a-z0-9_-]
  body: {
    messages: Array<{ role: string; content: string }>;
    response_format?: { type: "json_object" };
    [key: string]: any;
  };
}

/**
 * Encodes an identifier (e.g. YouTube videoId) into a safe string matching [a-z0-9_-].
 * OpenRouter batch providers (e.g. Anthropic, Mistral, OpenAI) strictly enforce:
 * custom_id may only contain characters in [a-z0-9_-] with length <= 64 chars.
 * YouTube video IDs contain uppercase letters (e.g. 'rFXiMXRhGSU'), which violate this constraint.
 */
export function encodeCustomId(id: string): string {
  if (!id) return "";
  let hex = "";
  for (let i = 0; i < id.length; i++) {
    hex += id.charCodeAt(i).toString(16).padStart(2, "0");
  }
  return `yt_${hex}`;
}

/**
 * Decodes an encoded custom_id back to its original identifier.
 * If the string starts with 'yt_', it decodes the hex back to ASCII.
 * Otherwise, it returns the customId as-is for backwards compatibility.
 */
export function decodeCustomId(customId: string): string {
  if (!customId) return "";
  if (customId.startsWith("yt_")) {
    const hex = customId.slice(3);
    let str = "";
    for (let i = 0; i < hex.length; i += 2) {
      const code = parseInt(hex.slice(i, i + 2), 16);
      if (!isNaN(code)) {
        str += String.fromCharCode(code);
      }
    }
    return str;
  }
  return customId;
}

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

export async function createBatch(
  requests: BatchRequestItem[],
  modelOverride?: string
): Promise<any> {
  const apiKey = Deno.env.get("OPENROUTER_API_KEY");
  if (!apiKey) {
    throw new Error("Missing OPENROUTER_API_KEY environment variable.");
  }

  const model =
    modelOverride ||
    Deno.env.get("OPENROUTER_BATCH_MODEL") ||
    "xiaomi/mimo-v2.6-pro";

  // Ensure all custom_id values strictly satisfy [a-z0-9_-]
  const sanitizedRequests = requests.map((req) => ({
    ...req,
    custom_id: /^[a-z0-9_-]+$/.test(req.custom_id)
      ? req.custom_id
      : encodeCustomId(req.custom_id),
  }));

  const payload = {
    endpoint: "/v1/chat/completions",
    model,
    completion_window: "24h",
    requests: sanitizedRequests,
  };

  const res = await fetch(OPENROUTER_BATCH_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(
      `OpenRouter Batch creation failed (${res.status} ${res.statusText}): ${errorText}`
    );
  }

  return await res.json();
}

export async function getBatch(batchId: string): Promise<any> {
  const apiKey = Deno.env.get("OPENROUTER_API_KEY");
  if (!apiKey) {
    throw new Error("Missing OPENROUTER_API_KEY environment variable.");
  }

  const res = await fetch(`${OPENROUTER_BATCH_URL}/${batchId}`, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
  });

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(
      `Failed to get batch ${batchId} (${res.status} ${res.statusText}): ${errorText}`
    );
  }

  return await res.json();
}

export function parseBatchTradeResults(batch: any): Array<{
  videoId: string;
  status: "completed" | "failed";
  trades?: any[];
  error?: string;
}> {
  const results = batch.results || [];

  return results.map((item: any) => {
    const rawId = item.custom_id || item.customId || "";
    const videoId = decodeCustomId(rawId);

    if (item.error) {
      return {
        videoId,
        status: "failed",
        error:
          typeof item.error === "string"
            ? item.error
            : item.error.message || JSON.stringify(item.error),
      };
    }

    const choice = item.response?.body?.choices?.[0];
    const rawContent = choice?.message?.content;

    if (!rawContent) {
      return {
        videoId,
        status: "failed",
        error: "Missing completion message content in batch response.",
      };
    }

    try {
      let cleaned = rawContent.trim();
      if (cleaned.startsWith("```")) {
        cleaned = cleaned.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
      }
      const parsed = JSON.parse(cleaned);
      const trades = Array.isArray(parsed.trades) ? parsed.trades : [];

      return {
        videoId,
        status: "completed",
        trades,
      };
    } catch (parseErr: any) {
      return {
        videoId,
        status: "failed",
        error: `JSON schema parse error: ${parseErr.message || parseErr}`,
      };
    }
  });
}
