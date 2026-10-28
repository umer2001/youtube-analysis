import WebSocket from "ws";

// Ensure globalThis.WebSocket exists for @google/genai across all Node.js runtimes
if (typeof (globalThis as any).WebSocket === "undefined") {
  (globalThis as any).WebSocket = WebSocket;
}

import { loadConfig } from "./config.js";
import { initSupabase } from "./db.js";
import { StreamSupervisor } from "./supervisor.js";
import { startHttpServer } from "./server.js";

async function main() {
  console.log("\n=======================================================");
  console.log("    YOUTUBE FINANCIAL LIVE MONITOR - DOKKU SERVICE    ");
  console.log("=======================================================");

  const config = loadConfig();
  console.log(` Port:             ${config.port}`);
  console.log(` Gemini Model:     ${config.geminiModel}`);
  console.log(` Poll Interval:    ${config.pollIntervalSeconds}s`);
  console.log(` Max Streams:      ${config.maxConcurrentStreams}`);
  console.log(` Pushover Active:  ${Boolean(config.pushoverUserKey && config.pushoverAppToken)}`);
  console.log(` Telegram Active:  ${Boolean(config.telegramBotToken && config.telegramChatId)}`);
  console.log(` Database Mode:    STRICTLY READ-ONLY (No inserts / updates)`);
  console.log("=======================================================\n");

  // 1. Initialize Supabase Client
  initSupabase(config);

  // 2. Initialize and start stream supervisor
  const supervisor = new StreamSupervisor(config);
  supervisor.start();

  // 3. Start HTTP server for Dokku CHECKS and status monitoring
  const server = startHttpServer(config.port, supervisor);

  // 4. Graceful termination handler
  const shutdown = async (signal: string) => {
    console.log(`\n[Process] Received ${signal}. Initiating graceful shutdown...`);
    server.close();
    await supervisor.shutdown();
    process.exit(0);
  };

  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
}

main().catch((err) => {
  console.error("\x1b[31m[Fatal Error]\x1b[0m", err.message || err);
  process.exit(1);
});
