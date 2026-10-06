-- Migration: 20261006141000_allow_authenticated_manage_channels.sql
-- Description: Allow authenticated admin users to manage channels, streams, and trades.

-- Channels policies for authenticated users
CREATE POLICY "Allow authenticated users to insert channels" ON public.channels
    FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Allow authenticated users to update channels" ON public.channels
    FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Allow authenticated users to delete channels" ON public.channels
    FOR DELETE TO authenticated USING (true);

-- Streams policies for authenticated users (edit/delete if needed)
CREATE POLICY "Allow authenticated users to insert streams" ON public.streams
    FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Allow authenticated users to update streams" ON public.streams
    FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Allow authenticated users to delete streams" ON public.streams
    FOR DELETE TO authenticated USING (true);

-- Trades policies for authenticated users (edit/delete if needed)
CREATE POLICY "Allow authenticated users to insert trades" ON public.trades
    FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Allow authenticated users to update trades" ON public.trades
    FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Allow authenticated users to delete trades" ON public.trades
    FOR DELETE TO authenticated USING (true);
