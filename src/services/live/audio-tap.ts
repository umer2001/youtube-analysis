import { spawn, execSync, ChildProcess } from "child_process";
import { EventEmitter } from "events";
import fs from "fs";
import path from "path";

import os from "os";

export interface AudioTapOptions {
  sampleRate?: number; // Default 16000
  channels?: number;   // Default 1 (mono)
  livePacing?: boolean; // Default true (-re flag)
  verbose?: boolean;
}

/**
 * Resolves paths to yt-dlp and ffmpeg binaries across Windows, Linux, and Docker/Dokku containers.
 */
export function resolveBinaryPaths(): { ytDlpPath: string; ffmpegPath: string } {
  let ytDlpPath = process.env.YT_DLP_PATH || "yt-dlp";
  let ffmpegPath = process.env.FFMPEG_PATH || "ffmpeg";

  // Check explicit overrides or standard PATH first
  if (process.platform === "win32") {
    try {
      execSync("where.exe yt-dlp", { stdio: "ignore" });
    } catch {
      const localAppData = process.env.LOCALAPPDATA || "";
      const wingetBase = path.join(localAppData, "Microsoft", "WinGet", "Packages");
      if (fs.existsSync(wingetBase)) {
        const candidates = fs.readdirSync(wingetBase);
        for (const candidate of candidates) {
          if (candidate.startsWith("yt-dlp")) {
            const directExe = path.join(wingetBase, candidate, "yt-dlp.exe");
            if (fs.existsSync(directExe)) {
              ytDlpPath = directExe;
              break;
            }
          }
        }
      }
    }

    try {
      execSync("where.exe ffmpeg", { stdio: "ignore" });
    } catch {
      const localAppData = process.env.LOCALAPPDATA || "";
      const wingetBase = path.join(localAppData, "Microsoft", "WinGet", "Packages");
      if (fs.existsSync(wingetBase)) {
        const candidates = fs.readdirSync(wingetBase);
        for (const candidate of candidates) {
          if (candidate.toLowerCase().includes("ffmpeg")) {
            const binPath = path.join(wingetBase, candidate);
            const findInDir = (dir: string): string | null => {
              const items = fs.readdirSync(dir);
              for (const item of items) {
                const full = path.join(dir, item);
                if (item.toLowerCase() === "ffmpeg.exe") return full;
                if (fs.statSync(full).isDirectory()) {
                  const sub = findInDir(full);
                  if (sub) return sub;
                }
              }
              return null;
            };
            const found = findInDir(binPath);
            if (found) {
              ffmpegPath = found;
              break;
            }
          }
        }
      }
    }
  } else {
    // POSIX / Linux / Docker / Dokku
    try {
      execSync("which yt-dlp", { stdio: "ignore" });
    } catch {
      if (fs.existsSync("/usr/local/bin/yt-dlp")) {
        ytDlpPath = "/usr/local/bin/yt-dlp";
      } else if (fs.existsSync("/usr/bin/yt-dlp")) {
        ytDlpPath = "/usr/bin/yt-dlp";
      }
    }

    try {
      execSync("which ffmpeg", { stdio: "ignore" });
    } catch {
      if (fs.existsSync("/usr/local/bin/ffmpeg")) {
        ffmpegPath = "/usr/local/bin/ffmpeg";
      } else if (fs.existsSync("/usr/bin/ffmpeg")) {
        ffmpegPath = "/usr/bin/ffmpeg";
      }
    }
  }

  return { ytDlpPath, ffmpegPath };
}

/**
 * Lists available audio recording devices (DirectShow on Windows).
 */
export function listAudioDevices(): string[] {
  if (process.platform !== "win32") {
    // Microphone capture via DirectShow is Windows specific
    return [];
  }
  const { ffmpegPath } = resolveBinaryPaths();
  try {
    const output = execSync(`"${ffmpegPath}" -list_devices true -f dshow -i dummy 2>&1`, {
      encoding: "utf8",
    });
    return extractDevicesFromOutput(output);
  } catch (err: any) {
    const text = (err.stdout || "") + (err.stderr || "") + (err.message || "");
    return extractDevicesFromOutput(text);
  }
}

function extractDevicesFromOutput(output: string): string[] {
  const devices: string[] = [];
  const lines = output.split(/\r?\n/);
  for (const line of lines) {
    if (line.includes("(audio)")) {
      const match = line.match(/"([^"]+)"\s+\(audio\)/);
      if (match && match[1]) {
        devices.push(match[1]);
      }
    }
  }
  return devices;
}

/**
 * Creates a valid 44-byte WAV header for raw 16-bit mono PCM bytes in memory.
 */
export function pcmToWav(pcmData: Buffer, sampleRate = 16000, channels = 1): Buffer {
  const byteRate = sampleRate * channels * 2;
  const blockAlign = channels * 2;
  const header = Buffer.alloc(44);

  // RIFF identifier
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + pcmData.length, 4);
  header.write("WAVE", 8);

  // "fmt " subchunk
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16); // Subchunk1Size (16 for PCM)
  header.writeUInt16LE(1, 20);  // AudioFormat (1 = PCM)
  header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(16, 34); // BitsPerSample

  // "data" subchunk
  header.write("data", 36);
  header.writeUInt32LE(pcmData.length, 40);

  return Buffer.concat([header, pcmData]);
}

/**
 * AudioTap connects to YouTube, local audio files, or live microphones via ffmpeg,
 * streaming raw 16kHz mono PCM.
 */
export class AudioTap extends EventEmitter {
  private ffmpegProcess: ChildProcess | null = null;
  private isRunning = false;
  private readonly sampleRate: number;
  private readonly channels: number;
  private readonly livePacing: boolean;
  private readonly verbose: boolean;

  constructor(options: AudioTapOptions = {}) {
    super();
    this.sampleRate = options.sampleRate || 16000;
    this.channels = options.channels || 1;
    this.livePacing = options.livePacing ?? true;
    this.verbose = options.verbose ?? false;
  }

  /**
   * Resolves direct media stream URL for the provided YouTube URL using yt-dlp.
   * Employs mobile player client emulation and cookies fallbacks to bypass YouTube 429 bot checks.
   */
  public async resolveStreamUrl(
    youtubeUrl: string,
    options: { cookiesFromBrowser?: string; cookiesFile?: string } = {}
  ): Promise<string> {
    const { ytDlpPath } = resolveBinaryPaths();
    if (this.verbose) {
      console.log(`[AudioTap] Resolving audio stream using: ${ytDlpPath}`);
    }

    const runExtraction = (extraArgs: string[]): Promise<string> => {
      return new Promise((resolve, reject) => {
        const args = [
          "-g",
          "-f", "bestaudio/best",
          "--no-warnings",
          ...extraArgs,
          youtubeUrl,
        ];

        const proc = spawn(ytDlpPath, args, { stdio: ["ignore", "pipe", "pipe"] });
        let stdout = "";
        let stderr = "";

        proc.stdout.on("data", (chunk) => {
          stdout += chunk.toString();
        });

        proc.stderr.on("data", (chunk) => {
          stderr += chunk.toString();
        });

        proc.on("close", (code) => {
          if (code !== 0) {
            reject(new Error(`yt-dlp failed (code ${code}): ${stderr.trim()}`));
            return;
          }
          const lines = stdout.trim().split(/\r?\n/).filter(Boolean);
          if (lines.length === 0) {
            reject(new Error("yt-dlp returned no stream URL"));
            return;
          }
          resolve(lines[0]);
        });

        proc.on("error", (err) => {
          reject(new Error(`Failed to spawn yt-dlp: ${err.message}`));
        });
      });
    };

    // Resolve cookies file from options, environment, or temporary file
    let effectiveCookiesFile = options.cookiesFile || process.env.COOKIES_FILE || process.env.YOUTUBE_COOKIES_FILE;
    if (!effectiveCookiesFile && process.env.YOUTUBE_COOKIES) {
      try {
        let cookieContent = process.env.YOUTUBE_COOKIES.trim();
        // Check if base64 encoded
        if (!cookieContent.includes("\t") && !cookieContent.includes("\n") && cookieContent.length > 50) {
          try {
            const decoded = Buffer.from(cookieContent, "base64").toString("utf8");
            if (decoded.includes("# Netscape") || decoded.includes(".youtube.com") || decoded.includes("\t")) {
              cookieContent = decoded;
            }
          } catch {
            // keep original
          }
        }
        const tempPath = path.join(os.tmpdir(), `yt_cookies_${process.pid}.txt`);
        fs.writeFileSync(tempPath, cookieContent, "utf8");
        effectiveCookiesFile = tempPath;
      } catch (err: any) {
        if (this.verbose) {
          console.warn("[AudioTap] Failed to write temporary cookies file:", err.message);
        }
      }
    }

    // Strategy 1: Use Android/Web player client emulation (bypasses YouTube webpage 429 bot check)
    try {
      const extraArgs = ["--extractor-args", "youtube:player_client=android,web"];
      if (options.cookiesFromBrowser) extraArgs.push("--cookies-from-browser", options.cookiesFromBrowser);
      if (effectiveCookiesFile) extraArgs.push("--cookies", effectiveCookiesFile);
      return await runExtraction(extraArgs);
    } catch (err: any) {
      if (this.verbose) {
        console.warn(`[AudioTap] Primary extraction failed: ${err.message}. Attempting browser cookies...`);
      }

      // Strategy 2: In desktop environments (Windows/macOS), try borrowing cookies from Chrome or Edge
      if (!options.cookiesFromBrowser && !effectiveCookiesFile && (process.platform === "win32" || process.platform === "darwin")) {
        try {
          return await runExtraction(["--cookies-from-browser", "chrome"]);
        } catch {
          try {
            return await runExtraction(["--cookies-from-browser", "edge"]);
          } catch {
            // fallback to original error
            throw err;
          }
        }
      }
      throw err;
    }
  }

  /**
   * Starts tapping a remote stream URL (HLS / YouTube).
   */
  public start(streamUrl: string): void {
    const { ffmpegPath } = resolveBinaryPaths();
    const ffmpegArgs: string[] = [];

    if (this.livePacing) {
      ffmpegArgs.push("-re");
    }

    ffmpegArgs.push(
      "-i", streamUrl,
      "-vn",
      "-acodec", "pcm_s16le",
      "-ar", String(this.sampleRate),
      "-ac", String(this.channels),
      "-f", "s16le",
      "-"
    );

    this.spawnFfmpeg(ffmpegPath, ffmpegArgs);
  }

  /**
   * Starts tapping audio directly from a system microphone.
   * Returns the name of the microphone device used.
   */
  public startMicrophone(deviceName?: string): string {
    const { ffmpegPath } = resolveBinaryPaths();
    let targetDevice = deviceName;

    if (!targetDevice) {
      const devices = listAudioDevices();
      if (devices.length === 0) {
        throw new Error("No microphone devices detected on this system.");
      }
      // Prioritize physical headset or microphone array over Stereo Mix
      targetDevice =
        devices.find((d) => !d.toLowerCase().includes("stereo mix")) || devices[0];
    }

    const ffmpegArgs = [
      "-f", "dshow",
      "-i", `audio=${targetDevice}`,
      "-vn",
      "-acodec", "pcm_s16le",
      "-ar", String(this.sampleRate),
      "-ac", String(this.channels),
      "-f", "s16le",
      "-",
    ];

    this.spawnFfmpeg(ffmpegPath, ffmpegArgs);
    return targetDevice;
  }

  /**
   * Starts tapping audio from a local media file (wav, mp3, m4a, etc.).
   */
  public startAudioFile(filePath: string): void {
    const { ffmpegPath } = resolveBinaryPaths();
    const ffmpegArgs = [
      "-re", // Playback in real-time
      "-i", filePath,
      "-vn",
      "-acodec", "pcm_s16le",
      "-ar", String(this.sampleRate),
      "-ac", String(this.channels),
      "-f", "s16le",
      "-",
    ];

    this.spawnFfmpeg(ffmpegPath, ffmpegArgs);
  }

  private spawnFfmpeg(ffmpegPath: string, args: string[]): void {
    if (this.isRunning) {
      throw new Error("AudioTap is already running");
    }

    if (this.verbose) {
      console.log(`[AudioTap] Spawning ffmpeg: ${ffmpegPath} ${args.join(" ")}`);
    }

    this.ffmpegProcess = spawn(ffmpegPath, args, {
      stdio: ["ignore", "pipe", "pipe"],
    });

    this.isRunning = true;
    this.emit("started");

    let totalBytesReceived = 0;

    this.ffmpegProcess.stdout?.on("data", (chunk: Buffer) => {
      totalBytesReceived += chunk.length;
      this.emit("data", chunk);
    });

    this.ffmpegProcess.stderr?.on("data", (chunk: Buffer) => {
      const text = chunk.toString();
      if (this.verbose && (text.includes("error") || text.includes("Opening"))) {
        console.warn(`[ffmpeg] ${text.trim()}`);
      }
    });

    this.ffmpegProcess.on("close", (code) => {
      this.isRunning = false;
      this.ffmpegProcess = null;
      this.emit("stopped", code, totalBytesReceived);
    });

    this.ffmpegProcess.on("error", (err) => {
      this.isRunning = false;
      this.ffmpegProcess = null;
      this.emit("error", err);
    });
  }

  /**
   * Stops the active ffmpeg ingestion process cleanly.
   */
  public stop(): void {
    if (this.ffmpegProcess) {
      const proc = this.ffmpegProcess;
      this.ffmpegProcess = null;
      this.isRunning = false;

      try {
        if (process.platform === "win32" && proc.pid) {
          execSync(`taskkill /pid ${proc.pid} /T /F`, { stdio: "ignore" });
        } else {
          proc.kill("SIGKILL");
        }
      } catch {
        try {
          proc.kill();
        } catch {
          // ignore
        }
      }
    }
  }

  public get active(): boolean {
    return this.isRunning;
  }
}
