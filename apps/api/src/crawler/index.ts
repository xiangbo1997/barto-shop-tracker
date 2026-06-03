import { FETCH_TIER, type ScrapeResult } from '@barto/shared';
import { scrapeTier0, type Tier0Result } from './tier0-static.ts';
import { scrapeTier1, type Tier1Result } from './tier1-browser.ts';
import { scrapeTier2, type Tier2Result } from './tier2-scrape.ts';

export interface ScrapeOptions {
  defaultTier?: 0 | 1 | 2;
  timeoutMs?: number;
}

export interface ScrapeOutcome {
  data: ScrapeResult | null;
  fetchError: string | null;
  attempts: Array<{ tier: 0 | 1 | 2; hit: boolean; error: string | null; elapsedMs?: number }>;
  finalUrl: string;
}

/**
 * 启发式判断 URL 是否为「店铺/列表页」（含多个商品），而非单商品页。
 * barto 提取器只解析单商品页；店铺列表页应引导用户改用单品链接。
 * 常见发卡/电商平台店铺路径模式：/shop/、/store/、/seller/、/u/、分类页等。
 */
function looksLikeShopListing(url: string): boolean {
  try {
    const path = new URL(url).pathname.toLowerCase();
    return /\/(shop|store|seller|merchant|category|cat|list|index)(\/|$)/.test(path) || path === '/' || path === '';
  } catch {
    return false;
  }
}

export async function scrape(url: string, options: ScrapeOptions = {}): Promise<ScrapeOutcome> {
  const defaultTier = options.defaultTier ?? 1;
  const attempts: ScrapeOutcome['attempts'] = [];
  let finalUrl = url;

  if (defaultTier === 0) {
    const t0 = await scrapeTier0(url, { timeoutMs: options.timeoutMs });
    attempts.push({ tier: 0, hit: t0.hit, error: t0.fetchError });
    if (t0.hit && t0.data) {
      return { data: t0.data, fetchError: null, attempts, finalUrl };
    }
  }

  const t1 = await scrapeTier1(url, { timeoutMs: options.timeoutMs });
  finalUrl = t1.finalUrl;
  attempts.push({ tier: 1, hit: t1.hit, error: t1.fetchError, elapsedMs: t1.elapsedMs });
  if (t1.hit && t1.data) {
    return { data: t1.data, fetchError: null, attempts, finalUrl };
  }

  // Tier 2 兜底：本地 Playwright 也失败时，调自建反爬平台过盾抓取。
  // 显式跳过 defaultTier===2 的重复（若调用方直接指定 tier2 也走这里）。
  const t2 = await scrapeTier2(url);
  attempts.push({ tier: 2, hit: t2.hit, error: t2.fetchError });
  if (t2.hit && t2.data) {
    return { data: t2.data, fetchError: null, attempts, finalUrl };
  }

  // 全部 tier 都没提取到数据：若像店铺列表页，给可操作的引导提示。
  const allFailedNoData =
    !t1.data && !t2.data && (t1.fetchError === null || t2.fetchError === null);
  if (allFailedNoData && looksLikeShopListing(finalUrl)) {
    return {
      data: null,
      fetchError: '这看起来是店铺/列表页（含多个商品），barto 仅支持单个商品链接。请打开具体商品后复制其购买链接再导入。',
      attempts,
      finalUrl,
    };
  }

  return {
    data: null,
    fetchError: t2.fetchError ?? t1.fetchError ?? 'all tiers failed',
    attempts,
    finalUrl,
  };
}

export { scrapeTier0, scrapeTier1, scrapeTier2, FETCH_TIER };
export type { Tier0Result, Tier1Result, Tier2Result };
