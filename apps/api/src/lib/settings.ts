import { getSetting } from '@barto/db';
import { env } from './env.ts';

/**
 * 运行时配置解析：DB 配置优先，回退 env（保持未配置时行为不变）。
 * 配置项 key 与 .env 变量名一致，便于理解。
 */

// ── LLM ──
export async function resolveLlm() {
  const enabled = (await getSetting('FEATURE_LLM_ENABLED', String(env.FEATURE_LLM_ENABLED))) === 'true';
  const baseUrl = await getSetting('LLM_BASE_URL', env.LLM_BASE_URL ?? '');
  const apiKey = await getSetting('LLM_API_KEY', env.LLM_API_KEY ?? '');
  const model = await getSetting('LLM_MODEL', env.LLM_MODEL);
  return { enabled, baseUrl: baseUrl ?? '', apiKey: apiKey ?? '', model: model ?? 'gpt-4o-mini' };
}

// ── Tier2 反爬平台 ──
export async function resolveScrape() {
  const enabled = (await getSetting('FEATURE_TIER2_SCRAPE', String(env.FEATURE_TIER2_SCRAPE))) === 'true';
  const apiUrl = await getSetting('SCRAPE_API_URL', env.SCRAPE_API_URL);
  const apiKey = await getSetting('SCRAPE_API_KEY', env.SCRAPE_API_KEY ?? '');
  const timeoutMs = Number(await getSetting('SCRAPE_TIMEOUT_MS', String(env.SCRAPE_TIMEOUT_MS)));
  return {
    enabled,
    apiUrl: apiUrl ?? env.SCRAPE_API_URL,
    apiKey: apiKey ?? '',
    timeoutMs: Number.isFinite(timeoutMs) ? timeoutMs : env.SCRAPE_TIMEOUT_MS,
  };
}

// ── 抓取参数（即时生效项）──
export async function resolveScraper() {
  const defaultTier = Number(await getSetting('SCRAPER_DEFAULT_TIER', String(env.SCRAPER_DEFAULT_TIER)));
  const timeoutMs = Number(await getSetting('SCRAPER_TIMEOUT_MS', String(env.SCRAPER_TIMEOUT_MS)));
  return {
    defaultTier: ([0, 1, 2].includes(defaultTier) ? defaultTier : env.SCRAPER_DEFAULT_TIER) as 0 | 1 | 2,
    timeoutMs: Number.isFinite(timeoutMs) ? timeoutMs : env.SCRAPER_TIMEOUT_MS,
  };
}

// ── 定时刷新（改了需重启调度器才生效）──
export async function resolveSchedule() {
  const cron = await getSetting('SCHEDULE_REFRESH_CRON', env.SCHEDULE_REFRESH_CRON);
  const batch = Number(await getSetting('SCHEDULE_REFRESH_BATCH', String(env.SCHEDULE_REFRESH_BATCH)));
  const enabled = (await getSetting('FEATURE_SCHEDULED_REFRESH', String(env.FEATURE_SCHEDULED_REFRESH))) === 'true';
  return {
    cron: cron ?? env.SCHEDULE_REFRESH_CRON,
    batch: Number.isFinite(batch) ? batch : env.SCHEDULE_REFRESH_BATCH,
    enabled,
  };
}

// 配置项清单（供配置页 GET，标注哪些是敏感/即时生效）
export const SETTING_KEYS = {
  sensitive: ['LLM_API_KEY', 'SCRAPE_API_KEY'],
  all: [
    'FEATURE_LLM_ENABLED', 'LLM_BASE_URL', 'LLM_API_KEY', 'LLM_MODEL',
    'FEATURE_TIER2_SCRAPE', 'SCRAPE_API_URL', 'SCRAPE_API_KEY', 'SCRAPE_TIMEOUT_MS',
    'SCRAPER_DEFAULT_TIER', 'SCRAPER_TIMEOUT_MS',
    'FEATURE_SCHEDULED_REFRESH', 'SCHEDULE_REFRESH_CRON', 'SCHEDULE_REFRESH_BATCH',
  ],
} as const;
