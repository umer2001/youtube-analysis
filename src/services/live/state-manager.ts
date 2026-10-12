import { ActiveTradeState, LiveTradeSignal } from "../../types/live-alert.js";

export interface DeduplicationDecision {
  shouldAlert: boolean;
  alertType: "NEW" | "UPDATE" | "EXIT" | "SUPPRESSED";
  reason?: string;
  state: ActiveTradeState;
}

export class LiveTradeStateManager {
  private activeTrades: Map<string, ActiveTradeState> = new Map();
  private readonly debounceWindowMs: number;

  constructor(debounceWindowMinutes = 15) {
    this.debounceWindowMs = debounceWindowMinutes * 60 * 1000;
  }

  /**
   * Processes a raw trade signal and decides whether to alert or suppress as a duplicate.
   */
  public processSignal(signal: LiveTradeSignal): DeduplicationDecision {
    const symbolKey = signal.symbol.toUpperCase().trim();
    const now = Date.now();
    const existing = this.activeTrades.get(symbolKey);

    // Case 1: Brand new symbol or no previous active trade within debounce window
    if (!existing || now - existing.last_updated_at > this.debounceWindowMs) {
      const newState: ActiveTradeState = {
        symbol: symbolKey,
        side: signal.side,
        entry_price: signal.entry_price,
        stop_loss: signal.stop_loss,
        take_profit: signal.take_profit,
        last_action: signal.action,
        first_detected_at: now,
        last_updated_at: now,
        alert_count: 1,
      };

      if (signal.action === "EXIT") {
        // Standalone exit without prior state
        return {
          shouldAlert: true,
          alertType: "EXIT",
          reason: "Position close announced",
          state: newState,
        };
      }

      this.activeTrades.set(symbolKey, newState);
      return {
        shouldAlert: true,
        alertType: "NEW",
        reason: "Initial trade setup announced",
        state: newState,
      };
    }

    // Case 2: Explicit Position Exit
    if (signal.action === "EXIT") {
      existing.last_action = "EXIT";
      existing.last_updated_at = now;
      this.activeTrades.delete(symbolKey);
      return {
        shouldAlert: true,
        alertType: "EXIT",
        reason: "Trader closed position",
        state: existing,
      };
    }

    // Case 3: SL or TP modification
    const slChanged = signal.stop_loss && signal.stop_loss !== existing.stop_loss;
    const tpChanged = signal.take_profit && signal.take_profit !== existing.take_profit;

    if (signal.action === "SL_TP_UPDATE" || slChanged || tpChanged) {
      if (signal.stop_loss) existing.stop_loss = signal.stop_loss;
      if (signal.take_profit) existing.take_profit = signal.take_profit;
      existing.last_action = "SL_TP_UPDATE";
      existing.last_updated_at = now;
      existing.alert_count++;

      return {
        shouldAlert: true,
        alertType: "UPDATE",
        reason: slChanged ? "Stop Loss updated" : "Take Profit updated",
        state: existing,
      };
    }

    // Case 4: Repeated commentary on the same open trade
    if (signal.side === existing.side && signal.action === existing.last_action) {
      existing.last_updated_at = now;
      return {
        shouldAlert: false,
        alertType: "SUPPRESSED",
        reason: `Repeated discussion of active ${existing.symbol} ${existing.side} trade (alerted ${existing.alert_count}x previously)`,
        state: existing,
      };
    }

    // Case 5: Different side on the same symbol (reversal or hedge)
    if (signal.side && signal.side !== existing.side) {
      existing.side = signal.side;
      existing.entry_price = signal.entry_price || existing.entry_price;
      existing.stop_loss = signal.stop_loss;
      existing.take_profit = signal.take_profit;
      existing.last_action = signal.action;
      existing.last_updated_at = now;
      existing.alert_count = 1;

      return {
        shouldAlert: true,
        alertType: "NEW",
        reason: `Position direction flipped to ${signal.side}`,
        state: existing,
      };
    }

    // Default: Suppress
    existing.last_updated_at = now;
    return {
      shouldAlert: false,
      alertType: "SUPPRESSED",
      reason: "No significant changes to active trade parameters",
      state: existing,
    };
  }

  public getActiveTrades(): ActiveTradeState[] {
    return Array.from(this.activeTrades.values());
  }

  public clear(): void {
    this.activeTrades.clear();
  }
}
