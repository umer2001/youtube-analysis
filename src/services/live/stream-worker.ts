import { EventEmitter } from "events";
import { AudioTap, AudioTapOptions } from "./audio-tap.js";
import { GeminiLiveClient } from "./gemini-live-client.js";
import { GeminiChunkClient } from "./gemini-chunk-client.js";
import { LiveTradeStateManager, DeduplicationDecision } from "./state-manager.js";
import {
  LiveAlertDispatcher,
  PushoverConfig,
  TelegramConfig,
} from "../notifications/alert-dispatcher.js";
import { LiveTradeSignal } from "../../types/live-alert.js";
import { getSupabaseClient } from "../../db/supabase.js";
import { TradeItem } from "../../types/trade.js";

export type WorkerStatus =
  | "idle"
  | "resolving"
  | "connecting"
  | "streaming"
  | "ended"
  | "error";

export interface LiveWorkerOptions {
  streamUrl: string;
  videoId?: string;
  channelId?: string;
  channelTitle?: string;
  streamTitle?: string;
  streamDbId?: string;
  mode?: "live" | "chunk";
  model?: string;
  verbose?: boolean;
  pushover?: PushoverConfig;
  telegram?: TelegramConfig;
  cookiesFromBrowser?: string;
  cookiesFile?: string;
  persistTradesToDb?: boolean;
  debounceWindowMinutes?: number;
}

export interface WorkerMetrics {
  status: WorkerStatus;
  videoId?: string;
  channelTitle: string;
  streamUrl: string;
  uptimeSeconds: number;
  totalBytesIngested: number;
  megabytesIngested: number;
  signalsDetected: number;
  lastSignalAt: string | null;
  errorMessage: string | null;
}

/**
 * Productionized Worker that manages live stream audio tapping, Gemini AI inference,
 * trade deduplication, notification dispatching, and optional Supabase persistence.
 */
export class LiveStreamWorker extends EventEmitter {
  private readonly options: LiveWorkerOptions;
  private audioTap: AudioTap | null = null;
  private liveClient: GeminiLiveClient | null = null;
  private chunkClient: GeminiChunkClient | null = null;
  private stateManager: LiveTradeStateManager;
  private dispatcher: LiveAlertDispatcher;

  private status: WorkerStatus = "idle";
  private startTime: number | null = null;
  private totalBytesIngested = 0;
  private signalsDetected = 0;
  private lastSignalAt: string | null = null;
  private errorMessage: string | null = null;
  private isStopping = false;

  constructor(options: LiveWorkerOptions) {
    super();
    this.options = {
      mode: "live",
      verbose: false,
      persistTradesToDb: false,
      debounceWindowMinutes: 15,
      ...options,
    };

    this.stateManager = new LiveTradeStateManager(this.options.debounceWindowMinutes);
    this.dispatcher = new LiveAlertDispatcher({
      streamUrl: this.options.streamUrl,
      channelTitle: this.options.channelTitle || "Live Streamer",
      pushover: this.options.pushover,
      telegram: this.options.telegram,
    });
  }

  /**
   * Starts live ingestion and inference for the stream.
   */
  public async start(): Promise<void> {
    if (this.status !== "idle" && this.status !== "ended") {
      throw new Error(`Cannot start worker in status: ${this.status}`);
    }

    this.isStopping = false;
    this.errorMessage = null;
    this.startTime = Date.now();
    this.totalBytesIngested = 0;
    this.signalsDetected = 0;

    try {
      this.setStatus("resolving");
      if (this.options.verbose) {
        console.log(`[LiveStreamWorker] Resolving media stream URL for: ${this.options.streamUrl}`);
      }

      const tapOptions: AudioTapOptions = {
        sampleRate: 16000,
        channels: 1,
        livePacing: true,
        verbose: this.options.verbose,
      };
      this.audioTap = new AudioTap(tapOptions);

      const streamMediaUrl = await this.audioTap.resolveStreamUrl(this.options.streamUrl, {
        cookiesFromBrowser: this.options.cookiesFromBrowser,
        cookiesFile: this.options.cookiesFile,
      });

      this.setStatus("connecting");

      if (this.options.mode === "live") {
        this.liveClient = new GeminiLiveClient({
          model: this.options.model,
          verbose: this.options.verbose,
        });

        this.liveClient.on("signal", (signal: LiveTradeSignal) => this.handleSignal(signal));
        this.liveClient.on("error", (err: any) => {
          this.emit("warn", `GeminiLive: ${err.message || err}`);
        });
        this.liveClient.on("closed", (code: number, reason: string) => {
          if (this.options.verbose) {
            console.log(`[LiveStreamWorker] GeminiLive connection closed (${code}): ${reason}`);
          }
        });

        await this.liveClient.connect();
      } else {
        this.chunkClient = new GeminiChunkClient({
          model: this.options.model,
          verbose: this.options.verbose,
        });

        this.chunkClient.on("signal", (signal: LiveTradeSignal) => this.handleSignal(signal));
        this.chunkClient.on("error", (err: any) => {
          this.emit("warn", `GeminiChunk: ${err.message || err}`);
        });
      }

      // Route audio bytes to AI client
      this.audioTap.on("data", (chunk: Buffer) => {
        this.totalBytesIngested += chunk.length;
        if (this.liveClient && this.liveClient.ready) {
          this.liveClient.pushAudio(chunk);
        } else if (this.chunkClient) {
          this.chunkClient.pushAudio(chunk);
        }
      });

      this.audioTap.on("stopped", (code: number, bytes: number) => {
        if (this.options.verbose) {
          console.log(`[LiveStreamWorker] AudioTap stopped (code: ${code}, bytes: ${bytes})`);
        }
        if (!this.isStopping) {
          this.stop("Stream finished / AudioTap closed");
        }
      });

      this.audioTap.on("error", (err: any) => {
        const msg = err.message || String(err);
        this.errorMessage = msg;
        this.emit("error", err);
        this.stop(`AudioTap error: ${msg}`);
      });

      this.setStatus("streaming");
      this.audioTap.start(streamMediaUrl);
    } catch (err: any) {
      const msg = err.message || String(err);
      this.errorMessage = msg;
      this.setStatus("error");
      this.cleanup();
      this.emit("error", err);
      throw err;
    }
  }

  /**
   * Processes a live signal detected by Gemini.
   */
  private async handleSignal(signal: LiveTradeSignal): Promise<void> {
    this.signalsDetected++;
    this.lastSignalAt = new Date().toISOString();

    const decision = this.stateManager.processSignal(signal);
    this.emit("signal", signal, decision);

    // Dispatch notification (Pushover, Telegram, Terminal)
    await this.dispatcher.dispatch(signal, decision);

    // Persist to Supabase if requested and actionable
    if (
      this.options.persistTradesToDb &&
      decision.shouldAlert &&
      this.options.channelId &&
      this.options.streamDbId
    ) {
      this.saveTradeToDb(signal, decision).catch((err) => {
        if (this.options.verbose) {
          console.warn("[LiveStreamWorker] Failed to persist trade to DB:", err.message);
        }
      });
    }
  }

  /**
   * Saves actionable live trade signal into the Supabase trades table.
   */
  private async saveTradeToDb(
    signal: LiveTradeSignal,
    decision: DeduplicationDecision
  ): Promise<void> {
    const streamDbId = this.options.streamDbId;
    const channelId = this.options.channelId;
    if (!streamDbId || !channelId) return;

    try {
      const supabase = getSupabaseClient();
      const timestamp = signal.detected_at || new Date().toISOString();
      const rawTradeItem: TradeItem = {
        symbol: signal.symbol,
        side: (signal.side as "LONG" | "SHORT") || "LONG",
        result: decision.alertType === "EXIT" ? "TP" : "UNKNOWN",
        entry_price: signal.entry_price,
        exit_price: undefined,
        important_timestamps: [timestamp],
        notes: `[Live Detected] Action: ${signal.action}. Quote: "${signal.verbatim_quote || ""}" - Rationale: ${signal.rationale || ""}`,
      };

      await supabase.from("trades").insert({
        stream_id: streamDbId,
        channel_id: channelId,
        symbol: signal.symbol,
        side: (signal.side as "LONG" | "SHORT") || "LONG",
        result: decision.alertType === "EXIT" ? "TP" : "UNKNOWN",
        entry_price: signal.entry_price || null,
        exit_price: null,
        important_timestamps: [timestamp],
        notes: rawTradeItem.notes || null,
        raw_data: rawTradeItem as any,
      });
    } catch (err: any) {
      if (this.options.verbose) {
        console.warn(`[LiveStreamWorker] Database trade insert error: ${err.message}`);
      }
    }
  }

  /**
   * Gracefully stops the worker session.
   */
  public stop(reason = "Stopped"): void {
    if (this.isStopping) return;
    this.isStopping = true;

    this.cleanup();
    this.setStatus("ended");
    this.emit("ended", reason, this.getMetrics());
  }

  private cleanup(): void {
    if (this.audioTap) {
      try {
        this.audioTap.stop();
      } catch {
        // ignore
      }
      this.audioTap = null;
    }

    if (this.liveClient) {
      try {
        this.liveClient.close();
      } catch {
        // ignore
      }
      this.liveClient = null;
    }

    if (this.chunkClient) {
      try {
        this.chunkClient.reset();
      } catch {
        // ignore
      }
      this.chunkClient = null;
    }
  }

  private setStatus(newStatus: WorkerStatus): void {
    if (this.status !== newStatus) {
      this.status = newStatus;
      this.emit("status", newStatus);
    }
  }

  public getStatus(): WorkerStatus {
    return this.status;
  }

  public getMetrics(): WorkerMetrics {
    const uptime = this.startTime ? Math.round((Date.now() - this.startTime) / 1000) : 0;
    return {
      status: this.status,
      videoId: this.options.videoId,
      channelTitle: this.options.channelTitle || "Live Streamer",
      streamUrl: this.options.streamUrl,
      uptimeSeconds: uptime,
      totalBytesIngested: this.totalBytesIngested,
      megabytesIngested: Number((this.totalBytesIngested / (1024 * 1024)).toFixed(2)),
      signalsDetected: this.signalsDetected,
      lastSignalAt: this.lastSignalAt,
      errorMessage: this.errorMessage,
    };
  }
}
