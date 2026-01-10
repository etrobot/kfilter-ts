import { useQuery, useMutation } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import {
  ArrowUpDown,
  Calendar as CalendarIcon,
  TrendingUp,
  LayoutGrid,
  RefreshCw,
} from "lucide-react";
import { useState, useMemo, useEffect } from "react";
import { format } from "date-fns";
import { zhCN } from "date-fns/locale";

import { Button, buttonVariants } from "@/components/ui/button";
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
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { trpc } from "@/utils/trpc";

export const Route = createFileRoute("/sentiment")({
  component: SentimentPage,
});

type SortField =
  | "name"
  | "latest"
  | "changeRate"
  | "continueNum"
  | "firstLimitUpTime"
  | "lastLimitUpTime";
type SortOrder = "asc" | "desc";

// 判断是否为节假日 (For Calendar disabled prop)
function isDateDisabled(date: Date): boolean {
  const day = date.getDay();
  const month = date.getMonth(); // 0-indexed
  const dayOfMonth = date.getDate();

  // Weekend
  if (day === 0 || day === 6) return true;

  // Holidays: Jan 1, May 1, Oct 1
  if (month === 0 && dayOfMonth === 1) return true;
  if (month === 4 && dayOfMonth === 1) return true;
  if (month === 9 && dayOfMonth === 1) return true;

  return false;
}

function SentimentPage() {
  const [date, setDate] = useState<Date>(new Date());
  const [selectedBlock, setSelectedBlock] = useState<string | null>(null);
  const [sortField, setSortField] = useState<SortField>("continueNum");
  const [sortOrder, setSortOrder] = useState<SortOrder>("desc");

  const dateStr = useMemo(() => format(date, "yyyy-MM-dd"), [date]);

  const { data, isLoading, error } = useQuery({
    queryKey: ["blockData", dateStr],
    queryFn: () => trpc.stock.getBlockData.query({ date: dateStr }),
  });

  // 批量更新状态查询
  const { data: updateStatus } = useQuery({
    queryKey: ["batchUpdateStatus"],
    queryFn: () => trpc.stock.getBatchUpdateStatus.query(),
    refetchInterval: (query) => 
      query.state.data?.isRunning ? 2000 : false, // 更新中时每2秒刷新
  });

  // 触发K线数据检查更新
  const checkUpdateMutation = useMutation({
    mutationFn: (dataDate: string) => trpc.stock.checkAndUpdateKLine.mutate({ dataDate }),
  });

  // 数据加载完成后，用返回数据的日期检查是否需要更新K线
  useEffect(() => {
    if (data && data.blocks.length > 0) {
      // 使用 10jqka 返回的数据日期（取第一个 block 的 date）
      const dataDate = data.blocks[0]?.date;
      if (dataDate) {
        checkUpdateMutation.mutate(dataDate);
      }
    }
  }, [data]);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortOrder(sortOrder === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortOrder("desc");
    }
  };

  const filteredStocks = useMemo(() => {
    if (!data?.stocks) return [];
    let stocks = selectedBlock
      ? data.stocks.filter((s) => s.blockCode === selectedBlock)
      : data.stocks;

    // 去重
    const uniqueStocks = Array.from(
      new Map(stocks.map((s) => [s.code, s])).values()
    );

    return uniqueStocks.sort((a, b) => {
      let aVal: any = a[sortField];
      let bVal: any = b[sortField];

      if (sortField === "firstLimitUpTime" || sortField === "lastLimitUpTime") {
        aVal = aVal || "99:99:99";
        bVal = bVal || "99:99:99";
      }

      if (aVal === null || aVal === undefined) aVal = sortOrder === "asc" ? Infinity : -Infinity;
      if (bVal === null || bVal === undefined) bVal = sortOrder === "asc" ? Infinity : -Infinity;

      if (sortOrder === "asc") {
        return aVal > bVal ? 1 : -1;
      }
      return aVal < bVal ? 1 : -1;
    });
  }, [data?.stocks, selectedBlock, sortField, sortOrder]);

  const selectedBlockData = useMemo(() => {
    if (!selectedBlock || !data?.blocks) return null;
    return data.blocks.find((b) => b.code === selectedBlock);
  }, [selectedBlock, data?.blocks]);

  return (
    <div className="flex h-[calc(100vh-theme(spacing.8))] overflow-hidden rounded-3xl border bg-gradient-to-br from-background to-muted/30 shadow-2xl m-4">
      {/* Left Sidebar */}
      <aside className="w-80 flex flex-col border-r bg-background/50 backdrop-blur-sm">
        <div className="p-6 space-y-6">
          <Popover>
            <PopoverTrigger
              className={cn(
                buttonVariants({ variant: "outline" }),
                "w-full justify-start text-left font-normal h-12 rounded-xl border-dashed hover:border-solid hover:border-orange-200 transition-all"
              )}
            >
              <CalendarIcon className="mr-3 h-4 w-4 text-muted-foreground" />
              <span className="text-base">
                {date ? format(date, "PPP", { locale: zhCN }) : <span>选择日期</span>}
              </span>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0 rounded-xl shadow-xl" align="start">
              <Calendar
                mode="single"
                selected={date}
                onSelect={(d) => d && setDate(d)}
                disabled={isDateDisabled}
                initialFocus
                locale={zhCN}
                className="rounded-xl border"
              />
            </PopoverContent>
          </Popover>
        </div>

        <ScrollArea className="flex-1 px-4 pb-4">
          <div className="space-y-2">
            <Button
              variant="ghost"
              className={cn(
                "w-full justify-start h-12 rounded-xl transition-all duration-200",
                selectedBlock === null
                  ? "bg-orange-50 text-orange-700 dark:bg-orange-950/30 dark:text-orange-400 font-semibold shadow-sm ring-1 ring-orange-100 dark:ring-orange-900"
                  : "hover:bg-muted/60 text-muted-foreground hover:text-foreground"
              )}
              onClick={() => setSelectedBlock(null)}
            >
              <LayoutGrid className="mr-3 h-4 w-4 opacity-70" />
              <span>全部板块</span>
            </Button>

            <div className="h-px bg-border/50 my-3 mx-2" />

            {isLoading ? (
              Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="px-2 py-3 space-y-2">
                  <Skeleton className="h-5 w-2/3 rounded-lg" />
                  <Skeleton className="h-3 w-full rounded-lg opacity-60" />
                </div>
              ))
            ) : (
              data?.blocks.map((block) => (
                <Button
                  key={block.code}
                  variant="ghost"
                  className={cn(
                    "w-full justify-start h-auto py-3 px-4 rounded-xl transition-all duration-200 group relative overflow-hidden",
                    selectedBlock === block.code
                      ? "bg-orange-50 text-orange-700 dark:bg-orange-950/30 dark:text-orange-400 shadow-sm ring-1 ring-orange-100 dark:ring-orange-900"
                      : "hover:bg-muted/50"
                  )}
                  onClick={() => setSelectedBlock(block.code)}
                >
                  <div className="flex flex-col items-start w-full gap-1.5 z-10">
                    <div className="flex items-center justify-between w-full">
                      <span className={cn(
                        "font-medium truncate transition-colors",
                        selectedBlock === block.code ? "text-orange-900 dark:text-orange-300" : "text-foreground"
                      )}>{block.name}</span>
                      <Badge variant="outline" className={cn(
                        "rounded-md border-0 px-1.5 py-0 h-5 text-[10px] font-medium transition-colors",
                        selectedBlock === block.code
                          ? "bg-orange-100 text-orange-700 dark:bg-orange-900/50 dark:text-orange-300"
                          : "bg-muted text-muted-foreground group-hover:bg-background"
                      )}>
                        {block.limitUpNum}
                      </Badge>
                    </div>
                    <div className="flex items-center justify-between w-full text-xs opacity-70">
                      <span>连板: {block.continuousPlateNum}</span>
                      <span>高度: {block.high}</span>
                    </div>
                  </div>
                </Button>
              ))
            )}
          </div>
        </ScrollArea>
      </aside>

      {/* Right Content */}
      <main className="flex-1 flex flex-col overflow-hidden relative">
        {/* Decorative background element */}
        <div className="absolute top-0 right-0 w-96 h-96 bg-orange-500/5 rounded-full blur-3xl pointer-events-none -translate-y-1/2 translate-x-1/2" />

        <header className="flex items-center justify-between px-8 py-6 z-10">
          <div>
            <div className="text-sm text-muted-foreground mt-2 flex items-center gap-4">
              <span className="flex items-center gap-1.5">
                <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                共 {filteredStocks.length} 只股票
              </span>
              {selectedBlockData && (
                <>
                  <span className="w-px h-3 bg-border" />
                  <span>连板高度: <span className="font-medium text-foreground">{selectedBlockData.high}</span></span>
                  <span className="w-px h-3 bg-border" />
                  <span>上榜天数: <span className="font-medium text-foreground">{selectedBlockData.days}</span></span>
                </>
              )}
              {updateStatus?.isRunning && (
                <>
                  <span className="w-px h-3 bg-border" />
                  <span className="flex items-center gap-1.5 text-orange-600">
                    <RefreshCw className="h-3 w-3 animate-spin" />
                    K线更新中: {updateStatus.completed}/{updateStatus.total}
                  </span>
                </>
              )}
            </div>
          </div>
        </header>

        <div className="flex-1 overflow-hidden p-0 z-10">
          <ScrollArea className="h-full">
            <div className="px-8 pb-8">
              {error && (
                <div className="p-4 rounded-xl bg-orange-50 border border-orange-100 text-orange-600 mb-4 text-sm font-medium">
                  加载失败: {error.message}
                </div>
              )}

              <Card className="border-0 shadow-xl shadow-black/5 bg-card/50 backdrop-blur-sm rounded-2xl overflow-hidden ring-1 ring-border/50">
                <Table>
                  <TableHeader className="bg-muted/30">
                    <TableRow className="hover:bg-transparent border-b border-border/60">
                      <TableHead className="w-[200px] cursor-pointer h-12 text-xs font-semibold uppercase tracking-wider text-muted-foreground pl-6" onClick={() => handleSort("name")}>
                        <div className="flex items-center gap-1 hover:text-foreground transition-colors group">
                          股票名称 <ArrowUpDown className="h-3 w-3 opacity-0 group-hover:opacity-100 transition-opacity" />
                        </div>
                      </TableHead>
                      <TableHead className="text-right cursor-pointer h-12 text-xs font-semibold uppercase tracking-wider text-muted-foreground" onClick={() => handleSort("latest")}>
                        <div className="flex items-center justify-end gap-1 hover:text-foreground transition-colors group">
                          最新价 <ArrowUpDown className="h-3 w-3 opacity-0 group-hover:opacity-100 transition-opacity" />
                        </div>
                      </TableHead>
                      <TableHead className="text-right cursor-pointer h-12 text-xs font-semibold uppercase tracking-wider text-muted-foreground" onClick={() => handleSort("changeRate")}>
                        <div className="flex items-center justify-end gap-1 hover:text-foreground transition-colors group">
                          涨幅 <ArrowUpDown className="h-3 w-3 opacity-0 group-hover:opacity-100 transition-opacity" />
                        </div>
                      </TableHead>
                      <TableHead className="text-right cursor-pointer h-12 text-xs font-semibold uppercase tracking-wider text-muted-foreground" onClick={() => handleSort("continueNum")}>
                        <div className="flex items-center justify-end gap-1 hover:text-foreground transition-colors group">
                          板数 <ArrowUpDown className="h-3 w-3 opacity-0 group-hover:opacity-100 transition-opacity" />
                        </div>
                      </TableHead>
                      <TableHead className="text-right cursor-pointer h-12 text-xs font-semibold uppercase tracking-wider text-muted-foreground" onClick={() => handleSort("firstLimitUpTime")}>
                        <div className="flex items-center justify-end gap-1 hover:text-foreground transition-colors group">
                          首次涨停 <ArrowUpDown className="h-3 w-3 opacity-0 group-hover:opacity-100 transition-opacity" />
                        </div>
                      </TableHead>
                      <TableHead className="text-right cursor-pointer h-12 text-xs font-semibold uppercase tracking-wider text-muted-foreground pr-6" onClick={() => handleSort("lastLimitUpTime")}>
                        <div className="flex items-center justify-end gap-1 hover:text-foreground transition-colors group">
                          最后涨停 <ArrowUpDown className="h-3 w-3 opacity-0 group-hover:opacity-100 transition-opacity" />
                        </div>
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredStocks.map((stock) => (
                      <TableRow key={`${stock.blockCode}-${stock.code}`} className="hover:bg-muted/40 transition-colors border-border/50">
                        <TableCell className="pl-6 py-4">
                          <div className="flex flex-col gap-0.5">
                            <div className="font-semibold text-foreground">{stock.name}</div>
                            <div className="text-[11px] text-muted-foreground font-mono tracking-wide bg-muted/60 px-1.5 py-0.5 rounded-md w-fit">{stock.code}</div>
                          </div>
                        </TableCell>
                        <TableCell className="text-right font-mono font-medium">{stock.latest?.toFixed(2)}</TableCell>
                        <TableCell className="text-right font-mono font-bold text-red-700">{stock.changeRate?.toFixed(2)}%</TableCell>
                        <TableCell className="text-right">
                          <Badge
                            variant="secondary"
                            className={cn(
                              "font-medium border shadow-none px-2.5 py-0.5 transition-all text-sm",
                              (stock.high || (stock.continueNum && stock.continueNum > 1))
                                ? "bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-900/30 dark:text-orange-400 dark:border-orange-900"
                                : "bg-muted text-muted-foreground border-transparent"
                            )}
                          >
                            {stock.high || `${stock.continueNum}板`}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right font-mono text-xs text-muted-foreground">{stock.firstLimitUpTime}</TableCell>
                        <TableCell className="text-right font-mono text-xs text-muted-foreground pr-6">{stock.lastLimitUpTime}</TableCell>
                      </TableRow>
                    ))}
                    {filteredStocks.length === 0 && !isLoading && (
                      <TableRow>
                        <TableCell colSpan={6} className="h-32 text-center text-muted-foreground">
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
