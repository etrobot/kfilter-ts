import { db, blockData, stockData, stockInfo, type KLineData } from "@kfilter-ts/db";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { publicProcedure, router } from "../index";

// 批量更新状态
let batchUpdateStatus = {
  isRunning: false,
  total: 0,
  completed: 0,
  failed: 0,
  startTime: null as Date | null,
};

// 判断是否为节假日（周末、五一、十一、元旦）
function isHoliday(date: Date): boolean {
  const day = date.getDay();
  const month = date.getMonth() + 1;
  const dayOfMonth = date.getDate();

  // 周末
  if (day === 0 || day === 6) return true;

  // 元旦 1月1日
  if (month === 1 && dayOfMonth === 1) return true;

  // 五一 5月1日
  if (month === 5 && dayOfMonth === 1) return true;

  // 十一 10月1日
  if (month === 10 && dayOfMonth === 1) return true;

  return false;
}

// 获取上一个交易日
function getPrevTradingDay(dateStr: string): string {
  const date = new Date(dateStr);
  date.setDate(date.getDate() - 1);
  while (isHoliday(date)) {
    date.setDate(date.getDate() - 1);
  }
  const result = date.toISOString().split("T")[0];
  return result ?? dateStr;
}

// 获取下一个交易日
function getNextTradingDay(dateStr: string): string {
  const date = new Date(dateStr);
  date.setDate(date.getDate() + 1);
  while (isHoliday(date)) {
    date.setDate(date.getDate() + 1);
  }
  const result = date.toISOString().split("T")[0];
  return result ?? dateStr;
}

// 格式化时间戳为 HH:mm:ss
function formatTime(timestamp: string): string {
  if (!timestamp) return "";
  const ts = Number.parseInt(timestamp, 10);
  if (Number.isNaN(ts)) return timestamp;
  const date = new Date(ts * 1000);
  const timeStr = date.toTimeString().split(" ")[0];
  return timeStr ?? "";
}

interface ApiBlock {
  code: string;
  name: string;
  change: number;
  limit_up_num: number;
  continuous_plate_num: number;
  high: string;
  high_num: number;
  days: number;
  stock_list?: ApiStock[];
}

interface ApiStock {
  code: string;
  name: string;
  latest: number;
  change_rate: number;
  continue_num: number;
  high: string;
  high_days: number;
  first_limit_up_time: string;
  last_limit_up_time: string;
  reason_type: string;
  reason_info: string;
  is_new: number;
  is_st: number;
  market_type: string;
}

interface ApiResponse {
  status_code: number;
  data?: ApiBlock[];
}

// 从API获取数据
async function fetchFromApi(date: string): Promise<ApiResponse> {
  // 将日期格式从 YYYY-MM-DD 转换为 YYYYMMDD
  const apiDate = date.replace(/-/g, '');
  const url = `https://data.10jqka.com.cn/dataapi/limit_up/block_top?filter=HS,GEM2STAR&date=${apiDate}`;

  try {
    const response = await fetch(url, {
      headers: {
        Accept: "application/json, text/plain, */*",
        Referer:
          "https://data.10jqka.com.cn/datacenterph/limitup/limtupInfo.html?client_userid=nM9Y3&back_source=hyperlink&share_hxapp=isc&fontzoom=no",
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36",
        "sec-ch-ua": '"Google Chrome";v="143", "Chromium";v="143", "Not A(Brand";v="24"',
        "sec-ch-ua-mobile": "?0",
        "sec-ch-ua-platform": '"macOS"',
      },
    });

    const text = await response.text();
    console.log(`API请求: ${url}`);
    console.log(`API响应状态: ${response.status}`);
    console.log(`API响应内容: ${text.substring(0, 500)}`);
    
    // 检查是否是HTML错误页面
    if (text.includes("<h1>") || text.includes("<!DOCTYPE")) {
      console.error("API返回HTML错误页面:", text.substring(0, 200));
      return { status_code: -1 };
    }

    const result = JSON.parse(text) as ApiResponse;
    return result;
  } catch (error) {
    console.error("获取API数据失败:", error);
    return { status_code: -1 };
  }
}

// ============ 腾讯证券 K线数据 API ============

type PeriodType = "daily" | "weekly" | "monthly";

// 批量更新所有股票的K线数据（后台执行）
async function batchUpdateAllStocksKLine(queryDate: Date): Promise<void> {
  if (batchUpdateStatus.isRunning) {
    console.log("批量更新任务已在运行中，跳过...");
    return;
  }

  // 获取所有需要更新的股票（updatedAt < queryDate 或不存在）
  const allStockCodes = await db
    .selectDistinct({ code: stockData.code, name: stockData.name })
    .from(stockData);

  if (allStockCodes.length === 0) {
    console.log("没有股票需要更新");
    return;
  }

  // 转换股票代码格式：000001 -> sz000001
  const stocksToUpdate = allStockCodes.map((s) => ({
    symbol: s.code.startsWith("6") ? `sh${s.code}` : `sz${s.code}`,
    name: s.name,
  }));

  // 查询已有的 stockInfo，过滤出需要更新的
  const existingStocks = await db.select().from(stockInfo);
  const existingMap = new Map(existingStocks.map((s) => [s.symbol, s]));

  const needsUpdateList = stocksToUpdate.filter((s) => {
    const existing = existingMap.get(s.symbol);
    if (!existing || !existing.updatedAt) return true;
    return new Date(existing.updatedAt) < queryDate;
  });

  if (needsUpdateList.length === 0) {
    console.log("所有股票K线数据已是最新");
    return;
  }

  // 开始批量更新
  batchUpdateStatus = {
    isRunning: true,
    total: needsUpdateList.length,
    completed: 0,
    failed: 0,
    startTime: new Date(),
  };

  console.log(`开始批量更新 ${needsUpdateList.length} 只股票的K线数据...`);

  // 使用队列控制并发，避免请求过快
  const concurrency = 3;
  const queue = [...needsUpdateList];

  const worker = async () => {
    while (queue.length > 0) {
      const stock = queue.shift();
      if (!stock) break;

      try {
        console.log(`[${batchUpdateStatus.completed + 1}/${batchUpdateStatus.total}] 更新 ${stock.symbol} ${stock.name}...`);

        // const [daily, weekly, monthly] = await Promise.all([
        //   fetchKLineFromQQ(stock.symbol, "daily"),
        //   fetchKLineFromQQ(stock.symbol, "weekly"),
        //   fetchKLineFromQQ(stock.symbol, "monthly"),
        // ]);

        const [daily] = await Promise.all([
          fetchKLineFromQQ(stock.symbol, "daily")
        ]);

        const now = new Date();
        const existing = existingMap.get(stock.symbol);

        if (existing) {
          await db
            .update(stockInfo)
            .set({ name: stock.name, daily,updatedAt: now })
            .where(eq(stockInfo.symbol, stock.symbol));
        } else {
          await db.insert(stockInfo).values({
            symbol: stock.symbol,
            name: stock.name,
            daily,
            // weekly,
            // monthly,
            updatedAt: now,
            createdAt: now,
          });
        }

        batchUpdateStatus.completed++;
      } catch (error) {
        console.error(`更新 ${stock.symbol} 失败:`, error);
        batchUpdateStatus.failed++;
      }

      // 请求间隔，避免被限流
      await new Promise((r) => setTimeout(r, 500));
    }
  };

  // 启动并发 worker
  await Promise.all(Array.from({ length: concurrency }, () => worker()));

  console.log(`批量更新完成: 成功 ${batchUpdateStatus.completed}, 失败 ${batchUpdateStatus.failed}`);
  batchUpdateStatus.isRunning = false;
}

// 从腾讯证券获取K线数据
async function fetchKLineFromQQ(
  symbol: string,
  period: PeriodType,
  startDate: string = "20240101",
  endDate: string = "20500101",
  adjust: "" | "qfq" | "hfq" = ""
): Promise<KLineData[]> {
  const url = "https://proxy.finance.qq.com/ifzqgtimg/appstock/app/newfqkline/get";

  // 日期格式化
  const normDate = (s: string) => s.replace(/-/g, "");
  const startDateN = normDate(startDate);
  const endDateN = normDate(endDate);

  const periodMapping: Record<PeriodType, { key: string; varPattern: string; paramPattern: string }> = {
    daily: {
      key: "day",
      varPattern: `kline_day${adjust}{year}`,
      paramPattern: `${symbol},day,{start_date},{end_date},640,${adjust}`,
    },
    weekly: {
      key: "week",
      varPattern: `kline_week${adjust}`,
      paramPattern: `${symbol},week,,,320,${adjust}`,
    },
    monthly: {
      key: "month",
      varPattern: `kline_month${adjust}`,
      paramPattern: `${symbol},month,,,320,${adjust}`,
    },
  };

  const { key: periodKey, varPattern, paramPattern } = periodMapping[period];

  // 日线需要按年份循环获取
  if (period === "daily") {
    const rangeStart = Number.parseInt(startDateN.slice(0, 4), 10) || 1900;
    const currentYear = new Date().getFullYear();
    const endYear = Number.parseInt(endDateN.slice(0, 4), 10) || currentYear;
    const rangeEnd = Math.min(endYear, currentYear) + 1;

    const allData: KLineData[] = [];

    for (let year = rangeStart; year < rangeEnd; year++) {
      const yearStart = `${year}-01-01`;
      const yearEnd = `${year + 1}-12-31`;

      const params = new URLSearchParams({
        _var: varPattern.replace("{year}", String(year)),
        param: paramPattern.replace("{start_date}", yearStart).replace("{end_date}", yearEnd),
        r: "0.8205512681390605",
      });

      try {
        const response = await fetch(`${url}?${params.toString()}`);
        const text = await response.text();

        const idx = text.indexOf("={");
        if (idx === -1) continue;

        const jsonStr = text.slice(idx + 1).trim().replace(/;$/, "");
        const parsed = JSON.parse(jsonStr);
        const dataJson = parsed?.data?.[symbol];
        if (!dataJson) continue;

        // 根据复权类型选择数据
        let rawData: unknown[] = [];
        if (adjust === "hfq" && dataJson.hfqday) {
          rawData = dataJson.hfqday;
        } else if (adjust === "qfq" && dataJson.qfqday) {
          rawData = dataJson.qfqday;
        } else if (dataJson.day) {
          rawData = dataJson.day;
        } else {
          const key = ["qfqday", "hfqday", "day"].find((k) => dataJson[k]);
          if (key) rawData = dataJson[key];
        }

        for (const row of rawData) {
          if (Array.isArray(row) && row.length >= 6) {
            allData.push({
              date: String(row[0]),
              open: Number(row[1]),
              close: Number(row[2]),
              high: Number(row[3]),
              low: Number(row[4]),
              amount: Number(row[5]),
            });
          }
        }
      } catch (error) {
        console.warn(`获取${year}年日线数据失败: ${symbol}`, error);
        continue;
      }
    }

    // 去重并按日期过滤
    const uniqueData = Array.from(new Map(allData.map((d) => [d.date, d])).values());
    const startDt = new Date(startDateN.slice(0, 4) + "-" + startDateN.slice(4, 6) + "-" + startDateN.slice(6, 8));
    const endDt = new Date(endDateN.slice(0, 4) + "-" + endDateN.slice(4, 6) + "-" + endDateN.slice(6, 8));

    return uniqueData.filter((d) => {
      const dt = new Date(d.date);
      return dt >= startDt && dt <= endDt;
    });
  }

  // 周线和月线一次性获取
  const params = new URLSearchParams({
    _var: varPattern,
    param: paramPattern,
    r: period === "weekly" ? "0.29287884480018567" : "0.2325567257403376",
  });

  try {
    const response = await fetch(`${url}?${params.toString()}`);
    const text = await response.text();

    const idx = text.indexOf("={");
    if (idx === -1) return [];

    const jsonStr = text.slice(idx + 1).trim().replace(/;$/, "");
    const parsed = JSON.parse(jsonStr);

    let dataJson = parsed?.data;
    if (Array.isArray(dataJson)) {
      const item = dataJson.find((d: Record<string, unknown>) => d && symbol in d);
      dataJson = item?.[symbol] ?? {};
    } else {
      dataJson = dataJson?.[symbol] ?? {};
    }

    if (!dataJson) return [];

    // 根据复权类型选择数据
    let dataKey = adjust ? `${adjust}${periodKey}` : periodKey;
    let dataArray = dataJson[dataKey];
    if (!dataArray) {
      const fallbackKey = [`qfq${periodKey}`, `hfq${periodKey}`, periodKey].find((k) => dataJson[k]);
      dataArray = fallbackKey ? dataJson[fallbackKey] : [];
    }

    const result: KLineData[] = [];
    for (const row of dataArray) {
      if (Array.isArray(row) && row.length >= 6) {
        result.push({
          date: String(row[0]),
          open: Number(row[1]),
          close: Number(row[2]),
          high: Number(row[3]),
          low: Number(row[4]),
          amount: Number(row[5]),
        });
      }
    }

    // 按日期过滤
    const startDt = new Date(startDateN.slice(0, 4) + "-" + startDateN.slice(4, 6) + "-" + startDateN.slice(6, 8));
    const endDt = new Date(endDateN.slice(0, 4) + "-" + endDateN.slice(4, 6) + "-" + endDateN.slice(6, 8));

    return result.filter((d) => {
      const dt = new Date(d.date);
      return dt >= startDt && dt <= endDt;
    });
  } catch (error) {
    console.error(`获取${period}K线数据失败: ${symbol}`, error);
    return [];
  }
}

export const stockRouter = router({
  // 获取板块数据
  getBlockData: publicProcedure
    .input(z.object({ date: z.string() }))
    .query(async ({ input }) => {
      const { date } = input;

      // 先查询数据库
      const existingBlocks = await db
        .select()
        .from(blockData)
        .where(eq(blockData.date, date));

      if (existingBlocks.length > 0) {
        // 获取对应的股票数据
        const stocks = await db
          .select()
          .from(stockData)
          .where(eq(stockData.date, date));

        return {
        blocks: existingBlocks,
        stocks,
        fromCache: true,
      };
    }

    // 从API获取数据
      const apiData = await fetchFromApi(date);

      if (apiData.status_code !== 0 || !apiData.data) {
        return {
          blocks: [],
          stocks: [],
          fromCache: false,
          error: "获取数据失败",
        };
      }

      // 存储板块数据
      const blocksToInsert = apiData.data.map((block) => ({
        date,
        code: block.code,
        name: block.name,
        change: block.change,
        limitUpNum: block.limit_up_num,
        continuousPlateNum: block.continuous_plate_num,
        high: block.high,
        highNum: block.high_num,
        days: block.days,
      }));

      if (blocksToInsert.length > 0) {
        await db.insert(blockData).values(blocksToInsert);
      }

      // 存储股票数据
      const stocksToInsert: (typeof stockData.$inferInsert)[] = [];
      for (const block of apiData.data) {
        if (block.stock_list) {
          for (const stock of block.stock_list) {
            stocksToInsert.push({
              date,
              blockCode: block.code,
              code: stock.code,
              name: stock.name,
              latest: stock.latest,
              changeRate: stock.change_rate,
              continueNum: stock.continue_num,
              high: stock.high,
              highDays: stock.high_days,
              firstLimitUpTime: formatTime(stock.first_limit_up_time),
              lastLimitUpTime: formatTime(stock.last_limit_up_time),
              reasonType: stock.reason_type,
              reasonInfo: stock.reason_info,
              isNew: stock.is_new,
              isSt: stock.is_st,
              marketType: stock.market_type,
            });
          }
        }
      }

      if (stocksToInsert.length > 0) {
        await db.insert(stockData).values(stocksToInsert);
      }

      // 重新查询返回
      const blocks = await db
        .select()
        .from(blockData)
        .where(eq(blockData.date, date));

      const stocks = await db
        .select()
        .from(stockData)
        .where(eq(stockData.date, date));

      return {
        blocks,
        stocks,
        fromCache: false,
      };
    }),

  // 检查并触发K线数据批量更新
  checkAndUpdateKLine: publicProcedure
    .input(z.object({ dataDate: z.string() })) // 10jqka 返回的数据日期
    .mutation(async ({ input }) => {
      // 如果已经在运行，直接返回
      if (batchUpdateStatus.isRunning) {
        return {
          triggered: false,
          message: "批量更新任务已在运行中",
          status: batchUpdateStatus,
        };
      }

      const dataDate = new Date(input.dataDate);
      dataDate.setHours(0, 0, 0, 0);

      // 查询最新的 stockInfo updatedAt
      const latestStock = await db
        .select({ updatedAt: stockInfo.updatedAt })
        .from(stockInfo)
        .orderBy(stockInfo.updatedAt)
        .limit(1);

      const latestUpdatedAt = latestStock[0]?.updatedAt;

      // 如果没有数据或者 dataDate > latestUpdatedAt，触发后台更新
      if (!latestUpdatedAt || dataDate > new Date(latestUpdatedAt)) {
        console.log(`数据日期 ${input.dataDate} 大于最新更新时间，启动后台批量更新...`);
        // 后台执行，不阻塞响应
        batchUpdateAllStocksKLine(dataDate).catch(console.error);
        return {
          triggered: true,
          message: "已启动后台批量更新任务",
          status: batchUpdateStatus,
        };
      }

      return {
        triggered: false,
        message: "数据已是最新，无需更新",
        status: batchUpdateStatus,
      };
    }),

  // 获取批量更新状态
  getBatchUpdateStatus: publicProcedure.query(() => {
    return batchUpdateStatus;
  }),

  // 获取上一个交易日
  getPrevTradingDay: publicProcedure
    .input(z.object({ date: z.string() }))
    .query(({ input }) => {
      return { date: getPrevTradingDay(input.date) };
    }),

  // 获取下一个交易日
  getNextTradingDay: publicProcedure
    .input(z.object({ date: z.string() }))
    .query(({ input }) => {
      return { date: getNextTradingDay(input.date) };
    }),

  // 获取股票K线数据（带缓存和自动更新）
  getStockKLine: publicProcedure
    .input(
      z.object({
        symbol: z.string(), // 股票代码，如 "sz000001"
        name: z.string().optional(), // 股票名称
        forceUpdate: z.boolean().optional(), // 强制更新
      })
    )
    .query(async ({ input }) => {
      const { symbol, name, forceUpdate } = input;

      // 查询数据库中的现有数据
      const existing = await db
        .select()
        .from(stockInfo)
        .where(eq(stockInfo.symbol, symbol))
        .limit(1);

      const stock = existing[0];
      const now = new Date();
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

      // 判断是否需要更新：强制更新 或 数据不存在 或 updatedAt < 今天
      const needsUpdate =
        forceUpdate ||
        !stock ||
        !stock.updatedAt ||
        new Date(stock.updatedAt) < today;

      if (!needsUpdate && stock) {
        return {
          ...stock,
          fromCache: true,
        };
      }

      // 从腾讯证券 API 获取数据
      console.log(`正在从腾讯证券获取 ${symbol} 的K线数据...`);

      const [daily] = await Promise.all([
        fetchKLineFromQQ(symbol, "daily"),
        // fetchKLineFromQQ(symbol, "weekly"),
        // fetchKLineFromQQ(symbol, "monthly"),
      ]);

      // 更新或插入数据库
      const stockName = name || stock?.name || symbol;

      if (stock) {
        await db
          .update(stockInfo)
          .set({
            name: stockName,
            daily,
            // weekly,
            // monthly,
            updatedAt: now,
          })
          .where(eq(stockInfo.symbol, symbol));
      } else {
        await db.insert(stockInfo).values({
          symbol,
          name: stockName,
          daily,
          // weekly,
          // monthly,
          updatedAt: now,
          createdAt: now,
        });
      }

      return {
        symbol,
        name: stockName,
        info: stock?.info ?? null,
        daily,
        weekly: stock?.weekly ?? null,
        monthly: stock?.monthly ?? null,
        updatedAt: now,
        createdAt: stock?.createdAt ?? now,
        fromCache: false,
      };
    }),

  // 获取所有股票列表及涨跌幅
  getAllStocks: publicProcedure.query(async () => {
    try {
      console.log("开始查询所有股票...");
      
      // 获取所有股票信息
      const stocks = await db.select().from(stockInfo);
      console.log(`查询到 ${stocks.length} 只股票`);

      // 计算涨跌幅
      const stocksWithChanges = stocks.map((stock) => {
        const daily = stock.daily as KLineData[] | null;
        
        if (!daily || daily.length === 0) {
          return {
            symbol: stock.symbol,
            name: stock.name,
            block: null,
            change1d: null,
            change5d: null,
            change30d: null,
            change250d: null,
            updatedAt: stock.updatedAt,
          };
        }

        // 按日期排序（最新的在最后）
        const sortedDaily = [...daily].sort((a, b) => 
          new Date(a.date).getTime() - new Date(b.date).getTime()
        );

        const latestData = sortedDaily[sortedDaily.length - 1];
        const latestPrice = latestData?.close;
        
        if (!latestPrice) {
          return {
            symbol: stock.symbol,
            name: stock.name,
            block: null,
            change1d: null,
            change5d: null,
            change30d: null,
            change250d: null,
            updatedAt: stock.updatedAt,
          };
        }
        
        // 计算涨跌幅
        const calcChange = (daysAgo: number) => {
          const targetIndex = sortedDaily.length - 1 - daysAgo;
          if (targetIndex < 0) return null;
          const oldData = sortedDaily[targetIndex];
          const oldPrice = oldData?.close;
          if (!oldPrice || oldPrice === 0) return null;
          return ((latestPrice - oldPrice) / oldPrice) * 100;
        };

        return {
          symbol: stock.symbol,
          name: stock.name,
          block: null, // 板块信息需要从 stockData 关联
          change1d: calcChange(1),
          change5d: calcChange(5),
          change30d: calcChange(30),
          change250d: calcChange(250),
          updatedAt: stock.updatedAt,
        };
      });

      console.log("开始查询板块信息...");
      
      // 关联板块信息（取最新的板块数据）
      const latestStockData = await db
        .selectDistinct({ 
          code: stockData.code, 
          blockCode: stockData.blockCode 
        })
        .from(stockData);

      console.log(`查询到 ${latestStockData.length} 条股票-板块关联`);

      const blockMap = new Map(
        latestStockData.map((s) => [s.code, s.blockCode])
      );

      // 获取板块名称
      const latestBlocks = await db
        .selectDistinct({ 
          code: blockData.code, 
          name: blockData.name 
        })
        .from(blockData);

      console.log(`查询到 ${latestBlocks.length} 个板块`);

      const blockNameMap = new Map(
        latestBlocks.map((b) => [b.code, b.name])
      );

      // 填充板块信息
      const result = stocksWithChanges.map((stock) => {
        const code = stock.symbol.replace(/^(sh|sz)/, "");
        const blockCode = blockMap.get(code);
        const blockName = blockCode ? blockNameMap.get(blockCode) : null;
        
        return {
          ...stock,
          block: blockName || null,
        };
      });

      console.log(`返回 ${result.length} 只股票数据`);
      return result;
    } catch (error) {
      console.error("getAllStocks error:", error);
      throw error;
    }
  }),
});
