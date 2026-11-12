const INNERTUBE_API_URL =
  "https://www.youtube.com/youtubei/v1/player?prettyPrint=false";
const INNERTUBE_CLIENT_VERSION = "20.10.38";
const INNERTUBE_CONTEXT = {
  client: {
    clientName: "ANDROID",
    clientVersion: INNERTUBE_CLIENT_VERSION,
  },
};
const INNERTUBE_USER_AGENT = `com.google.android.youtube/${INNERTUBE_CLIENT_VERSION} (Linux; U; Android 14)`;
const WEB_USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36";
const RE_XML_TRANSCRIPT =
  /<text start="([^"]*)" dur="([^"]*)">([^<]*)<\/text>/g;

export function extractVideoId(urlOrId: string): string {
  const match = urlOrId.match(
    /(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|v\/|live\/))([^?&"'>]+)/
  );
  return match ? match[1] : urlOrId.trim();
}

export function formatTimestamp(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function decodeEntities(text: string): string {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) =>
      String.fromCodePoint(parseInt(hex, 16))
    )
    .replace(/&#(\d+);/g, (_, dec) =>
      String.fromCodePoint(parseInt(dec, 10))
    );
}

function parseTranscriptXml(
  xml: string
): Array<{ text: string; offset: number; duration: number }> {
  const results: Array<{ text: string; offset: number; duration: number }> = [];

  // 1. Try srv3 / format 3: <p t="ms" d="ms"><s>word</s>...</p>
  const pRegex = /<p\s+t="(\d+)"\s+d="(\d+)"[^>]*>([\s\S]*?)<\/p>/g;
  let match: RegExpExecArray | null;
  while ((match = pRegex.exec(xml)) !== null) {
    const startMs = parseInt(match[1], 10);
    const durMs = parseInt(match[2], 10);
    const inner = match[3];
    let text = "";
    const sRegex = /<s[^>]*>([^<]*)<\/s>/g;
    let sMatch: RegExpExecArray | null;
    while ((sMatch = sRegex.exec(inner)) !== null) {
      text += sMatch[1];
    }
    if (!text) {
      text = inner.replace(/<[^>]+>/g, "");
    }
    text = decodeEntities(text).trim();
    if (text) {
      results.push({ text, offset: startMs, duration: durMs });
    }
  }

  if (results.length > 0) return results;

  // 2. Try classic format: <text start="s" dur="s">content</text>
  const classicMatches = [...xml.matchAll(RE_XML_TRANSCRIPT)];
  return classicMatches.map((m) => ({
    text: decodeEntities(m[3]).trim(),
    offset: Math.floor(parseFloat(m[1]) * 1000),
    duration: Math.floor(parseFloat(m[2]) * 1000),
  }));
}

export function getProxyList(): string[] {
  const envProxies = Deno.env.get("WEBSHARE_PROXIES");
  if (envProxies) {
    return envProxies.split(",").map((p) => p.trim()).filter(Boolean);
  }
  return [];
}

export function extractCaptionTracks(html: string): any[] | null {
  const marker = '"captionTracks":';
  const startIdx = html.indexOf(marker);
  if (startIdx === -1) return null;

  const jsonStart = html.indexOf("[", startIdx);
  if (jsonStart === -1) return null;

  let depth = 0;
  let inString = false;
  let escape = false;

  for (let i = jsonStart; i < html.length; i++) {
    const char = html[i];

    if (escape) {
      escape = false;
      continue;
    }
    if (char === "\\") {
      escape = true;
      continue;
    }
    if (char === '"') {
      inString = !inString;
      continue;
    }

    if (!inString) {
      if (char === "[") depth++;
      else if (char === "]") {
        depth--;
        if (depth === 0) {
          try {
            return JSON.parse(html.slice(jsonStart, i + 1));
          } catch {
            return null;
          }
        }
      }
    }
  }

  return null;
}

/**
 * Pure fetch & parse transcript extractor for YouTube videos.
 * Tries:
 * 1. InnerTube API via rotating Webshare proxies
 * 2. InnerTube API direct
 * 3. Watch page scraping via rotating Webshare proxies
 */
export async function getFormattedTranscript(videoUrlOrId: string): Promise<{
  videoId: string;
  totalChunks: number;
  formattedText: string;
}> {
  const videoId = extractVideoId(videoUrlOrId);
  const proxies = getProxyList();
  const innertubeBody = JSON.stringify({
    context: INNERTUBE_CONTEXT,
    videoId,
  });
  const TIMEDTEXT_UA =
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_4) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/85.0.4183.83 Safari/537.36,gzip(gfe)";

  // Helper to fetch and parse timedtext XML
  async function tryFetchTimedText(trackUrl: string, client?: any) {
    // Try direct first (clean Supabase egress), then proxy if needed
    const clientsToTry = [undefined, client].filter((c, i, a) => i === 0 || c !== undefined);
    for (const c of clientsToTry) {
      try {
        const resp = await fetch(trackUrl, {
          ...(c ? { client: c } : {}),
          headers: { "User-Agent": TIMEDTEXT_UA },
        });
        if (resp.ok) {
          const xml = await resp.text();
          if (xml.length > 0 && (xml.includes("<timedtext") || xml.includes("<p t="))) {
            const items = parseTranscriptXml(xml);
            if (items.length > 0) return items;
          }
        }
      } catch {}
    }
    return null;
  }

  // Method 1: InnerTube API via rotating proxies
  for (const proxyUrl of proxies) {
    try {
      const client = typeof (Deno as any).createHttpClient === "function"
        ? (Deno as any).createHttpClient({ proxy: { url: proxyUrl } })
        : undefined;

      const resp = await fetch(INNERTUBE_API_URL, {
        ...(client ? { client } : {}),
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "User-Agent": INNERTUBE_USER_AGENT,
        },
        body: innertubeBody,
      });

      if (!resp.ok) continue;

      const data = await resp.json();
      const captionTracks =
        data?.captions?.playerCaptionsTracklistRenderer?.captionTracks;
      if (Array.isArray(captionTracks) && captionTracks.length > 0) {
        const trackUrl = captionTracks[0].baseUrl;
        const items = await tryFetchTimedText(trackUrl, client);
        if (items && items.length > 0) {
          const formattedText = items
            .map((it) => `[${formatTimestamp(it.offset)}] ${it.text}`)
            .join("\n");
          return { videoId, totalChunks: items.length, formattedText };
        }
      }
    } catch (_err) {
      // Continue to next proxy
    }
  }

  // Method 2: Direct InnerTube (without proxy)
  try {
    const resp = await fetch(INNERTUBE_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": INNERTUBE_USER_AGENT,
      },
      body: innertubeBody,
    });

    if (resp.ok) {
      const data = await resp.json();
      const captionTracks =
        data?.captions?.playerCaptionsTracklistRenderer?.captionTracks;
      if (Array.isArray(captionTracks) && captionTracks.length > 0) {
        const trackUrl = captionTracks[0].baseUrl;
        const items = await tryFetchTimedText(trackUrl);
        if (items && items.length > 0) {
          const formattedText = items
            .map((it) => `[${formatTimestamp(it.offset)}] ${it.text}`)
            .join("\n");
          return { videoId, totalChunks: items.length, formattedText };
        }
      }
    }
  } catch (_e) {
    // Continue
  }

  // Method 3: Watch page scraping via rotating proxies
  for (const proxyUrl of proxies) {
    try {
      const client = typeof (Deno as any).createHttpClient === "function"
        ? (Deno as any).createHttpClient({ proxy: { url: proxyUrl } })
        : undefined;

      const pageResp = await fetch(`https://www.youtube.com/watch?v=${videoId}`, {
        ...(client ? { client } : {}),
        headers: {
          "User-Agent": WEB_USER_AGENT,
          "Accept-Language": "en-US,en;q=0.9",
          Cookie: "PREF=hl=en&gl=US",
        },
      });

      if (!pageResp.ok) continue;

      const html = await pageResp.text();
      if (html.includes("Sign in to confirm")) continue;

      const tracks = extractCaptionTracks(html);
      if (Array.isArray(tracks) && tracks.length > 0) {
        const trackUrl = tracks[0].baseUrl;
        const items = await tryFetchTimedText(trackUrl, client);
        if (items && items.length > 0) {
          const formattedText = items
            .map((it) => `[${formatTimestamp(it.offset)}] ${it.text}`)
            .join("\n");
          return { videoId, totalChunks: items.length, formattedText };
        }
      }
    } catch (_err) {
      // Continue to next proxy
    }
  }

  throw new Error(`Transcript unavailable or disabled for video ${videoId}.`);
}
