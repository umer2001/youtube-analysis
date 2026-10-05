import "dotenv/config";
import {
  listChannelLiveStreams,
  scrapeChannelStreamsTab,
  parseChannelIdentifier,
  getValidYouTubeApiKey,
} from "./services/youtube/streams.js";
import { LiveSession, LiveStreamsResult } from "./types/stream.js";

function getStatusBadge(status: LiveSession["status"]): string {
  switch (status) {
    case "live":
      return "🔴 LIVE NOW";
    case "upcoming":
      return "⏳ UPCOMING";
    case "completed":
      return "🏁 COMPLETED";
    default:
      return "⚪ STREAM";
  }
}

async function main() {
  const args = process.argv.slice(2);
  const isJson = args.includes("--json");
  const filteredArgs = args.filter((a) => !a.startsWith("--"));
  const channelInput = filteredArgs[0] || "https://www.youtube.com/@TradeLikeMalika";

  const parsed = parseChannelIdentifier(channelInput);

  if (!isJson) {
    console.log("============================================================================");
    console.log("📺 YOUTUBE LIVE SESSION EXPLORER");
    console.log(`🎯 Target Channel: ${channelInput} (${parsed.type}: ${parsed.value})`);
    console.log("============================================================================\n");
  }

  let result: LiveStreamsResult;

  const hasApiKey = Boolean(getValidYouTubeApiKey());

  try {
    if (!hasApiKey) {
      if (!isJson) {
        console.log("ℹ️  No YOUTUBE_API_KEY configured in .env (add one to use official Google Data API v3).");
        console.log("🌐 Ingesting live sessions via YouTube channel streams tab...\n");
      }
      result = await scrapeChannelStreamsTab(channelInput);
    } else {
      if (!isJson) {
        console.log("🔑 Google YouTube Data API v3 key detected.");
        console.log("🤖 Attempting primary path: Fetching via 'googleapis' package...");
      }
      result = await listChannelLiveStreams(channelInput, { maxResults: 25 });
      if (!isJson) {
        console.log("✅ Successfully retrieved live stream data via Google YouTube API.\n");
      }
    }
  } catch (err: any) {
    if (!isJson) {
      console.warn(`⚠️ Primary path (googleapis) failed: ${err.message || err}`);
      console.log("🔄 Switching to Fallback: Scraping channel streams tab directly...\n");
    }

    result = await scrapeChannelStreamsTab(channelInput);

    if (!isJson) {
      console.log(`✅ Loaded ${result.sessions.length} sessions from YouTube streams tab.\n`);
    }
  }

  if (isJson) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  // Display Channel Overview
  console.log("----------------------------------------------------------------------------");
  console.log(`📺 Channel:  ${result.channel.title}`);
  if (result.channel.channelId) {
    console.log(`🆔 ID:       ${result.channel.channelId}`);
  }
  if (result.channel.handle) {
    console.log(`👤 Handle:   ${result.channel.handle}`);
  }
  console.log(`📊 Found:    ${result.sessions.length} live stream session(s)`);
  console.log("----------------------------------------------------------------------------\n");

  if (result.sessions.length === 0) {
    console.log("ℹ️ No livestream sessions found for this channel.");
    return;
  }

  // Print list of sessions
  result.sessions.forEach((session, idx) => {
    const badge = getStatusBadge(session.status);
    console.log(`[${idx + 1}] ${badge} | ${session.title}`);
    console.log(`    🔗 URL:      ${session.url}`);

    if (session.actualStartTime) {
      console.log(`    ⏱️  Started:   ${new Date(session.actualStartTime).toLocaleString()}`);
    }
    if (session.actualEndTime) {
      console.log(`    ⏹️  Ended:     ${new Date(session.actualEndTime).toLocaleString()}`);
    }
    if (session.scheduledStartTime && !session.actualStartTime) {
      console.log(`    ⏱️  Scheduled: ${new Date(session.scheduledStartTime).toLocaleString()}`);
    } else if (session.publishedAt && !session.actualStartTime) {
      console.log(`    📅 Published: ${new Date(session.publishedAt).toLocaleString()}`);
    }

    if (session.duration) {
      console.log(`    ⏳ Duration: ${session.duration}`);
    }

    if (session.concurrentViewers !== undefined) {
      console.log(`    👥 Watching: ${session.concurrentViewers.toLocaleString()} live viewers`);
    } else if (session.viewCount !== undefined) {
      console.log(`    👁️  Views:    ${session.viewCount.toLocaleString()}`);
    }

    console.log("");
  });

  console.log("============================================================================");
  console.log("💡 Tip: To run trade analysis on any of these streams with Gemini, run:");
  const sampleUrl = result.sessions[0]?.url || "https://www.youtube.com/watch?v=...";
  console.log(`   pnpm start "${sampleUrl}"`);
  console.log("============================================================================\n");
}

main().catch((err) => {
  console.error("\n❌ Error retrieving channel live streams:", err);
  process.exit(1);
});
