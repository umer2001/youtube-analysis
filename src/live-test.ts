import dotenv from "dotenv";
import {
  AudioTap,
  listAudioDevices,
  resolveBinaryPaths,
} from "./services/live/audio-tap.js";
import { GeminiLiveClient } from "./services/live/gemini-live-client.js";
import { GeminiChunkClient } from "./services/live/gemini-chunk-client.js";
import { LiveTradeStateManager } from "./services/live/state-manager.js";
import { LiveAlertDispatcher } from "./services/notifications/alert-dispatcher.js";
import { LiveTradeSignal } from "./types/live-alert.js";

dotenv.config();

interface CliArgs {
  url?: string;
  mic?: boolean;
  micDevice?: string;
  file?: string;
  listDevices?: boolean;
  mode: "live" | "chunk";
  model?: string;
  telegram: boolean;
  pushover?: boolean;
  pushoverUser?: string;
  pushoverToken?: string;
  pushoverDevice?: string;
  emergency?: boolean;
  priority?: number;
  sound?: string;
  verbose: boolean;
  duration?: number;
  mock?: boolean;
  cookiesFromBrowser?: string;
  cookiesFile?: string;
}

function parseArgs(): CliArgs {
  const args = process.argv.slice(2);
  const options: CliArgs = {
    mode: "live",
    telegram: false,
    verbose: false,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--url" || arg === "-u") {
      options.url = args[++i];
    } else if (arg === "--mic") {
      options.mic = true;
      if (args[i + 1] && !args[i + 1].startsWith("-")) {
        options.micDevice = args[++i];
      }
    } else if (arg === "--file" || arg === "-f") {
      options.file = args[++i];
    } else if (arg === "--cookies-from-browser" || arg === "--cookies-browser") {
      options.cookiesFromBrowser = args[++i];
    } else if (arg === "--cookies" || arg === "-c") {
      options.cookiesFile = args[++i];
    } else if (arg === "--list-devices" || arg === "--devices") {
      options.listDevices = true;
    } else if (arg === "--mode" || arg === "-m") {
      const mode = args[++i]?.toLowerCase();
      if (mode === "chunk" || mode === "live") {
        options.mode = mode;
      }
    } else if (arg === "--model") {
      options.model = args[++i];
    } else if (arg === "--telegram" || arg === "-t") {
      options.telegram = true;
    } else if (arg === "--pushover" || arg === "-p") {
      options.pushover = true;
    } else if (arg === "--emergency" || arg === "-e") {
      options.emergency = true;
      options.pushover = true;
    } else if (arg === "--priority") {
      options.priority = parseInt(args[++i], 10);
      options.pushover = true;
    } else if (arg === "--sound") {
      options.sound = args[++i];
      options.pushover = true;
    } else if (arg === "--pushover-user") {
      options.pushoverUser = args[++i];
      options.pushover = true;
    } else if (arg === "--pushover-token") {
      options.pushoverToken = args[++i];
      options.pushover = true;
    } else if (arg === "--pushover-device") {
      options.pushoverDevice = args[++i];
      options.pushover = true;
    } else if (arg === "--verbose" || arg === "-v") {
      options.verbose = true;
    } else if (arg === "--duration" || arg === "-d") {
      options.duration = parseInt(args[++i], 10);
    } else if (arg === "--mock") {
      options.mock = true;
    } else if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    }
  }

  return options;
}

function printHelp(): void {
  console.log(`
========================================================================
  LIVE TRADE ALERT SYSTEM - CLI TEST RUNNER
========================================================================

Usage:
  pnpm live-test --url <YOUTUBE_URL> [options]
  pnpm live-test --mic [options]
  pnpm live-test --file <AUDIO_PATH> [options]

Input Sources:
  --url, -u        YouTube Live stream or recorded video URL
  --mic            Capture audio directly from your microphone (Speak live!)
  --file, -f       Stream from a local audio file (.wav, .mp3, .m4a)
  --list-devices   List available microphone devices on your computer

Inference Options:
  --mode, -m       Inference mode: 'live' (Option C) or 'chunk' (Option A) [Default: live]
  --model          Gemini model name override (default: gemini-3.8-live)
  --telegram, -t   Send alerts to Telegram (reads TELEGRAM_BOT_TOKEN & CHAT_ID)
  --pushover, -p   Send push alerts to phone/watch via Pushover (reads PUSHOVER_USER_KEY & APP_TOKEN)
  --emergency, -e  Pushover repeating alarm (Priority 2): keeps sounding until you tap Acknowledge
  --priority <NUM> Pushover priority level: -2 (silent), -1 (quiet), 0 (normal), 1 (high), 2 (emergency)
  --sound <NAME>   Pushover alert sound (e.g. siren, cashregister, incoming, persistent)
  --pushover-user  Pushover user key override
  --pushover-token Pushover application API token override
  --pushover-device Pushover target device name
  --verbose, -v    Print live transcriptions, ffmpeg logs, and buffer stats
  --duration, -d   Max test run duration in seconds
  --mock           Run a simulated trade detection demo
  --help, -h       Show this help menu

Examples:
  # 1. Test repeating alarm that doesn't stop until you tap Acknowledge:
  pnpm live-test --mock --pushover --emergency

  # 2. Test with microphone:
  pnpm live-test --mic --pushover

  # 3. Test with a YouTube live stream:
  pnpm live-test --url "https://www.youtube.com/watch?v=VIDEO_ID" --pushover --emergency
========================================================================
`);
}

async function runMockDemo(dispatcher: LiveAlertDispatcher, stateManager: LiveTradeStateManager) {
  console.log("\n[Demo] Starting Simulated Live Trade Alert Sequence...");
  await new Promise((r) => setTimeout(r, 1000));

  const demoSignals: LiveTradeSignal[] = [
    {
      symbol: "XAUUSD",
      side: "SHORT",
      action: "NEW_ENTRY",
      entry_price: "4185.50",
      stop_loss: "4188.00",
      take_profit: "4175.00",
      risk_reward: "1:4.2",
      rationale: "Retest of broken support zone after sweep of day high",
      confidence: "HIGH",
      verbatim_quote: "Taking a short at 4185, stop loss just above 4188 high",
      detected_at: new Date().toISOString(),
    },
    {
      symbol: "XAUUSD",
      side: "SHORT",
      action: "NEW_ENTRY",
      entry_price: "4185.50",
      stop_loss: "4188.00",
      confidence: "HIGH",
      verbatim_quote: "Still holding our 4185 short, floating +12 pips",
      detected_at: new Date().toISOString(),
    },
    {
      symbol: "XAUUSD",
      side: "SHORT",
      action: "SL_TP_UPDATE",
      stop_loss: "4185.50 (Breakeven)",
      take_profit: "4175.00",
      confidence: "HIGH",
      rationale: "Moved stop loss to cost/breakeven after 1:2 hit",
      verbatim_quote: "Lock it in guys, move stops to breakeven",
      detected_at: new Date().toISOString(),
    },
  ];

  for (const sig of demoSignals) {
    const decision = stateManager.processSignal(sig);
    await dispatcher.dispatch(sig, decision);
    await new Promise((r) => setTimeout(r, 1500));
  }

  console.log("[Demo] Simulated sequence complete.\n");
}

async function main() {
  const options = parseArgs();

  if (options.listDevices) {
    console.log("\nDetecting audio recording devices on this system...");
    const devices = listAudioDevices();
    if (devices.length === 0) {
      console.log("No audio recording devices found.");
    } else {
      console.log("Available Microphones:");
      devices.forEach((d, idx) => console.log(`  [${idx + 1}] "${d}"`));
    }
    console.log();
    return;
  }

  const stateManager = new LiveTradeStateManager(15);
  const dispatcher = new LiveAlertDispatcher({
    streamUrl: options.url,
    channelTitle: options.mic ? "You (Live Microphone)" : options.file ? "Audio File Test" : "Live Trader Stream",
    pushover: {
      userKey: options.pushoverUser,
      appToken: options.pushoverToken,
      device: options.pushoverDevice,
      emergency: options.emergency,
      priority: options.priority,
      sound: options.sound,
    },
  });

  if (options.mock) {
    await runMockDemo(dispatcher, stateManager);
    return;
  }

  if (!options.url && !options.mic && !options.file) {
    console.error("\x1b[31mError: Please provide an audio source: --url <URL>, --mic, or --file <PATH>\x1b[0m");
    printHelp();
    process.exit(1);
  }

  const { ytDlpPath, ffmpegPath } = resolveBinaryPaths();
  const activeChannels = dispatcher.getActiveChannels();

  console.log("\n=======================================================");
  console.log("       LIVE TRADE ALERT SYSTEM - CLI TEST RUNNER       ");
  console.log("=======================================================");
  if (options.mic) {
    console.log(` Source:      🎤 MICROPHONE (Live Speech)`);
  } else if (options.file) {
    console.log(` Source:      📁 FILE (${options.file})`);
  } else {
    console.log(` Source:      🌐 YOUTUBE (${options.url})`);
  }
  console.log(` Mode:        ${options.mode.toUpperCase()} (${options.mode === "live" ? "Option C: Multimodal Live WebSocket" : "Option A: Rolling Audio Chunks"})`);
  console.log(` Channels:    ${activeChannels.join(", ")}`);
  console.log(` ffmpeg:      ${ffmpegPath}`);
  console.log("=======================================================\n");

  const audioTap = new AudioTap({
    sampleRate: 16000,
    channels: 1,
    livePacing: true,
    verbose: options.verbose,
  });

  let liveClient: GeminiLiveClient | null = null;
  let chunkClient: GeminiChunkClient | null = null;
  let totalBytesIngested = 0;
  const startTime = Date.now();

  const onSignal = async (signal: LiveTradeSignal) => {
    const decision = stateManager.processSignal(signal);
    await dispatcher.dispatch(signal, decision);
  };

  const cleanup = () => {
    console.log("\n[Shutdown] Cleaning up stream worker...");
    audioTap.stop();
    if (liveClient) liveClient.close();
    if (chunkClient) chunkClient.reset();

    const elapsedSec = Math.round((Date.now() - startTime) / 1000);
    const mbIngested = (totalBytesIngested / (1024 * 1024)).toFixed(2);
    console.log(`[Summary] Ran for ${elapsedSec}s | Audio Processed: ${mbIngested} MB`);
    process.exit(0);
  };

  process.on("SIGINT", cleanup);
  process.on("SIGTERM", cleanup);

  try {
    let streamMediaUrl = "";
    if (options.url) {
      console.log("[AudioTap] Resolving YouTube stream URL...");
      streamMediaUrl = await audioTap.resolveStreamUrl(options.url, {
        cookiesFromBrowser: options.cookiesFromBrowser,
        cookiesFile: options.cookiesFile,
      });
      console.log("[AudioTap] Stream URL resolved successfully!\n");
    }

    if (options.mode === "live") {
      console.log("[GeminiLive] Initializing Option C: Gemini Multimodal Live API...");
      liveClient = new GeminiLiveClient({
        model: options.model,
        verbose: options.verbose,
      });

      liveClient.on("signal", onSignal);
      liveClient.on("error", (err: any) => {
        console.warn(`\x1b[33m[GeminiLive Warning] ${err.message || err}\x1b[0m`);
      });
      liveClient.on("closed", (code: number, reason: string) => {
        console.log(`[GeminiLive] Connection closed: ${code} ${reason}`);
      });

      await liveClient.connect();
      console.log("[GeminiLive] WebSocket connected and ready for live audio streaming!\n");
    } else {
      console.log("[ChunkClient] Initializing Option A: Gemini Audio Chunk Client...");
      chunkClient = new GeminiChunkClient({
        model: options.model,
        verbose: options.verbose,
      });

      chunkClient.on("signal", onSignal);
      chunkClient.on("error", (err: any) => {
        console.warn(`\x1b[33m[ChunkClient Warning] ${err.message || err}\x1b[0m`);
      });
    }

    // Connect audio stream pipe to the AI client
    audioTap.on("data", (chunk: Buffer) => {
      totalBytesIngested += chunk.length;
      if (options.verbose && totalBytesIngested % (32000 * 5) === 0) {
        const sec = Math.round(totalBytesIngested / 32000);
        process.stdout.write(`\r[AudioTap] Streaming active: ${sec}s of audio processed...`);
      }

      if (liveClient && liveClient.ready) {
        liveClient.pushAudio(chunk);
      } else if (chunkClient) {
        chunkClient.pushAudio(chunk);
      }
    });

    audioTap.on("stopped", (code: number, bytes: number) => {
      console.log(`\n[AudioTap] Audio ingestion completed (code ${code}, ${bytes} bytes)`);
      cleanup();
    });

    audioTap.on("error", (err: any) => {
      console.error("\n[AudioTap Error]", err.message);
      cleanup();
    });

    // Start audio source
    if (options.mic) {
      const devName = audioTap.startMicrophone(options.micDevice);
      console.log(`\x1b[32m🎤 [Microphone Active] Recording from: "${devName}"\x1b[0m`);
      console.log("\x1b[36m💡 Speak like a streamer! For example:\x1b[0m");
      console.log('   \x1b[33m"Alright guys, taking a long on Gold at 2650, stop loss at 2645, take profit 2670"\x1b[0m');
      console.log("   (Press Ctrl+C to stop)\n");
    } else if (options.file) {
      console.log(`📁 [File Stream Active] Ingesting: "${options.file}"`);
      audioTap.startAudioFile(options.file);
    } else {
      console.log("[AudioTap] Starting ffmpeg YouTube audio ingestion...");
      audioTap.start(streamMediaUrl);
      console.log("[System] Listening for live trade calls... (Press Ctrl+C to stop)\n");
    }

    if (options.duration && options.duration > 0) {
      setTimeout(() => {
        console.log(`\n[Timer] Reached test duration limit of ${options.duration}s`);
        cleanup();
      }, options.duration * 1000);
    }
  } catch (err: any) {
    console.error("\x1b[31m[Startup Error]\x1b[0m", err.message || err);
    cleanup();
  }
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
