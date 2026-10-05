import "dotenv/config";
import {
  addChannel,
  listChannels,
  updateChannel,
} from "./services/db/channels.service.js";
import { fetchChannelMetadata } from "./services/youtube/streams.js";

function printHelp() {
  console.log(`
============================================================================
📺 YOUTUBE CHANNELS TRACKER MANAGER
============================================================================
Manage channels tracked in Supabase for automated livestream trade analysis.

USAGE:
  pnpm manage-channels [options]

COMMANDS & OPTIONS:
  --add <url|handle>        Add or update a channel to track (e.g. @TradeLikeMalika)
  --title <title>           Optional custom title for the channel
  --refresh                 Refresh metadata (title, ID, description, thumbnail) for tracked channels
  --list                    List all tracked channels in Supabase
  --all                     Include deactivated channels in the listing
  --disable <channelId>     Deactivate tracking for a channel
  --enable <channelId>      Reactivate tracking for a channel
  --help                    Show this help message

EXAMPLES:
  pnpm manage-channels --add https://www.youtube.com/@TradeLikeMalika
  pnpm manage-channels --add @TheTradingChannel --title "The Trading Channel"
  pnpm manage-channels --refresh
  pnpm manage-channels --list
  pnpm manage-channels --disable 123e4567-e89b-12d3-a456-426614174000
============================================================================
`);
}

async function main() {
  const args = process.argv.slice(2);

  if (args.includes("--help") || args.includes("-h")) {
    printHelp();
    return;
  }

  const addIdx = args.indexOf("--add");
  const disableIdx = args.indexOf("--disable");
  const enableIdx = args.indexOf("--enable");
  const refresh = args.includes("--refresh");
  const isMutating = addIdx !== -1 || disableIdx !== -1 || enableIdx !== -1 || refresh;

  if (isMutating && !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error(`\n⚠️ Missing SUPABASE_SERVICE_ROLE_KEY in .env!`);
    console.error(`Adding, enabling, or disabling channels requires the Supabase service_role key to bypass Row Level Security (RLS).`);
    console.error(`👉 Get your service_role key from your Supabase Dashboard:`);
    console.error(`   https://supabase.com/dashboard/project/REDACTED_SUPABASE_PROJECT_ID/settings/api`);
    console.error(`   And paste it into .env:`);
    console.error(`   SUPABASE_SERVICE_ROLE_KEY=eyJ...\n`);
    process.exit(1);
  }

  // Handle --refresh
  if (refresh) {
    console.log(`\n🔄 Refreshing metadata for tracked channels in Supabase...`);
    const channels = await listChannels(false);
    let updated = 0;
    for (const c of channels) {
      try {
        console.log(`   Fetching details for ${c.channel_url}...`);
        const meta = await fetchChannelMetadata(c.channel_url);
        await updateChannel(c.id, {
          title: meta.title || c.title || null,
          channel_id: meta.channelId || c.channel_id || null,
          description: meta.description || c.description || null,
          thumbnail_url: meta.thumbnailUrl || c.thumbnail_url || null,
        });
        console.log(`   ✅ Updated: "${meta.title}" (${meta.channelId})`);
        updated++;
      } catch (err: any) {
        console.warn(`   ⚠️ Failed to refresh ${c.channel_url}: ${err.message || err}`);
      }
    }
    console.log(`\n🎉 Successfully refreshed metadata for ${updated} channel(s).\n`);
    return;
  }

  // Handle --add
  if (addIdx !== -1 && args[addIdx + 1]) {
    let channelInput = args[addIdx + 1].trim();
    if (!channelInput.startsWith("http://") && !channelInput.startsWith("https://")) {
      const handle = channelInput.startsWith("@") ? channelInput : `@${channelInput}`;
      channelInput = `https://www.youtube.com/${handle}`;
    }

    const titleIdx = args.indexOf("--title");
    const explicitTitle = titleIdx !== -1 && args[titleIdx + 1] ? args[titleIdx + 1] : undefined;

    console.log(`\n➕ Resolving channel metadata for: ${channelInput}...`);
    let channelId: string | null = null;
    let fetchedTitle: string | null = null;
    let description: string | null = null;
    let thumbnailUrl: string | null = null;

    try {
      const meta = await fetchChannelMetadata(channelInput);
      channelId = meta.channelId || null;
      fetchedTitle = meta.title || null;
      description = meta.description || null;
      thumbnailUrl = meta.thumbnailUrl || null;
      console.log(`   ✅ Found: "${fetchedTitle}" (Channel ID: ${channelId || "N/A"})`);
    } catch (err: any) {
      console.warn(`   ⚠️ Could not resolve full channel metadata: ${err.message || err}`);
    }

    const finalTitle = explicitTitle || fetchedTitle || null;

    console.log(`💾 Saving channel into Supabase...`);
    const channel = await addChannel({
      channel_url: channelInput,
      title: finalTitle,
      description,
      thumbnail_url: thumbnailUrl,
      channel_id: channelId,
      is_active: true,
    });

    console.log(`✅ Channel successfully saved in Supabase!`);
    console.log(`   ID:           ${channel.id}`);
    console.log(`   Channel ID:   ${channel.channel_id || "N/A"}`);
    console.log(`   Title:        ${channel.title || "N/A"}`);
    console.log(`   URL:          ${channel.channel_url}`);
    if (channel.description) {
      console.log(`   Description:  ${channel.description.slice(0, 80).replace(/\n/g, " ")}...`);
    }
    if (channel.thumbnail_url) {
      console.log(`   Thumbnail:    ${channel.thumbnail_url}`);
    }
    console.log(`   Active:       ${channel.is_active ? "YES" : "NO"}\n`);
    return;
  }

  // Handle --disable
  if (disableIdx !== -1 && args[disableIdx + 1]) {
    const id = args[disableIdx + 1];
    const channel = await updateChannel(id, { is_active: false });
    console.log(`\n🛑 Deactivated channel: ${channel.title || channel.channel_url} (${channel.id})\n`);
    return;
  }

  // Handle --enable
  if (enableIdx !== -1 && args[enableIdx + 1]) {
    const id = args[enableIdx + 1];
    const channel = await updateChannel(id, { is_active: true });
    console.log(`\n🟢 Activated channel: ${channel.title || channel.channel_url} (${channel.id})\n`);
    return;
  }

  // Handle --list or default
  const showAll = args.includes("--all");
  console.log(`\n📋 Querying tracked channels from Supabase (activeOnly: ${!showAll})...`);
  const channels = await listChannels(!showAll);

  if (channels.length === 0) {
    console.log(`ℹ️ No tracked channels found in database.`);
    console.log(`💡 Add your first channel with:`);
    console.log(`   pnpm manage-channels --add https://www.youtube.com/@TradeLikeMalika\n`);
    return;
  }

  console.log(`\n============================================================================`);
  console.log(`📺 TRACKED CHANNELS (${channels.length})`);
  console.log(`============================================================================`);
  channels.forEach((c, idx) => {
    const statusBadge = c.is_active ? "🟢 ACTIVE" : "⚪ DISABLED";
    console.log(`[${idx + 1}] ${c.title || c.channel_url}`);
    console.log(`    🆔 DB ID:        ${c.id}`);
    console.log(`    📺 Channel ID:   ${c.channel_id || "N/A"}`);
    console.log(`    🔗 URL:          ${c.channel_url}`);
    if (c.description) {
      const descSnippet = c.description.slice(0, 100).replace(/\n/g, " ");
      console.log(`    📝 Description:  ${descSnippet}${c.description.length > 100 ? "..." : ""}`);
    }
    if (c.thumbnail_url) {
      console.log(`    🖼️ Thumbnail:    ${c.thumbnail_url}`);
    }
    console.log(`    📊 Status:       ${statusBadge}`);
    console.log(
      `    ⏰ Last Checked: ${c.last_checked_at ? new Date(c.last_checked_at).toLocaleString() : "Never"}`
    );
    console.log(`    📅 Created:      ${new Date(c.created_at).toLocaleString()}`);
    console.log("");
  });
}

main().catch((err) => {
  console.error("\n❌ Error:", err.message || err);
  process.exit(1);
});
