import React, { useMemo, useState } from "react";
import { useTable } from "@refinedev/react-table";
import { createColumnHelper } from "@tanstack/react-table";
import { useMany, useSelect } from "@refinedev/core";
import { useSearchParams, useNavigate } from "react-router";
import { toast } from "sonner";
import {
  ExternalLink,
  Play,
  CheckCircle2,
  Clock,
  AlertCircle,
  HelpCircle,
  FileQuestion,
  TrendingUp,
  Trash2,
  Loader2,
  Layers,
} from "lucide-react";

import { DataTable } from "@/components/refine-ui/data-table/data-table";
import { ListView } from "@/components/refine-ui/views/list-view";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import { Breadcrumb } from "@/components/refine-ui/layout/breadcrumb";
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
import { ComplexFilterBar, type FilterFieldConfig } from "@/components/complex-filter";
import { supabaseClient } from "@/providers/supabase-client";
import type { Stream, Channel } from "@/types";

export const StreamList = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const channelFilterParam = searchParams.get("channel_id") || "all";

  // Row selection state for bulk operations
  const [rowSelection, setRowSelection] = useState<Record<string, boolean>>({});

  // Deletion dialog states
  const [streamToDelete, setStreamToDelete] = useState<Stream | null>(null);
  const [isBulkDialogOpen, setIsBulkDialogOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  // Channel dropdown options
  const { options: channelOptions } = useSelect<Channel>({
    resource: "channels",
    optionLabel: "title",
    optionValue: "id",
  });

  const columns = useMemo(() => {
    const columnHelper = createColumnHelper<Stream>();

    return [
      // Checkbox selection column
      columnHelper.display({
        id: "select",
        header: ({ table }) => (
          <div className="flex items-center justify-center pl-2">
            <Checkbox
              checked={
                table.getIsAllPageRowsSelected() ||
                (table.getIsSomePageRowsSelected() && "indeterminate")
              }
              onCheckedChange={(val) => table.toggleAllPageRowsSelected(!!val)}
              aria-label="Select all streams on page"
              className="translate-y-[1px]"
            />
          </div>
        ),
        cell: ({ row }) => (
          <div className="flex items-center justify-center pl-2">
            <Checkbox
              checked={row.getIsSelected()}
              onCheckedChange={(val) => row.toggleSelected(!!val)}
              aria-label="Select stream row"
              className="translate-y-[1px]"
            />
          </div>
        ),
        enableSorting: false,
        size: 40,
      }),

      columnHelper.display({
        id: "stream",
        header: "Stream / Video",
        cell: ({ row }) => {
          const stream = row.original;
          const thumbnailUrl = `https://img.youtube.com/vi/${stream.video_id}/mqdefault.jpg`;

          return (
            <div className="flex items-center gap-3 py-1">
              <div className="relative w-24 h-14 rounded-md overflow-hidden bg-muted border shrink-0 group">
                <img
                  src={thumbnailUrl}
                  alt={stream.title}
                  className="w-full h-full object-cover transition-transform duration-200 group-hover:scale-105"
                  onError={(e) => {
                    (e.target as HTMLImageElement).src =
                      "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='96' height='56' viewBox='0 0 96 56'><rect width='96' height='56' fill='%23222'/><text x='48' y='32' fill='%23666' font-size='12' text-anchor='middle'>Stream</text></svg>";
                  }}
                />
                <div className="absolute inset-0 bg-black/20 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                  <Play className="h-5 w-5 text-white fill-white" />
                </div>
              </div>
              <div className="flex flex-col min-w-0">
                <span
                  className="font-medium text-sm text-foreground line-clamp-1 hover:text-primary cursor-pointer"
                  onClick={() => navigate(`/streams/show/${stream.id}`)}
                  title={stream.title}
                >
                  {stream.title}
                </span>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="font-mono text-xs text-muted-foreground">
                    {stream.video_id}
                  </span>
                  <a
                    href={stream.stream_url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs text-muted-foreground hover:text-primary inline-flex items-center gap-0.5"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <span>YouTube</span>
                    <ExternalLink className="h-2.5 w-2.5" />
                  </a>
                </div>
              </div>
            </div>
          );
        },
        size: 360,
      }),
      columnHelper.accessor("channel_id", {
        id: "channel_id",
        header: "Channel",
        cell: ({ getValue, table }) => {
          const channelId = getValue();
          const channelMap = (table.options.meta as any)?.channelMap || {};
          const channel = channelMap[channelId];
          return (
            <span className="text-sm font-medium text-foreground truncate block">
              {channel?.title || "—"}
            </span>
          );
        },
        enableSorting: false,
        size: 160,
      }),
      columnHelper.accessor("stream_status", {
        id: "stream_status",
        header: "Stream Status",
        cell: ({ getValue }) => {
          const status = getValue();
          return (
            <Badge variant="outline" className="text-xs font-mono capitalize">
              {status || "completed"}
            </Badge>
          );
        },
        enableSorting: true,
        size: 120,
      }),
      columnHelper.accessor("processing_status", {
        id: "processing_status",
        header: "Pipeline Status",
        cell: ({ getValue, row }) => {
          const status = getValue();

          switch (status) {
            case "completed":
              return (
                <Badge className="bg-emerald-500/15 text-emerald-600 hover:bg-emerald-500/25 border-emerald-500/20 gap-1 text-xs">
                  <CheckCircle2 className="h-3 w-3" />
                  Completed
                </Badge>
              );
            case "batch_submitted":
              return (
                <Badge className="bg-blue-500/15 text-blue-600 hover:bg-blue-500/25 border-blue-500/20 gap-1 text-xs">
                  <Clock className="h-3 w-3 animate-spin" />
                  Analyzing
                </Badge>
              );
            case "failed":
              return (
                <Badge variant="destructive" className="gap-1 text-xs" title={row.original.error_message || undefined}>
                  <AlertCircle className="h-3 w-3" />
                  Failed
                </Badge>
              );
            case "transcript_pending":
              return (
                <Badge
                  className="bg-amber-500/15 text-amber-600 hover:bg-amber-500/25 border-amber-500/20 gap-1 text-xs"
                  title={row.original.error_message || "Transcript pending, retrying during 7-day grace period"}
                >
                  <Clock className="h-3 w-3" />
                  Pending Retry
                </Badge>
              );
            case "no_transcript":
              return (
                <Badge
                  variant="outline"
                  className="text-muted-foreground border-dashed gap-1 text-xs"
                  title={row.original.error_message || "No transcript available after 7-day grace window. Abandoned."}
                >
                  <FileQuestion className="h-3 w-3" />
                  No Transcript
                </Badge>
              );
            default:
              return (
                <Badge variant="secondary" className="gap-1 text-xs">
                  <HelpCircle className="h-3 w-3" />
                  {status || "Unprocessed"}
                </Badge>
              );
          }
        },
        enableSorting: true,
        size: 140,
      }),
      columnHelper.display({
        id: "trades_count",
        header: "Extracted Trades",
        cell: ({ row }) => {
          const tradeCount =
            Array.isArray(row.original.trades) && row.original.trades[0]
              ? row.original.trades[0].count
              : 0;

          if (tradeCount > 0) {
            return (
              <Badge
                variant="secondary"
                className="gap-1 font-mono font-semibold bg-emerald-500/10 text-emerald-600 hover:bg-emerald-500/20 border-emerald-500/20 text-xs"
              >
                <TrendingUp className="h-3 w-3" />
                <span>{tradeCount} {tradeCount === 1 ? "trade" : "trades"}</span>
              </Badge>
            );
          }

          return (
            <span className="text-xs text-muted-foreground font-mono pl-2">
              0
            </span>
          );
        },
        size: 150,
      }),
      columnHelper.accessor("published_at", {
        id: "published_at",
        header: "Stream Date",
        cell: ({ getValue }) => {
          const val = getValue();
          if (!val) return <span className="text-xs text-muted-foreground">—</span>;
          const date = new Date(val);
          return (
            <span className="text-xs text-muted-foreground">
              {date.toLocaleDateString()} {date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
            </span>
          );
        },
        enableSorting: true,
        size: 150,
      }),
      columnHelper.display({
        id: "actions",
        header: "Actions",
        cell: ({ row }) => (
          <div className="flex items-center gap-1.5">
            <Button
              size="sm"
              variant="default"
              className="h-8 gap-1.5 text-xs font-medium"
              onClick={() => navigate(`/streams/show/${row.original.id}`)}
            >
              <Play className="h-3.5 w-3.5 fill-current" />
              <span>View & Analyze</span>
            </Button>

            <Button
              size="sm"
              variant="ghost"
              className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
              onClick={() => setStreamToDelete(row.original)}
              title="Delete stream and associated trades"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        ),
        enableSorting: false,
        size: 170,
      }),
    ];
  }, [navigate]);

  // Initial filter from query param
  const initialFilters = useMemo(() => {
    if (channelFilterParam && channelFilterParam !== "all") {
      return [
        {
          field: "channel_id",
          operator: "eq" as const,
          value: channelFilterParam,
        },
      ];
    }
    return [];
  }, [channelFilterParam]);

  const table = useTable<Stream>({
    columns,
    refineCoreProps: {
      resource: "streams",
      syncWithLocation: true,
      meta: {
        select: "*, trades(count)",
      },
      filters: {
        initial: initialFilters,
      },
      sorters: {
        initial: [
          {
            field: "published_at",
            order: "desc",
          },
        ],
      },
      pagination: {
        pageSize: 15,
      },
    },
    enableRowSelection: true,
    getRowId: (row) => row.id,
    state: {
      rowSelection,
    },
    onRowSelectionChange: setRowSelection,
  });

  // Extract channel IDs from rows to fetch channel names in batch
  const streamRows = table.reactTable.getRowModel().rows || [];
  const channelIds = useMemo(() => {
    const ids = new Set<string>();
    streamRows.forEach((r) => {
      if (r.original.channel_id) ids.add(r.original.channel_id);
    });
    return Array.from(ids);
  }, [streamRows]);

  const { result: channelsResult } = useMany<Channel>({
    resource: "channels",
    ids: channelIds,
    queryOptions: {
      enabled: channelIds.length > 0,
    },
  });

  const channelMap = useMemo(() => {
    const map: Record<string, Channel> = {};
    channelsResult?.data?.forEach((ch: Channel) => {
      map[ch.id] = ch;
    });
    return map;
  }, [channelsResult]);

  // Pass channelMap to table meta
  table.reactTable.options.meta = {
    ...table.reactTable.options.meta,
    channelMap,
  };

  // Complex filter configurations for Livestreams
  const filterFields: FilterFieldConfig[] = useMemo(() => {
    return [
      {
        id: "channel_id",
        label: "Channel",
        type: "select",
        options: channelOptions.map((opt) => ({
          label: String(opt.label),
          value: String(opt.value),
        })),
        quickFilter: true,
      },
      {
        id: "processing_status",
        label: "Pipeline Status",
        type: "select",
        options: [
          { label: "Completed", value: "completed" },
          { label: "Analyzing", value: "batch_submitted" },
          { label: "Failed", value: "failed" },
          { label: "Pending Retry", value: "transcript_pending" },
          { label: "No Transcript", value: "no_transcript" },
          { label: "Unprocessed", value: "unprocessed" },
        ],
        quickFilter: true,
      },
      {
        id: "stream_status",
        label: "Stream Status",
        type: "select",
        options: [
          { label: "Completed", value: "completed" },
          { label: "Live", value: "live" },
          { label: "Upcoming", value: "upcoming" },
        ],
        quickFilter: true,
      },
      {
        id: "title",
        label: "Stream Title",
        type: "text",
        placeholder: "Search by title...",
        quickFilter: true,
      },
      {
        id: "video_id",
        label: "YouTube Video ID",
        type: "text",
        placeholder: "e.g. dQw4w9WgXcQ",
      },
      {
        id: "published_at",
        label: "Stream Date",
        type: "date",
      },
    ];
  }, [channelOptions]);

  // Selected streams count
  const selectedStreamIds = useMemo(() => {
    return Object.keys(rowSelection).filter((k) => rowSelection[k]);
  }, [rowSelection]);

  // Single stream deletion handler
  const handleDeleteStream = async () => {
    if (!streamToDelete) return;
    setIsDeleting(true);
    try {
      const { error } = await supabaseClient
        .from("streams")
        .delete()
        .eq("id", streamToDelete.id);

      if (error) throw error;

      toast.success("Livestream and its associated trades deleted successfully");
      setStreamToDelete(null);
      // Remove from selection if it was selected
      setRowSelection((prev) => {
        const next = { ...prev };
        delete next[streamToDelete.id];
        return next;
      });
      table.refineCore.tableQuery.refetch();
    } catch (err: any) {
      toast.error(err.message || "Failed to delete livestream");
    } finally {
      setIsDeleting(false);
    }
  };

  // Bulk stream deletion handler
  const handleBulkDeleteStreams = async () => {
    if (selectedStreamIds.length === 0) return;
    setIsDeleting(true);
    try {
      const { error } = await supabaseClient
        .from("streams")
        .delete()
        .in("id", selectedStreamIds);

      if (error) throw error;

      toast.success(
        `Successfully deleted ${selectedStreamIds.length} streams and their associated trades`
      );
      setRowSelection({});
      setIsBulkDialogOpen(false);
      table.refineCore.tableQuery.refetch();
    } catch (err: any) {
      toast.error(err.message || "Failed to delete selected livestreams");
    } finally {
      setIsDeleting(false);
    }
  };

  const tradeCountForStreamToDelete = useMemo(() => {
    if (!streamToDelete) return 0;
    return Array.isArray(streamToDelete.trades) && streamToDelete.trades[0]
      ? streamToDelete.trades[0].count
      : 0;
  }, [streamToDelete]);

  return (
    <ListView>
      {/* Header and Filter Bar */}
      <div className="flex flex-col gap-4">
        <div className="flex items-center relative gap-2">
          <div className="bg-background z-[2] pr-4">
            <Breadcrumb />
          </div>
          <Separator className="absolute left-0 right-0 z-[1]" />
        </div>

        <div className="flex flex-col gap-1">
          <h2 className="text-2xl font-bold tracking-tight">Livestreams</h2>
          <p className="text-sm text-muted-foreground">
            Monitor detected trading sessions, pipeline statuses, and AI trade extractions.
          </p>
        </div>

        {/* Complex ERPNext/Airtable Style Filter Bar */}
        <ComplexFilterBar
          fields={filterFields}
          filters={table.refineCore.filters}
          onFiltersChange={(newFilters) => {
            table.refineCore.setFilters(newFilters, "replace");
          }}
        />

        {/* Bulk Action Bar (visible when rows are selected) */}
        {selectedStreamIds.length > 0 && (
          <div className="flex items-center justify-between px-4 py-2.5 bg-primary/5 border border-primary/20 rounded-lg text-sm transition-all animate-in fade-in-50">
            <div className="flex items-center gap-2">
              <Layers className="h-4 w-4 text-primary" />
              <span className="font-semibold text-foreground">
                {selectedStreamIds.length}{" "}
                {selectedStreamIds.length === 1 ? "stream" : "streams"} selected
              </span>
            </div>

            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                className="h-8 text-xs text-muted-foreground hover:text-foreground"
                onClick={() => setRowSelection({})}
              >
                Deselect all
              </Button>
              <Button
                variant="destructive"
                size="sm"
                className="h-8 text-xs gap-1.5 font-medium shadow-sm"
                onClick={() => setIsBulkDialogOpen(true)}
              >
                <Trash2 className="h-3.5 w-3.5" />
                <span>Delete Selected ({selectedStreamIds.length})</span>
              </Button>
            </div>
          </div>
        )}
      </div>

      <DataTable table={table} />

      {/* Single Stream Delete Alert Dialog */}
      <AlertDialog
        open={!!streamToDelete}
        onOpenChange={(open) => !open && !isDeleting && setStreamToDelete(null)}
      >
        <AlertDialogContent className="max-w-md">
          <AlertDialogHeader>
            <div className="p-2 w-fit rounded-full bg-destructive/10 text-destructive mb-2">
              <Trash2 className="h-5 w-5" />
            </div>
            <AlertDialogTitle className="text-lg">
              Delete Livestream?
            </AlertDialogTitle>
            <AlertDialogDescription className="text-sm leading-relaxed space-y-2">
              <span>
                Are you sure you want to delete{" "}
                <strong className="text-foreground">
                  &ldquo;{streamToDelete?.title}&rdquo;
                </strong>
                ?
              </span>
              <span className="block text-destructive/90 font-medium">
                Warning: This will permanently delete this stream session and all{" "}
                {tradeCountForStreamToDelete > 0
                  ? `${tradeCountForStreamToDelete} associated extracted trade${
                      tradeCountForStreamToDelete === 1 ? "" : "s"
                    }`
                  : "associated trades"}{" "}
                from the database.
              </span>
              <span className="block text-xs text-muted-foreground">
                This action cannot be undone.
              </span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={handleDeleteStream}
              disabled={isDeleting}
            >
              {isDeleting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-1.5" />
                  Deleting...
                </>
              ) : (
                "Delete Stream & Trades"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Bulk Stream Delete Alert Dialog */}
      <AlertDialog
        open={isBulkDialogOpen}
        onOpenChange={(open) => !open && !isDeleting && setIsBulkDialogOpen(false)}
      >
        <AlertDialogContent className="max-w-md">
          <AlertDialogHeader>
            <div className="p-2 w-fit rounded-full bg-destructive/10 text-destructive mb-2">
              <Trash2 className="h-5 w-5" />
            </div>
            <AlertDialogTitle className="text-lg">
              Delete {selectedStreamIds.length} Livestreams?
            </AlertDialogTitle>
            <AlertDialogDescription className="text-sm leading-relaxed space-y-2">
              <span>
                Are you sure you want to delete the{" "}
                <strong className="text-foreground">
                  {selectedStreamIds.length} selected livestream sessions
                </strong>
                ?
              </span>
              <span className="block text-destructive/90 font-medium">
                Warning: This will permanently delete all {selectedStreamIds.length} selected
                streams along with ALL associated extracted trades across these streams.
              </span>
              <span className="block text-xs text-muted-foreground">
                This action cannot be undone.
              </span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={handleBulkDeleteStreams}
              disabled={isDeleting}
            >
              {isDeleting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-1.5" />
                  Deleting...
                </>
              ) : (
                `Delete ${selectedStreamIds.length} Streams`
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </ListView>
  );
};
