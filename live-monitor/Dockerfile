# Production Dockerfile for YouTube Financial Live Monitor
# Ultra-lightweight Alpine container (~180MB vs 1.4GB) for resource-constrained Dokku VMs

FROM node:22-alpine AS base

# Install ffmpeg, python3 (required by yt-dlp), curl, and ca-certificates
RUN apk add --no-cache \
    ffmpeg \
    python3 \
    curl \
    ca-certificates

# Install latest yt-dlp binary directly
RUN curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp \
  && chmod a+rx /usr/local/bin/yt-dlp

WORKDIR /app

# Stage 1: Dependencies & Build
FROM base AS builder
WORKDIR /app

RUN corepack enable && corepack prepare pnpm@10.12.1 --activate

COPY package.json pnpm-lock.yaml* tsconfig.json ./
RUN pnpm install --frozen-lockfile || pnpm install

COPY src/ ./src/
RUN pnpm build

# Stage 2: Production Runner
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000

# Install production dependencies cleanly without pnpm store overhead
COPY package.json ./
RUN npm install --omit=dev --no-audit --no-fund && npm cache clean --force

COPY --from=builder /app/dist ./dist

# Test binary availability
RUN yt-dlp --version && ffmpeg -version

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD curl -f http://localhost:${PORT:-3000}/health || exit 1

CMD ["node", "dist/index.js"]
