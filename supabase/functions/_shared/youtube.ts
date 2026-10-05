export interface DiscoveredStream {
  videoId: string;
  title: string;
  description?: string;
  publishedAt?: string;
  url: string;
}

export function parseChannelIdentifier(channelInput: string): {
  type: "handle" | "channelId" | "customUrl";
  value: string;
} {
  const trimmed = channelInput.trim();

  const handleMatch = trimmed.match(/(?:youtube\.com\/)?@([a-zA-Z0-9_\-\.]+)/);
  if (handleMatch) {
    return { type: "handle", value: `@${handleMatch[1]}` };
  }

  const idMatch = trimmed.match(
    /(?:youtube\.com\/channel\/)(UC[a-zA-Z0-9_\-]{22})/
  );
  if (idMatch) {
    return { type: "channelId", value: idMatch[1] };
  }

  if (trimmed.startsWith("UC") && trimmed.length === 24) {
    return { type: "channelId", value: trimmed };
  }

  if (trimmed.startsWith("@")) {
    return { type: "handle", value: trimmed };
  }

  return { type: "customUrl", value: trimmed };
}

/**
 * Scrapes the channel /streams tab using pure fetch in Deno.
 */
export async function scrapeChannelStreams(
  channelInput: string,
  maxResults = 10
): Promise<DiscoveredStream[]> {
  const parsed = parseChannelIdentifier(channelInput);
  let targetUrl: string;

  if (parsed.type === "handle") {
    targetUrl = `https://www.youtube.com/${parsed.value}/streams`;
  } else if (parsed.type === "channelId") {
    targetUrl = `https://www.youtube.com/channel/${parsed.value}/streams`;
  } else {
    targetUrl = channelInput.includes("/streams")
      ? channelInput
      : `${channelInput.replace(/\/$/, "")}/streams`;
  }

  const response = await fetch(targetUrl, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
      "Accept-Language": "en-US,en;q=0.9",
    },
  });

  if (!response.ok) {
    throw new Error(
      `Failed to scrape channel streams (${response.status} ${response.statusText}): ${targetUrl}`
    );
  }

  const html = await response.text();
  const jsonMatch = html.match(/var ytInitialData\s*=\s*({.+?});\s*<\/script>/s);

  if (!jsonMatch) {
    return [];
  }

  const data = JSON.parse(jsonMatch[1]);
  const streams: DiscoveredStream[] = [];

  // Traverse tabs -> richGridRenderer / itemSectionRenderer -> videoRenderer
  const tabs =
    data?.contents?.twoColumnBrowseResultsRenderer?.tabs || [];

  for (const tab of tabs) {
    const contents =
      tab?.tabRenderer?.content?.richGridRenderer?.contents ||
      tab?.tabRenderer?.content?.sectionListRenderer?.contents ||
      [];

    for (const item of contents) {
      const renderers = [
        item?.richItemRenderer?.content?.videoRenderer,
        item?.videoRenderer,
        item?.compactVideoRenderer,
      ].filter(Boolean);

      for (const v of renderers) {
        if (!v?.videoId) continue;

        const title =
          v?.title?.runs?.map((r: any) => r.text).join("") ||
          v?.title?.simpleText ||
          `Stream ${v.videoId}`;

        const isLive = v?.badges?.some(
          (b: any) =>
            b?.metadataBadgeRenderer?.style === "BADGE_STYLE_TYPE_LIVE_NOW" ||
            b?.metadataBadgeRenderer?.label?.toLowerCase().includes("live")
        );

        // We only want completed livestreams
        if (isLive) continue;

        streams.push({
          videoId: v.videoId,
          title,
          url: `https://www.youtube.com/watch?v=${v.videoId}`,
        });

        if (streams.length >= maxResults) {
          return streams;
        }
      }
    }
  }

  return streams;
}

/**
 * Discovers completed livestreams using YouTube Data API v3 if API key exists, otherwise scrapes.
 */
export async function fetchCompletedLivestreams(
  channelUrl: string,
  maxResults = 10
): Promise<DiscoveredStream[]> {
  const apiKey = Deno.env.get("YOUTUBE_API_KEY");

  if (!apiKey) {
    return await scrapeChannelStreams(channelUrl, maxResults);
  }

  try {
    const parsed = parseChannelIdentifier(channelUrl);
    let channelId = parsed.type === "channelId" ? parsed.value : undefined;

    if (!channelId) {
      // Resolve handle or customUrl to channelId
      const resolveUrl = `https://www.googleapis.com/youtube/v3/search?part=snippet&type=channel&q=${encodeURIComponent(
        parsed.value
      )}&key=${apiKey}`;
      const res = await fetch(resolveUrl);
      if (res.ok) {
        const searchData = await res.json();
        channelId = searchData.items?.[0]?.snippet?.channelId;
      }
    }

    if (!channelId) {
      return await scrapeChannelStreams(channelUrl, maxResults);
    }

    const searchStreamsUrl = `https://www.googleapis.com/youtube/v3/search?part=snippet&channelId=${channelId}&eventType=completed&type=video&maxResults=${maxResults}&order=date&key=${apiKey}`;
    const streamsRes = await fetch(searchStreamsUrl);

    if (!streamsRes.ok) {
      return await scrapeChannelStreams(channelUrl, maxResults);
    }

    const streamsData = await streamsRes.json();
    const items = streamsData.items || [];

    return items.map((item: any) => ({
      videoId: item.id?.videoId,
      title: item.snippet?.title || `Stream ${item.id?.videoId}`,
      description: item.snippet?.description,
      publishedAt: item.snippet?.publishedAt,
      url: `https://www.youtube.com/watch?v=${item.id?.videoId}`,
    }));
  } catch (_err) {
    return await scrapeChannelStreams(channelUrl, maxResults);
  }
}
