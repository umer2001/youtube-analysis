import { ServerConfig } from "./config.js";
import { ChannelLivePoller } from "./poller.js";
import { LiveStreamWorker } from "./services/stream-worker.js";
import { LiveAlertDispatcher } from "./services/notifications/alert-dispatcher.js";
import { getActiveChannels } from "./db.js";
import { ChannelRecord, LiveStreamCandidate, WorkerMetrics } from "./types.js";

export class StreamSupervisor {
  private readonly config: ServerConfig;
  private readonly poller: ChannelLivePoller;
  private readonly globalDispatcher: LiveAlertDispatcher;
  private readonly activeWorkers: Map<string, LiveStreamWorker> = new Map();
  private pollTimer: NodeJS.Timeout | null = null;
  private isPolling = false;
  private isShuttingDown = false;
  private lastPollAt: string | null = null;
  private totalStreamsMonitored = 0;

  constructor(config: ServerConfig) {
    this.config = config;
    this.poller = new ChannelLivePoller(config.youtubeApiKey, config.verbose);
    this.globalDispatcher = new LiveAlertDispatcher({
      pushover: {
        userKey: config.pushoverUserKey,
        appToken: config.pushoverAppToken,
        device: config.pushoverDevice,
        priority: config.pushoverPriority,
        emergency: config.pushoverEmergency,
        sound: config.pushoverSound,
      },
      telegram: {
        botToken: config.telegramBotToken,
        chatId: config.telegramChatId,
      },
    });
  }

  /**
   * Starts periodic polling of active channels.
   */
  public start(): void {
    if (this.pollTimer) return;
    this.isShuttingDown = false;

    console.log(
      `\x1b[32m[Supervisor] Started stream monitor engine (Poll interval: ${this.config.pollIntervalSeconds}s | Concurrency limit: ${this.config.maxConcurrentStreams} | DB: READ-ONLY)\x1b[0m`
    );

    // Initial check immediately
    this.pollCycle().catch((err) => {
      console.error("[Supervisor] Initial poll cycle error:", err.message);
    });

    // Recurring interval
    this.pollTimer = setInterval(() => {
      this.pollCycle().catch((err) => {
        console.error("[Supervisor] Poll cycle error:", err.message);
      });
    }, this.config.pollIntervalSeconds * 1000);
  }

  /**
   * Executes a single channel polling cycle (strictly reads active channels from DB).
   */
  public async pollCycle(): Promise<void> {
    if (this.isPolling || this.isShuttingDown) return;
    this.isPolling = true;
    this.lastPollAt = new Date().toISOString();

    try {
      const channels = await getActiveChannels();
      if (this.config.verbose) {
        console.log(`[Supervisor] Checking ${channels.length} active channels for live broadcasts...`);
      }

      for (const channel of channels) {
        if (this.isShuttingDown) break;

        // Skip channel if we are already monitoring a live stream for it
        const alreadyMonitoringChannel = Array.from(this.activeWorkers.values()).some(
          (w) => w.options.channelDbId === channel.id
        );
        if (alreadyMonitoringChannel) {
          continue;
        }

        try {
          const liveCandidate = await this.poller.checkForLiveStream(channel);
          if (liveCandidate) {
            this.handleDiscoveredLiveStream(channel, liveCandidate);
          }
        } catch (err: any) {
          if (this.config.verbose) {
            console.warn(`[Supervisor] Error checking channel ${channel.title || channel.channel_url}: ${err.message}`);
          }
        }
      }
    } catch (err: any) {
      console.error("[Supervisor] Failed to query active channels:", err.message);
    } finally {
      this.isPolling = false;
    }
  }

  /**
   * Spawns a dedicated worker for a detected live stream.
   * Performs zero database writes.
   */
  private handleDiscoveredLiveStream(
    channel: ChannelRecord,
    candidate: LiveStreamCandidate
  ): void {
    const { videoId, streamUrl, title } = candidate;

    // Check if worker already exists for this videoId
    if (this.activeWorkers.has(videoId)) {
      return;
    }

    // Check concurrency limit
    if (this.activeWorkers.size >= this.config.maxConcurrentStreams) {
      console.warn(
        `\x1b[33m[Supervisor Warning] Reached max concurrent streams (${this.config.maxConcurrentStreams}). Skipping stream ${videoId} (${title})\x1b[0m`
      );
      return;
    }

    console.log(
      `\n\x1b[36m============================================================\x1b[0m`
    );
    console.log(
      `\x1b[32m[Supervisor] DISCOVERED LIVE STREAM: "${title}" by ${channel.title || "Streamer"}\x1b[0m`
    );
    console.log(`  Video ID:   ${videoId}`);
    console.log(`  Stream URL: ${streamUrl}`);
    console.log(
      `\x1b[36m============================================================\x1b[0m\n`
    );

    // 1. Dispatch Stream Online notification (Pushover, Telegram)
    this.globalDispatcher
      .dispatchStreamOnline({
        channelTitle: channel.title || "Live Streamer",
        streamTitle: title,
        streamUrl,
      })
      .catch((err) => {
        console.warn("[Supervisor] Failed to dispatch stream online notification:", err.message);
      });

    // 2. Spawn and configure LiveStreamWorker
    const worker = new LiveStreamWorker({
      streamUrl,
      videoId,
      channelDbId: channel.id,
      channelTitle: channel.title || "Live Streamer",
      streamTitle: title,
      mode: "live",
      model: this.config.geminiModel,
      verbose: this.config.verbose,
      pushover: {
        userKey: this.config.pushoverUserKey,
        appToken: this.config.pushoverAppToken,
        device: this.config.pushoverDevice,
        priority: this.config.pushoverPriority,
        emergency: this.config.pushoverEmergency,
        sound: this.config.pushoverSound,
      },
      telegram: {
        botToken: this.config.telegramBotToken,
        chatId: this.config.telegramChatId,
      },
      cookiesFile: this.config.cookiesFile,
      debounceMinutes: this.config.debounceMinutes,
    });

    this.activeWorkers.set(videoId, worker);
    this.totalStreamsMonitored++;

    worker.on("status", (status) => {
      console.log(`[Worker:${videoId}] Status changed -> ${status.toUpperCase()}`);
    });

    worker.on("ended", (reason, metrics) => {
      console.log(
        `\x1b[33m[Worker:${videoId}] Stream ended: ${reason} (Uptime: ${metrics.uptimeSeconds}s | Audio: ${metrics.megabytesIngested}MB | Signals: ${metrics.signalsDetected})\x1b[0m`
      );
      this.activeWorkers.delete(videoId);
    });

    worker.on("error", (err) => {
      console.error(`\x1b[31m[Worker:${videoId} Error]\x1b[0m ${err.message}`);
      this.activeWorkers.delete(videoId);
    });

    // Start worker asynchronously
    worker.start().catch((err) => {
      console.error(`[Worker:${videoId} Failed to start]:`, err.message);
      this.activeWorkers.delete(videoId);
    });
  }

  /**
   * Gracefully shuts down the supervisor and all running stream workers.
   */
  public async shutdown(): Promise<void> {
    if (this.isShuttingDown) return;
    this.isShuttingDown = true;

    console.log("\n[Supervisor] Shutting down stream supervisor...");
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }

    const workers = Array.from(this.activeWorkers.values());
    for (const worker of workers) {
      try {
        worker.stop("Supervisor Shutdown");
      } catch {
        // ignore
      }
    }
    this.activeWorkers.clear();
    console.log("[Supervisor] Shutdown complete.");
  }

  /**
   * Returns current supervisor health and active stream metrics.
   */
  public getStatus(): {
    isHealthy: boolean;
    uptimeSeconds: number;
    activeWorkersCount: number;
    totalStreamsMonitored: number;
    lastPollAt: string | null;
    workers: WorkerMetrics[];
  } {
    const workers = Array.from(this.activeWorkers.values()).map((w) => w.getMetrics());
    return {
      isHealthy: true,
      uptimeSeconds: Math.round(process.uptime()),
      activeWorkersCount: this.activeWorkers.size,
      totalStreamsMonitored: this.totalStreamsMonitored,
      lastPollAt: this.lastPollAt,
      workers,
    };
  }
}
