import { z } from 'zod';

const schema = z.object({
  DATABASE_URL: z.string().url(),
  API_PORT: z.coerce.number().int().positive().default(3001),
  LLM_BASE_URL: z.string().url().optional(),
  LLM_API_KEY: z.string().min(1).optional(),
  LLM_MODEL: z.string().default('gpt-4o-mini'),
  LLM_VISION_MODEL: z.string().default('gpt-4o-mini'),
  SCRAPER_DEFAULT_TIER: z.coerce.number().int().min(0).max(2).default(1),
  SCRAPER_CONCURRENCY: z.coerce.number().int().positive().default(5),
  SCRAPER_BROWSER_POOL_SIZE: z.coerce.number().int().positive().default(2),
  SCRAPER_TIMEOUT_MS: z.coerce.number().int().positive().default(30_000),
  // 定时刷新：cron 表达式（pg-boss schedule）。默认每天 03:00 刷新最陈旧的一批。
  SCHEDULE_REFRESH_CRON: z.string().default('0 3 * * *'),
  // 每次定时任务最多刷新多少个最陈旧商品（限制单轮配额，避免一次性打满）。
  SCHEDULE_REFRESH_BATCH: z.coerce.number().int().positive().default(100),
  FEATURE_SCHEDULED_REFRESH: z
    .enum(['true', 'false'])
    .default('true')
    .transform((v) => v === 'true'),
  // Tier 2 兜底：自建反爬抓取平台（过 Cloudflare + SPA 渲染，返回 HTML/Markdown）。
  SCRAPE_API_URL: z.string().url().default('https://scrape.cloudsentryai.com'),
  SCRAPE_API_KEY: z.string().min(1).optional(),
  SCRAPE_TIMEOUT_MS: z.coerce.number().int().positive().default(120_000),
  FEATURE_TIER2_SCRAPE: z
    .enum(['true', 'false'])
    .default('true')
    .transform((v) => v === 'true'),
  FEATURE_LLM_ENABLED: z
    .enum(['true', 'false'])
    .default('true')
    .transform((v) => v === 'true'),
  FEATURE_SMART_TOKEN_REFRESH: z
    .enum(['true', 'false'])
    .default('true')
    .transform((v) => v === 'true'),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  console.error('Invalid environment variables:', parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;

export interface LlmCredentials {
  baseUrl: string;
  apiKey: string;
  model: string;
  visionModel: string;
}

export function getLlmCredentials(): LlmCredentials {
  if (!env.FEATURE_LLM_ENABLED) {
    throw new Error('LLM feature is disabled (FEATURE_LLM_ENABLED=false)');
  }
  if (!env.LLM_BASE_URL || !env.LLM_API_KEY) {
    throw new Error('LLM_BASE_URL and LLM_API_KEY are required when FEATURE_LLM_ENABLED=true');
  }
  return {
    baseUrl: env.LLM_BASE_URL,
    apiKey: env.LLM_API_KEY,
    model: env.LLM_MODEL,
    visionModel: env.LLM_VISION_MODEL,
  };
}
