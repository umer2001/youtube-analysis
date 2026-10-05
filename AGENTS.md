# Project: YouTube Livestream Trade Analysis

## 1. Project Overview & Vision
This project automates the monitoring, ingestion, and AI analysis of YouTube livestreamers who trade financial markets live. 
The system tracks a curated list of YouTube channels, detects when a livestream concludes, processes the stream content (transcripts, audio, or metadata), analyzes what happened during the session using Google Gemini (`@google/genai`), extracts structured trading activity, and persists the data into Supabase.

### Initial Phase / MVP Focus
- **Target Domain**: Live financial trading streamers (Equities, Forex, Crypto, Futures/Options).
- **Core Objective**: Extract and record trade calls and executions made during live sessions:
  - Asset / Ticker / Pair (e.g., `NQ`, `ES`, `BTC/USDT`, `TSLA`)
  - Trade Direction (`LONG` / `SHORT`)
  - Entry Price, Exit Price, Stop Loss, Take Profit
  - Trade Rationale & Strategy Mentioned
  - Stream Timestamp / Time Marker
  - Claimed or Calculated PnL / Outcome
  - Streamer Sentiment & Market Commentary

---

## 2. Core Tech Stack & Tooling

| Component | Technology | Guidelines |
| :--- | :--- | :--- |
| **Package Manager** | `pnpm` | **Mandatory.** Do not use `npm` or `yarn`. |
| **Runtime & Language** | Node.js (v20+) / TypeScript | Enforce strict typing (`strict: true`). |
| **Serverless Compute** | Supabase Edge Functions | Deno / TypeScript for cron polling, webhook handling, and lightweight orchestration. |
| **AI Engine (Primary)** | `@google/genai` | Native Google Gen AI SDK for direct agentic video processing. |
| **AI Engine (Fallback)** | `@openrouter/sdk` | Multi-model routing (Claude, DeepSeek, GPT) on transcript ingestion to eliminate vendor lock-in. |
| **Database & Storage** | Supabase | PostgreSQL for relational data; Supabase Storage for transcripts/artifacts; Edge Functions for serverless processing. |
| **External APIs** | YouTube Data API v3 / Scraping | For stream status polling, metadata, and transcript extraction. |

---

## 3. Architecture & Data Flow

```text
[Tracked Channels List] 
         │
         ▼
[Stream Monitor / Poller (Edge Function or Service)] ──► (Detects Live Stream Concluded)
         │
         ▼
[Transcript & Content Ingestion] (Fetches transcript, chapters, audio segments)
         │
         ▼
[Gemini Analysis Engine (`@google/genai`)] (Structured Prompting & Extraction)
         │
         ▼
[Supabase Database] (Stores Channels, Streams, Extracted Trades, Metrics)
```

### Proposed Directory Layout
```text
├── supabase/
│   ├── functions/       # Supabase Edge Functions (Deno / TypeScript)
│   │   ├── monitor-streams/  # Cron/poller to check for ended livestreams
│   │   └── process-stream/   # Trigger handler for stream analysis
│   └── migrations/      # SQL migrations for Supabase
├── src/
│   ├── config/          # Environment variables & constants
│   ├── db/              # Supabase client & database schema definitions
│   ├── services/
│   │   ├── youtube/     # Channel tracking, stream status, transcript fetching
│   │   ├── analyzer/    # Prompt engineering & @google/genai extraction
│   │   └── trades/      # Trade parsing, validation, & persistence logic
│   ├── types/           # Domain models, database types, API contracts
│   └── index.ts         # Main pipeline entrypoint or scheduler
├── .env.example
├── AGENTS.md
├── package.json
└── tsconfig.json
```

---

## 4. Coding Conventions & Best Practices

### TypeScript & Style
- Write modular, single-responsibility functions and classes.
- Use explicit types; avoid `any`. Define Zod schemas or TypeScript interfaces for all AI outputs and database records.
- Favor early returns and comprehensive error handling.

### AI Engine (`@google/genai`)
- Always utilize structured JSON output (`responseMimeType: "application/json"` with schema definitions) when asking Gemini to extract trade logs.
- Streams can be hours long: implement chunking or transcript pre-processing to stay within context budgets and minimize latency/costs.
- Always include stream timestamps (e.g., `01:24:15`) in the extracted records for easy human auditability and playback verification.

### Supabase & Edge Functions
- **Database**: Keep database schema normalized (e.g., `channels`, `streams`, `trades`, `trade_tags`). Use parameterized queries via the Supabase client (`@supabase/supabase-js`).
- **Edge Functions**:
  - Use Edge Functions (Deno runtime) for scheduled cron jobs (e.g. stream polling) and async processing triggers.
  - Access secrets securely via `Deno.env.get(...)`.
  - Handle CORS and error responses consistently across all function endpoints.
- **Auditability**: Store raw extraction responses alongside structured trade rows for debugging and prompt evaluation.

---

## 5. Security & Boundary Guardrails
- **Secrets Management**: Never commit API keys (`GEMINI_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `YOUTUBE_API_KEY`) to Git. Always read from `.env` or Supabase secrets (`supabase secrets set`).
- **Destructive Actions**: Do not drop tables or execute unreviewed schema migrations against production Supabase instances.
- **Migrations Guardrail**: NEVER apply migrations directly to the database via API/tool calls. Always create explicit versioned SQL migration files under `supabase/migrations/` (e.g., `YYYYMMDDHHMMSS_name.sql`) so that schema changes are tracked, auditable, and reviewed before execution.
- **Package Management**: Always install dependencies using `pnpm add <package>` (or Deno imports for Edge Functions).
