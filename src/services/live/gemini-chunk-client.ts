import { GoogleGenAI } from "@google/genai";
import { EventEmitter } from "events";
import { pcmToWav } from "./audio-tap.js";
import { LiveTradeSignal, LiveTradeSignalSchema } from "../../types/live-alert.js";

export interface ChunkClientOptions {
  apiKey?: string;
  model?: string;
  windowSeconds?: number;   // Length of audio buffer (e.g. 20s)
  intervalSeconds?: number; // How often to evaluate (e.g. 10s)
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
  private recentContextNotes: string[] = [];

  constructor(options: ChunkClientOptions = {}) {
    super();
    const apiKey = options.apiKey || process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error("GEMINI_API_KEY is required for Gemini Chunk Client");
    }
    this.ai = new GoogleGenAI({ apiKey });
    // Default to Gemini 3.8 Flash
    this.model = options.model || "gemini-3.8-flash";
    this.verbose = options.verbose ?? false;

    const winSec = options.windowSeconds || 25;
    const intSec = options.intervalSeconds || 12;

    // 16kHz * 2 bytes/sample = 32000 bytes per second
    this.windowBytes = winSec * 32000;
    this.intervalBytes = intSec * 32000;
  }

  /**
   * Pushes incoming PCM bytes into the rolling ring buffer.
   */
  public pushAudio(pcmData: Buffer): void {
    this.ringBuffer = Buffer.concat([this.ringBuffer, pcmData]);
    this.bytesSinceLastEval += pcmData.length;

    // Maintain max buffer length (sliding window)
    if (this.ringBuffer.length > this.windowBytes) {
      this.ringBuffer = this.ringBuffer.subarray(this.ringBuffer.length - this.windowBytes);
    }

    // Trigger evaluation once interval threshold is reached
    if (this.bytesSinceLastEval >= this.intervalBytes && !this.isEvaluating) {
      this.bytesSinceLastEval = 0;
      this.evaluateCurrentBuffer().catch((err) => {
        if (this.verbose) {
          console.warn("[ChunkClient] Evaluation failed:", err.message);
        }
      });
    }
  }

  /**
   * Evaluates the current audio window buffer with Gemini Flash.
   */
  private async evaluateCurrentBuffer(): Promise<void> {
    if (this.ringBuffer.length < 32000 * 5) {
      // Need at least 5 seconds of audio
      return;
    }

    this.isEvaluating = true;
    const wavBuffer = pcmToWav(this.ringBuffer, 16000, 1);
    const base64Audio = wavBuffer.toString("base64");

    const contextPrefix = this.recentContextNotes.length > 0
      ? `Recently discussed context in this stream:\n${this.recentContextNotes.slice(-3).join("\n")}\n\n`
      : "";

    const promptText = `${contextPrefix}You are a real-time trading stream analyzer.
Listen to this ${Math.round(this.ringBuffer.length / 32000)}s audio clip from a financial trading livestream.
Determine if the streamer actively entered, planned an order for, updated SL/TP for, or closed a trade in this clip.

RULES:
- If NO trade action occurred in this clip, return has_trade_action = false and action = "NONE".
- Ignore past recaps ("Yesterday's trade...") or hypothetical general remarks.
- If the streamer enters without restating the symbol (e.g. "I'm entering now!"), use the recent context if clear.
- Output MUST be valid JSON strictly matching this schema:
{
  "has_trade_action": boolean,
  "action": "NEW_ENTRY" | "PENDING_ORDER" | "SL_TP_UPDATE" | "EXIT" | "NONE",
  "symbol": string or null,
  "side": "LONG" | "SHORT" | null,
  "entry_price": string or null,
  "stop_loss": string or null,
  "take_profit": string or null,
  "rationale": string or null,
  "confidence": "HIGH" | "MEDIUM" | "LOW",
  "verbatim_quote": string or null
}`;

    try {
      if (this.verbose) {
        console.log(`[ChunkClient] Submitting ${Math.round(wavBuffer.length / 1024)} KB audio to ${this.model}...`);
      }

      const response = await this.ai.models.generateContent({
        model: this.model,
        contents: [
          {
            role: "user",
            parts: [
              {
                inlineData: {
                  mimeType: "audio/wav",
                  data: base64Audio,
                },
              },
              { text: promptText },
            ],
          },
        ],
        config: {
          responseMimeType: "application/json",
        },
      });

      const raw = response.text || "";
      let cleaned = raw.trim();
      if (cleaned.startsWith("```")) {
        cleaned = cleaned.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
      }

      const parsed = JSON.parse(cleaned);

      if (parsed.has_trade_action && parsed.symbol && parsed.confidence !== "LOW") {
        const signal: LiveTradeSignal = {
          symbol: String(parsed.symbol).toUpperCase(),
          side: parsed.side === "LONG" || parsed.side === "SHORT" ? parsed.side : null,
          action: parsed.action || "NEW_ENTRY",
          entry_price: parsed.entry_price || undefined,
          stop_loss: parsed.stop_loss || undefined,
          take_profit: parsed.take_profit || undefined,
          rationale: parsed.rationale || undefined,
          confidence: parsed.confidence || "HIGH",
          verbatim_quote: parsed.verbatim_quote || undefined,
          detected_at: new Date().toISOString(),
        };

        // Cache brief context note for subsequent chunks
        this.recentContextNotes.push(`[${new Date().toLocaleTimeString()}] Active trade on ${signal.symbol} (${signal.side}): ${signal.rationale || signal.verbatim_quote || ""}`);
        if (this.recentContextNotes.length > 5) this.recentContextNotes.shift();

        this.emit("signal", signal);
      }
    } catch (err: any) {
      this.emit("error", err);
    } finally {
      this.isEvaluating = false;
    }
  }

  public reset(): void {
    this.ringBuffer = Buffer.alloc(0);
    this.bytesSinceLastEval = 0;
    this.isEvaluating = false;
    this.recentContextNotes = [];
  }
}
