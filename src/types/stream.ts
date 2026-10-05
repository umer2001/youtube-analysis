export type LiveStreamStatus = "live" | "completed" | "upcoming" | "unknown";

export interface ChannelInfo {
  channelId: string;
  title: string;
  description?: string;
  customUrl?: string;
  handle?: string;
  thumbnailUrl?: string;
}

export interface LiveSession {
  videoId: string;
  url: string;
  title: string;
  description: string;
  channelId: string;
  channelTitle: string;
  status: LiveStreamStatus;
  publishedAt?: string;
  scheduledStartTime?: string;
  actualStartTime?: string;
  actualEndTime?: string;
  duration?: string;
  viewCount?: number;
  concurrentViewers?: number;
  thumbnailUrl?: string;
}

export interface ListLiveStreamsOptions {
  apiKey?: string;
  eventType?: "all" | "live" | "completed" | "upcoming";
  maxResults?: number;
}

export interface LiveStreamsResult {
  channel: ChannelInfo;
  sessions: LiveSession[];
}
