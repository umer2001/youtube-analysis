-- Migration: 20261016000000_add_transcript_pending_status.sql
-- Description: Adds documentation for 'transcript_pending' processing_status and provides transition for recent streams.

-- 1. Update column comment to document the 7-day retry grace period lifecycle
COMMENT ON COLUMN public.streams.processing_status IS 
'Status of stream processing:
 - unprocessed: Newly discovered completed stream, never attempted.
 - transcript_pending: Transcript not yet available from YouTube; actively retried within the 7-day grace period.
 - batch_submitted: Transcript extracted and packaged into an active OpenRouter batch.
 - completed: Analysis completed and trades extracted.
 - failed: LLM or batch processing encountered a fatal error.
 - no_transcript: Permanently abandoned after the 7-day retry grace period has elapsed without a transcript.';

-- 2. Transition recent streams (< 7 days old) that were prematurely marked as 'no_transcript' back to 'transcript_pending'
UPDATE public.streams
SET 
    processing_status = 'transcript_pending',
    error_message = 'Reset from no_transcript to transcript_pending: within 7-day retry grace period.'
WHERE 
    processing_status = 'no_transcript'
    AND (NOW() - COALESCE(published_at, created_at)) < INTERVAL '7 days';
