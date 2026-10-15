import React, { useMemo } from "react";
import { useTable } from "@refinedev/react-table";
import { createColumnHelper } from "@tanstack/react-table";
import { useMany, useSelect } from "@refinedev/core";
import { useSearchParams, useNavigate } from "react-router";
import {
  ExternalLink,
  Play,
  Filter,
  CheckCircle2,
  Clock,
  AlertCircle,
  HelpCircle,
  FileQuestion,
  X,
  TrendingUp,
} from "lucide-react";

import { DataTable } from "@/components/refine-ui/data-table/data-table";
import { ListView } from "@/components/refine-ui/views/list-view";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Breadcrumb } from "@/components/refine-ui/layout/breadcrumb";
import type { Stream, Channel } from "@/types";

export const StreamList = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const channelFilterParam = searchParams.get("channel_id") || "all";

  // Channel dropdown options
  const { options: channelOptions } = useSelect<Channel>({
    resource: "channels",
    optionLabel: "title",
    optionValue: "id",
  });

  const columns = useMemo(() => {
    const columnHelper = createColumnHelper<Stream>();

    return [
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
        size: 380,
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
        header: "Analysis",
        cell: ({ row }) => (
          <Button
            size="sm"
            variant="default"
            className="h-8 gap-1.5 text-xs font-medium"
            onClick={() => navigate(`/streams/show/${row.original.id}`)}
          >
            <Play className="h-3.5 w-3.5 fill-current" />
            <span>View & Analyze</span>
          </Button>
        ),
        enableSorting: false,
        size: 140,
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

  const handleChannelFilterChange = (val: string) => {
    if (val === "all") {
      table.refineCore.setFilters([], "replace");
      setSearchParams({});
    } else {
      table.refineCore.setFilters(
        [
          {
            field: "channel_id",
            operator: "eq",
            value: val,
          },
        ],
        "replace"
      );
      setSearchParams({ channel_id: val });
    }
  };

  const clearChannelFilter = () => {
    handleChannelFilterChange("all");
  };

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

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-2xl font-bold tracking-tight">Livestreams</h2>
            <p className="text-sm text-muted-foreground">
              Monitor detected trading sessions, pipeline statuses, and AI trade extractions.
            </p>
          </div>

          {/* Channel Filter Dropdown */}
          <div className="flex items-center gap-2">
            <Filter className="h-4 w-4 text-muted-foreground shrink-0" />
            <Select
              value={channelFilterParam}
              onValueChange={handleChannelFilterChange}
            >
              <SelectTrigger className="w-[220px] h-9 text-xs">
                <SelectValue placeholder="Filter by Channel" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Tracked Channels</SelectItem>
                {channelOptions.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value as string}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {channelFilterParam !== "all" && (
              <Button
                variant="ghost"
                size="sm"
                className="h-9 px-2 text-xs text-muted-foreground hover:text-foreground"
                onClick={clearChannelFilter}
                title="Clear filter"
              >
                <X className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>
      </div>

      <DataTable table={table} />
    </ListView>
  );
};
