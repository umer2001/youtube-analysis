import {
  NotificationChannel,
  NotificationResult,
  TelegramConfig,
  TradeAlertPayload,
} from "./types.js";

/**
 * Telegram Bot notification channel.
 * Sends formatted markdown alerts to a Telegram chat or channel.
 */
export class TelegramChannel implements NotificationChannel {
  public readonly name = "Telegram";
  private botToken?: string;
  private chatId?: string;

  constructor(config: TelegramConfig = {}) {
    this.botToken = config.botToken || process.env.TELEGRAM_BOT_TOKEN;
    this.chatId = config.chatId || process.env.TELEGRAM_CHAT_ID;
  }

  public isEnabled(): boolean {
    return Boolean(this.botToken && this.chatId);
  }

  public async send(payload: TradeAlertPayload): Promise<NotificationResult> {
    if (!this.isEnabled()) {
      return {
        channel: this.name,
        success: false,
        error: "Telegram credentials not configured (requires TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID)",
      };
    }

    const { signal, decision, channelTitle, streamUrl } = payload;
    const isLong = signal.side === "LONG";
    const sideEmoji = isLong ? "🟢 LONG" : signal.side === "SHORT" ? "🔴 SHORT" : "⚡ UNKNOWN";
    const actionEmoji =
      decision.alertType === "NEW"
        ? "🚨 *NEW LIVE TRADE ALERT*"
        : decision.alertType === "EXIT"
        ? "🏁 *POSITION CLOSED*"
        : "🔄 *TRADE MODIFICATION*";

    let text = `${actionEmoji}\n━━━━━━━━━━━━━━━━━━━━━\n`;
    if (channelTitle) text += `👤 *Trader*: ${channelTitle}\n`;
    text += `🎯 *Asset*: \`${signal.symbol}\`\n`;
    text += `📈 *Direction*: *${sideEmoji}*\n`;
    text += `⚡ *Action*: \`${signal.action}\`\n`;

    if (signal.entry_price) text += `📍 *Entry*: \`${signal.entry_price}\`\n`;
    if (signal.stop_loss) text += `🛑 *Stop Loss*: \`${signal.stop_loss}\`\n`;
    if (signal.take_profit) text += `🎯 *Target TP*: \`${signal.take_profit}\`\n`;
    if (signal.rationale) text += `💡 *Rationale*: ${signal.rationale}\n`;
    if (signal.verbatim_quote) text += `💬 *Quote*: _"${signal.verbatim_quote}"_\n`;

    text += `━━━━━━━━━━━━━━━━━━━━━\n`;
    if (streamUrl) {
      text += `🔗 [Watch Live Stream](${streamUrl})`;
    }

    const url = `https://api.telegram.org/bot${this.botToken}/sendMessage`;
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: this.chatId,
          text,
          parse_mode: "Markdown",
          disable_web_page_preview: false,
        }),
        signal: AbortSignal.timeout(5000),
      });

      if (!res.ok) {
        const errText = await res.text();
        console.warn(`[Telegram Alert] Failed (${res.status}): ${errText}`);
        return {
          channel: this.name,
          success: false,
          error: `HTTP ${res.status}: ${errText}`,
        };
      }

      console.log(`[Telegram Alert] Successfully dispatched to chat ${this.chatId}`);
      return {
        channel: this.name,
        success: true,
      };
    } catch (err: any) {
      console.warn(`[Telegram Alert] Network error: ${err.message}`);
      return {
        channel: this.name,
        success: false,
        error: err.message,
      };
    }
  }
}
