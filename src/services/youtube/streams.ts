import { google, youtube_v3 } from "googleapis";
import {
  ChannelInfo,
  LiveSession,
  LiveStreamStatus,
  ListLiveStreamsOptions,
  LiveStreamsResult,
} from "../../types/stream.js";

/**
 * Normalizes an ISO-8601 date string to standard UTC ISO format (e.g. 2026-10-01T08:22:20.000Z).
 */
export function normalizeIsoDate(dateStr?: string | null): string | undefined {
  if (!dateStr) return undefined;
  try {
    const d = new Date(dateStr);
    if (!isNaN(d.getTime())) {
      return d.toISOString();
    }
  } catch {
    // ignore
  }
  return dateStr;
}

/**
 * Parses an ISO 8601 duration string (e.g. "PT1H23M45S", "PT45M12S") into a human-readable string.
 */
export function formatDuration(isoDuration?: string): string | undefined {
  if (!isoDuration) return undefined;
  const match = isoDuration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!match) return isoDuration;

  const hours = match[1] ? `${match[1]}h ` : "";
  const minutes = match[2] ? `${match[2]}m ` : "";
  const seconds = match[3] ? `${match[3]}s` : "";

  const formatted = `${hours}${minutes}${seconds}`.trim();
  return formatted.length > 0 ? formatted : undefined;
}

/**
 * Converts total seconds into a human-readable duration string matching formatDuration (e.g. "3h 1m 1s").
 */
export function formatSecondsToDuration(totalSeconds?: number | string | null): string | undefined {
  if (totalSeconds === undefined || totalSeconds === null) return undefined;
  const sec = typeof totalSeconds === "string" ? parseInt(totalSeconds, 10) : totalSeconds;
  if (isNaN(sec) || sec <= 0) return undefined;

  const hours = Math.floor(sec / 3600);
  const minutes = Math.floor((sec % 3600) / 60);
  const seconds = sec % 60;

  const hoursStr = hours > 0 ? `${hours}h ` : "";
  const minutesStr = minutes > 0 || hours > 0 ? `${minutes}m ` : "";
  const secondsStr = `${seconds}s`;

  const formatted = `${hoursStr}${minutesStr}${secondsStr}`.trim();
  return formatted.length > 0 ? formatted : undefined;
}

/**
 * Extracts a handle, channel ID, or query term from a channel URL or input string.
 */
export function parseChannelIdentifier(input: string): {
  type: "handle" | "channelId" | "query";
  value: string;
} {
  const trimmed = input.trim();

  // Match YouTube handle URL (e.g., https://www.youtube.com/@TradeLikeMalika or @TradeLikeMalika)
  const handleMatch = trimmed.match(/(?:https?:\/\/)?(?:www\.)?youtube\.com\/@([a-zA-Z0-9_\-\.]+)/i);
  if (handleMatch) {
    return { type: "handle", value: `@${handleMatch[1]}` };
  }

  // Direct @handle input
  if (trimmed.startsWith("@")) {
    return { type: "handle", value: trimmed };
  }

  // Match channel ID URL (e.g., https://www.youtube.com/channel/UC...)
  const channelUrlMatch = trimmed.match(/(?:https?:\/\/)?(?:www\.)?youtube\.com\/channel\/(UC[a-zA-Z0-9_\-]{22})/i);
  if (channelUrlMatch) {
    return { type: "channelId", value: channelUrlMatch[1] };
  }

  // Raw 24-character UC... channel ID
  if (/^UC[a-zA-Z0-9_\-]{22}$/.test(trimmed)) {
    return { type: "channelId", value: trimmed };
  }

  // Custom channel URL (e.g., https://www.youtube.com/c/CustomName or youtube.com/user/UserName)
  const customMatch = trimmed.match(/(?:https?:\/\/)?(?:www\.)?youtube\.com\/(?:c\/|user\/)?([a-zA-Z0-9_\-\.]+)/i);
  if (customMatch && !customMatch[1].startsWith("watch")) {
    return { type: "query", value: customMatch[1] };
  }

  return { type: "query", value: trimmed };
}

/**
 * Returns a valid YouTube API key if configured.
 * Note: Avoids Gemini-only keys (AQ.*) which are rejected by the YouTube Data API.
 */
export function getValidYouTubeApiKey(explicitKey?: string): string | undefined {
  if (explicitKey) return explicitKey;
  if (process.env.YOUTUBE_API_KEY) return process.env.YOUTUBE_API_KEY;
  if (process.env.GOOGLE_API_KEY && !process.env.GOOGLE_API_KEY.startsWith("AQ.")) {
    return process.env.GOOGLE_API_KEY;
  }
  return undefined;
}

/**
 * Initializes the Google YouTube Data API v3 client using googleapis.
 */
export function getYouTubeClient(apiKey?: string): youtube_v3.Youtube {
  const key = getValidYouTubeApiKey(apiKey);
  if (!key) {
    throw new Error(
      "Missing YouTube Data API key. Set YOUTUBE_API_KEY in your .env file or pass apiKey in options."
    );
  }
  return google.youtube({ version: "v3", auth: key });
}

/**
 * Resolves a channel URL, handle, or ID to a structured ChannelInfo using Google YouTube API.
 */
export async function resolveChannel(
  identifier: string,
  youtube?: youtube_v3.Youtube
): Promise<ChannelInfo> {
  const client = youtube || getYouTubeClient();
  const parsed = parseChannelIdentifier(identifier);

  let channelItem: youtube_v3.Schema$Channel | undefined;

  if (parsed.type === "handle") {
    try {
      const res = await client.channels.list({
        part: ["snippet", "contentDetails", "statistics"],
        forHandle: parsed.value,
      });
      channelItem = res.data.items?.[0];
    } catch {
      const res = await client.channels.list({
        part: ["snippet", "contentDetails", "statistics"],
        forHandle: parsed.value.replace(/^@/, ""),
      });
      channelItem = res.data.items?.[0];
    }
  } else if (parsed.type === "channelId") {
    const res = await client.channels.list({
      part: ["snippet", "contentDetails", "statistics"],
      id: [parsed.value],
    });
    channelItem = res.data.items?.[0];
  } else {
    const searchRes = await client.search.list({
      part: ["snippet"],
      q: parsed.value,
      type: ["channel"],
      maxResults: 1,
    });
    const foundId = searchRes.data.items?.[0]?.snippet?.channelId;
    if (foundId) {
      const res = await client.channels.list({
        part: ["snippet", "contentDetails", "statistics"],
        id: [foundId],
      });
      channelItem = res.data.items?.[0];
    }
  }

  if (!channelItem || !channelItem.id) {
    throw new Error(`Unable to resolve YouTube channel for identifier: "${identifier}".`);
  }

  return {
    channelId: channelItem.id,
    title: channelItem.snippet?.title || "Unknown Channel",
    description: channelItem.snippet?.description || "",
    customUrl: channelItem.snippet?.customUrl || undefined,
    handle: parsed.type === "handle" ? parsed.value : channelItem.snippet?.customUrl || undefined,
    thumbnailUrl:
      channelItem.snippet?.thumbnails?.medium?.url ||
      channelItem.snippet?.thumbnails?.default?.url ||
      undefined,
  };
}

/**
 * PRIMARY PATH: Lists live sessions for a YouTube channel using Google YouTube Data API v3 (`googleapis`).
 */
export async function listChannelLiveStreams(
  channelIdentifier: string,
  options: ListLiveStreamsOptions = {}
): Promise<LiveStreamsResult> {
  const client = getYouTubeClient(options.apiKey);
  const channel = await resolveChannel(channelIdentifier, client);

  const eventType = options.eventType || "all";
  const limit = options.maxResults || 20;

  const eventTypesToQuery: Array<"live" | "completed" | "upcoming"> =
    eventType === "all"
      ? ["live", "completed", "upcoming"]
      : [eventType];

  const videoIdsSet = new Set<string>();

  for (const type of eventTypesToQuery) {
    try {
      const maxResultsForType = type === "completed" ? Math.min(limit, 50) : 5;
      const searchRes = await client.search.list({
        part: ["snippet"],
        channelId: channel.channelId,
        eventType: type,
        type: ["video"],
        order: "date",
        maxResults: maxResultsForType,
      });

      for (const item of searchRes.data.items || []) {
        if (item.id?.videoId) {
          videoIdsSet.add(item.id.videoId);
        }
      }
    } catch (err: any) {
      console.warn(`[YouTube API] Search query failed for eventType="${type}": ${err.message || err}`);
    }
  }

  const videoIds = Array.from(videoIdsSet);
  if (videoIds.length === 0) {
    return { channel, sessions: [] };
  }

  // Fetch full video details including liveStreamingDetails, contentDetails, and statistics
  const videosRes = await client.videos.list({
    part: ["snippet", "liveStreamingDetails", "contentDetails", "statistics"],
    id: videoIds,
  });

  const sessions: LiveSession[] = (videosRes.data.items || []).map((video) => {
    const videoId = video.id!;
    const snippet = video.snippet;
    const liveDetails = video.liveStreamingDetails;
    const contentDetails = video.contentDetails;
    const statistics = video.statistics;

    let status: LiveStreamStatus = "unknown";
    if (snippet?.liveBroadcastContent === "live" || (liveDetails?.actualStartTime && !liveDetails?.actualEndTime)) {
      status = "live";
    } else if (snippet?.liveBroadcastContent === "upcoming" || (!liveDetails?.actualStartTime && liveDetails?.scheduledStartTime)) {
      status = "upcoming";
    } else if (liveDetails?.actualEndTime || liveDetails?.actualStartTime || snippet?.liveBroadcastContent === "none") {
      status = "completed";
    }

    return {
      videoId,
      url: `https://www.youtube.com/watch?v=${videoId}`,
      title: snippet?.title || "Untitled Stream",
      description: snippet?.description || "",
      channelId: channel.channelId,
      channelTitle: snippet?.channelTitle || channel.title,
      status,
      publishedAt: normalizeIsoDate(snippet?.publishedAt),
      scheduledStartTime: normalizeIsoDate(liveDetails?.scheduledStartTime),
      actualStartTime: normalizeIsoDate(liveDetails?.actualStartTime),
      actualEndTime: normalizeIsoDate(liveDetails?.actualEndTime),
      duration: formatDuration(contentDetails?.duration || undefined),
      viewCount: statistics?.viewCount ? parseInt(statistics.viewCount, 10) : undefined,
      concurrentViewers: liveDetails?.concurrentViewers ? parseInt(liveDetails.concurrentViewers, 10) : undefined,
      thumbnailUrl:
        snippet?.thumbnails?.maxres?.url ||
        snippet?.thumbnails?.high?.url ||
        snippet?.thumbnails?.medium?.url ||
        undefined,
    };
  });

  // Sort sessions: live broadcasts first, then newest completed/upcoming
  sessions.sort((a, b) => {
    if (a.status === "live" && b.status !== "live") return -1;
    if (b.status === "live" && a.status !== "live") return 1;

    const timeA = new Date(a.actualStartTime || a.scheduledStartTime || a.publishedAt || 0).getTime();
    const timeB = new Date(b.actualStartTime || b.scheduledStartTime || b.publishedAt || 0).getTime();
    return timeB - timeA;
  });

  return { channel, sessions: sessions.slice(0, limit) };
}

/**
 * Fetches rich details for an individual video watch page (fallback metadata scraper).
 */
async function fetchWatchPageDetails(videoId: string): Promise<Partial<LiveSession> | null> {
  try {
    const res = await fetch(`https://www.youtube.com/watch?v=${videoId}`, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
        "Accept-Language": "en-US,en;q=0.9",
        "Cookie": "PREF=hl=en&gl=US",
      },
    });

    if (!res.ok) return null;
    const html = await res.text();
    const match = html.match(/var ytInitialPlayerResponse = ({.*?});<\/script>/s);
    if (!match) return null;

    const data = JSON.parse(match[1]);
    const vd = data.videoDetails;
    const mf = data.microformat?.playerMicroformatRenderer;
    const liveDetails = mf?.liveBroadcastDetails;

    let status: LiveStreamStatus = "unknown";
    if (liveDetails?.isLiveNow || (liveDetails?.startTimestamp && !liveDetails?.endTimestamp)) {
      status = "live";
    } else if (liveDetails?.startTimestamp === undefined && liveDetails?.scheduledStartTime) {
      status = "upcoming";
    } else if (liveDetails?.endTimestamp || liveDetails?.startTimestamp) {
      status = "completed";
    }

    return {
      title: vd?.title || mf?.title?.simpleText,
      description: vd?.shortDescription || mf?.description?.simpleText || "",
      channelId: vd?.channelId || mf?.externalChannelId,
      channelTitle: vd?.author || mf?.ownerChannelName,
      status,
      publishedAt: normalizeIsoDate(mf?.publishDate || mf?.uploadDate),
      actualStartTime: normalizeIsoDate(liveDetails?.startTimestamp),
      actualEndTime: normalizeIsoDate(liveDetails?.endTimestamp),
      scheduledStartTime: normalizeIsoDate(liveDetails?.scheduledStartTime),
      duration: formatSecondsToDuration(vd?.lengthSeconds),
      viewCount: vd?.viewCount ? parseInt(vd.viewCount, 10) : undefined,
      concurrentViewers: status === "live" && vd?.viewCount ? parseInt(vd.viewCount, 10) : undefined,
      thumbnailUrl:
        mf?.thumbnail?.thumbnails?.slice(-1)[0]?.url ||
        vd?.thumbnail?.thumbnails?.slice(-1)[0]?.url ||
        `https://i.ytimg.com/vi/${videoId}/maxresdefault.jpg`,
    };
  } catch {
    return null;
  }
}

/**
 * FALLBACK PATH: Scrapes the channel's `/streams` tab directly and enriches video details.
 * Output format and types match `listChannelLiveStreams` 100%.
 */
export async function scrapeChannelStreamsTab(
  channelIdentifier: string,
  options: ListLiveStreamsOptions = {}
): Promise<LiveStreamsResult> {
  const parsed = parseChannelIdentifier(channelIdentifier);
  let targetUrl: string;

  if (parsed.type === "handle") {
    targetUrl = `https://www.youtube.com/${parsed.value}/streams`;
  } else if (parsed.type === "channelId") {
    targetUrl = `https://www.youtube.com/channel/${parsed.value}/streams`;
  } else {
    targetUrl = `https://www.youtube.com/@${parsed.value.replace(/^@/, "")}/streams`;
  }

  const response = await fetch(targetUrl, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
      "Accept-Language": "en-US,en;q=0.9",
      "Cookie": "PREF=hl=en&gl=US",
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch channel streams tab (${response.status} ${response.statusText}): ${targetUrl}`);
  }

  const html = await response.text();
  const jsonMatch = html.match(/var ytInitialData = ({.*?});<\/script>/s) || html.match(/ytInitialData\s*=\s*({.*?});/s);

  if (!jsonMatch) {
    throw new Error("Could not parse YouTube initial stream data from page HTML.");
  }

  const data = JSON.parse(jsonMatch[1]);
  const channelMeta = data.metadata?.channelMetadataRenderer;
  const channelTitle =
    channelMeta?.title ||
    data.header?.c4TabbedHeaderRenderer?.title ||
    data.header?.pageHeaderRenderer?.pageTitle ||
    parsed.value;

  const channelId =
    channelMeta?.externalId ||
    data.header?.c4TabbedHeaderRenderer?.channelId ||
    "";

  const handle =
    parsed.type === "handle"
      ? parsed.value
      : channelMeta?.vanityChannelUrl
      ? `@${channelMeta.vanityChannelUrl.split("@")[1] || channelMeta.vanityChannelUrl}`
      : `@${channelTitle.replace(/\s+/g, "")}`;

  const channel: ChannelInfo = {
    channelId,
    title: channelTitle,
    handle,
    description: channelMeta?.description || "",
    customUrl: channelMeta?.channelUrl || channelMeta?.vanityChannelUrl || undefined,
    thumbnailUrl:
      channelMeta?.avatar?.thumbnails?.slice(-1)[0]?.url ||
      data.header?.c4TabbedHeaderRenderer?.avatar?.thumbnails?.slice(-1)[0]?.url ||
      undefined,
  };

  // Traverse tabs to find "Live" tab contents
  const tabs = data.contents?.twoColumnBrowseResultsRenderer?.tabs || [];
  const liveTab =
    tabs.find((t: any) => t.tabRenderer?.selected) ||
    tabs.find((t: any) =>
      /live|streams|لائیو/i.test(
        t.tabRenderer?.title || t.tabRenderer?.endpoint?.commandMetadata?.webCommandMetadata?.url || ""
      )
    );

  const contents =
    liveTab?.tabRenderer?.content?.richGridRenderer?.contents ||
    liveTab?.tabRenderer?.content?.sectionListRenderer?.contents?.[0]?.itemSectionRenderer?.contents?.[0]?.gridRenderer?.items ||
    [];

  const initialSessions: Array<{
    videoId: string;
    title: string;
    preliminaryStatus: LiveStreamStatus;
    preliminaryThumbnail?: string;
  }> = [];

  for (const item of contents) {
    // 1. Support modern lockupViewModel layout
    const lockup = item.richItemRenderer?.content?.lockupViewModel;
    if (lockup) {
      const videoId =
        lockup.contentId ||
        lockup.rendererContext?.commandContext?.onTap?.innertubeCommand?.watchEndpoint?.videoId;

      if (!videoId) continue;

      const title =
        lockup.metadata?.lockupMetadataViewModel?.title?.content ||
        lockup.rendererContext?.accessibilityContext?.label ||
        "Untitled Stream";

      const rows = lockup.metadata?.lockupMetadataViewModel?.metadata?.contentMetadataViewModel?.metadataRows || [];
      const metaTexts: string[] = rows
        .flatMap((r: any) => r.metadataParts?.map((p: any) => p.text?.content))
        .filter(Boolean);

      const overlays =
        lockup.contentImage?.collectionThumbnailViewModel?.primaryThumbnail?.thumbnailViewModel?.overlays || [];

      let isLiveNow = false;
      let isUpcoming = false;

      for (const overlay of overlays) {
        const badge = overlay.thumbnailBadgeViewModel;
        if (badge) {
          if (badge.badgeStyle === "BADGE_STYLE_TYPE_LIVE_NOW" || /LIVE/i.test(badge.text || "")) {
            isLiveNow = true;
          } else if (/UPCOMING/i.test(badge.text || "")) {
            isUpcoming = true;
          }
        }
      }

      const metaString = metaTexts.join(" • ");
      if (!isLiveNow && /watching/i.test(metaString)) isLiveNow = true;
      if (!isUpcoming && /scheduled|upcoming/i.test(metaString)) isUpcoming = true;

      const preliminaryStatus: LiveStreamStatus = isLiveNow ? "live" : isUpcoming ? "upcoming" : "completed";
      const preliminaryThumbnail =
        lockup.contentImage?.collectionThumbnailViewModel?.primaryThumbnail?.thumbnailViewModel?.image?.sources?.slice(-1)[0]?.url;

      initialSessions.push({ videoId, title, preliminaryStatus, preliminaryThumbnail });
      continue;
    }

    // 2. Support classic videoRenderer layout
    const videoRenderer = item.richItemRenderer?.content?.videoRenderer || item.gridVideoRenderer;
    if (videoRenderer && videoRenderer.videoId) {
      const videoId = videoRenderer.videoId;
      const title =
        videoRenderer.title?.runs?.[0]?.text || videoRenderer.title?.simpleText || "Untitled Stream";

      const badges =
        videoRenderer.badges?.map((b: any) => b.metadataBadgeRenderer?.label || "").filter(Boolean) || [];
      const isLiveNow = badges.some((b: string) => /LIVE/i.test(b));
      const isUpcoming = badges.some((b: string) => /UPCOMING/i.test(b));

      const preliminaryStatus: LiveStreamStatus = isLiveNow ? "live" : isUpcoming ? "upcoming" : "completed";
      const preliminaryThumbnail = videoRenderer.thumbnail?.thumbnails?.slice(-1)[0]?.url;

      initialSessions.push({ videoId, title, preliminaryStatus, preliminaryThumbnail });
    }
  }

  const limit = options.maxResults || 20;
  const sessionsToEnrich = initialSessions.slice(0, limit);

  // Concurrently fetch watch page details to enrich fields to 100% match googleapis output
  const enrichedSessions: LiveSession[] = await Promise.all(
    sessionsToEnrich.map(async (init) => {
      const watchDetails = await fetchWatchPageDetails(init.videoId);

      const status: LiveStreamStatus =
        watchDetails?.status && watchDetails.status !== "unknown"
          ? watchDetails.status
          : init.preliminaryStatus;

      return {
        videoId: init.videoId,
        url: `https://www.youtube.com/watch?v=${init.videoId}`,
        title: watchDetails?.title || init.title,
        description: watchDetails?.description || "",
        channelId: watchDetails?.channelId || channel.channelId,
        channelTitle: watchDetails?.channelTitle || channel.title,
        status,
        publishedAt: watchDetails?.publishedAt,
        scheduledStartTime: watchDetails?.scheduledStartTime,
        actualStartTime: watchDetails?.actualStartTime,
        actualEndTime: watchDetails?.actualEndTime,
        duration: watchDetails?.duration,
        viewCount: watchDetails?.viewCount,
        concurrentViewers: watchDetails?.concurrentViewers,
        thumbnailUrl:
          watchDetails?.thumbnailUrl ||
          init.preliminaryThumbnail ||
          `https://i.ytimg.com/vi/${init.videoId}/maxresdefault.jpg`,
      };
    })
  );

  // Sort sessions: live streams first, then newest start/publish time
  enrichedSessions.sort((a, b) => {
    if (a.status === "live" && b.status !== "live") return -1;
    if (b.status === "live" && a.status !== "live") return 1;

    const timeA = new Date(a.actualStartTime || a.scheduledStartTime || a.publishedAt || 0).getTime();
    const timeB = new Date(b.actualStartTime || b.scheduledStartTime || b.publishedAt || 0).getTime();
    return timeB - timeA;
  });

  return { channel, sessions: enrichedSessions };
}
