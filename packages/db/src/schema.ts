import {
  bigserial,
  boolean,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from 'drizzle-orm/pg-core';

export const stockStatusEnum = pgEnum('stock_status', ['in_stock', 'out_of_stock', 'unknown']);

export const productGroups = pgTable('product_groups', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  canonicalTitle: text('canonical_title').notNull(),
  lowestPrice: numeric('lowest_price', { precision: 12, scale: 2 }),
  lowestPriceCurrency: varchar('lowest_price_currency', { length: 8 }),
  // 指向组内当前最低可用价的 product.id（可空：组内可能暂无可用报价）。
  lowestPriceProductId: integer('lowest_price_product_id'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export const products = pgTable(
  'products',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    url: text('url').notNull(),
    sourceSite: varchar('source_site', { length: 255 }).notNull(),
    title: text('title'),
    imageUrl: text('image_url'),
    brand: varchar('brand', { length: 255 }),
    sku: varchar('sku', { length: 255 }),
    currentPrice: numeric('current_price', { precision: 12, scale: 2 }),
    currency: varchar('currency', { length: 8 }),
    stockStatus: stockStatusEnum('stock_status').default('unknown').notNull(),
    lastFetchedAt: timestamp('last_fetched_at', { withTimezone: true }),
    lastSuccessAt: timestamp('last_success_at', { withTimezone: true }),
    // verifiedAt 仅在抓取成功时更新，区别于 updatedAt（任何元数据变更都会动）。
    // 前端"上次确认时间"应读 verifiedAt，确保展示的是价格被真实核验的时刻。
    verifiedAt: timestamp('verified_at', { withTimezone: true }),
    // expiresAt 按抓取层级 TTL 计算的数据过期时刻（事实值，不随时间漂移）。
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    // freshnessStatus 为写入瞬间的新鲜度快照（fresh/aging/stale/expired/failed），
    // 仅供列表粗筛走索引；精确状态由前端用 verifiedAt+expiresAt 实时重算。
    freshnessStatus: varchar('freshness_status', { length: 16 }).default('fresh').notNull(),
    fetchError: text('fetch_error'),
    fetchTierUsed: smallint('fetch_tier_used'),
    // 通用分类（ai-account/email/api-credit/subscription/physical/other），供顶部 tab 过滤。
    category: varchar('category', { length: 32 }),
    groupId: integer('group_id'),
    userNote: text('user_note'),
    manuallyEdited: boolean('manually_edited').default(false).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    urlUnique: uniqueIndex('products_url_unique').on(t.url),
    sourceSiteIdx: index('products_source_site_idx').on(t.sourceSite),
    groupIdx: index('products_group_idx').on(t.groupId),
    stockIdx: index('products_stock_idx').on(t.stockStatus),
    freshnessIdx: index('products_freshness_idx').on(t.freshnessStatus),
    categoryIdx: index('products_category_idx').on(t.category),
  })
);

export const priceHistory = pgTable(
  'price_history',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    productId: integer('product_id').notNull(),
    price: numeric('price', { precision: 12, scale: 2 }),
    currency: varchar('currency', { length: 8 }),
    stockStatus: stockStatusEnum('stock_status').default('unknown').notNull(),
    fetchedAt: timestamp('fetched_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    productTimeIdx: index('price_history_product_time_idx').on(t.productId, t.fetchedAt),
  })
);

export const siteAdapters = pgTable(
  'site_adapters',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    host: varchar('host', { length: 255 }).notNull(),
    successfulTier: smallint('successful_tier').notNull(),
    successfulRule: jsonb('successful_rule').$type<Record<string, unknown>>(),
    tokenRefreshRule: jsonb('token_refresh_rule').$type<Record<string, unknown>>(),
    successCount: integer('success_count').default(0).notNull(),
    failureCount: integer('failure_count').default(0).notNull(),
    // 来源健康状态机：unknown（未知）/ healthy（健康）/ failing（连续失败降级）。
    healthStatus: varchar('health_status', { length: 16 }).default('unknown').notNull(),
    // 连续失败计数：成功时清零，≥3 时 healthStatus 降级为 failing。
    consecutiveFailures: integer('consecutive_failures').default(0).notNull(),
    lastError: text('last_error'),
    lastSuccessAt: timestamp('last_success_at', { withTimezone: true }),
    lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    hostUnique: uniqueIndex('site_adapters_host_unique').on(t.host),
    healthIdx: index('site_adapters_health_idx').on(t.healthStatus),
  })
);

// crawlRuns 记录每次抓取任务的时间序列日志，供回溯与趋势分析。
// 区别于实时 SSE 事件流（瞬时、不持久），此表是落盘的审计记录。
export const crawlRuns = pgTable(
  'crawl_runs',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    host: varchar('host', { length: 255 }),
    productId: integer('product_id'),
    triggeredBy: varchar('triggered_by', { length: 32 }).notNull(),
    status: varchar('status', { length: 16 }).notNull(), // success | failed
    tierUsed: smallint('tier_used'),
    elapsedMs: integer('elapsed_ms'),
    error: text('error'),
    details: jsonb('details').$type<Record<string, unknown>>(),
    startedAt: timestamp('started_at', { withTimezone: true }).defaultNow().notNull(),
    finishedAt: timestamp('finished_at', { withTimezone: true }),
  },
  (t) => ({
    hostTimeIdx: index('crawl_runs_host_time_idx').on(t.host, t.startedAt),
    productTimeIdx: index('crawl_runs_product_time_idx').on(t.productId, t.startedAt),
  })
);

export interface SessionCookie {
  name: string;
  value: string;
  domain?: string;
  path?: string;
  expires?: number;
  httpOnly?: boolean;
  secure?: boolean;
  sameSite?: 'Strict' | 'Lax' | 'None';
}

export const siteSessions = pgTable(
  'site_sessions',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    host: varchar('host', { length: 255 }).notNull(),
    label: varchar('label', { length: 255 }),
    cookies: jsonb('cookies').$type<SessionCookie[]>().notNull(),
    localStorage: jsonb('local_storage').$type<Record<string, string>>(),
    userAgent: text('user_agent'),
    note: text('note'),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
    lastTestedAt: timestamp('last_tested_at', { withTimezone: true }),
    lastTestStatus: varchar('last_test_status', { length: 32 }),
    lastTestError: text('last_test_error'),
    isActive: boolean('is_active').default(true).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    hostIdx: index('site_sessions_host_idx').on(t.host),
    activeIdx: index('site_sessions_active_idx').on(t.isActive),
  })
);

export type Product = typeof products.$inferSelect;
export type NewProduct = typeof products.$inferInsert;
export type PriceHistoryRow = typeof priceHistory.$inferSelect;
export type ProductGroup = typeof productGroups.$inferSelect;
export type SiteAdapter = typeof siteAdapters.$inferSelect;
export type SiteSession = typeof siteSessions.$inferSelect;
export type NewSiteSession = typeof siteSessions.$inferInsert;
export type CrawlRun = typeof crawlRuns.$inferSelect;
export type NewCrawlRun = typeof crawlRuns.$inferInsert;

// 运行时应用配置（key-value）。让 LLM/抓取/定时等配置可在 UI 改，无需重启容器。
// 简单 KV 而非每项一列：加配置项无需改 schema。
export const appSettings = pgTable('app_settings', {
  key: varchar('key', { length: 64 }).primaryKey(),
  value: text('value'),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export type AppSetting = typeof appSettings.$inferSelect;
