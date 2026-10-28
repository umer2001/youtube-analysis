import { DeduplicationDecision, LiveTradeSignal } from "../../types.js";
import { PushoverChannel } from "./pushover-channel.js";
import { TelegramChannel } from "./telegram-channel.js";
import { TerminalChannel } from "./terminal-channel.js";
import {
  DispatcherOptions,
  NotificationChannel,
  NotificationResult,
  TradeAlertPayload,
  StreamOnlinePayload,
} from "./types.js";

export * from "./types.js";
export * from "./pushover-channel.js";
export * from "./telegram-channel.js";
export * from "./terminal-channel.js";

/**
 * Enterprise Alert Dispatcher for live streams.
 */
export class LiveAlertDispatcher {
  private channels: NotificationChannel[] = [];
  private channelTitle: string;
  private streamUrl?: string;

  constructor(options: DispatcherOptions = {}) {
    this.channelTitle = options.channelTitle || "Live Streamer";
    this.streamUrl = options.streamUrl;

    // Terminal Channel (Always active)
    this.channels.push(new TerminalChannel());

    // Pushover Channel
    const pushoverChannel = new PushoverChannel(options.pushover || {});
    if (pushoverChannel.isEnabled()) {
      this.channels.push(pushoverChannel);
    }

    // Telegram Channel
    const telegramChannel = new TelegramChannel(options.telegram || {});
    if (telegramChannel.isEnabled()) {
      this.channels.push(telegramChannel);
    }
  }

  public registerChannel(channel: NotificationChannel): void {
    this.channels.push(channel);
  }

  public getActiveChannels(): string[] {
    return this.channels.filter((c) => c.isEnabled()).map((c) => c.name);
  }

  /**
   * Dispatches trade alert across registered channels.
   */
  public async dispatch(
    signal: LiveTradeSignal,
    decision: DeduplicationDecision
  ): Promise<NotificationResult[]> {
    const payload: TradeAlertPayload = {
      signal,
      decision,
      channelTitle: this.channelTitle,
      streamUrl: this.streamUrl,
    };

    const targetChannels = this.channels.filter((channel) => {
      if (!channel.isEnabled()) return false;
      if (channel.name === "Terminal") return true;
      return decision.shouldAlert;
    });

    const results = await Promise.allSettled(
      targetChannels.map((channel) => channel.send(payload))
    );

    const outcomes: NotificationResult[] = [];
    results.forEach((res, index) => {
      if (res.status === "fulfilled") {
        outcomes.push(res.value);
      } else {
        outcomes.push({
          channel: targetChannels[index]?.name || "Unknown",
          success: false,
          error: res.reason?.message || String(res.reason),
        });
      }
    });

    return outcomes;
  }

  /**
   * Dispatches a notification that a streamer has gone LIVE.
   */
  public async dispatchStreamOnline(payload: StreamOnlinePayload): Promise<NotificationResult[]> {
    const targetChannels = this.channels.filter((c) => c.isEnabled() && typeof c.sendStreamOnline === "function");
    const results = await Promise.allSettled(
      targetChannels.map((channel) => channel.sendStreamOnline!(payload))
    );

    const outcomes: NotificationResult[] = [];
    results.forEach((res, index) => {
      if (res.status === "fulfilled") {
        outcomes.push(res.value);
      } else {
        outcomes.push({
          channel: targetChannels[index]?.name || "Unknown",
          success: false,
          error: res.reason?.message || String(res.reason),
        });
      }
    });

    return outcomes;
  }
}
