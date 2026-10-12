import { LiveTradeSignal } from "../../types/live-alert.js";
import { DeduplicationDecision } from "../live/state-manager.js";

export interface TradeAlertPayload {
  signal: LiveTradeSignal;
  decision: DeduplicationDecision;
  channelTitle?: string;
  streamUrl?: string;
}

export interface NotificationResult {
  channel: string;
  success: boolean;
  messageId?: string;
  error?: string;
}

export interface NotificationChannel {
  readonly name: string;
  isEnabled(): boolean;
  send(payload: TradeAlertPayload): Promise<NotificationResult>;
}

export interface PushoverConfig {
  userKey?: string;
  appToken?: string;
  device?: string;
  priority?: number; // -2, -1, 0, 1, 2
  defaultPriority?: number; // -2 to 2
  emergency?: boolean; // When true, sets priority to 2 (repeats until acknowledged)
  sound?: string;
  emergencyRetrySeconds?: number;
  emergencyExpireSeconds?: number;
}

export interface TelegramConfig {
  botToken?: string;
  chatId?: string;
}

export interface DispatcherOptions {
  channelTitle?: string;
  streamUrl?: string;
  telegram?: TelegramConfig;
  pushover?: PushoverConfig;
  // Legacy / convenience flat parameters:
  telegramToken?: string;
  telegramChatId?: string;
  pushoverUserKey?: string;
  pushoverAppToken?: string;
  pushoverDevice?: string;
  pushoverPriority?: number;
  pushoverEmergency?: boolean;
}
