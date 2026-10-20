import React, { useMemo } from "react";
import { useTable } from "@refinedev/react-table";
import { createColumnHelper } from "@tanstack/react-table";
import { useNavigate } from "react-router";
import { TrendingUp, TrendingDown, Play } from "lucide-react";

import { DataTable } from "@/components/refine-ui/data-table/data-table";
import { ListView, ListViewHeader } from "@/components/refine-ui/views/list-view";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ComplexFilterBar, type FilterFieldConfig } from "@/components/complex-filter";
import type { Trade } from "@/types";

export const TradeList = () => {
  const navigate = useNavigate();

  const columns = useMemo(() => {
    const columnHelper = createColumnHelper<Trade>();

    return [
      columnHelper.accessor("symbol", {
        id: "symbol",
        header: "Symbol / Asset",
        cell: ({ getValue }) => (
          <span className="font-bold text-sm text-foreground">
            {getValue()}
          </span>
        ),
        enableSorting: true,
        size: 160,
      }),
      columnHelper.accessor("side", {
        id: "side",
        header: "Side",
        cell: ({ getValue }) => {
          const isLong = getValue() === "LONG";
          return (
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
              {getValue()}
            </Badge>
          );
        },
        enableSorting: true,
        size: 110,
      }),
      columnHelper.accessor("result", {
        id: "result",
        header: "Result",
        cell: ({ getValue }) => {
          const res = getValue();
          const isTp = res === "TP";
          const isSl = res === "SL";

          return (
            <Badge
              variant={isTp ? "default" : isSl ? "destructive" : "outline"}
              className={`text-xs uppercase font-mono ${
                isTp
                  ? "bg-emerald-600 text-white"
                  : isSl
                  ? "bg-rose-600 text-white"
                  : "text-amber-600 border-amber-500/30 bg-amber-500/10"
              }`}
            >
              {res}
            </Badge>
          );
        },
        enableSorting: true,
        size: 110,
      }),
      columnHelper.accessor("entry_price", {
        id: "entry_price",
        header: "Entry Price",
        cell: ({ getValue }) => (
          <span className="text-xs text-muted-foreground truncate block max-w-[140px]">
            {getValue() || "—"}
          </span>
        ),
        size: 150,
      }),
      columnHelper.accessor("exit_price", {
        id: "exit_price",
        header: "Exit Price",
        cell: ({ getValue }) => (
          <span className="text-xs text-muted-foreground truncate block max-w-[140px]">
            {getValue() || "—"}
          </span>
        ),
        size: 150,
      }),
      columnHelper.accessor("important_timestamps", {
        id: "important_timestamps",
        header: "Key Timestamps",
        cell: ({ getValue }) => {
          const timestamps = getValue();
          if (!timestamps || timestamps.length === 0) {
            return <span className="text-xs text-muted-foreground">—</span>;
          }
          return (
            <div className="flex items-center gap-1 flex-wrap">
              {timestamps.slice(0, 3).map((ts) => (
                <Badge
                  key={ts}
                  variant="secondary"
                  className="text-[11px] font-mono px-1.5 py-0"
                >
                  {ts}
                </Badge>
              ))}
              {timestamps.length > 3 && (
                <span className="text-[10px] text-muted-foreground">
                  +{timestamps.length - 3} more
                </span>
              )}
            </div>
          );
        },
        size: 220,
      }),
      columnHelper.accessor("notes", {
        id: "notes",
        header: "Rationale / Notes",
        cell: ({ getValue }) => (
          <span className="text-xs text-muted-foreground truncate block max-w-[280px]" title={getValue() || ""}>
            {getValue() || "—"}
          </span>
        ),
        size: 280,
      }),
      columnHelper.display({
        id: "actions",
        header: "Stream Link",
        cell: ({ row }) => (
          <Button
            size="sm"
            variant="outline"
            className="h-8 gap-1.5 text-xs font-medium hover:bg-primary/10 hover:text-primary"
            onClick={() => navigate(`/streams/show/${row.original.stream_id}`)}
          >
            <Play className="h-3 w-3 text-primary" />
            <span>Open Stream</span>
          </Button>
        ),
        enableSorting: false,
        size: 140,
      }),
    ];
  }, [navigate]);

  const filterFields: FilterFieldConfig[] = useMemo(() => [
    {
      id: "symbol",
      label: "Symbol / Asset",
      type: "text",
      placeholder: "e.g. NQ, ES, BTC...",
      quickFilter: true,
    },
    {
      id: "side",
      label: "Side",
      type: "select",
      options: [
        { label: "LONG", value: "LONG" },
        { label: "SHORT", value: "SHORT" },
      ],
      quickFilter: true,
    },
    {
      id: "result",
      label: "Result",
      type: "select",
      options: [
        { label: "TP (Take Profit)", value: "TP" },
        { label: "SL (Stop Loss)", value: "SL" },
        { label: "UNKNOWN", value: "UNKNOWN" },
      ],
      quickFilter: true,
    },
    {
      id: "notes",
      label: "Notes / Rationale",
      type: "text",
      placeholder: "Search rationale...",
      quickFilter: true,
    },
    {
      id: "entry_price",
      label: "Entry Price",
      type: "text",
    },
    {
      id: "exit_price",
      label: "Exit Price",
      type: "text",
    },
    {
      id: "created_at",
      label: "Extracted Date",
      type: "date",
    },
  ], []);

  const table = useTable<Trade>({
    columns,
    refineCoreProps: {
      resource: "trades",
      syncWithLocation: true,
      sorters: {
        initial: [
          {
            field: "created_at",
            order: "desc",
          },
        ],
      },
      pagination: {
        pageSize: 15,
      },
    },
  });

  return (
    <ListView>
      <div className="flex flex-col gap-4">
        <ListViewHeader
          resource="trades"
          title="Extracted Trades"
          canCreate={false}
        />

        <ComplexFilterBar
          fields={filterFields}
          filters={table.refineCore.filters}
          onFiltersChange={(newFilters) => {
            table.refineCore.setFilters(newFilters, "replace");
          }}
        />
      </div>

      <DataTable table={table} />
    </ListView>
  );
};
