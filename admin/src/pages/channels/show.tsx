import React from "react";
import { useShow, useList } from "@refinedev/core";
import { useNavigate } from "react-router";
import { ExternalLink, Radio, Play, TrendingUp } from "lucide-react";

import { ShowView, ShowViewHeader } from "@/components/refine-ui/views/show-view";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { Channel, Stream } from "@/types";

export const ChannelShow = () => {
  const navigate = useNavigate();

  const { query, result: channelResult } = useShow<Channel>({
    resource: "channels",
  });

  const channel = (channelResult as Channel) || query.data?.data;
  const isLoading = query.isLoading;

  const { result: streamsResult, query: streamsQuery } = useList<Stream>({
    resource: "streams",
    meta: {
      select: "*, trades(count)",
    },
    filters: [
      {
        field: "channel_id",
        operator: "eq",
        value: channel?.id,
      },
    ],
    sorters: [
      {
        field: "published_at",
        order: "desc",
      },
    ],
    pagination: {
      pageSize: 10,
    },
    queryOptions: {
      enabled: !!channel?.id,
    },
  });

  const streams: Stream[] = streamsResult?.data || [];
  const totalStreams = streamsResult?.total ?? 0;

  if (isLoading || !channel) {
    return (
      <ShowView>
        <ShowViewHeader resource="channels" />
        <Card className="p-8 text-center text-muted-foreground">
          Loading channel details...
        </Card>
      </ShowView>
    );
  }

  return (
    <ShowView>
      <ShowViewHeader resource="channels" title={channel.title || "Channel Details"} />

      {/* Main Channel Profile Card */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2">
          <CardHeader className="flex flex-row items-start gap-4 space-y-0">
            <Avatar className="h-16 w-16 border-2 border-border shadow-xs">
              {channel.thumbnail_url && (
                <AvatarImage src={channel.thumbnail_url} alt={channel.title || ""} />
              )}
              <AvatarFallback className="text-xl font-bold bg-primary/10 text-primary">
                {channel.title ? channel.title.substring(0, 2).toUpperCase() : "YT"}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <CardTitle className="text-xl">{channel.title || "Untitled Channel"}</CardTitle>
                <Badge
                  variant={channel.is_active ? "default" : "secondary"}
                  className={
                    channel.is_active
                      ? "bg-emerald-500/15 text-emerald-600 border-emerald-500/20"
                      : "bg-muted text-muted-foreground"
                  }
                >
                  <span
                    className={`w-1.5 h-1.5 rounded-full mr-1.5 ${
                      channel.is_active ? "bg-emerald-500" : "bg-muted-foreground"
                    }`}
                  />
                  {channel.is_active ? "Active" : "Inactive"}
                </Badge>
              </div>
              <a
                href={channel.channel_url}
                target="_blank"
                rel="noreferrer"
                className="text-sm text-primary hover:underline inline-flex items-center gap-1.5 mt-1"
              >
                {channel.channel_url}
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
              {channel.description && (
                <CardDescription className="mt-3 text-sm text-foreground/80">
                  {channel.description}
                </CardDescription>
              )}
            </div>
          </CardHeader>
          <CardContent className="border-t pt-4 grid grid-cols-2 sm:grid-cols-3 gap-4 text-sm">
            <div>
              <span className="text-xs text-muted-foreground block">Channel ID</span>
              <span className="font-mono text-xs">{channel.channel_id || "—"}</span>
            </div>
            <div>
              <span className="text-xs text-muted-foreground block">Last Polled</span>
              <span className="text-xs">
                {channel.last_checked_at
                  ? new Date(channel.last_checked_at).toLocaleString()
                  : "Never"}
              </span>
            </div>
            <div>
              <span className="text-xs text-muted-foreground block">Tracked Since</span>
              <span className="text-xs">
                {new Date(channel.created_at).toLocaleDateString()}
              </span>
            </div>
          </CardContent>
        </Card>

        {/* Channel Quick Summary Card */}
        <Card className="flex flex-col justify-between">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Radio className="h-4 w-4 text-primary" />
              Livestreams Stats
            </CardTitle>
            <CardDescription>Pipeline coverage for this channel</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50 border">
              <span className="text-sm font-medium">Discovered Streams</span>
              <span className="text-2xl font-bold text-primary">{totalStreams}</span>
            </div>
            <Button
              className="w-full gap-2"
              onClick={() => navigate(`/streams?channel_id=${channel.id}`)}
            >
              <Radio className="h-4 w-4" />
              View Filtered Streams ({totalStreams})
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Recent Streams Sub-Table */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-lg">Recent Streams</CardTitle>
            <CardDescription>Livestreams detected and analyzed from this channel</CardDescription>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => navigate(`/streams?channel_id=${channel.id}`)}
          >
            View All ({totalStreams})
          </Button>
        </CardHeader>
        <CardContent>
          {streamsQuery.isLoading ? (
            <div className="py-8 text-center text-sm text-muted-foreground">
              Loading streams...
            </div>
          ) : streams.length === 0 ? (
            <div className="py-8 text-center text-sm text-muted-foreground">
              No streams recorded for this channel yet.
            </div>
          ) : (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Stream Title</TableHead>
                    <TableHead>Stream Status</TableHead>
                    <TableHead>Pipeline Status</TableHead>
                    <TableHead>Extracted Trades</TableHead>
                    <TableHead>Published</TableHead>
                    <TableHead className="text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {streams.map((stream: Stream) => {
                    const tradeCount =
                      Array.isArray(stream.trades) && stream.trades[0]
                        ? stream.trades[0].count
                        : 0;

                    return (
                      <TableRow key={stream.id}>
                        <TableCell className="font-medium max-w-[300px] truncate">
                          {stream.title}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-xs">
                            {stream.stream_status}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant={
                              stream.processing_status === "completed"
                                ? "default"
                                : stream.processing_status === "failed"
                                ? "destructive"
                                : "secondary"
                            }
                            className="text-xs"
                          >
                            {stream.processing_status}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {tradeCount > 0 ? (
                            <Badge
                              variant="secondary"
                              className="gap-1 font-mono font-semibold bg-emerald-500/10 text-emerald-600 border-emerald-500/20 text-xs"
                            >
                              <TrendingUp className="h-3 w-3" />
                              <span>{tradeCount}</span>
                            </Badge>
                          ) : (
                            <span className="text-xs text-muted-foreground font-mono pl-1">
                              0
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {stream.published_at
                            ? new Date(stream.published_at).toLocaleDateString()
                            : "—"}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 gap-1 text-xs"
                            onClick={() => navigate(`/streams/show/${stream.id}`)}
                          >
                            <Play className="h-3 w-3 text-primary" />
                            View Stream
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </ShowView>
  );
};
