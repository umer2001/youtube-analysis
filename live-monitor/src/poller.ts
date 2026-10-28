import { google, youtube_v3 } from "googleapis";
import { ChannelRecord, LiveStreamCandidate } from "./types.js";

/**
 * Parses channel handle or ID from channel URL or handle string.
 */
export function parseChannelIdentifier(input: string): {
  type: "handle" | "channelId" | "query";
  value: string;
} {
  const trimmed = input.trim();

  const handleMatch = trimmed.match(/(?:https?:\/\/)?(?:www\.)?youtube\.com\/@([a-zA-Z0-9_\-\.]+)/i);
  if (handleMatch) {
    return { type: "handle", value: `@${handleMatch[1]}` };
  }

  if (trimmed.startsWith("@")) {
    return { type: "handle", value: trimmed };
  }

  const channelUrlMatch = trimmed.match(/(?:https?:\/\/)?(?:www\.)?youtube\.com\/channel\/(UC[a-zA-Z0-9_\-]{22})/i);
  if (channelUrlMatch) {
    return { type: "channelId", value: channelUrlMatch[1] };
  }

  if (/^UC[a-zA-Z0-9_\-]{22}$/.test(trimmed)) {
    return { type: "channelId", value: trimmed };
  }

  const customMatch = trimmed.match(/(?:https?:\/\/)?(?:www\.)?youtube\.com\/(?:c\/|user\/)?([a-zA-Z0-9_\-\.]+)/i);
  if (customMatch && !customMatch[1].startsWith("watch")) {
    return { type: "query", value: customMatch[1] };
  }

  return { type: "query", value: trimmed };
}

/**
 * Detects if a channel has an active LIVE stream right now.
 * Tries YouTube Data API first if an API key is available; falls back to fast zero-quota web scraping.
 */
export class ChannelLivePoller {
  private youtubeClient: youtube_v3.Youtube | null = null;
  private readonly verbose: boolean;

  constructor(apiKey?: string, verbose = false) {
    this.verbose = verbose;
    if (apiKey && !apiKey.startsWith("AQ.")) {
      try {
        this.youtubeClient = google.youtube({ version: "v3", auth: apiKey });
      } catch (err: any) {
        if (this.verbose) {
          console.warn("[Poller] Could not initialize YouTube Data API client:", err.message);
        }
      }
    }
  }

  /**
   * Checks a channel for any currently broadcasting live stream.
   */
  public async checkForLiveStream(channel: ChannelRecord): Promise<LiveStreamCandidate | null> {
    // 1. Try YouTube Data API if client is available and channel_id is populated
    if (this.youtubeClient && channel.channel_id) {
      try {
        const live = await this.queryApiForLiveStream(channel);
        if (live) return live;
      } catch (err: any) {
        if (this.verbose) {
          console.warn(`[Poller] YouTube API check failed for ${channel.title || channel.channel_url}: ${err.message}. Falling back to scraping.`);
        }
      }
    }

    // 2. Fallback to direct web scraping of YouTube live tab (Zero API Quota!)
    try {
      return await this.scrapeForLiveStream(channel);
    } catch (err: any) {
      if (this.verbose) {
        console.warn(`[Poller] Scraping check failed for ${channel.title || channel.channel_url}: ${err.message}`);
      }
      return null;
    }
  }

  private async queryApiForLiveStream(channel: ChannelRecord): Promise<LiveStreamCandidate | null> {
    if (!this.youtubeClient || !channel.channel_id) return null;

    const res = await this.youtubeClient.search.list({
      part: ["snippet"],
      channelId: channel.channel_id,
      eventType: "live",
      type: ["video"],
      maxResults: 1,
    });

    const item = res.data.items?.[0];
    if (item && item.id?.videoId) {
      const videoId = item.id.videoId;
      const title = item.snippet?.title || "Untitled Live Stream";
      return {
        videoId,
        channelDbId: channel.id,
        channelTitle: channel.title || item.snippet?.channelTitle || "Live Streamer",
        channelUrl: channel.channel_url,
        streamUrl: `https://www.youtube.com/watch?v=${videoId}`,
        title,
        status: "live",
      };
    }

    return null;
  }

  /**
   * Scrapes the channel's `/live` endpoint. If the channel is live, YouTube redirects to
   * `/watch?v=VIDEO_ID` or renders live broadcast metadata.
   */
  private async scrapeForLiveStream(channel: ChannelRecord): Promise<LiveStreamCandidate | null> {
    const parsed = parseChannelIdentifier(channel.channel_url);
    let targetUrl: string;

    if (parsed.type === "handle") {
      targetUrl = `https://www.youtube.com/${parsed.value}/live`;
    } else if (parsed.type === "channelId") {
      targetUrl = `https://www.youtube.com/channel/${parsed.value}/live`;
    } else {
      targetUrl = `https://www.youtube.com/@${parsed.value.replace(/^@/, "")}/live`;
    }

    const response = await fetch(targetUrl, {
      redirect: "follow",
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
        "Accept-Language": "en-US,en;q=0.9",
        "Cookie": "PREF=hl=en&gl=US",
      },
    });

    if (!response.ok) return null;

    // Check if redirected to a watch URL
    const finalUrl = response.url;
    const watchMatch = finalUrl.match(/[?&]v=([a-zA-Z0-9_\-]{11})/);
    const html = await response.text();

    let isLive = false;
    let videoId = watchMatch ? watchMatch[1] : null;
    let title = channel.title || "Live Stream";

    // Extract ytInitialPlayerResponse from page
    const match = html.match(/var ytInitialPlayerResponse = ({.*?});(?:var |<\/[a-z])/s) ||
      html.match(/ytInitialPlayerResponse\s*=\s*({.+?});/s);

    if (match) {
      try {
        const playerResponse = JSON.parse(match[1]);
        const liveDetails = playerResponse?.microformat?.playerMicroformatRenderer?.liveBroadcastDetails;
        const videoDetails = playerResponse?.videoDetails;

        if (videoDetails?.videoId) {
          videoId = videoDetails.videoId;
        }
        if (videoDetails?.title) {
          title = videoDetails.title;
        }

        if (liveDetails?.isLiveNow || (liveDetails?.startTimestamp && !liveDetails?.endTimestamp)) {
          isLive = true;
        } else if (videoDetails?.isLive) {
          isLive = true;
        }
      } catch {
        // fallback
      }
    }

    // Check initialData badge if player response didn't confirm
    if (!isLive) {
      if (html.includes('"BADGE_STYLE_TYPE_LIVE_NOW"') || html.includes('"label":"LIVE"') || html.includes('"isLive":true')) {
        isLive = true;
      }
    }

    if (isLive && videoId) {
      return {
        videoId,
        channelDbId: channel.id,
        channelTitle: channel.title || "Live Streamer",
        channelUrl: channel.channel_url,
        streamUrl: `https://www.youtube.com/watch?v=${videoId}`,
        title,
        status: "live",
      };
    }

    return null;
  }
}
