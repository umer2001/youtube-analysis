import { LiveTradeSignal } from "../../types/live-alert.js";
import { DeduplicationDecision } from "../live/state-manager.js";
import { PushoverChannel } from "./pushover-channel.js";
import { TelegramChannel } from "./telegram-channel.js";
import { TerminalChannel } from "./terminal-channel.js";
import {
  DispatcherOptions,
  NotificationChannel,
  NotificationResult,
  TradeAlertPayload,
} from "./types.js";

export * from "./types.js";
export * from "./pushover-channel.js";
export * from "./telegram-channel.js";
export * from "./terminal-channel.js";

/**
 * Enterprise Alert Dispatcher.
 * Coordinates multi-channel notifications (Terminal, Pushover, Telegram) with
 * concurrent dispatch, deduplication rules, and fault isolation.
 */
export class LiveAlertDispatcher {
  private channels: NotificationChannel[] = [];
  private channelTitle: string;
  private streamUrl?: string;

  constructor(options: DispatcherOptions = {}) {
    this.channelTitle = options.channelTitle || "Live Streamer";
    this.streamUrl = options.streamUrl;

    // 1. Terminal Channel (Always active)
    this.channels.push(new TerminalChannel());

    // 2. Pushover Channel (Mobile Push, Apple Watch, Desktop)
    const pushoverConfig = options.pushover || {
      userKey: options.pushoverUserKey,
      appToken: options.pushoverAppToken,
      device: options.pushoverDevice,
      priority: options.pushoverPriority,
      emergency: options.pushoverEmergency,
    };
    const pushoverChannel = new PushoverChannel(pushoverConfig);
    if (pushoverChannel.isEnabled()) {
      this.channels.push(pushoverChannel);
    }

    // 3. Telegram Channel
    const telegramConfig = options.telegram || {
      botToken: options.telegramToken,
      chatId: options.telegramChatId,
    };
    const telegramChannel = new TelegramChannel(telegramConfig);
    if (telegramChannel.isEnabled()) {
      this.channels.push(telegramChannel);
    }
  }

  /**
   * Registers a new custom notification channel (e.g. Discord, Webhook, SMS).
   */
  public registerChannel(channel: NotificationChannel): void {
    this.channels.push(channel);
  }

  /**
   * Returns all active notification channels.
   */
  public getActiveChannels(): string[] {
    return this.channels.filter((c) => c.isEnabled()).map((c) => c.name);
  }

  /**
   * Dispatches the trade alert across all registered and enabled channels concurrently.
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

    // Filter channels: Terminal logs everything (including suppressed duplicates),
    // but remote push channels (Pushover, Telegram) only fire if decision.shouldAlert is true.
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
      const channelName = targetChannels[index].name;
      if (res.status === "fulfilled") {
        outcomes.push(res.value);
      } else {
        outcomes.push({
          channel: channelName,
          success: false,
          error: res.reason?.message || "Unknown error",
        });
      }
    });

    return outcomes;
  }
}
