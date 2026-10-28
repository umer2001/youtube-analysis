import { DeduplicationDecision, LiveTradeSignal } from "../../types.js";

export interface TradeAlertPayload {
  signal: LiveTradeSignal;
  decision: DeduplicationDecision;
  channelTitle: string;
  streamUrl?: string;
}

export interface StreamOnlinePayload {
  channelTitle: string;
  streamTitle: string;
  streamUrl: string;
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
  sendStreamOnline?(payload: StreamOnlinePayload): Promise<NotificationResult>;
}

export interface PushoverConfig {
  userKey?: string;
  appToken?: string;
  device?: string;
  priority?: number;
  defaultPriority?: number;
  emergency?: boolean;
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
  pushover?: PushoverConfig;
  telegram?: TelegramConfig;
}
