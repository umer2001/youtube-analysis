# Production Dockerfile for YouTube Financial Live Monitor
# Designed for deployment on Dokku / Linux VM with yt-dlp, ffmpeg & Node.js

FROM node:20-bookworm-slim AS base

# Install system dependencies: ffmpeg, python3, ca-certificates, and curl
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    python3 \
    ca-certificates \
    curl \
  && rm -rf /var/lib/apt/lists/*

# Install latest yt-dlp binary directly
RUN curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp \
  && chmod a+rx /usr/local/bin/yt-dlp

# Enable pnpm via corepack
RUN corepack enable && corepack prepare pnpm@10.12.1 --activate

WORKDIR /app

# Stage 1: Dependencies & Build
FROM base AS builder

COPY package.json pnpm-lock.yaml* ./
RUN pnpm install --frozen-lockfile || pnpm install

COPY tsconfig.json ./
COPY src/ ./src/

RUN pnpm build

# Stage 2: Production Runner
FROM base AS runner

WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000

COPY package.json pnpm-lock.yaml* ./
RUN pnpm install --prod --frozen-lockfile || pnpm install --prod

COPY --from=builder /app/dist ./dist

# Test binary availability
RUN yt-dlp --version && ffmpeg -version

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD curl -f http://localhost:${PORT:-3000}/health || exit 1

CMD ["node", "dist/index.js"]
