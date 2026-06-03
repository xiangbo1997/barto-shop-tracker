import { FETCH_TIER, type ScrapeResult } from '@barto/shared';
import { parseJsonLd } from './jsonld.ts';
import { parseOpenGraph } from './og.ts';

const DEFAULT_HEADERS: Record<string, string> = {
  'User-Agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept':
    'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
  'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
};

export interface Tier0Options {
  timeoutMs?: number;
  signal?: AbortSignal;
  headers?: Record<string, string>;
}

export interface Tier0FetchResult {
  ok: boolean;
  status: number;
  html: string | null;
  finalUrl: string;
  error: string | null;
}

export async function fetchHtml(url: string, options: Tier0Options = {}): Promise<Tier0FetchResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? 15_000);
  try {
    const response = await fetch(url, {
      headers: { ...DEFAULT_HEADERS, ...(options.headers ?? {}) },
      redirect: 'follow',
      signal: options.signal ?? controller.signal,
    });
    const html = await response.text();
    return {
      ok: response.ok,
      status: response.status,
      html: response.ok ? html : null,
      finalUrl: response.url || url,
      error: response.ok ? null : `HTTP ${response.status}`,
    };
  } catch (err) {
    return {
      ok: false,
      status: 0,
      html: null,
      finalUrl: url,
      error: err instanceof Error ? err.message : String(err),
    };
  } finally {
    clearTimeout(timer);
  }
}

export function isHit(result: ScrapeResult): boolean {
  return Boolean(result.title) && (result.price !== null || result.imageUrl !== null);
}

/**
 * 从 HTML 解析出 ScrapeResult（JSON-LD + OpenGraph 合并）。
 * 供 Tier 0（本地 fetch 的 HTML）与 Tier 2（scrape 平台返回的 HTML）共用。
 */
export function parseHtmlToResult(html: string, tierUsed: ScrapeResult['tierUsed']): ScrapeResult | null {
  const ld = parseJsonLd(html);
  const og = parseOpenGraph(html);
  if (!ld && !og) return null;

  return {
    title: ld?.title ?? og?.title ?? null,
    price: ld?.price ?? og?.price ?? null,
    currency: ld?.currency ?? og?.currency ?? null,
    imageUrl: ld?.imageUrl ?? og?.imageUrl ?? null,
    stockStatus: ld?.stockStatus ?? og?.stockStatus ?? 'unknown',
    brand: ld?.brand ?? null,
    sku: ld?.sku ?? null,
    tierUsed,
  };
}

export interface Tier0Result {
  hit: boolean;
  data: ScrapeResult | null;
  fetchError: string | null;
}

export async function scrapeTier0(url: string, options: Tier0Options = {}): Promise<Tier0Result> {
  const fetched = await fetchHtml(url, options);
  if (!fetched.ok || !fetched.html) {
    return { hit: false, data: null, fetchError: fetched.error };
  }

  const merged = parseHtmlToResult(fetched.html, FETCH_TIER.STATIC);
  if (!merged) {
    return { hit: false, data: null, fetchError: null };
  }

  return {
    hit: isHit(merged),
    data: merged,
    fetchError: null,
  };
}
