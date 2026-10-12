-- Migration: 20261007184119_add_normalized_symbol.sql
-- Description: Add normalized_symbol column to trades table for standardized asset lookup.

ALTER TABLE public.trades 
ADD COLUMN IF NOT EXISTS normalized_symbol TEXT;

CREATE INDEX IF NOT EXISTS idx_trades_normalized_symbol ON public.trades(normalized_symbol);
