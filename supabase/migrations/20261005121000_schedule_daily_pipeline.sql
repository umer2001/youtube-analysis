-- Migration: 20261005121000_schedule_daily_pipeline.sql
-- Description: Schedules the daily-pipeline Edge Function to execute every day at midnight UTC via pg_cron & pg_net.

CREATE EXTENSION IF NOT EXISTS pg_net;
CREATE EXTENSION IF NOT EXISTS pg_cron;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    -- Remove old job if it already exists
    PERFORM cron.unschedule('daily-youtube-trade-pipeline')
    WHERE EXISTS (
      SELECT 1 FROM cron.job WHERE jobname = 'daily-youtube-trade-pipeline'
    );

    -- Schedule daily run at 00:00 UTC (midnight every day)
    PERFORM cron.schedule(
      'daily-youtube-trade-pipeline',
      '0 0 * * *',
      $cron$
      SELECT net.http_post(
        url := 'https://<your-project-ref>.supabase.co/functions/v1/daily-pipeline',
        headers := '{"Content-Type": "application/json"}'::jsonb,
        body := '{"action": "all"}'::jsonb
      );
      $cron$
    );
  END IF;
END $$;
