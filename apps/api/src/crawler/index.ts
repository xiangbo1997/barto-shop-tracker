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
  /** 单品抓取全部 miss 且 URL 像店铺列表页——worker 可据此尝试 LLM 展开。 */
  isShopListing?: boolean;
}

export { looksLikeShopListing };

/**
 * 启发式判断 URL 是否为「店铺/列表页」（含多个商品），而非单商品页。
 * barto 提取器只解析单商品页；店铺列表页走 LLM 展开为多商品。
 * 常见发卡/电商平台列表路径：/shop/、/store/、/category/、/products（复数）、/goods 等。
 *
 * 注意区分单复数：
 *  - /products、/goods、/items（复数）= 列表页 → true
 *  - /product/123、/item/456（单数 + id）= 单品页 → false（不命中）
 */
function looksLikeShopListing(url: string): boolean {
  try {
    const path = new URL(url).pathname.toLowerCase();
    return (
      /\/(shop|store|seller|merchant|category|cat|list|index|products|goods|items|all)(\/|$)/.test(path) ||
      path === '/' ||
      path === ''
    );
  } catch {
    return false;
  }
}

export async function scrape(url: string, options: ScrapeOptions = {}): Promise<ScrapeOutcome> {
  const defaultTier = options.defaultTier ?? 1;
  const attempts: ScrapeOutcome['attempts'] = [];
  let finalUrl = url;

  // 店铺/列表页：在单品抓取之前直接判定走展开。
  // 否则单品抓取会从多商品页提取出"第一个商品"的脏数据（库存/价格混入页面其他商品），
  // hit=true 而当成单品处理，导致库存等判断错误（如 caowo.store 有货被误判缺货）。
  if (looksLikeShopListing(url)) {
    return {
      data: null,
      fetchError: '店铺/列表页：将尝试展开为多个商品。',
      attempts,
      finalUrl,
      isShopListing: true,
    };
  }

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

  // 全部 tier 都没"命中"（提取到可用商品）：若像店铺列表页，给可操作引导。
  // 用 hit 而非 data：店铺页常有 og:title(店铺名)+og:image，会让 parseHtmlToResult
  // 返回非空 data（有标题无价格），但 hit=false。
  if (!t1.hit && !t2.hit && (looksLikeShopListing(url) || looksLikeShopListing(finalUrl))) {
    return {
      data: null,
      // 提示作为 LLM 展开失败时的回退文案；worker 会先尝试展开。
      fetchError: '这看起来是店铺/列表页（含多个商品）。如已配置 LLM，可自动展开为多个商品；否则请改用单个商品链接。',
      attempts,
      finalUrl,
      isShopListing: true,
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
