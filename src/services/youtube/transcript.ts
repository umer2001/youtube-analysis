import { YoutubeTranscript } from "youtube-transcript";

export interface TranscriptItem {
  text: string;
  offset: number; // offset in milliseconds
  duration: number;
}

/**
 * Extracts YouTube video ID from various URL formats or returns the input if already an ID.
 */
export function extractVideoId(urlOrId: string): string {
  const match = urlOrId.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|v\/|live\/))([^?&"'>]+)/);
  return match ? match[1] : urlOrId.trim();
}

/**
 * Formats milliseconds into a human-readable timestamp [HH:MM:SS].
 */
export function formatTimestamp(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

/**
 * Fetches transcript for a YouTube video and formats it with stream timestamps.
 */
export async function getFormattedTranscript(videoUrlOrId: string): Promise<{
  videoId: string;
  totalChunks: number;
  formattedText: string;
}> {
  const videoId = extractVideoId(videoUrlOrId);
  const rawTranscript = await YoutubeTranscript.fetchTranscript(videoId);

  const formattedText = rawTranscript
    .map((item) => `[${formatTimestamp(item.offset)}] ${item.text}`)
    .join("\n");

  return {
    videoId,
    totalChunks: rawTranscript.length,
    formattedText,
  };
}
