import { YoutubeTranscript } from "npm:youtube-transcript";

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

/**
 * Fetches transcript for a YouTube video in Deno Edge Functions and formats with timestamps.
 */
export async function getFormattedTranscript(videoUrlOrId: string): Promise<{
  videoId: string;
  totalChunks: number;
  formattedText: string;
}> {
  const videoId = extractVideoId(videoUrlOrId);

  // Method 1: Try npm:youtube-transcript
  try {
    const rawTranscript = await YoutubeTranscript.fetchTranscript(videoId);
    if (rawTranscript && rawTranscript.length > 0) {
      const formattedText = rawTranscript
        .map((item) => `[${formatTimestamp(item.offset)}] ${item.text}`)
        .join("\n");

      return {
        videoId,
        totalChunks: rawTranscript.length,
        formattedText,
      };
    }
  } catch (_err: any) {
    // Continue to InnerTube fallback
  }

  // Method 2: Direct InnerTube Android client fetch
  try {
    const resp = await fetch("https://www.youtube.com/youtubei/v1/player", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent":
          "com.google.android.youtube/19.09.37 (Linux; U; Android 11) gzip",
      },
      body: JSON.stringify({
        context: {
          client: {
            clientName: "ANDROID",
            clientVersion: "19.09.37",
          },
        },
        videoId,
      }),
    });

    if (resp.ok) {
      const data = await resp.json();
      const captionTracks =
        data?.captions?.playerCaptionsTracklistRenderer?.captionTracks;

      if (Array.isArray(captionTracks) && captionTracks.length > 0) {
        const trackUrl = `${captionTracks[0].baseUrl}&fmt=json3`;
        const capResp = await fetch(trackUrl);

        if (capResp.ok) {
          const capData = await capResp.json();
          const events = capData.events || [];
          const chunks: string[] = [];

          for (const ev of events) {
            if (!ev.segs) continue;
            const text = ev.segs.map((s: any) => s.utf8 || "").join("").trim();
            if (text) {
              chunks.push(`[${formatTimestamp(ev.tStartMs || 0)}] ${text}`);
            }
          }

          if (chunks.length > 0) {
            return {
              videoId,
              totalChunks: chunks.length,
              formattedText: chunks.join("\n"),
            };
          }
        }
      }
    }
  } catch (_innerErr: any) {
    // continue
  }

  throw new Error(`Transcript unavailable or disabled for video ${videoId}.`);
}
