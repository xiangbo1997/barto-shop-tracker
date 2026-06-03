export const STOCK_STATUS = {
  IN_STOCK: 'in_stock',
  OUT_OF_STOCK: 'out_of_stock',
  UNKNOWN: 'unknown',
} as const;

export type StockStatus = (typeof STOCK_STATUS)[keyof typeof STOCK_STATUS];

export const FETCH_TIER = {
  STATIC: 0,
  BROWSER: 1,
  LLM: 2,
} as const;

export type FetchTier = (typeof FETCH_TIER)[keyof typeof FETCH_TIER];

// ─────────────────────────────────────────────
// 数据新鲜度（freshness）
// 借鉴 PriceAI 的 effective/freshness 状态模型，但简化为单机自用场景所需的维度。
// 设计目标：让"过期数据不再伪装成有效价格"（PRODUCT 第 1 原则）。
// ─────────────────────────────────────────────

export const FRESHNESS_STATUS = {
  FRESH: 'fresh', // 在 TTL 内，数据可信
  AGING: 'aging', // 已超过 TTL 的一半，临近过期
  STALE: 'stale', // 已过 TTL，但宽限期内仍展示（标注陈旧）
  EXPIRED: 'expired', // 远超 TTL，数据不可信
  FAILED: 'failed', // 最近一次抓取失败
} as const;

export type FreshnessStatus = (typeof FRESHNESS_STATUS)[keyof typeof FRESHNESS_STATUS];

// 按抓取层级设定 TTL（毫秒）。层级越高（越依赖动态渲染/LLM），成本越高、刷新越不频繁，TTL 越长。
export const FRESHNESS_TTL_MS: Record<FetchTier, number> = {
  [FETCH_TIER.STATIC]: 24 * 60 * 60 * 1000, // 静态页变动慢，24h
  [FETCH_TIER.BROWSER]: 12 * 60 * 60 * 1000, // 动态价格，12h
  [FETCH_TIER.LLM]: 48 * 60 * 60 * 1000, // LLM 兜底成本高，48h
};

// stale 宽限期：过期后多久内仍展示旧价（标注陈旧），超过则视为 expired。
export const FRESHNESS_STALE_GRACE_MS = 24 * 60 * 60 * 1000;

/**
 * 计算 TTL 对应的过期时刻。抓取成功时调用，写入 products.expiresAt。
 */
export function computeExpiresAt(tier: FetchTier, from: Date = new Date()): Date {
  const ttl = FRESHNESS_TTL_MS[tier] ?? FRESHNESS_TTL_MS[FETCH_TIER.BROWSER];
  return new Date(from.getTime() + ttl);
}

/**
 * 根据核验时刻与过期时刻，实时推算当前新鲜度。
 * 纯函数，无副作用，供 worker（写快照）与前端（实时重算）共用，确保规则单一来源。
 *
 * @param verifiedAt 上次抓取成功的时刻（null 表示从未成功）
 * @param expiresAt  数据过期时刻（null 表示未设置）
 * @param hasError   最近一次抓取是否失败
 * @param now        当前时刻（便于测试注入）
 */
export function computeFreshness(
  verifiedAt: Date | string | null,
  expiresAt: Date | string | null,
  hasError = false,
  now: Date = new Date()
): FreshnessStatus {
  if (hasError) return FRESHNESS_STATUS.FAILED;
  if (!verifiedAt || !expiresAt) return FRESHNESS_STATUS.EXPIRED;

  const verified = typeof verifiedAt === 'string' ? new Date(verifiedAt) : verifiedAt;
  const expires = typeof expiresAt === 'string' ? new Date(expiresAt) : expiresAt;
  if (Number.isNaN(verified.getTime()) || Number.isNaN(expires.getTime())) {
    return FRESHNESS_STATUS.EXPIRED;
  }

  const nowMs = now.getTime();
  const expiresMs = expires.getTime();

  if (nowMs < expiresMs) {
    // 仍在 TTL 内：过半则 aging，否则 fresh。
    const ttlSpan = expiresMs - verified.getTime();
    const elapsed = nowMs - verified.getTime();
    return ttlSpan > 0 && elapsed > ttlSpan / 2 ? FRESHNESS_STATUS.AGING : FRESHNESS_STATUS.FRESH;
  }

  // 已过期：宽限期内 stale，否则 expired。
  return nowMs - expiresMs <= FRESHNESS_STALE_GRACE_MS
    ? FRESHNESS_STATUS.STALE
    : FRESHNESS_STATUS.EXPIRED;
}

// ─────────────────────────────────────────────
// 来源健康状态（source health）
// 借鉴 PriceAI 的 consecutive_failures 降级策略。
// ─────────────────────────────────────────────

export const SOURCE_HEALTH = {
  UNKNOWN: 'unknown',
  HEALTHY: 'healthy',
  FAILING: 'failing', // 连续失败 ≥ SOURCE_FAILING_THRESHOLD 次
} as const;

export type SourceHealth = (typeof SOURCE_HEALTH)[keyof typeof SOURCE_HEALTH];

// 连续失败达到此阈值，来源标记为 failing。
export const SOURCE_FAILING_THRESHOLD = 3;

export interface ScrapeResult {
  title: string | null;
  price: number | null;
  currency: string | null;
  imageUrl: string | null;
  stockStatus: StockStatus;
  brand?: string | null;
  sku?: string | null;
  tierUsed: FetchTier;
  needsReview?: boolean;
}

export interface JobProgress {
  jobId: string;
  total: number;
  processed: number;
  succeeded: number;
  failed: number;
  status: 'pending' | 'running' | 'completed' | 'failed';
}
