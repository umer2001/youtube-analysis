import { EventEmitter } from "events";
import { AudioTap, AudioTapOptions } from "./audio-tap.js";
import { GeminiLiveClient } from "./gemini-live.js";
import { GeminiChunkClient } from "./gemini-chunk.js";
import { LiveTradeStateManager } from "./state-manager.js";
import {
  LiveAlertDispatcher,
  PushoverConfig,
  TelegramConfig,
} from "./notifications/alert-dispatcher.js";
import {
  DeduplicationDecision,
  LiveTradeSignal,
  WorkerMetrics,
  WorkerStatus,
} from "../types.js";

export interface LiveWorkerOptions {
  streamUrl: string;
  videoId: string;
  channelDbId: string;
  channelTitle: string;
  streamTitle?: string;
  mode?: "live" | "chunk";
  model?: string;
  verbose?: boolean;
  pushover?: PushoverConfig;
  telegram?: TelegramConfig;
  cookiesFile?: string;
  debounceMinutes?: number;
}

export class LiveStreamWorker extends EventEmitter {
  public readonly options: LiveWorkerOptions;
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
      debounceMinutes: 15,
      ...options,
    };

    this.stateManager = new LiveTradeStateManager(this.options.debounceMinutes);
    this.dispatcher = new LiveAlertDispatcher({
      streamUrl: this.options.streamUrl,
      channelTitle: this.options.channelTitle,
      pushover: this.options.pushover,
      telegram: this.options.telegram,
    });
  }

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
        console.log(`[Worker:${this.options.videoId}] Resolving stream URL: ${this.options.streamUrl}`);
      }

      const tapOptions: AudioTapOptions = {
        sampleRate: 16000,
        channels: 1,
        livePacing: true,
        verbose: this.options.verbose,
      };
      this.audioTap = new AudioTap(tapOptions);

      const streamMediaUrl = await this.audioTap.resolveStreamUrl(this.options.streamUrl, {
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
          console.log(`[Worker:${this.options.videoId}] AudioTap stopped (code ${code}, bytes ${bytes})`);
        }
        if (!this.isStopping) {
          this.stop("Stream concluded by broadcaster");
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

  private async handleSignal(signal: LiveTradeSignal): Promise<void> {
    this.signalsDetected++;
    this.lastSignalAt = new Date().toISOString();

    const decision = this.stateManager.processSignal(signal);
    this.emit("signal", signal, decision);

    // Dispatch notification (Pushover, Telegram, Terminal)
    await this.dispatcher.dispatch(signal, decision);
  }

  public stop(reason = "Worker Stopped"): void {
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
      channelId: this.options.channelDbId,
      channelTitle: this.options.channelTitle,
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
