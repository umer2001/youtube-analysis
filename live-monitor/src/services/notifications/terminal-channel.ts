import {
  NotificationChannel,
  NotificationResult,
  TradeAlertPayload,
  StreamOnlinePayload,
} from "./types.js";

/**
 * Terminal channel for server console logging with color highlights.
 */
export class TerminalChannel implements NotificationChannel {
  public readonly name = "Terminal";

  public isEnabled(): boolean {
    return true;
  }

  public async send(payload: TradeAlertPayload): Promise<NotificationResult> {
    const { signal, decision, channelTitle } = payload;
    const isExit = decision.alertType === "EXIT";
    const isUpdate = decision.alertType === "UPDATE";
    const isSuppressed = decision.alertType === "SUPPRESSED";

    const bannerChar = isExit ? "🏁" : isUpdate ? "🔄" : isSuppressed ? "⏸️" : "🚨";
    const actionLabel = isSuppressed
      ? "SUPPRESSED DUPLICATE"
      : isExit
      ? "TRADE CLOSED"
      : isUpdate
      ? "TRADE UPDATE"
      : "NEW TRADE ALERT";

    console.log(`\n============================================================`);
    console.log(`${bannerChar} [${actionLabel}] ${signal.symbol} ${signal.side || ""}`);
    console.log(`============================================================`);
    console.log(`  Trader:     ${channelTitle}`);
    console.log(`  Action:     ${signal.action}`);
    if (signal.side) console.log(`  Direction:  ${signal.side}`);
    if (signal.entry_price) console.log(`  Entry:      ${signal.entry_price}`);
    if (signal.stop_loss) console.log(`  Stop Loss:  ${signal.stop_loss}`);
    if (signal.take_profit) console.log(`  Target TP:  ${signal.take_profit}`);
    if (signal.risk_reward) console.log(`  R:R:        ${signal.risk_reward}`);
    if (signal.rationale) console.log(`  Rationale:  ${signal.rationale}`);
    if (signal.verbatim_quote) console.log(`  Quote:      "${signal.verbatim_quote}"`);
    console.log(`  Confidence: ${signal.confidence}`);
    if (signal.detected_at) console.log(`  Detected At:${signal.detected_at}`);
    if (decision.reason) console.log(`  Decision:   ${decision.reason}`);
    console.log(`============================================================\n`);

    return { channel: this.name, success: true };
  }

  public async sendStreamOnline(payload: StreamOnlinePayload): Promise<NotificationResult> {
    console.log(`\n🔴 [STREAM ONLINE] ${payload.channelTitle} is now LIVE!`);
    console.log(`   Title: ${payload.streamTitle}`);
    console.log(`   URL:   ${payload.streamUrl}\n`);
    return { channel: this.name, success: true };
  }
}
