-- Migration: 20261012185000_drop_normalized_symbol_from_trades.sql
-- Description: Drop unnecessary normalized_symbol column and associated index from trades table.

DROP INDEX IF EXISTS public.idx_trades_normalized_symbol;

ALTER TABLE public.trades 
DROP COLUMN IF EXISTS normalized_symbol;
