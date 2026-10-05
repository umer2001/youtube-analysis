import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { corsHeaders } from "./_shared/cors.ts";
import { createAdminClient } from "./_shared/supabase.ts";
import { fetchCompletedLivestreams } from "./_shared/youtube.ts";
import { getFormattedTranscript } from "./_shared/transcript.ts";
import {
  buildTradeExtractionPrompt,
  createBatch,
  getBatch,
  parseBatchTradeResults,
  BatchRequestItem,
} from "./_shared/openrouter.ts";

Deno.serve(async (req: Request) => {
  // 1. Handle CORS Preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabase = createAdminClient();
    const url = new URL(req.url);

    let action = url.searchParams.get("action") || "all";
    let modelOverride = url.searchParams.get("model") || undefined;

    if (req.method === "POST") {
      try {
        const body = await req.json();
        if (body.action) action = body.action;
        if (body.model) modelOverride = body.model;
      } catch {
        // use query params or defaults
      }
    }

    const report: Record<string, any> = {
      timestamp: new Date().toISOString(),
      action,
    };

    // =========================================================================
    // STEP 1: SYNC CHANNELS (Find completed streams)
    // =========================================================================
    if (action === "all" || action === "sync") {
      const { data: channels, error: channelsErr } = await supabase
        .from("channels")
        .select("*")
        .eq("is_active", true);

      if (channelsErr) throw channelsErr;

      let newStreamsFound = 0;
      const errors: Array<{ channelUrl: string; error: string }> = [];

      for (const channel of channels || []) {
        try {
          const sessions = await fetchCompletedLivestreams(channel.channel_url, 10);

          if (sessions.length > 0) {
            const streamRows = sessions.map((s) => ({
              channel_id: channel.id,
              video_id: s.videoId,
              title: s.title,
              description: s.description || null,
              published_at: s.publishedAt || null,
              stream_url: s.url,
              stream_status: "completed",
              processing_status: "unprocessed",
            }));

            const { data: upserted, error: upsertErr } = await supabase
              .from("streams")
              .upsert(streamRows, { onConflict: "video_id", ignoreDuplicates: true })
              .select();

            if (upsertErr) throw upsertErr;
            newStreamsFound += upserted?.length || 0;
          }

          await supabase
            .from("channels")
            .update({ last_checked_at: new Date().toISOString() })
            .eq("id", channel.id);
        } catch (err: any) {
          errors.push({
            channelUrl: channel.channel_url,
            error: err.message || String(err),
          });
        }
      }

      report.sync = {
        channelsCount: channels?.length || 0,
        newStreamsFound,
        errors,
      };
    }

    // =========================================================================
    // STEP 2: SUBMIT BATCH (Package unprocessed streams)
    // =========================================================================
    if (action === "all" || action === "submit") {
      const { data: unprocessed, error: unprocErr } = await supabase
        .from("streams")
        .select("*")
        .eq("stream_status", "completed")
        .eq("processing_status", "unprocessed")
        .limit(15);

      if (unprocErr) throw unprocErr;

      if (!unprocessed || unprocessed.length === 0) {
        report.submit = { status: "no_streams", submittedCount: 0 };
      } else {
        const requests: BatchRequestItem[] = [];
        const validVideoIds: string[] = [];

        for (const stream of unprocessed) {
          try {
            const { formattedText } = await getFormattedTranscript(stream.video_id);
            const { systemPrompt, userPrompt } = buildTradeExtractionPrompt(formattedText);

            requests.push({
              custom_id: stream.video_id,
              body: {
                messages: [
                  { role: "system", content: systemPrompt },
                  { role: "user", content: userPrompt },
                ],
                response_format: { type: "json_object" },
              },
            });

            validVideoIds.push(stream.video_id);
          } catch (tErr: any) {
            await supabase
              .from("streams")
              .update({
                processing_status: "no_transcript",
                error_message: tErr.message || "Failed to load transcript",
              })
              .eq("video_id", stream.video_id);
          }
        }

        if (requests.length === 0) {
          report.submit = { status: "no_transcripts", submittedCount: 0 };
        } else {
          const batch = await createBatch(requests, modelOverride);

          await supabase.from("batches").upsert({
            id: batch.id,
            model: batch.model,
            status: batch.status,
            total_requests: batch.request_counts?.total || requests.length,
            completed_requests: batch.request_counts?.completed || 0,
            failed_requests: batch.request_counts?.failed || 0,
            submitted_at: new Date().toISOString(),
            metadata: {
              endpoint: batch.endpoint,
              completion_window: batch.completion_window,
            },
          });

          await supabase
            .from("streams")
            .update({
              batch_id: batch.id,
              processing_status: "batch_submitted",
            })
            .in("video_id", validVideoIds);

          report.submit = {
            status: "submitted",
            batchId: batch.id,
            submittedCount: requests.length,
          };
        }
      }
    }

    // =========================================================================
    // STEP 3: HARVEST BATCHES (Check active batches & store trades)
    // =========================================================================
    if (action === "all" || action === "harvest") {
      const { data: activeBatches, error: batchErr } = await supabase
        .from("batches")
        .select("*")
        .in("status", ["validating", "in_progress", "finalizing"]);

      if (batchErr) throw batchErr;

      let completedBatchesCount = 0;
      let totalTradesExtracted = 0;

      for (const b of activeBatches || []) {
        try {
          const remoteBatch = await getBatch(b.id);

          await supabase
            .from("batches")
            .update({
              status: remoteBatch.status,
              completed_requests: remoteBatch.request_counts?.completed || 0,
              failed_requests: remoteBatch.request_counts?.failed || 0,
              total_requests: remoteBatch.request_counts?.total || 0,
              cost: remoteBatch.usage?.cost ?? null,
              finalized_at: remoteBatch.finalized_at
                ? new Date(remoteBatch.finalized_at * 1000).toISOString()
                : null,
              error: remoteBatch.error ?? null,
            })
            .eq("id", b.id);

          if (remoteBatch.status === "completed") {
            completedBatchesCount++;

            const { data: streams } = await supabase
              .from("streams")
              .select("*")
              .eq("batch_id", b.id);

            const streamMap = new Map((streams || []).map((s) => [s.video_id, s]));
            const parsedResults = parseBatchTradeResults(remoteBatch);

            for (const item of parsedResults) {
              const stream = streamMap.get(item.videoId);
              if (!stream) continue;

              if (item.status === "completed" && item.trades) {
                if (item.trades.length > 0) {
                  const tradeRows = item.trades.map((t: any) => ({
                    stream_id: stream.id,
                    channel_id: stream.channel_id,
                    symbol: t.symbol,
                    side: t.side,
                    result: t.result,
                    entry_price: t.entry_price ?? null,
                    exit_price: t.exit_price ?? null,
                    important_timestamps: t.important_timestamps ?? [],
                    notes: t.notes ?? null,
                    raw_data: t,
                  }));

                  await supabase.from("trades").insert(tradeRows);
                  totalTradesExtracted += tradeRows.length;
                }

                await supabase
                  .from("streams")
                  .update({
                    processing_status: "completed",
                    error_message: null,
                  })
                  .eq("id", stream.id);
              } else {
                await supabase
                  .from("streams")
                  .update({
                    processing_status: "failed",
                    error_message: item.error || "Batch item failed",
                  })
                  .eq("id", stream.id);
              }
            }
          }
        } catch (err: any) {
          console.warn(`Error harvesting batch ${b.id}:`, err);
        }
      }

      report.harvest = {
        checkedBatchesCount: activeBatches?.length || 0,
        completedBatchesCount,
        totalTradesExtracted,
      };
    }

    return new Response(JSON.stringify({ ok: true, report }, null, 2), {
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json",
      },
      status: 200,
    });
  } catch (err: any) {
    return new Response(
      JSON.stringify(
        {
          ok: false,
          error: err.message || String(err),
        },
        null,
        2
      ),
      {
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
        status: 500,
      }
    );
  }
});
