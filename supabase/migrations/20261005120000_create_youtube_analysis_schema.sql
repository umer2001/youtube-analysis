-- Migration: 20261005120000_create_youtube_analysis_schema.sql
-- Description: Creates channels, batches, streams, and trades tables with indexes and triggers.

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. CHANNELS TABLE
-- Stores YouTube channels tracked by the system
CREATE TABLE IF NOT EXISTS public.channels (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    channel_id TEXT UNIQUE,
    channel_url TEXT NOT NULL UNIQUE,
    title TEXT,
    description TEXT,
    thumbnail_url TEXT,
    is_active BOOLEAN NOT NULL DEFAULT true,
    last_checked_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 2. BATCHES TABLE
-- Tracks OpenRouter batch analysis jobs
CREATE TABLE IF NOT EXISTS public.batches (
    id TEXT PRIMARY KEY, -- OpenRouter batch ID (e.g. batch-179...)
    model TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'validating',
    total_requests INTEGER NOT NULL DEFAULT 0,
    completed_requests INTEGER NOT NULL DEFAULT 0,
    failed_requests INTEGER NOT NULL DEFAULT 0,
    cost NUMERIC(10, 6),
    submitted_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    finalized_at TIMESTAMPTZ,
    error JSONB,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 3. STREAMS TABLE
-- Stores livestream sessions discovered for tracked channels
CREATE TABLE IF NOT EXISTS public.streams (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    channel_id UUID NOT NULL REFERENCES public.channels(id) ON DELETE CASCADE,
    video_id TEXT NOT NULL UNIQUE,
    title TEXT NOT NULL,
    description TEXT,
    published_at TIMESTAMPTZ,
    stream_url TEXT NOT NULL,
    stream_status TEXT NOT NULL DEFAULT 'completed', -- 'completed', 'live', 'upcoming'
    processing_status TEXT NOT NULL DEFAULT 'unprocessed', -- 'unprocessed', 'batch_submitted', 'completed', 'failed', 'no_transcript'
    batch_id TEXT REFERENCES public.batches(id) ON DELETE SET NULL,
    error_message TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 4. TRADES TABLE
-- Stores individual trade entries extracted from analyzed livestream sessions
CREATE TABLE IF NOT EXISTS public.trades (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    stream_id UUID NOT NULL REFERENCES public.streams(id) ON DELETE CASCADE,
    channel_id UUID NOT NULL REFERENCES public.channels(id) ON DELETE CASCADE,
    symbol TEXT NOT NULL,
    side TEXT NOT NULL CHECK (side IN ('LONG', 'SHORT')),
    result TEXT NOT NULL CHECK (result IN ('TP', 'SL', 'UNKNOWN')),
    entry_price TEXT,
    exit_price TEXT,
    important_timestamps JSONB NOT NULL DEFAULT '[]'::jsonb,
    notes TEXT,
    raw_data JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- INDEXES
CREATE INDEX IF NOT EXISTS idx_channels_active ON public.channels(is_active);
CREATE INDEX IF NOT EXISTS idx_streams_channel_id ON public.streams(channel_id);
CREATE INDEX IF NOT EXISTS idx_streams_processing_status ON public.streams(processing_status);
CREATE INDEX IF NOT EXISTS idx_streams_batch_id ON public.streams(batch_id);
CREATE INDEX IF NOT EXISTS idx_batches_status ON public.batches(status);
CREATE INDEX IF NOT EXISTS idx_trades_stream_id ON public.trades(stream_id);
CREATE INDEX IF NOT EXISTS idx_trades_channel_id ON public.trades(channel_id);
CREATE INDEX IF NOT EXISTS idx_trades_symbol ON public.trades(symbol);

-- TRIGGER FUNCTION FOR UPDATED_AT
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = timezone('utc'::text, now());
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- APPLY TRIGGERS
DROP TRIGGER IF EXISTS trigger_channels_updated_at ON public.channels;
CREATE TRIGGER trigger_channels_updated_at
    BEFORE UPDATE ON public.channels
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trigger_batches_updated_at ON public.batches;
CREATE TRIGGER trigger_batches_updated_at
    BEFORE UPDATE ON public.batches
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trigger_streams_updated_at ON public.streams;
CREATE TRIGGER trigger_streams_updated_at
    BEFORE UPDATE ON public.streams
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ROW LEVEL SECURITY (RLS)
ALTER TABLE public.channels ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.streams ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trades ENABLE ROW LEVEL SECURITY;

-- Allow service role full access (default in Supabase, but explicit policies for clarity)
CREATE POLICY "Service role full access on channels" ON public.channels
    FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "Service role full access on batches" ON public.batches
    FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "Service role full access on streams" ON public.streams
    FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "Service role full access on trades" ON public.trades
    FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Allow public / anon read-only access (optional for frontend display if needed)
CREATE POLICY "Allow public read access on channels" ON public.channels
    FOR SELECT TO anon, authenticated USING (true);

CREATE POLICY "Allow public read access on streams" ON public.streams
    FOR SELECT TO anon, authenticated USING (true);

CREATE POLICY "Allow public read access on trades" ON public.trades
    FOR SELECT TO anon, authenticated USING (true);

CREATE POLICY "Allow public read access on batches" ON public.batches
    FOR SELECT TO anon, authenticated USING (true);
