import {
  NotificationChannel,
  NotificationResult,
  PushoverConfig,
  TradeAlertPayload,
} from "./types.js";

/**
 * Pushover notification channel.
 * Sends instantaneous, high-priority push notifications to iOS, Android, Desktop, and Smartwatches.
 * https://pushover.net/api
 */
export class PushoverChannel implements NotificationChannel {
  public readonly name = "Pushover";
  private userKey?: string;
  private appToken?: string;
  private device?: string;
  private defaultPriority?: number;
  private customSound?: string;
  private emergencyRetry: number;
  private emergencyExpire: number;
  private readonly apiUrl = "https://api.pushover.net/1/messages.json";

  constructor(config: PushoverConfig = {}) {
    this.userKey = config.userKey || process.env.PUSHOVER_USER_KEY;
    this.appToken = config.appToken || process.env.PUSHOVER_APP_TOKEN;
    this.device = config.device || process.env.PUSHOVER_DEVICE;

    // Emergency mode sets priority to 2 (repeats every `retry` seconds until acknowledged)
    if (config.emergency || process.env.PUSHOVER_EMERGENCY === "true") {
      this.defaultPriority = 2;
    } else if (config.priority !== undefined) {
      this.defaultPriority = config.priority;
    } else if (config.defaultPriority !== undefined) {
      this.defaultPriority = config.defaultPriority;
    } else if (process.env.PUSHOVER_PRIORITY !== undefined) {
      this.defaultPriority = parseInt(process.env.PUSHOVER_PRIORITY, 10);
    }

    this.customSound = config.sound || process.env.PUSHOVER_SOUND;
    this.emergencyRetry =
      config.emergencyRetrySeconds ||
      (process.env.PUSHOVER_RETRY ? parseInt(process.env.PUSHOVER_RETRY, 10) : 30);
    this.emergencyExpire =
      config.emergencyExpireSeconds ||
      (process.env.PUSHOVER_EXPIRE ? parseInt(process.env.PUSHOVER_EXPIRE, 10) : 1800);
  }

  public isEnabled(): boolean {
    return Boolean(this.userKey && this.appToken);
  }

  /**
   * Dispatches trade alert to Pushover API.
   */
  public async send(payload: TradeAlertPayload): Promise<NotificationResult> {
    if (!this.isEnabled()) {
      return {
        channel: this.name,
        success: false,
        error: "Pushover credentials not configured (requires PUSHOVER_USER_KEY and PUSHOVER_APP_TOKEN)",
      };
    }

    const { signal, decision, channelTitle, streamUrl } = payload;
    const isLong = signal.side === "LONG";
    const sideLabel = isLong ? "LONG" : signal.side === "SHORT" ? "SHORT" : "";
    const sideEmoji = isLong ? "🟢 BUY" : signal.side === "SHORT" ? "🔴 SELL" : "⚡";

    // 1. Build punchy, high-visibility title
    let title: string;
    if (decision.alertType === "EXIT") {
      title = `🏁 EXIT ${signal.symbol} (Closed)`;
    } else if (decision.alertType === "UPDATE") {
      title = `🔄 UPDATE ${signal.symbol} ${sideLabel}`;
    } else {
      title = `🚨 ${sideEmoji} ${signal.symbol}`;
      if (signal.entry_price) {
        title += ` @ ${signal.entry_price}`;
      }
    }

    // 2. Select priority:
    // 2 = Emergency: repeats sound/alarm every `retry`s until user taps "Acknowledge" in Pushover!
    // 1 = High: rings immediately & bypasses quiet hours
    // 0 = Normal
    let priority = this.defaultPriority ?? 1;

    // Routine SL/TP updates stay normal priority unless user explicitly forced emergency
    if (priority !== 2 && decision.alertType === "UPDATE") {
      priority = 0;
    }

    // 3. Select sound based on priority and trade action
    let sound = this.customSound;
    if (!sound) {
      if (priority === 2) {
        sound = "siren"; // Continuous emergency alarm until acknowledged
      } else if (decision.alertType === "EXIT") {
        sound = "cashregister"; // Sound of profit/exit
      } else if (decision.alertType === "NEW") {
        sound = "incoming";
      } else {
        sound = "intermission";
      }
    }

    // 4. Format HTML body
    const lines: string[] = [];
    if (channelTitle) {
      lines.push(`<b>Trader:</b> ${channelTitle}`);
    }
    lines.push(`<b>Action:</b> ${signal.action} (${sideLabel || "N/A"})`);

    if (signal.entry_price) {
      lines.push(`<b>Entry:</b> <code>${signal.entry_price}</code>`);
    }
    if (signal.stop_loss) {
      lines.push(`<b>Stop Loss:</b> <code>${signal.stop_loss}</code>`);
    }
    if (signal.take_profit) {
      lines.push(`<b>Take Profit:</b> <code>${signal.take_profit}</code>`);
    }
    if (signal.rationale) {
      lines.push(`<b>Rationale:</b> ${signal.rationale}`);
    }
    if (signal.verbatim_quote) {
      lines.push(`<i>"${signal.verbatim_quote}"</i>`);
    }

    const messageHtml = lines.join("<br>");

    // 5. Construct Pushover payload
    const body: Record<string, any> = {
      token: this.appToken,
      user: this.userKey,
      title,
      message: messageHtml,
      html: 1,
      priority,
      sound,
      timestamp: Math.floor(Date.now() / 1000),
    };

    if (this.device) {
      body.device = this.device;
    }

    if (streamUrl) {
      body.url = streamUrl;
      body.url_title = "Watch Live Stream";
    }

    // Priority 2 (Emergency) requires retry and expire
    if (priority === 2) {
      body.retry = Math.max(30, this.emergencyRetry);
      body.expire = this.emergencyExpire;
    }

    try {
      const response = await fetch(this.apiUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(5000), // 5s timeout
      });

      const data = (await response.json()) as any;

      if (!response.ok || data.status !== 1) {
        const errorMsg = data.errors ? data.errors.join(", ") : `HTTP ${response.status}`;
        console.warn(`[Pushover Alert] Failed: ${errorMsg}`);
        return {
          channel: this.name,
          success: false,
          error: errorMsg,
        };
      }

      if (priority === 2) {
        console.log(
          `\x1b[31m[Pushover Alert]\x1b[0m 🚨 EMERGENCY ALARM active on your device! Repeating every ${body.retry}s until you tap Acknowledge. (${title})`
        );
      } else {
        console.log(`[Pushover Alert] Successfully sent to device (${title})`);
      }

      return {
        channel: this.name,
        success: true,
        messageId: data.receipt || data.request,
      };
    } catch (err: any) {
      const errorMsg = err.message || "Unknown error";
      console.warn(`[Pushover Alert] Network error: ${errorMsg}`);
      return {
        channel: this.name,
        success: false,
        error: errorMsg,
      };
    }
  }
}
