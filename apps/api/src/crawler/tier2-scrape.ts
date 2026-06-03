import { FETCH_TIER, type ScrapeResult } from '@barto/shared';
import { env } from '../lib/env.ts';
import { isHit, parseHtmlToResult } from './tier0-static.ts';

/**
 * Tier 2 兜底：调用自建反爬抓取平台（scrape.cloudsentryai.com）。
 * 平台用 stealth 浏览器过 Cloudflare + 等 SPA 渲染，返回完整 HTML。
 * 拿到 HTML 后复用 Tier 0 的 parseHtmlToResult（JSON-LD + OpenGraph）提取结构化字段。
 *
 * 仅在本地 Tier 0/1 失败时调用（每次 10-30 秒 + 占用平台配额）。
 */

export interface Tier2Result {
  hit: boolean;
  data: ScrapeResult | null;
  fetchError: string | null;
}

interface ScrapeApiResponse {
  success?: boolean;
  status_code?: number;
  url?: string;
  html?: string;
  markdown?: string;
}

export async function scrapeTier2(
  url: string,
  options: { timeoutMs?: number } = {}
): Promise<Tier2Result> {
  if (!env.FEATURE_TIER2_SCRAPE) {
    return { hit: false, data: null, fetchError: 'tier2 disabled (FEATURE_TIER2_SCRAPE=false)' };
  }
  if (!env.SCRAPE_API_KEY) {
    return { hit: false, data: null, fetchError: 'tier2 unavailable: SCRAPE_API_KEY not set' };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? env.SCRAPE_TIMEOUT_MS);

  try {
    const response = await fetch(`${env.SCRAPE_API_URL}/scrape`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': env.SCRAPE_API_KEY,
      },
      // 抓取商品页：要完整 HTML 以便复用解析器；过盾页给足等待时间。
      body: JSON.stringify({ url, format: 'html', use_proxy: false, scroll: true, delay: 6 }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      return { hit: false, data: null, fetchError: `scrape api HTTP ${response.status}: ${text.slice(0, 200)}` };
    }

    const body = (await response.json()) as ScrapeApiResponse;
    const html = body.html;
    if (!html) {
      return { hit: false, data: null, fetchError: 'scrape api returned no html' };
    }

    const merged = parseHtmlToResult(html, FETCH_TIER.LLM);
    if (!merged) {
      return { hit: false, data: null, fetchError: 'tier2: no JSON-LD / OpenGraph in rendered html' };
    }

    return { hit: isHit(merged), data: merged, fetchError: null };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { hit: false, data: null, fetchError: `tier2 error: ${message}` };
  } finally {
    clearTimeout(timer);
  }
}
