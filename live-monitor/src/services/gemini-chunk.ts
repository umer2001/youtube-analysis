import { GoogleGenAI } from "@google/genai";
import { EventEmitter } from "events";
import { LiveTradeSignal, LiveTradeSignalSchema } from "../types.js";

function pcmToWav(pcmData: Buffer, sampleRate = 16000, channels = 1): Buffer {
  const byteRate = sampleRate * channels * 2;
  const blockAlign = channels * 2;
  const header = Buffer.alloc(44);

  header.write("RIFF", 0);
  header.writeUInt32LE(36 + pcmData.length, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(16, 34);
  header.write("data", 36);
  header.writeUInt32LE(pcmData.length, 40);

  return Buffer.concat([header, pcmData]);
}

export interface ChunkClientOptions {
  apiKey?: string;
  model?: string;
  windowSeconds?: number;
  intervalSeconds?: number;
  verbose?: boolean;
}

export class GeminiChunkClient extends EventEmitter {
  private ai: GoogleGenAI;
  private model: string;
  private windowBytes: number;
  private intervalBytes: number;
  private verbose: boolean;
  private ringBuffer: Buffer = Buffer.alloc(0);
  private bytesSinceLastEval = 0;
  private isEvaluating = false;

  constructor(options: ChunkClientOptions = {}) {
    super();
    const apiKey = options.apiKey || process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error("GEMINI_API_KEY is required for Gemini Chunk Client");
    }
    this.ai = new GoogleGenAI({ apiKey });
    this.model = options.model || "gemini-3.8-flash";
    this.verbose = options.verbose ?? false;

    const winSec = options.windowSeconds || 25;
    const intSec = options.intervalSeconds || 12;

    this.windowBytes = winSec * 32000;
    this.intervalBytes = intSec * 32000;
  }

  public pushAudio(pcmData: Buffer): void {
    this.ringBuffer = Buffer.concat([this.ringBuffer, pcmData]);
    this.bytesSinceLastEval += pcmData.length;

    if (this.ringBuffer.length > this.windowBytes) {
      this.ringBuffer = this.ringBuffer.subarray(this.ringBuffer.length - this.windowBytes);
    }

    if (this.bytesSinceLastEval >= this.intervalBytes && !this.isEvaluating) {
      this.bytesSinceLastEval = 0;
      this.evaluateCurrentBuffer().catch((err) => {
        if (this.verbose) {
          console.warn("[ChunkClient] Evaluation failed:", err.message);
        }
      });
    }
  }

  private async evaluateCurrentBuffer(): Promise<void> {
    if (this.ringBuffer.length < 32000 * 5) return;

    this.isEvaluating = true;
    const wavBuffer = pcmToWav(this.ringBuffer, 16000, 1);
    const base64Audio = wavBuffer.toString("base64");

    const promptText = `You are a real-time trading stream analyzer.
Listen to this ${Math.round(this.ringBuffer.length / 32000)}s audio clip from a financial trading livestream.
Determine if the streamer actively entered, planned an order for, updated SL/TP for, or closed a trade in this clip.

RULES:
- If NO trade action occurred in this clip, return has_trade_action = false and action = "NONE".
- Ignore past recaps ("Yesterday's trade...") or hypothetical general remarks.
- Output MUST be valid JSON strictly matching this schema:
{
  "has_trade_action": boolean,
  "action": "NEW_ENTRY" | "PENDING_ORDER" | "SL_TP_UPDATE" | "EXIT" | "NONE",
  "symbol": string or null,
  "side": "LONG" | "SHORT" | null,
  "entry_price": string or null,
  "stop_loss": string or null,
  "take_profit": string or null,
  "risk_reward": string or null,
  "rationale": string or null,
  "confidence": "HIGH" | "MEDIUM" | "LOW",
  "verbatim_quote": string or null
}`;

    try {
      const response = await this.ai.models.generateContent({
        model: this.model,
        contents: [
          {
            role: "user",
            parts: [
              { inlineData: { mimeType: "audio/wav", data: base64Audio } },
              { text: promptText },
            ],
          },
        ],
        config: {
          responseMimeType: "application/json",
        },
      });

      const responseText = response.text?.trim() || "";
      if (!responseText) return;

      const raw = JSON.parse(responseText);
      if (!raw.has_trade_action || raw.action === "NONE") return;

      const signal: LiveTradeSignal = {
        symbol: raw.symbol ? String(raw.symbol).toUpperCase() : "UNKNOWN",
        side: raw.side === "LONG" || raw.side === "SHORT" ? raw.side : null,
        action: raw.action,
        entry_price: raw.entry_price || undefined,
        stop_loss: raw.stop_loss || undefined,
        take_profit: raw.take_profit || undefined,
        risk_reward: raw.risk_reward || undefined,
        rationale: raw.rationale || undefined,
        confidence: raw.confidence || "MEDIUM",
        verbatim_quote: raw.verbatim_quote || undefined,
        detected_at: new Date().toISOString(),
      };

      const validated = LiveTradeSignalSchema.safeParse(signal);
      if (validated.success) {
        this.emit("signal", validated.data);
      }
    } finally {
      this.isEvaluating = false;
    }
  }

  public reset(): void {
    this.ringBuffer = Buffer.alloc(0);
    this.bytesSinceLastEval = 0;
    this.isEvaluating = false;
  }
}
