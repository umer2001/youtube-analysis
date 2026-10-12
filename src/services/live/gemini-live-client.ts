import { GoogleGenAI, Type, Modality } from "@google/genai";
import { EventEmitter } from "events";
import { LiveTradeSignal } from "../../types/live-alert.js";

export interface GeminiLiveOptions {
  apiKey?: string;
  model?: string;
  verbose?: boolean;
}

export class GeminiLiveClient extends EventEmitter {
  private ai: GoogleGenAI;
  private session: any = null;
  private isConnected = false;
  private model: string;
  private verbose: boolean;
  private pcmAccumulator: Buffer = Buffer.alloc(0);
  private readonly chunkSize: number = 32000; // ~1 second of 16kHz 16-bit mono PCM
  private isManuallyClosed = false;
  private isReconnecting = false;
  private resumptionHandle?: string;

  constructor(options: GeminiLiveOptions = {}) {
    super();
    const apiKey = options.apiKey || process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error("GEMINI_API_KEY is required for Gemini Multimodal Live API");
    }
    this.ai = new GoogleGenAI({ apiKey });
    // Default to Gemini 3.8 Live
    this.model = options.model || "gemini-3.8-live";
    this.verbose = options.verbose ?? false;
  }

  /**
   * Connects to the Gemini Multimodal Live WebSocket session.
   */
  public async connect(): Promise<void> {
    if (this.session) {
      try {
        this.session.close();
      } catch {
        // ignore
      }
      this.session = null;
      this.isConnected = false;
    }

    const systemInstruction = `You are an automated real-time financial market live-stream trade alert bot.
Listen carefully to the audio stream.
CRITICAL: When the speaker takes, announces, executes, or plans any trade, or says they are going short or long (e.g. 'short ho raha hoon', 'buying here', 'taking short', 'going long', 'entering here', 'SL hit', 'TP hit'), you MUST IMMEDIATELY call the report_live_trade_signal tool!
Do NOT hesitate! Do NOT wait for more details!
If the streamer does not explicitly state the asset/ticker name, set symbol="UNKNOWN" or infer it from the price context (e.g. 4230 could be Gold/XAUUSD or S&P 500). DO NOT skip calling the tool!
If stop loss or take profit is not mentioned, leave them null.
Common Hindi/Urdu trading slang:
- 'short ho raha hoon' / 'sell karenge' -> action="NEW_ENTRY", side="SHORT"
- 'buy karenge' / 'long ja rahe hain' -> action="NEW_ENTRY", side="LONG"
- 'TP hit ho gaya' / 'profit book kar lo' -> action="EXIT" or "SL_TP_UPDATE"
- 'break-even kar lo' / 'cost pe le aao' -> action="SL_TP_UPDATE"
Keep any spoken audio responses brief and concise (e.g. short acknowledgment of trades or listening status) while focusing on calling report_live_trade_signal!
Always trigger the tool call on any live trade action!`;

    const toolDeclaration = {
      functionDeclarations: [
        {
          name: "report_live_trade_signal",
          description:
            "Report an active live trade entry, planned order, stop-loss update, or exit spoken by the streamer.",
          parameters: {
            type: Type.OBJECT,
            properties: {
              symbol: {
                type: Type.STRING,
                description:
                  "Asset/symbol (e.g., Gold, XAUUSD, NQ, BTC, ES, EURUSD, BankNifty). If not explicitly spoken by the streamer, set to 'UNKNOWN'.",
              },
              side: {
                type: Type.STRING,
                enum: ["LONG", "SHORT"],
                description: "Trade direction",
              },
              action: {
                type: Type.STRING,
                enum: ["NEW_ENTRY", "PENDING_ORDER", "SL_TP_UPDATE", "EXIT"],
                description: "Event type",
              },
              entry_price: { type: Type.STRING, description: "Entry price level" },
              stop_loss: { type: Type.STRING, description: "Stop loss price or pips" },
              take_profit: { type: Type.STRING, description: "Take profit target price" },
              rationale: { type: Type.STRING, description: "Brief rationale or setup concept" },
              confidence: {
                type: Type.STRING,
                enum: ["HIGH", "MEDIUM", "LOW"],
                description: "Confidence that a real trade occurred",
              },
              verbatim_quote: { type: Type.STRING, description: "Exact words spoken" },
            },
            required: ["side", "action"],
          },
        },
      ],
    };

    if (this.verbose) {
      console.log(`[GeminiLive] Connecting to live session with model: ${this.model}`);
    }

    const liveConfig: any = {
      responseModalities: [Modality.AUDIO],
      inputAudioTranscription: {},
      outputAudioTranscription: {},
      contextWindowCompression: {
        slidingWindow: {},
      },
      systemInstruction: {
        parts: [{ text: systemInstruction }],
      },
      tools: [toolDeclaration],
    };

    if (this.resumptionHandle) {
      liveConfig.sessionResumption = { handle: this.resumptionHandle };
      if (this.verbose) {
        console.log(`[GeminiLive] Resuming previous session with handle: ${this.resumptionHandle.slice(0, 15)}...`);
      }
    }

    this.session = await this.ai.live.connect({
      model: this.model,
      config: liveConfig,
      callbacks: {
        onopen: () => {
          this.isConnected = true;
          this.isReconnecting = false;
          this.emit("connected");
          if (this.verbose) {
            console.log("[GeminiLive] WebSocket connected!");
          }
        },
        onmessage: (msg: any) => {
          this.handleServerMessage(msg);
        },
        onerror: (err: any) => {
          this.emit("error", err);
          if (this.verbose) {
            console.error("[GeminiLive] Error:", err);
          }
        },
        onclose: async (e: any) => {
          this.isConnected = false;
          this.emit("closed", e?.code, e?.reason);
          if (this.verbose) {
            console.log(`[GeminiLive] Closed (code ${e?.code}): ${e?.reason || "Normal"}`);
          }

          // If closed with code 1008 (session not found/expired on Google cluster), clear stale handle
          if (e?.code === 1008 || (e?.reason && String(e.reason).toLowerCase().includes("expired"))) {
            if (this.resumptionHandle) {
              console.log(
                `\x1b[33m[GeminiLive] Previous session expired on Google backend. Resetting handle to start fresh session.\x1b[0m`
              );
              this.resumptionHandle = undefined;
            }
          }

          // Auto-reconnect if session closed unexpectedly by Google
          if (!this.isManuallyClosed && !this.isReconnecting) {
            console.log(
              `\x1b[33m[GeminiLive] Session closed by server (code ${e?.code || "1011"}). Auto-reconnecting in 2s...\x1b[0m`
            );
            await this.reconnect();
          }
        },
      },
    });
  }

  /**
   * Reconnects to the Gemini Live session while preserving stream audio.
   */
  public async reconnect(): Promise<void> {
    if (this.isReconnecting || this.isManuallyClosed) return;
    this.isReconnecting = true;

    try {
      await new Promise((r) => setTimeout(r, 2000));
      await this.connect();
      console.log(`\x1b[32m[GeminiLive] Reconnected successfully! Audio stream resumed.\x1b[0m`);
    } catch (err: any) {
      console.warn(`[GeminiLive] Reconnect failed: ${err.message}. Starting fresh session...`);
      this.resumptionHandle = undefined;
      try {
        await new Promise((r) => setTimeout(r, 1000));
        await this.connect();
        console.log(`\x1b[32m[GeminiLive] Fresh session connected successfully! Audio stream resumed.\x1b[0m`);
      } catch (freshErr: any) {
        console.warn(`[GeminiLive] Fresh connect failed: ${freshErr.message}. Retrying in 5s...`);
        setTimeout(() => {
          this.isReconnecting = false;
          this.reconnect();
        }, 5000);
        return;
      }
    }
    this.isReconnecting = false;
  }

  /**
   * Pushes raw PCM audio bytes to the live stream session.
   */
  public pushAudio(pcmData: Buffer): void {
    this.pcmAccumulator = Buffer.concat([this.pcmAccumulator, pcmData]);

    // Keep accumulator bounded during network reconnects (max 5 MB / ~2.5 mins)
    if (this.pcmAccumulator.length > 5 * 1024 * 1024) {
      this.pcmAccumulator = this.pcmAccumulator.subarray(this.pcmAccumulator.length - 5 * 1024 * 1024);
    }

    if (!this.session || !this.isConnected) {
      return;
    }

    while (this.pcmAccumulator.length >= this.chunkSize) {
      const slice = this.pcmAccumulator.subarray(0, this.chunkSize);
      this.pcmAccumulator = this.pcmAccumulator.subarray(this.chunkSize);

      const base64Audio = slice.toString("base64");
      try {
        this.session.sendRealtimeInput({
          audio: {
            data: base64Audio,
            mimeType: "audio/pcm;rate=16000",
          },
        });
      } catch (err: any) {
        if (this.verbose) {
          console.warn("[GeminiLive] Send audio failed:", err.message);
        }
      }
    }
  }

  /**
   * Processes incoming server messages and executes tool responses.
   */
  private handleServerMessage(msg: any): void {
    // Log real-time transcriptions (always shown so the user sees live comprehension)
    const inputTranscription = msg?.serverContent?.inputTranscription?.text;
    if (inputTranscription && inputTranscription.trim().length > 0) {
      console.log(`\x1b[2m[Streamer Spoke]\x1b[0m ${inputTranscription.trim()}`);
    }

    const outputTranscription = msg?.serverContent?.outputTranscription?.text;
    if (outputTranscription && outputTranscription.trim().length > 0) {
      console.log(`\x1b[35m[Gemini Replied]\x1b[0m ${outputTranscription.trim()}`);
    }

    // Track session resumption handle if provided by Gemini
    if (msg?.sessionResumptionUpdate?.newHandle) {
      this.resumptionHandle = msg.sessionResumptionUpdate.newHandle;
    }

    // Check for toolCall
    const functionCalls: any[] = [];
    if (msg?.toolCall?.functionCalls) {
      functionCalls.push(...msg.toolCall.functionCalls);
    }
    if (msg?.serverContent?.modelTurn?.parts) {
      for (const part of msg.serverContent.modelTurn.parts) {
        if (part.functionCall) functionCalls.push(part.functionCall);
      }
    }

    for (const call of functionCalls) {
      if (call.name === "report_live_trade_signal" && call.args) {
        if (this.verbose) {
          console.log(`\x1b[32m[Live Tool Call]\x1b[0m Signal detected: ${JSON.stringify(call.args)}\x1b[0m`);
        }

        const rawSymbol = String(call.args.symbol || "").toUpperCase().trim();
        const rawSide = String(call.args.side || "").toUpperCase().trim();
        const normalizedSide: "LONG" | "SHORT" | null =
          rawSide === "LONG" || rawSide.includes("BUY")
            ? "LONG"
            : rawSide === "SHORT" || rawSide.includes("SELL")
            ? "SHORT"
            : null;

        const rawAction = String(call.args.action || "NEW_ENTRY").toUpperCase().trim();
        const normalizedAction: "NEW_ENTRY" | "PENDING_ORDER" | "SL_TP_UPDATE" | "EXIT" =
          rawAction.includes("EXIT") || rawAction.includes("CLOSE")
            ? "EXIT"
            : rawAction.includes("UPDATE") || rawAction.includes("SL") || rawAction.includes("TP")
            ? "SL_TP_UPDATE"
            : rawAction.includes("PENDING") || rawAction.includes("LIMIT")
            ? "PENDING_ORDER"
            : "NEW_ENTRY";

        const signal: LiveTradeSignal = {
          symbol: rawSymbol.length > 0 && rawSymbol !== "NULL" ? rawSymbol : "UNKNOWN",
          side: normalizedSide,
          action: normalizedAction,
          entry_price: call.args.entry_price ? String(call.args.entry_price) : undefined,
          stop_loss: call.args.stop_loss ? String(call.args.stop_loss) : undefined,
          take_profit: call.args.take_profit ? String(call.args.take_profit) : undefined,
          rationale: call.args.rationale || undefined,
          confidence: (call.args.confidence as any) || "HIGH",
          verbatim_quote: call.args.verbatim_quote || undefined,
          detected_at: new Date().toISOString(),
        };

        this.emit("signal", signal);

        // Acknowledge the tool call to keep the session alive
        if (call.id) {
          try {
            this.session.sendToolResponse({
              functionResponses: [
                {
                  id: call.id,
                  name: call.name,
                  response: { status: "received", recorded_at: new Date().toISOString() },
                },
              ],
            });
          } catch {
            // ignore response send error
          }
        }
      }
    }
  }

  /**
   * Closes the live session.
   */
  public close(): void {
    this.isManuallyClosed = true;
    if (this.session) {
      try {
        this.session.close();
      } catch {
        // ignore
      }
      this.session = null;
      this.isConnected = false;
    }
  }

  public get ready(): boolean {
    return this.isConnected;
  }
}
