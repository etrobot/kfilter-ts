import { index, integer, real, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

// 板块数据表
export const blockData = sqliteTable("block_data", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  date: text("date").notNull(), // YYYY-MM-DD
  code: text("code").notNull(),
  name: text("name").notNull(),
  change: real("change"), // 涨跌幅
  limitUpNum: integer("limit_up_num"), // 涨停家数
  continuousPlateNum: integer("continuous_plate_num"), // 连板家数
  high: text("high"), // 连板高度
  highNum: integer("high_num"),
  days: integer("days"), // 上榜天数
  createdAt: integer("created_at", { mode: "timestamp" }).$defaultFn(() => new Date()),
});

// 涨停股票数据表
export const stockData = sqliteTable("stock_data", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  date: text("date").notNull(), // YYYY-MM-DD
  blockCode: text("block_code").notNull(), // 关联板块code
  code: text("code").notNull(),
  name: text("name").notNull(),
  latest: real("latest"), // 最新价
  changeRate: real("change_rate"), // 涨幅
  continueNum: integer("continue_num"), // 连板数
  high: text("high"), // 板数描述
  highDays: integer("high_days"),
  firstLimitUpTime: text("first_limit_up_time"), // 首次涨停时间
  lastLimitUpTime: text("last_limit_up_time"), // 最后涨停时间
  reasonType: text("reason_type"), // 涨停原因
  reasonInfo: text("reason_info"), // 详细原因
  isNew: integer("is_new"),
  isSt: integer("is_st"),
  marketType: text("market_type"),
  createdAt: integer("created_at", { mode: "timestamp" }).$defaultFn(() => new Date()),
});

// K线数据类型定义
// 每条K线数据: { date, open, close, high, low, amount }
export type KLineData = {
  date: string; // YYYY-MM-DD
  open: number;
  close: number;
  high: number;
  low: number;
  amount: number;
};

// 股票信息表 - 存储股票基本信息和K线数据
export const stockInfo = sqliteTable(
  "stock_info",
  {
    symbol: text("symbol").primaryKey(), // 股票代码，如 "sz000001"
    name: text("name").notNull(), // 股票名称
    info: text("info"), // 股票详细信息（JSON或文本）
    daily: text("daily", { mode: "json" }).$type<KLineData[]>(), // 日K线数据数组
    weekly: text("weekly", { mode: "json" }).$type<KLineData[]>(), // 周K线数据数组
    monthly: text("monthly", { mode: "json" }).$type<KLineData[]>(), // 月K线数据数组
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
      .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
      .$onUpdate(() => new Date())
      .notNull(), // 更新时间，用于判断是否需要重新获取数据
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
      .notNull(),
  },
  (table) => [
    index("stock_info_symbol_idx").on(table.symbol),
    index("stock_info_updated_at_idx").on(table.updatedAt),
  ]
);
