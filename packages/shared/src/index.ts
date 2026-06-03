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

// ─────────────────────────────────────────────
// 通用商品分类（面向任意海淘，非固定 AI 平台）
// ─────────────────────────────────────────────

export const CATEGORY = {
  AI_ACCOUNT: 'ai-account',
  API_CREDIT: 'api-credit',
  EMAIL: 'email',
  SUBSCRIPTION: 'subscription',
  PHYSICAL: 'physical',
  OTHER: 'other',
} as const;

export type Category = (typeof CATEGORY)[keyof typeof CATEGORY];

export const CATEGORY_LABELS: Record<Category, string> = {
  'ai-account': 'AI 账号',
  'api-credit': 'API / 额度',
  email: '邮箱',
  subscription: '订阅 / 会员',
  physical: '实物',
  other: '其他',
};

// 关键词规则（按数组顺序优先匹配；命中即返回）。标题转小写后匹配。
const CATEGORY_RULES: Array<{ category: Category; keywords: string[] }> = [
  { category: CATEGORY.API_CREDIT, keywords: ['api', 'cdk', '额度', '中转', 'token', 'key', '余额', 'codex api'] },
  { category: CATEGORY.EMAIL, keywords: ['邮箱', 'gmail', 'outlook', 'hotmail', 'email', '谷歌邮箱', 'microsoft 邮箱'] },
  {
    category: CATEGORY.AI_ACCOUNT,
    keywords: [
      'chatgpt', 'gpt', 'claude', 'gemini', 'grok', 'openai', 'plus', 'pro 会员', 'super grok',
      '普号', '成品号', '账号', '账密', '直登', 'ai ', '会员号',
    ],
  },
  { category: CATEGORY.SUBSCRIPTION, keywords: ['月卡', '年卡', '会员', '订阅', '充值', 'netflix', 'spotify', '续费'] },
];

/**
 * 按标题关键词归类。无标题或无命中归 other。
 * 纯函数，供 worker（写入）与前端（展示标签）共用。
 */
export function classifyTitle(title: string | null | undefined): Category {
  if (!title) return CATEGORY.OTHER;
  const lower = title.toLowerCase();
  for (const rule of CATEGORY_RULES) {
    if (rule.keywords.some((k) => lower.includes(k))) return rule.category;
  }
  return CATEGORY.OTHER;
}

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
