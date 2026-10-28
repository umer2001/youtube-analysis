import {
  NotificationChannel,
  NotificationResult,
  TelegramConfig,
  TradeAlertPayload,
  StreamOnlinePayload,
} from "./types.js";

/**
 * Telegram notification channel.
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
        error: "Telegram not configured (requires TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID)",
      };
    }

    const { signal, decision, channelTitle, streamUrl } = payload;
    const isLong = signal.side === "LONG";
    const sideEmoji = isLong ? "🟢 BUY" : signal.side === "SHORT" ? "🔴 SELL" : "⚡";

    let header = `<b>🚨 ${sideEmoji} ${signal.symbol}</b>`;
    if (decision.alertType === "EXIT") {
      header = `<b>🏁 EXIT ${signal.symbol}</b>`;
    } else if (decision.alertType === "UPDATE") {
      header = `<b>🔄 UPDATE ${signal.symbol}</b>`;
    }

    const lines: string[] = [header, ""];
    lines.push(`👤 <b>Trader:</b> ${channelTitle}`);
    if (signal.side) lines.push(`📊 <b>Direction:</b> ${signal.side}`);
    if (signal.entry_price) lines.push(`🎯 <b>Entry:</b> <code>${signal.entry_price}</code>`);
    if (signal.stop_loss) lines.push(`🛑 <b>Stop Loss:</b> <code>${signal.stop_loss}</code>`);
    if (signal.take_profit) lines.push(`💰 <b>Target TP:</b> <code>${signal.take_profit}</code>`);
    if (signal.verbatim_quote) lines.push(`💬 <i>"${signal.verbatim_quote}"</i>`);
    if (streamUrl) lines.push(`\n🔗 <a href="${streamUrl}">Watch Live</a>`);

    return this.postTelegram(lines.join("\n"));
  }

  public async sendStreamOnline(payload: StreamOnlinePayload): Promise<NotificationResult> {
    if (!this.isEnabled()) {
      return { channel: this.name, success: false };
    }

    const lines = [
      `<b>🔴 LIVE NOW: ${payload.channelTitle}</b>`,
      "",
      `<i>${payload.streamTitle}</i>`,
      "",
      `Live audio monitoring started automatically!`,
      `\n🔗 <a href="${payload.streamUrl}">Watch Stream</a>`,
    ];

    return this.postTelegram(lines.join("\n"));
  }

  private async postTelegram(textHtml: string): Promise<NotificationResult> {
    try {
      const url = `https://api.telegram.org/bot${this.botToken}/sendMessage`;
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: this.chatId,
          text: textHtml,
          parse_mode: "HTML",
          disable_web_page_preview: false,
        }),
      });

      const data: any = await res.json();
      if (!res.ok || !data.ok) {
        return { channel: this.name, success: false, error: data.description || `HTTP ${res.status}` };
      }

      console.log(`\x1b[32m[Telegram Alert]\x1b[0m Successfully posted`);
      return { channel: this.name, success: true, messageId: String(data.result?.message_id) };
    } catch (err: any) {
      return { channel: this.name, success: false, error: err.message };
    }
  }
}
