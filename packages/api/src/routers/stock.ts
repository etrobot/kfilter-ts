import { db, blockData, stockData } from "@kfilter-ts/db";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { publicProcedure, router } from "../index";

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
});
