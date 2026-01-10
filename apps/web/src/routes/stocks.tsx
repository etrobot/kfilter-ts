import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { ArrowUpDown, TrendingUp, TrendingDown } from "lucide-react";
import { useState, useMemo } from "react";

import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { trpc } from "@/utils/trpc";

export const Route = createFileRoute("/stocks")({
  component: StocksPage,
});

type SortField = "name" | "symbol" | "block" | "change1d" | "change5d" | "change30d" | "change250d";
type SortOrder = "asc" | "desc";

function StocksPage() {
  const [sortField, setSortField] = useState<SortField>("change1d");
  const [sortOrder, setSortOrder] = useState<SortOrder>("desc");

  const { data, isLoading, error } = useQuery({
    queryKey: ["allStocks"],
    queryFn: () => trpc.stock.getAllStocks.query(),
  });

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortOrder(sortOrder === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortOrder("desc");
    }
  };

  const sortedStocks = useMemo(() => {
    if (!data) return [];

    return [...data].sort((a, b) => {
      let aVal: any = a[sortField];
      let bVal: any = b[sortField];

      if (aVal === null || aVal === undefined) aVal = sortOrder === "asc" ? Infinity : -Infinity;
      if (bVal === null || bVal === undefined) bVal = sortOrder === "asc" ? Infinity : -Infinity;

      if (sortOrder === "asc") {
        return aVal > bVal ? 1 : -1;
      }
      return aVal < bVal ? 1 : -1;
    });
  }, [data, sortField, sortOrder]);

  const renderChangeCell = (value: number | null) => {
    if (value === null) return <span className="text-muted-foreground">-</span>;
    
    const isPositive = value > 0;
    const isNegative = value < 0;
    
    return (
      <div className="flex items-center justify-end gap-1.5">
        {isPositive && <TrendingUp className="h-3.5 w-3.5 text-red-700" />}
        {isNegative && <TrendingDown className="h-3.5 w-3.5 text-teal-500" />}
        <span
          className={cn(
            "font-mono font-semibold",
            isPositive && "text-red-700",
            isNegative && "text-teal-500",
            !isPositive && !isNegative && "text-muted-foreground"
          )}
        >
          {value > 0 ? "+" : ""}{value.toFixed(2)}%
        </span>
      </div>
    );
  };

  return (
    <div className="flex h-[calc(100vh-theme(spacing.8))] overflow-hidden rounded-3xl border bg-gradient-to-br from-background to-muted/30 shadow-2xl m-4">
      <main className="flex-1 flex flex-col overflow-hidden relative">
        <div className="absolute top-0 right-0 w-96 h-96 bg-blue-500/5 rounded-full blur-3xl pointer-events-none -translate-y-1/2 translate-x-1/2" />

        <header className="flex items-center justify-between px-8 py-6 z-10">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">股票列表</h1>
            <div className="text-sm text-muted-foreground mt-2 flex items-center gap-4">
              <span className="flex items-center gap-1.5">
                <div className="w-1.5 h-1.5 rounded-full bg-blue-500" />
                共 {sortedStocks.length} 只股票
              </span>
            </div>
          </div>
        </header>

        <div className="flex-1 overflow-hidden p-0 z-10">
          <ScrollArea className="h-full">
            <div className="px-8 pb-8">
              {error && (
                <div className="p-4 rounded-xl bg-red-50 border border-red-100 text-red-700 mb-4 text-sm font-medium">
                  加载失败: {error.message}
                </div>
              )}

              <Card className="border-0 shadow-xl shadow-black/5 bg-card/50 backdrop-blur-sm rounded-2xl overflow-hidden ring-1 ring-border/50">
                <Table>
                  <TableHeader className="bg-muted/30">
                    <TableRow className="hover:bg-transparent border-b border-border/60">
                      <TableHead className="w-[180px] cursor-pointer h-12 text-xs font-semibold uppercase tracking-wider text-muted-foreground pl-6" onClick={() => handleSort("name")}>
                        <div className="flex items-center gap-1 hover:text-foreground transition-colors group">
                          股票名称 <ArrowUpDown className="h-3 w-3 opacity-0 group-hover:opacity-100 transition-opacity" />
                        </div>
                      </TableHead>
                      <TableHead className="cursor-pointer h-12 text-xs font-semibold uppercase tracking-wider text-muted-foreground" onClick={() => handleSort("symbol")}>
                        <div className="flex items-center gap-1 hover:text-foreground transition-colors group">
                          代码 <ArrowUpDown className="h-3 w-3 opacity-0 group-hover:opacity-100 transition-opacity" />
                        </div>
                      </TableHead>
                      <TableHead className="cursor-pointer h-12 text-xs font-semibold uppercase tracking-wider text-muted-foreground" onClick={() => handleSort("block")}>
                        <div className="flex items-center gap-1 hover:text-foreground transition-colors group">
                          板块 <ArrowUpDown className="h-3 w-3 opacity-0 group-hover:opacity-100 transition-opacity" />
                        </div>
                      </TableHead>
                      <TableHead className="text-right cursor-pointer h-12 text-xs font-semibold uppercase tracking-wider text-muted-foreground" onClick={() => handleSort("change1d")}>
                        <div className="flex items-center justify-end gap-1 hover:text-foreground transition-colors group">
                          近1天 <ArrowUpDown className="h-3 w-3 opacity-0 group-hover:opacity-100 transition-opacity" />
                        </div>
                      </TableHead>
                      <TableHead className="text-right cursor-pointer h-12 text-xs font-semibold uppercase tracking-wider text-muted-foreground" onClick={() => handleSort("change5d")}>
                        <div className="flex items-center justify-end gap-1 hover:text-foreground transition-colors group">
                          近5天 <ArrowUpDown className="h-3 w-3 opacity-0 group-hover:opacity-100 transition-opacity" />
                        </div>
                      </TableHead>
                      <TableHead className="text-right cursor-pointer h-12 text-xs font-semibold uppercase tracking-wider text-muted-foreground" onClick={() => handleSort("change30d")}>
                        <div className="flex items-center justify-end gap-1 hover:text-foreground transition-colors group">
                          近30天 <ArrowUpDown className="h-3 w-3 opacity-0 group-hover:opacity-100 transition-opacity" />
                        </div>
                      </TableHead>
                      <TableHead className="text-right cursor-pointer h-12 text-xs font-semibold uppercase tracking-wider text-muted-foreground pr-6" onClick={() => handleSort("change250d")}>
                        <div className="flex items-center justify-end gap-1 hover:text-foreground transition-colors group">
                          近250天 <ArrowUpDown className="h-3 w-3 opacity-0 group-hover:opacity-100 transition-opacity" />
                        </div>
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {isLoading ? (
                      Array.from({ length: 10 }).map((_, i) => (
                        <TableRow key={i}>
                          <TableCell className="pl-6"><Skeleton className="h-5 w-24" /></TableCell>
                          <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                          <TableCell><Skeleton className="h-4 w-16" /></TableCell>
                          <TableCell><Skeleton className="h-4 w-16 ml-auto" /></TableCell>
                          <TableCell><Skeleton className="h-4 w-16 ml-auto" /></TableCell>
                          <TableCell><Skeleton className="h-4 w-16 ml-auto" /></TableCell>
                          <TableCell className="pr-6"><Skeleton className="h-4 w-16 ml-auto" /></TableCell>
                        </TableRow>
                      ))
                    ) : (
                      sortedStocks.map((stock) => (
                        <TableRow key={stock.symbol} className="hover:bg-muted/40 transition-colors border-border/50">
                          <TableCell className="pl-6 py-4">
                            <div className="font-semibold text-foreground">{stock.name}</div>
                          </TableCell>
                          <TableCell>
                            <div className="text-xs text-muted-foreground font-mono tracking-wide bg-muted/60 px-1.5 py-0.5 rounded-md w-fit">
                              {stock.symbol}
                            </div>
                          </TableCell>
                          <TableCell>
                            {stock.block ? (
                              <Badge variant="outline" className="text-xs">
                                {stock.block}
                              </Badge>
                            ) : (
                              <span className="text-muted-foreground text-xs">-</span>
                            )}
                          </TableCell>
                          <TableCell className="text-right">{renderChangeCell(stock.change1d)}</TableCell>
                          <TableCell className="text-right">{renderChangeCell(stock.change5d)}</TableCell>
                          <TableCell className="text-right">{renderChangeCell(stock.change30d)}</TableCell>
                          <TableCell className="text-right pr-6">{renderChangeCell(stock.change250d)}</TableCell>
                        </TableRow>
                      ))
                    )}
                    {sortedStocks.length === 0 && !isLoading && (
                      <TableRow>
                        <TableCell colSpan={7} className="h-32 text-center text-muted-foreground">
                          <div className="flex flex-col items-center gap-2">
                            <div className="p-3 bg-muted rounded-full">
                              <TrendingUp className="h-6 w-6 opacity-40" />
                            </div>
                            <span>暂无数据</span>
                          </div>
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </Card>
            </div>
          </ScrollArea>
        </div>
      </main>
    </div>
  );
}
