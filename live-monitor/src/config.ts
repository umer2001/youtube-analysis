import dotenv from "dotenv";

dotenv.config();

export interface ServerConfig {
  port: number;
  geminiApiKey: string;
  geminiModel: string;
  supabaseUrl: string;
  supabaseKey: string;
  youtubeApiKey?: string;
  pollIntervalSeconds: number;
  maxConcurrentStreams: number;
  pushoverUserKey?: string;
  pushoverAppToken?: string;
  pushoverDevice?: string;
  pushoverEmergency: boolean;
  pushoverPriority?: number;
  pushoverSound?: string;
  telegramBotToken?: string;
  telegramChatId?: string;
  youtubeCookies?: string;
  cookiesFile?: string;
  verbose: boolean;
  debounceMinutes: number;
}

export function loadConfig(): ServerConfig {
  const geminiApiKey = process.env.GEMINI_API_KEY;
  if (!geminiApiKey) {
    throw new Error("GEMINI_API_KEY environment variable is required.");
  }

  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  if (!supabaseUrl) {
    throw new Error("SUPABASE_URL environment variable is required.");
  }

  const supabaseKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_ANON_KEY ||
    process.env.VITE_SUPABASE_ANON_KEY ||
    process.env.SUPABASE_KEY;
  if (!supabaseKey) {
    throw new Error("SUPABASE_KEY (or SUPABASE_SERVICE_ROLE_KEY / SUPABASE_ANON_KEY) is required.");
  }

  const port = parseInt(process.env.PORT || "3000", 10);
  const pollIntervalSeconds = Math.max(
    15,
    parseInt(process.env.POLL_INTERVAL_SECONDS || "60", 10)
  );
  const maxConcurrentStreams = Math.max(
    1,
    parseInt(process.env.MAX_CONCURRENT_STREAMS || "3", 10)
  );

  const pushoverEmergency =
    process.env.PUSHOVER_EMERGENCY === "true" || process.env.PUSHOVER_EMERGENCY === "1";
  const pushoverPriority = process.env.PUSHOVER_PRIORITY
    ? parseInt(process.env.PUSHOVER_PRIORITY, 10)
    : undefined;

  return {
    port: isNaN(port) ? 3000 : port,
    geminiApiKey,
    geminiModel: process.env.GEMINI_MODEL || "gemini-3.8-live",
    supabaseUrl,
    supabaseKey,
    youtubeApiKey: process.env.YOUTUBE_API_KEY,
    pollIntervalSeconds,
    maxConcurrentStreams,
    pushoverUserKey: process.env.PUSHOVER_USER_KEY,
    pushoverAppToken: process.env.PUSHOVER_APP_TOKEN,
    pushoverDevice: process.env.PUSHOVER_DEVICE,
    pushoverEmergency,
    pushoverPriority,
    pushoverSound: process.env.PUSHOVER_SOUND,
    telegramBotToken: process.env.TELEGRAM_BOT_TOKEN,
    telegramChatId: process.env.TELEGRAM_CHAT_ID,
    youtubeCookies: process.env.YOUTUBE_COOKIES,
    cookiesFile: process.env.COOKIES_FILE || process.env.YOUTUBE_COOKIES_FILE,
    verbose: process.env.VERBOSE === "true",
    debounceMinutes: parseInt(process.env.DEBOUNCE_MINUTES || "15", 10),
  };
}
