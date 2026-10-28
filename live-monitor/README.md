# Live Financial Stream Monitor Server (`live-monitor`)

An autonomous background daemon and streaming ingestion server designed to continuously monitor active YouTube trading channels stored in Supabase, detect when they go live, tap into their live audio streams in real-time, extract trade setups using **Google Gemini Multimodal Live API**, and dispatch instantaneous alerts to **Pushover** and **Telegram**.

Designed for deployment on a Linux VM with **Dokku** or any containerized Docker environment.

> [!IMPORTANT]
> **Strictly READ-ONLY towards Supabase**: This sub-project only performs `SELECT` queries on the `channels` table (`where is_active = true`). It performs **zero** `INSERT`, `UPDATE`, or `DELETE` operations on any table in the database.

---

## 🌟 Architecture & Capabilities

```text
[Supabase channels Table]
       │ (Read-only SELECT query every 60s)
       ▼
[Stream Supervisor & Poller]
       │ (Channel goes LIVE!)
       ├─────────────────────────────────► [Alert: "Streamer X is LIVE NOW!"] (Pushover/Telegram)
       ▼
[LiveStreamWorker]
       │
       ├─► [AudioTap] (yt-dlp + ffmpeg PCM 16kHz mono pipe)
       │
       ├─► [Gemini Multimodal Live API] (WebSocket sub-second trade call tool)
       │
       ├─► [LiveTradeStateManager] (In-memory deduplication & state tracking)
       │
       └─► [LiveAlertDispatcher] ────────► [🚨 Trade Alert: Entry/SL/TP/Quote] (Pushover / Telegram)
```

- **Read-Only Database Access**: Only reads channels where `is_active = true`. Can be used safely with `SUPABASE_ANON_KEY` or `SUPABASE_SERVICE_ROLE_KEY`.
- **Zero-Quota Live Detection**: Uses direct YouTube `/live` scraping to detect when streamers start broadcasting without burning YouTube Data API quota.
- **Multimodal Audio Streaming**: Streams 16kHz PCM audio directly into Gemini over WebSocket (`gemini-3.8-live`).
- **Emergency Repeating Push Alerts**: Supports Pushover priority 2 emergency sirens that repeat on phones/watches until acknowledged by the trader.
- **Deduplication Engine**: Understands Hindi/Urdu and English trading jargon, updates stops/targets on existing positions, and suppresses repetitive banter in-memory.
- **Dokku-Ready**: Contains `Dockerfile`, `CHECKS`, `Procfile`, and an embedded healthcheck HTTP server on `/health` for zero-downtime deployments.

---

## 📁 Directory Structure

```text
live-monitor/
├── src/
│   ├── config.ts              # Environment loader & validator
│   ├── db.ts                  # Supabase read-only channel queries
│   ├── poller.ts              # YouTube live broadcast detector (API + zero-quota scraping)
│   ├── supervisor.ts          # Worker pool orchestrator & concurrency limiter
│   ├── server.ts              # Native HTTP healthcheck & metrics endpoint
│   ├── types.ts               # Domain types & Zod schemas
│   ├── index.ts               # Server entrypoint & lifecycle manager
│   └── services/
│       ├── audio-tap.ts       # Cross-platform stream audio capture via yt-dlp & ffmpeg
│       ├── gemini-live.ts     # Gemini Multimodal Live WebSocket client
│       ├── gemini-chunk.ts    # Rolling chunk client fallback
│       ├── state-manager.ts   # Trade deduplication & in-memory state tracking
│       ├── stream-worker.ts   # Encapsulated stream worker session
│       └── notifications/     # Pushover, Telegram & Terminal channels
├── Dockerfile                 # Multi-stage Dockerfile with Node 20, ffmpeg, python3 & yt-dlp
├── Procfile                   # Dokku process definition (`web: node dist/index.js`)
├── CHECKS                     # Dokku zero-downtime healthcheck rules
├── .dockerignore
├── package.json
├── tsconfig.json
└── .env.example
```

---

## 🚀 Dokku Deployment Guide

Follow these steps to deploy `live-monitor` onto your VM running Dokku:

### 1. Create the App on your Dokku Server
SSH into your Dokku VM and create the application:
```bash
dokku apps:create live-monitor
```

### 2. Configure Environment Variables
Set the mandatory API keys and Supabase credentials:

```bash
dokku config:set live-monitor \
  GEMINI_API_KEY="AIzaSy..." \
  SUPABASE_URL="https://your-project.supabase.co" \
  SUPABASE_KEY="eyJhbG..." \
  PUSHOVER_USER_KEY="u..." \
  PUSHOVER_APP_TOKEN="a..." \
  PUSHOVER_EMERGENCY="false" \
  PUSHOVER_PRIORITY="1" \
  POLL_INTERVAL_SECONDS="60" \
  MAX_CONCURRENT_STREAMS="3"
```

*(Optional)* If you want Telegram alerts:
```bash
dokku config:set live-monitor \
  TELEGRAM_BOT_TOKEN="123456:ABC..." \
  TELEGRAM_CHAT_ID="-100..."
```

*(Optional)* If you experience YouTube bot verification/429 blocks:
```bash
dokku config:set live-monitor YOUTUBE_COOKIES="your_netscape_cookies_content_or_base64"
```

### 3. Port & Proxy Configuration
Ensure Dokku maps incoming HTTP traffic to container port `3000`:
```bash
dokku ports:set live-monitor http:80:3000
```

### 4. Deploying to Dokku

#### Option A: Direct Git Push from Monorepo (Using Dokku git-subdir plugin)
If you have the `dokku-monorepo` plugin or Dokku 0.28+ git-subdir:
```bash
# On your Dokku server:
dokku git:set live-monitor git-subdir live-monitor

# From your local machine:
git remote add dokku dokku@your-vm-ip:live-monitor
git push dokku main:master
```

#### Option B: Deploying with `git subtree` (Native Git, No plugins required)
From your local project root:
```bash
git subtree push --prefix live-monitor dokku@your-vm-ip:live-monitor master
```

---

## 🔍 Health Checks & Monitoring

Once deployed, Dokku uses the `CHECKS` file to verify container health before cutting over traffic:
- Health check URL: `http://<your-vm-domain-or-ip>/health` -> Returns `{"status":"healthy"}`
- Live metrics endpoint: `http://<your-vm-domain-or-ip>/status` -> Returns active worker stats, memory usage, and uptime.

### Inspecting Live Logs on Dokku:
```bash
# Stream live logs
dokku logs live-monitor -t

# Check container status
dokku ps:report live-monitor
```
