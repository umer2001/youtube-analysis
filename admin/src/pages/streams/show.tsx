import React, { useRef, useState } from "react";
import { useShow, useList, useOne, useUpdate, useDelete } from "@refinedev/core";
import { useNavigate } from "react-router";
import {
  ArrowLeft,
  RefreshCw,
  ExternalLink,
  Play,
  TrendingUp,
  TrendingDown,
  Clock,
  CheckCircle2,
  AlertCircle,
  FileQuestion,
  HelpCircle,
  Copy,
  Check,
  Radio,
  Layers,
  Sparkles,
  Pencil,
  Trash2,
} from "lucide-react";

import {
  YouTubePlayer,
  YouTubePlayerHandle,
  timestampToSeconds,
} from "@/components/youtube-player";
import { ShowView } from "@/components/refine-ui/views/show-view";
import { Breadcrumb } from "@/components/refine-ui/layout/breadcrumb";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { Stream, Channel, Trade, TradeSide, TradeResult } from "@/types";

export const StreamShow = () => {
  const navigate = useNavigate();
  const playerRef = useRef<YouTubePlayerHandle>(null);

  const [activeTimestamp, setActiveTimestamp] = useState<string | null>(null);
  const [copiedBatchId, setCopiedBatchId] = useState(false);

  // Edit trade dialog state
  const [editingTrade, setEditingTrade] = useState<Trade | null>(null);
  const [editSymbol, setEditSymbol] = useState("");
  const [editSide, setEditSide] = useState<TradeSide>("LONG");
  const [editResult, setEditResult] = useState<TradeResult>("UNKNOWN");
  const [editEntryPrice, setEditEntryPrice] = useState("");
  const [editExitPrice, setEditExitPrice] = useState("");
  const [editTimestamps, setEditTimestamps] = useState("");
  const [editNotes, setEditNotes] = useState("");

  // Delete trade alert dialog state
  const [tradeToDelete, setTradeToDelete] = useState<Trade | null>(null);

  // Mutations
  const { mutate: updateTrade, mutation: updateMutation } = useUpdate<Trade>();
  const { mutate: deleteTrade, mutation: deleteMutation } = useDelete<Trade>();
  const isUpdating = updateMutation.isPending;
  const isDeleting = deleteMutation.isPending;

  // 1. Fetch current stream record
  const { query, result: streamResult } = useShow<Stream>({
    resource: "streams",
  });
  const stream = (streamResult as Stream) || query.data?.data;
  const isLoading = query.isLoading;

  // 2. Fetch channel details
  const { result: channelResult } = useOne<Channel>({
    resource: "channels",
    id: stream?.channel_id || "",
    queryOptions: {
      enabled: !!stream?.channel_id,
    },
  });
  const channel = channelResult as Channel | undefined;

  // 3. Fetch trades extracted for this stream
  const { result: tradesResult, query: tradesQuery } = useList<Trade>({
    resource: "trades",
    filters: [
      {
        field: "stream_id",
        operator: "eq",
        value: stream?.id,
      },
    ],
    sorters: [
      {
        field: "created_at",
        order: "asc",
      },
    ],
    queryOptions: {
      enabled: !!stream?.id,
    },
  });

  const trades: Trade[] = tradesResult?.data || [];
  const tradesLoading = tradesQuery.isLoading;

  // Trade metrics
  const totalTrades = trades.length;
  const longTrades = trades.filter((t: Trade) => t.side === "LONG").length;
  const shortTrades = trades.filter((t: Trade) => t.side === "SHORT").length;

  const handleJumpToTimestamp = (timestamp: string) => {
    setActiveTimestamp(timestamp);
    const seconds = timestampToSeconds(timestamp);
    playerRef.current?.seekTo(seconds);
  };

  const handleCopyBatchId = (batchId: string) => {
    navigator.clipboard.writeText(batchId);
    setCopiedBatchId(true);
    setTimeout(() => setCopiedBatchId(false), 2000);
  };

  const handleRefreshAll = () => {
    query.refetch();
    tradesQuery.refetch();
  };

  // Open Edit Modal with populated values
  const handleOpenEdit = (trade: Trade) => {
    setEditingTrade(trade);
    setEditSymbol(trade.symbol);
    setEditSide(trade.side);
    setEditResult(trade.result);
    setEditEntryPrice(trade.entry_price || "");
    setEditExitPrice(trade.exit_price || "");
    setEditTimestamps((trade.important_timestamps || []).join(", "));
    setEditNotes(trade.notes || "");
  };

  // Save Trade Changes
  const handleSaveEdit = () => {
    if (!editingTrade) return;

    const timestampsArray = editTimestamps
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);

    updateTrade(
      {
        resource: "trades",
        id: editingTrade.id,
        values: {
          symbol: editSymbol,
          side: editSide,
          result: editResult,
          entry_price: editEntryPrice || null,
          exit_price: editExitPrice || null,
          important_timestamps: timestampsArray,
          notes: editNotes || null,
        },
      },
      {
        onSuccess: () => {
          setEditingTrade(null);
          tradesQuery.refetch();
        },
      }
    );
  };

  // Confirm Delete
  const handleConfirmDelete = () => {
    if (!tradeToDelete) return;

    deleteTrade(
      {
        resource: "trades",
        id: tradeToDelete.id,
      },
      {
        onSuccess: () => {
          setTradeToDelete(null);
          tradesQuery.refetch();
        },
      }
    );
  };

  if (isLoading || !stream) {
    return (
      <ShowView>
        <Card className="p-12 text-center text-muted-foreground">
          <div className="flex flex-col items-center gap-3">
            <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            <p>Loading stream data and trade extractions...</p>
          </div>
        </Card>
      </ShowView>
    );
  }

  return (
    <ShowView>
      {/* Top Navigation & Action Bar */}
      <div className="flex flex-col gap-3">
        <div className="flex items-center relative gap-2">
          <div className="bg-background z-[2] pr-4">
            <Breadcrumb />
          </div>
          <Separator className="absolute left-0 right-0 z-[1]" />
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => navigate(-1)}
              title="Go back"
            >
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div>
              <h2 className="text-xl sm:text-2xl font-bold tracking-tight line-clamp-1">
                {stream.title}
              </h2>
              <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
                {channel && (
                  <span className="font-medium text-foreground">
                    {channel.title}
                  </span>
                )}
                <span>•</span>
                <span className="font-mono">{stream.video_id}</span>
                <span>•</span>
                <a
                  href={stream.stream_url}
                  target="_blank"
                  rel="noreferrer"
                  className="hover:text-primary inline-flex items-center gap-1"
                >
                  Watch on YouTube
                  <ExternalLink className="h-3 w-3" />
                </a>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 self-start sm:self-center">
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5 text-xs"
              onClick={handleRefreshAll}
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Refresh
            </Button>
          </div>
        </div>
      </div>

      {/* Pipeline Status Banner */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {/* Pipeline Status */}
        <Card className="p-3.5 flex flex-col justify-between">
          <span className="text-xs text-muted-foreground">Pipeline Status</span>
          <div className="flex items-center gap-1.5 mt-1">
            {stream.processing_status === "completed" && (
              <Badge className="bg-emerald-500/15 text-emerald-600 border-emerald-500/20 gap-1">
                <CheckCircle2 className="h-3.5 w-3.5" />
                Completed
              </Badge>
            )}
            {stream.processing_status === "batch_submitted" && (
              <Badge className="bg-blue-500/15 text-blue-600 border-blue-500/20 gap-1 animate-pulse">
                <Clock className="h-3.5 w-3.5" />
                AI Analyzing
              </Badge>
            )}
            {stream.processing_status === "failed" && (
              <Badge variant="destructive" className="gap-1">
                <AlertCircle className="h-3.5 w-3.5" />
                Failed
              </Badge>
            )}
            {stream.processing_status === "transcript_pending" && (
              <Badge className="bg-amber-500/15 text-amber-600 border-amber-500/20 gap-1 animate-pulse" title={stream.error_message || undefined}>
                <Clock className="h-3.5 w-3.5" />
                Transcript Pending (Retrying)
              </Badge>
            )}
            {stream.processing_status === "no_transcript" && (
              <Badge variant="outline" className="text-muted-foreground border-dashed gap-1" title={stream.error_message || undefined}>
                <FileQuestion className="h-3.5 w-3.5" />
                No Transcript (Abandoned &gt;1w)
              </Badge>
            )}
            {stream.processing_status === "unprocessed" && (
              <Badge variant="secondary" className="gap-1">
                <HelpCircle className="h-3.5 w-3.5" />
                Unprocessed
              </Badge>
            )}
          </div>
        </Card>

        {/* Stream Status */}
        <Card className="p-3.5 flex flex-col justify-between">
          <span className="text-xs text-muted-foreground">Stream Status</span>
          <div className="mt-1">
            <Badge variant="outline" className="font-mono capitalize text-xs">
              <Radio className="h-3 w-3 mr-1 text-primary" />
              {stream.stream_status || "completed"}
            </Badge>
          </div>
        </Card>

        {/* Total Extracted Trades */}
        <Card className="p-3.5 flex flex-col justify-between">
          <span className="text-xs text-muted-foreground">Trades Extracted</span>
          <div className="flex items-baseline gap-2 mt-1">
            <span className="text-2xl font-bold text-foreground">
              {tradesLoading ? "..." : totalTrades}
            </span>
            {totalTrades > 0 && (
              <span className="text-xs text-muted-foreground">
                ({longTrades} Long • {shortTrades} Short)
              </span>
            )}
          </div>
        </Card>

        {/* Published Date */}
        <Card className="p-3.5 flex flex-col justify-between">
          <span className="text-xs text-muted-foreground">Stream Date</span>
          <div className="text-sm font-medium mt-1 truncate">
            {stream.published_at
              ? new Date(stream.published_at).toLocaleDateString(undefined, {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                })
              : "Unknown"}
          </div>
        </Card>
      </div>

      {/* Batch or Error Alert if present */}
      {stream.error_message && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Pipeline Error</AlertTitle>
          <AlertDescription className="text-xs font-mono mt-1">
            {stream.error_message}
          </AlertDescription>
        </Alert>
      )}

      {stream.batch_id && (
        <div className="flex items-center justify-between px-4 py-2.5 rounded-lg border bg-muted/40 text-xs">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary shrink-0" />
            <span className="text-muted-foreground">OpenRouter Batch ID:</span>
            <span className="font-mono font-medium text-foreground">
              {stream.batch_id}
            </span>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-xs gap-1"
            onClick={() => handleCopyBatchId(stream.batch_id!)}
          >
            {copiedBatchId ? (
              <>
                <Check className="h-3 w-3 text-emerald-500" />
                <span>Copied</span>
              </>
            ) : (
              <>
                <Copy className="h-3 w-3" />
                <span>Copy</span>
              </>
            )}
          </Button>
        </div>
      )}

      {/* Core Split Section: Video Player (Left) + Interactive Trades (Right) */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
        {/* Left Column: YouTube Video Player & Controls (7 Cols on XL) */}
        <div className="xl:col-span-7 flex flex-col gap-4">
          <Card className="overflow-hidden border-2 shadow-sm">
            <CardHeader className="py-3 px-4 bg-muted/30 border-b flex flex-row items-center justify-between space-y-0">
              <div className="flex items-center gap-2">
                <Play className="h-4 w-4 text-primary fill-primary" />
                <span className="font-semibold text-sm">Interactive Player</span>
              </div>
              {activeTimestamp && (
                <div className="flex items-center gap-1.5">
                  <span className="text-xs text-muted-foreground">Seeked to:</span>
                  <Badge variant="secondary" className="font-mono text-xs">
                    {activeTimestamp}
                  </Badge>
                </div>
              )}
            </CardHeader>
            <CardContent className="p-3">
              <YouTubePlayer ref={playerRef} videoId={stream.video_id} />

              <div className="flex items-center justify-between mt-3 pt-2 border-t text-xs text-muted-foreground">
                <span>Click any timestamp tag on the right to jump directly in video</span>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs gap-1"
                  onClick={() => handleJumpToTimestamp("00:00:00")}
                >
                  <Clock className="h-3 w-3" />
                  Jump to Start (00:00)
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Stream Description */}
          {stream.description && (
            <Card>
              <CardHeader className="py-3 px-4">
                <CardTitle className="text-sm font-semibold">Stream Description</CardTitle>
              </CardHeader>
              <CardContent className="px-4 pb-4">
                <p className="text-xs text-muted-foreground whitespace-pre-line line-clamp-4 hover:line-clamp-none transition-all">
                  {stream.description}
                </p>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Right Column: Extracted Trades & Clickable Timestamps (5 Cols on XL) */}
        <div className="xl:col-span-5 flex flex-col gap-4">
          <Card className="border-2 shadow-sm">
            <CardHeader className="py-3 px-4 bg-muted/30 border-b flex flex-row items-center justify-between space-y-0">
              <div className="flex items-center gap-2">
                <Layers className="h-4 w-4 text-primary" />
                <CardTitle className="text-sm font-semibold">
                  Extracted Trades & Key Moments
                </CardTitle>
              </div>
              <Badge variant="outline" className="text-xs">
                {totalTrades} {totalTrades === 1 ? "Trade" : "Trades"}
              </Badge>
            </CardHeader>

            <CardContent className="p-4">
              {tradesLoading ? (
                <div className="py-12 flex flex-col items-center justify-center gap-2 text-muted-foreground text-xs">
                  <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                  <span>Loading extracted trades...</span>
                </div>
              ) : trades.length === 0 ? (
                <div className="py-12 px-4 text-center">
                  <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center mx-auto mb-3">
                    <Clock className="h-6 w-6 text-muted-foreground" />
                  </div>
                  <h4 className="font-semibold text-sm text-foreground">
                    No Trades Recorded Yet
                  </h4>
                  <p className="text-xs text-muted-foreground mt-1 max-w-sm mx-auto">
                    {stream.processing_status === "batch_submitted"
                      ? "The stream is currently being analyzed by Gemini / OpenRouter. Once completed, trade setups and timestamps will automatically appear here."
                      : stream.processing_status === "completed"
                      ? "The AI analyzed this stream session but did not detect any trade entries or executions."
                      : "Processing has not been run for this stream yet."}
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  {trades.map((trade: Trade) => {
                    const isLong = trade.side === "LONG";
                    const isTp = trade.result === "TP";
                    const isSl = trade.result === "SL";

                    return (
                      <div
                        key={trade.id}
                        className="p-3.5 rounded-lg border bg-card hover:border-primary/40 transition-colors space-y-3"
                      >
                        {/* Trade Header: Symbol, Side, Result, Edit & Delete Actions */}
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-bold text-sm text-foreground">
                              {trade.symbol}
                            </span>
                            <Badge
                              className={`gap-1 text-xs font-semibold ${
                                isLong
                                  ? "bg-emerald-500/15 text-emerald-600 border-emerald-500/20"
                                  : "bg-rose-500/15 text-rose-600 border-rose-500/20"
                              }`}
                            >
                              {isLong ? (
                                <TrendingUp className="h-3 w-3" />
                              ) : (
                                <TrendingDown className="h-3 w-3" />
                              )}
                              {trade.side}
                            </Badge>
                          </div>

                          <div className="flex items-center gap-1.5 shrink-0">
                            <Badge
                              variant={
                                isTp
                                  ? "default"
                                  : isSl
                                  ? "destructive"
                                  : "outline"
                              }
                              className={`text-xs uppercase font-mono ${
                                isTp
                                  ? "bg-emerald-600 text-white"
                                  : isSl
                                  ? "bg-rose-600 text-white"
                                  : "text-amber-600 border-amber-500/30 bg-amber-500/10"
                              }`}
                            >
                              {trade.result}
                            </Badge>

                            {/* Edit Button */}
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-muted-foreground hover:text-foreground hover:bg-muted"
                              onClick={() => handleOpenEdit(trade)}
                              title="Edit trade"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>

                            {/* Delete Button */}
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-muted-foreground hover:text-rose-500 hover:bg-rose-500/10"
                              onClick={() => setTradeToDelete(trade)}
                              title="Delete trade"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </div>

                        {/* Prices Grid */}
                        {(trade.entry_price || trade.exit_price) && (
                          <div className="grid grid-cols-2 gap-2 text-xs bg-muted/40 p-2 rounded-md">
                            <div>
                              <span className="text-muted-foreground block text-[10px] uppercase font-semibold">
                                Entry Price
                              </span>
                              <span className="font-medium text-foreground">
                                {trade.entry_price || "—"}
                              </span>
                            </div>
                            <div>
                              <span className="text-muted-foreground block text-[10px] uppercase font-semibold">
                                Exit / Stop Out
                              </span>
                              <span className="font-medium text-foreground">
                                {trade.exit_price || "—"}
                              </span>
                            </div>
                          </div>
                        )}

                        {/* Trade Notes / Rationale */}
                        {trade.notes && (
                          <p className="text-xs text-muted-foreground/90 leading-relaxed bg-background/50 p-2 rounded border border-border/50">
                            {trade.notes}
                          </p>
                        )}

                        {/* Clickable Timestamps Section */}
                        {trade.important_timestamps &&
                          trade.important_timestamps.length > 0 && (
                            <div className="space-y-1.5 pt-1">
                              <span className="text-[11px] font-medium text-muted-foreground flex items-center gap-1">
                                <Clock className="h-3 w-3 text-primary" />
                                Click to jump in video:
                              </span>
                              <div className="flex items-center gap-1.5 flex-wrap">
                                {trade.important_timestamps.map((ts: string) => {
                                  const isActive = activeTimestamp === ts;
                                  return (
                                    <Button
                                      key={ts}
                                      variant={isActive ? "default" : "secondary"}
                                      size="sm"
                                      className={`h-7 px-2.5 text-xs font-mono gap-1 transition-all ${
                                        isActive
                                          ? "ring-2 ring-primary ring-offset-1 font-bold"
                                          : "hover:bg-primary/20 hover:text-primary"
                                      }`}
                                      onClick={() => handleJumpToTimestamp(ts)}
                                    >
                                      <Play className="h-2.5 w-2.5 fill-current" />
                                      {ts}
                                    </Button>
                                  );
                                })}
                              </div>
                            </div>
                          )}
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Edit Trade Dialog */}
      <Dialog
        open={!!editingTrade}
        onOpenChange={(open) => !open && setEditingTrade(null)}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Extracted Trade</DialogTitle>
            <DialogDescription>
              Adjust trade call details, target prices, rationale, and key timestamps.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-foreground">
                  Symbol / Asset *
                </label>
                <Input
                  value={editSymbol}
                  onChange={(e) => setEditSymbol(e.target.value)}
                  placeholder="e.g. Gold / XAUUSD, NQ, BTC"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-medium text-foreground">
                  Direction *
                </label>
                <Select
                  value={editSide}
                  onValueChange={(val: TradeSide) => setEditSide(val)}
                >
                  <SelectTrigger className="h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="LONG">LONG</SelectItem>
                    <SelectItem value="SHORT">SHORT</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-foreground">
                  Outcome *
                </label>
                <Select
                  value={editResult}
                  onValueChange={(val: TradeResult) => setEditResult(val)}
                >
                  <SelectTrigger className="h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="TP">TP (Take Profit)</SelectItem>
                    <SelectItem value="SL">SL (Stop Loss)</SelectItem>
                    <SelectItem value="UNKNOWN">UNKNOWN</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-medium text-foreground">
                  Entry Price
                </label>
                <Input
                  value={editEntryPrice}
                  onChange={(e) => setEditEntryPrice(e.target.value)}
                  placeholder="e.g. ~4185"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-medium text-foreground">
                  Exit Price
                </label>
                <Input
                  value={editExitPrice}
                  onChange={(e) => setEditExitPrice(e.target.value)}
                  placeholder="e.g. 4175"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-foreground">
                Important Timestamps (comma-separated)
              </label>
              <Input
                value={editTimestamps}
                onChange={(e) => setEditTimestamps(e.target.value)}
                placeholder="e.g. 01:17:11, 01:24:25, 02:05:00"
              />
              <span className="text-[11px] text-muted-foreground block">
                Format: HH:MM:SS or MM:SS, separated by commas.
              </span>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-foreground">
                Rationale / Trade Notes
              </label>
              <Textarea
                value={editNotes}
                onChange={(e) => setEditNotes(e.target.value)}
                placeholder="Brief setup rationale or notes"
                rows={3}
              />
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => setEditingTrade(null)}
              disabled={isUpdating}
            >
              Cancel
            </Button>
            <Button onClick={handleSaveEdit} disabled={isUpdating}>
              {isUpdating ? "Saving..." : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Trade Alert Dialog */}
      <AlertDialog
        open={!!tradeToDelete}
        onOpenChange={(open) => !open && setTradeToDelete(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Extracted Trade</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this {tradeToDelete?.symbol} ({tradeToDelete?.side}) trade? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={handleConfirmDelete}
              disabled={isDeleting}
            >
              {isDeleting ? "Deleting..." : "Delete Trade"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </ShowView>
  );
};
