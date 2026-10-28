import {
  NotificationChannel,
  NotificationResult,
  PushoverConfig,
  TradeAlertPayload,
  StreamOnlinePayload,
} from "./types.js";

/**
 * Pushover notification channel.
 * Instantaneous push notifications to iOS, Android, Desktop, and Smartwatches.
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

  public async send(payload: TradeAlertPayload): Promise<NotificationResult> {
    if (!this.isEnabled()) {
      return {
        channel: this.name,
        success: false,
        error: "Pushover credentials not configured",
      };
    }

    const { signal, decision, channelTitle, streamUrl } = payload;
    const isLong = signal.side === "LONG";
    const sideLabel = isLong ? "LONG" : signal.side === "SHORT" ? "SHORT" : "";
    const sideEmoji = isLong ? "🟢 BUY" : signal.side === "SHORT" ? "🔴 SELL" : "⚡";

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

    let priority = this.defaultPriority ?? 1;
    if (priority !== 2 && decision.alertType === "UPDATE") {
      priority = 0;
    }

    let sound = this.customSound;
    if (!sound) {
      if (priority === 2) {
        sound = "siren";
      } else if (decision.alertType === "EXIT") {
        sound = "cashregister";
      } else if (isLong) {
        sound = "up";
      } else {
        sound = "incoming";
      }
    }

    const lines: string[] = [];
    lines.push(`<b>Trader:</b> ${channelTitle}`);
    if (signal.side) {
      lines.push(`<b>Direction:</b> ${signal.side}`);
    }
    if (signal.entry_price) {
      lines.push(`<b>Entry:</b> <code>${signal.entry_price}</code>`);
    }
    if (signal.stop_loss) {
      lines.push(`<b>Stop Loss:</b> <code>${signal.stop_loss}</code>`);
    }
    if (signal.take_profit) {
      lines.push(`<b>Target TP:</b> <code>${signal.take_profit}</code>`);
    }
    if (signal.verbatim_quote) {
      lines.push(`<b>Quote:</b> <i>"${signal.verbatim_quote}"</i>`);
    }

    const messageHtml = lines.join("\n");
    return this.postPushover({
      title,
      message: messageHtml,
      priority,
      sound,
      url: streamUrl,
      urlTitle: "Open YouTube Stream",
    });
  }

  public async sendStreamOnline(payload: StreamOnlinePayload): Promise<NotificationResult> {
    if (!this.isEnabled()) {
      return { channel: this.name, success: false };
    }

    const title = `🔴 LIVE NOW: ${payload.channelTitle}`;
    const message = `<b>${payload.channelTitle}</b> just started a live stream:\n<i>${payload.streamTitle}</i>\n\nLive audio monitoring started automatically!`;

    return this.postPushover({
      title,
      message,
      priority: 1,
      sound: "tugboat",
      url: payload.streamUrl,
      urlTitle: "Watch Live Stream",
    });
  }

  private async postPushover(params: {
    title: string;
    message: string;
    priority: number;
    sound: string;
    url?: string;
    urlTitle?: string;
  }): Promise<NotificationResult> {
    try {
      const formData = new URLSearchParams();
      formData.append("token", this.appToken!);
      formData.append("user", this.userKey!);
      formData.append("title", params.title);
      formData.append("message", params.message);
      formData.append("html", "1");
      formData.append("priority", String(params.priority));
      formData.append("sound", params.sound);

      if (this.device) {
        formData.append("device", this.device);
      }
      if (params.url) {
        formData.append("url", params.url);
        formData.append("url_title", params.urlTitle || "Open Stream");
      }
      if (params.priority === 2) {
        formData.append("retry", String(this.emergencyRetry));
        formData.append("expire", String(this.emergencyExpire));
      }

      const res = await fetch(this.apiUrl, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: formData.toString(),
      });

      const data: any = await res.json();
      if (!res.ok || data.status !== 1) {
        const errorMsg = data.errors?.join(", ") || `HTTP ${res.status}`;
        return { channel: this.name, success: false, error: errorMsg };
      }

      console.log(`\x1b[32m[Pushover Alert]\x1b[0m Successfully sent (${params.title})`);
      return { channel: this.name, success: true, messageId: data.receipt || data.request };
    } catch (err: any) {
      return { channel: this.name, success: false, error: err.message };
    }
  }
}
