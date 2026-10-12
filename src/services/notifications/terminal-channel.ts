import {
  NotificationChannel,
  NotificationResult,
  TradeAlertPayload,
} from "./types.js";

/**
 * Terminal notification channel.
 * Renders colorized ANSI cards to standard output.
 */
export class TerminalChannel implements NotificationChannel {
  public readonly name = "Terminal";

  public isEnabled(): boolean {
    return true;
  }

  public async send(payload: TradeAlertPayload): Promise<NotificationResult> {
    const { signal, decision, channelTitle, streamUrl } = payload;
    const isLong = signal.side === "LONG";
    const sideColor = isLong ? "\x1b[32m" : "\x1b[31m"; // Green / Red
    const reset = "\x1b[0m";
    const bold = "\x1b[1m";
    const dim = "\x1b[2m";
    const yellow = "\x1b[33m";
    const cyan = "\x1b[36m";

    const titlePrefix =
      decision.alertType === "NEW"
        ? "🚨 [NEW TRADE ALERT]"
        : decision.alertType === "UPDATE"
        ? "🔄 [TRADE UPDATE]"
        : decision.alertType === "EXIT"
        ? "🏁 [POSITION CLOSED]"
        : "⏸️ [SUPPRESSED DUPLICATE]";

    console.log("\n" + "=".repeat(60));
    console.log(`${bold}${sideColor}${titlePrefix} ${signal.symbol} ${signal.side || ""}${reset}`);
    console.log("=".repeat(60));
    if (channelTitle) {
      console.log(`  ${dim}Trader:${reset}     ${channelTitle}`);
    }
    console.log(`  ${dim}Action:${reset}     ${yellow}${signal.action}${reset}`);
    console.log(`  ${dim}Direction:${reset}  ${sideColor}${bold}${signal.side || "N/A"}${reset}`);

    if (signal.entry_price) {
      console.log(`  ${dim}Entry:${reset}      ${cyan}${signal.entry_price}${reset}`);
    }
    if (signal.stop_loss) {
      console.log(`  ${dim}Stop Loss:${reset}  \x1b[31m${signal.stop_loss}${reset}`);
    }
    if (signal.take_profit) {
      console.log(`  ${dim}Target TP:${reset}  \x1b[32m${signal.take_profit}${reset}`);
    }
    if (signal.rationale) {
      console.log(`  ${dim}Rationale:${reset}  ${signal.rationale}`);
    }
    if (signal.verbatim_quote) {
      console.log(`  ${dim}Quote:${reset}      "${signal.verbatim_quote}"`);
    }

    console.log(`  ${dim}Confidence:${reset} ${signal.confidence}`);
    console.log(`  ${dim}Detected At:${reset}${signal.detected_at || new Date().toISOString()}`);

    if (decision.reason) {
      console.log(`  ${dim}Decision:${reset}   ${decision.reason}`);
    }
    if (streamUrl) {
      console.log(`  ${dim}Stream Link:${reset} \x1b[4m${streamUrl}${reset}`);
    }
    console.log("=".repeat(60) + "\n");

    return {
      channel: this.name,
      success: true,
    };
  }
}
