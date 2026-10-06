import React from "react";
import { useTable } from "@refinedev/react-table";
import { createColumnHelper } from "@tanstack/react-table";
import { useNavigate } from "react-router";
import { ExternalLink, Radio, Eye, Edit, Trash2 } from "lucide-react";

import { DataTable } from "@/components/refine-ui/data-table/data-table";
import { ListView, ListViewHeader } from "@/components/refine-ui/views/list-view";
import { EditButton } from "@/components/refine-ui/buttons/edit";
import { ShowButton } from "@/components/refine-ui/buttons/show";
import { DeleteButton } from "@/components/refine-ui/buttons/delete";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import type { Channel } from "@/types";

export const ChannelList = () => {
  const navigate = useNavigate();

  const columns = React.useMemo(() => {
    const columnHelper = createColumnHelper<Channel>();

    return [
      columnHelper.display({
        id: "channel",
        header: "Channel",
        cell: ({ row }) => {
          const channel = row.original;
          return (
            <div className="flex items-center gap-3 py-1">
              <Avatar className="h-9 w-9 border border-border">
                {channel.thumbnail_url && (
                  <AvatarImage src={channel.thumbnail_url} alt={channel.title || ""} />
                )}
                <AvatarFallback className="bg-primary/10 text-primary font-semibold text-xs">
                  {channel.title ? channel.title.substring(0, 2).toUpperCase() : "YT"}
                </AvatarFallback>
              </Avatar>
              <div className="flex flex-col min-w-0">
                <span className="font-medium text-sm text-foreground truncate">
                  {channel.title || "Untitled Channel"}
                </span>
                <a
                  href={channel.channel_url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs text-muted-foreground hover:text-primary flex items-center gap-1 truncate"
                  onClick={(e) => e.stopPropagation()}
                >
                  <span className="truncate">{channel.channel_url}</span>
                  <ExternalLink className="h-3 w-3 shrink-0" />
                </a>
              </div>
            </div>
          );
        },
        size: 320,
      }),
      columnHelper.accessor("channel_id", {
        id: "channel_id",
        header: "YouTube Channel ID",
        cell: ({ getValue }) => (
          <span className="font-mono text-xs text-muted-foreground">
            {getValue() || "—"}
          </span>
        ),
        enableSorting: false,
        size: 200,
      }),
      columnHelper.accessor("is_active", {
        id: "is_active",
        header: "Status",
        cell: ({ getValue }) => {
          const isActive = getValue();
          return (
            <Badge
              variant={isActive ? "default" : "secondary"}
              className={
                isActive
                  ? "bg-emerald-500/15 text-emerald-600 hover:bg-emerald-500/25 border-emerald-500/20"
                  : "bg-muted text-muted-foreground"
              }
            >
              <span
                className={`w-1.5 h-1.5 rounded-full mr-1.5 ${
                  isActive ? "bg-emerald-500" : "bg-muted-foreground"
                }`}
              />
              {isActive ? "Active" : "Inactive"}
            </Badge>
          );
        },
        enableSorting: true,
        size: 110,
      }),
      columnHelper.accessor("last_checked_at", {
        id: "last_checked_at",
        header: "Last Checked",
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
        size: 170,
      }),
      columnHelper.display({
        id: "streams",
        header: "Streams",
        cell: ({ row }) => (
          <Button
            variant="outline"
            size="sm"
            className="h-8 gap-1.5 text-xs font-medium hover:bg-primary/10 hover:text-primary"
            onClick={() => navigate(`/streams?channel_id=${row.original.id}`)}
          >
            <Radio className="h-3.5 w-3.5 text-primary" />
            <span>View Streams</span>
          </Button>
        ),
        enableSorting: false,
        size: 140,
      }),
      columnHelper.display({
        id: "actions",
        header: "Actions",
        cell: ({ row }) => (
          <div className="flex items-center gap-1">
            <ShowButton recordItemId={row.original.id} size="sm" variant="ghost" className="h-8 w-8 p-0">
              <Eye className="h-3.5 w-3.5 text-muted-foreground" />
            </ShowButton>
            <EditButton recordItemId={row.original.id} size="sm" variant="ghost" className="h-8 w-8 p-0">
              <Edit className="h-3.5 w-3.5 text-muted-foreground" />
            </EditButton>
            <DeleteButton recordItemId={row.original.id} size="sm" variant="ghost" className="h-8 w-8 p-0">
              <Trash2 className="h-3.5 w-3.5 text-rose-500" />
            </DeleteButton>
          </div>
        ),
        enableSorting: false,
        size: 120,
      }),
    ];
  }, [navigate]);

  const table = useTable<Channel>({
    columns,
    refineCoreProps: {
      resource: "channels",
      syncWithLocation: true,
      sorters: {
        initial: [
          {
            field: "created_at",
            order: "desc",
          },
        ],
      },
    },
  });

  return (
    <ListView>
      <ListViewHeader resource="channels" title="Tracked Channels" canCreate={true} />
      <DataTable table={table} />
    </ListView>
  );
};
