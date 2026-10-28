import { GoogleGenAI, Type, Modality } from "@google/genai";
import { EventEmitter } from "events";
import { LiveTradeSignal } from "../types.js";

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
  private readonly chunkSize: number = 32000;
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
    this.model = options.model || "gemini-3.8-live";
    this.verbose = options.verbose ?? false;
  }

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
If the streamer does not explicitly state the asset/ticker name, set symbol="UNKNOWN" or infer it from price context. DO NOT skip calling the tool!
If stop loss or take profit is not mentioned, leave them null.
Common Hindi/Urdu trading slang:
- 'short ho raha hoon' / 'sell karenge' -> action="NEW_ENTRY", side="SHORT"
- 'buy karenge' / 'long ja rahe hain' -> action="NEW_ENTRY", side="LONG"
- 'TP hit ho gaya' / 'profit book kar lo' -> action="EXIT" or "SL_TP_UPDATE"
- 'break-even kar lo' / 'cost pe le aao' -> action="SL_TP_UPDATE"
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
                  "Asset/symbol (e.g., Gold, XAUUSD, NQ, BTC, ES, EURUSD). If not explicitly spoken, set to 'UNKNOWN'.",
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

          if (e?.code === 1008 || (e?.reason && String(e.reason).toLowerCase().includes("expired"))) {
            this.resumptionHandle = undefined;
          }

          if (!this.isManuallyClosed && !this.isReconnecting) {
            console.log(`[GeminiLive] Reconnecting session in 2s (server closed code: ${e?.code})...`);
            await this.reconnect();
          }
        },
      },
    });
  }

  public async reconnect(): Promise<void> {
    if (this.isReconnecting || this.isManuallyClosed) return;
    this.isReconnecting = true;

    try {
      await new Promise((r) => setTimeout(r, 2000));
      await this.connect();
      console.log(`[GeminiLive] Reconnected successfully.`);
    } catch {
      this.resumptionHandle = undefined;
      try {
        await new Promise((r) => setTimeout(r, 1000));
        await this.connect();
      } catch {
        setTimeout(() => {
          this.isReconnecting = false;
          this.reconnect();
        }, 5000);
        return;
      }
    }
    this.isReconnecting = false;
  }

  public pushAudio(pcmData: Buffer): void {
    this.pcmAccumulator = Buffer.concat([this.pcmAccumulator, pcmData]);

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

  private handleServerMessage(msg: any): void {
    if (msg?.sessionResumptionUpdate?.newHandle) {
      this.resumptionHandle = msg.sessionResumptionUpdate.newHandle;
    }

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
            // ignore
          }
        }
      }
    }
  }

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
