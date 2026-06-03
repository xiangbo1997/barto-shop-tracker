import { FETCH_TIER, type ScrapeResult, type StockStatus } from '@barto/shared';
import type { BrowserContext, Page } from 'playwright';
import type { SessionCookie } from '@barto/db';
import { getBrowserPool } from './browser-pool.ts';
import { findProductInJson, type XhrCandidate } from './xhr-sniffer.ts';
import { extractFromDom } from './dom-extract.ts';
import { parseJsonLd } from './jsonld.ts';
import { findActiveSessionForHost, markSessionUsed, type InjectableSession } from './session-store.ts';
import { handleChallenges, type ChallengeOutcome } from './challenges.ts';

export interface Tier1Options {
  timeoutMs?: number;
  waitForSelector?: string;
  waitForXhrMs?: number;
  /** 强制使用某个 session（一般留空，自动按 host 查询） */
  sessionOverride?: InjectableSession;
  /** 跳过 session 注入（用于测试） */
  skipSession?: boolean;
}

export interface Tier1Result {
  hit: boolean;
  data: ScrapeResult | null;
  fetchError: string | null;
  sources: Array<'xhr' | 'jsonld' | 'dom'>;
  finalUrl: string;
  elapsedMs: number;
  sessionUsed: { id: number; host: string } | null;
  challenge: ChallengeOutcome | null;
}

function toPlaywrightCookies(
  cookies: SessionCookie[],
  fallbackHost: string
): Array<{ name: string; value: string; domain: string; path: string; expires?: number; httpOnly?: boolean; secure?: boolean; sameSite?: 'Strict' | 'Lax' | 'None' }> {
  const out: ReturnType<typeof toPlaywrightCookies> = [];
  for (const c of cookies) {
    let domain = c.domain ?? fallbackHost;
    if (!domain) continue;
    if (!domain.startsWith('.') && domain.includes(fallbackHost) === false && fallbackHost.endsWith(domain) === false) {
      domain = fallbackHost;
    }
    const cookie: ReturnType<typeof toPlaywrightCookies>[number] = {
      name: c.name,
      value: c.value,
      domain,
      path: c.path ?? '/',
    };
    if (c.expires && c.expires > 0) cookie.expires = c.expires;
    if (c.httpOnly !== undefined) cookie.httpOnly = c.httpOnly;
    if (c.secure !== undefined) cookie.secure = c.secure;
    if (c.sameSite) cookie.sameSite = c.sameSite;
    out.push(cookie);
  }
  return out;
}

async function injectSession(context: BrowserContext, session: InjectableSession): Promise<void> {
  const playwrightCookies = toPlaywrightCookies(session.cookies, session.host);
  if (playwrightCookies.length > 0) {
    await context.addCookies(playwrightCookies).catch((err) => {
      console.warn('[tier1] addCookies failed:', err instanceof Error ? err.message : err);
    });
  }
  if (session.localStorage && Object.keys(session.localStorage).length > 0) {
    const entries = Object.entries(session.localStorage);
    await context.addInitScript((items: Array<[string, string]>) => {
      try {
        for (const [k, v] of items) {
          window.localStorage.setItem(k, v);
        }
      } catch {}
    }, entries);
  }
}

const SKIPPED_RESOURCE_TYPES = new Set(['image', 'media', 'font', 'stylesheet']);

function pickFirst<T>(...values: Array<T | null | undefined>): T | null {
  for (const v of values) {
    if (v !== null && v !== undefined) return v;
  }
  return null;
}

function pickStock(...values: StockStatus[]): StockStatus {
  for (const v of values) {
    if (v !== 'unknown') return v;
  }
  return 'unknown';
}

function attachXhrSniffer(page: Page): { candidates: XhrCandidate[]; detach: () => void } {
  const candidates: XhrCandidate[] = [];
  const handler = async (response: Awaited<ReturnType<Page['waitForResponse']>>) => {
    const ct = response.headers()['content-type'] ?? '';
    if (!ct.includes('json')) return;
    try {
      const body = await response.json();
      const found = findProductInJson(body);
      if (found) candidates.push(found);
    } catch {}
  };
  page.on('response', handler);
  return {
    candidates,
    detach: () => page.off('response', handler),
  };
}

export async function scrapeTier1(url: string, options: Tier1Options = {}): Promise<Tier1Result> {
  const start = Date.now();
  const pool = getBrowserPool();
  const { browser, release } = await pool.acquire();

  let session: InjectableSession | null = options.sessionOverride ?? null;
  if (!session && !options.skipSession) {
    try {
      const host = new URL(url).hostname;
      session = await findActiveSessionForHost(host);
    } catch {}
  }

  const context = await pool.newContext(browser, { userAgent: session?.userAgent ?? null });
  if (session) {
    await injectSession(context, session);
  }
  const page = await context.newPage();

  await page.route('**/*', (route) => {
    const type = route.request().resourceType();
    if (SKIPPED_RESOURCE_TYPES.has(type)) {
      void route.abort();
    } else {
      void route.continue();
    }
  });

  const sniffer = attachXhrSniffer(page);

  let finalUrl = url;
  let fetchError: string | null = null;
  let html = '';
  let domResult: Awaited<ReturnType<typeof extractFromDom>> | null = null;
  let challenge: ChallengeOutcome | null = null;

  try {
    const response = await page.goto(url, {
      waitUntil: 'domcontentloaded',
      timeout: options.timeoutMs ?? 30_000,
    });
    finalUrl = page.url();
    if (response && !response.ok()) {
      fetchError = `HTTP ${response.status()}`;
    }

    if (options.waitForSelector) {
      await page.waitForSelector(options.waitForSelector, { timeout: 5000 }).catch(() => undefined);
    } else {
      await page.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => undefined);
    }

    await page.waitForTimeout(options.waitForXhrMs ?? 1500);

    challenge = await handleChallenges(page).catch(() => null);
    if (challenge?.bypassed) {
      finalUrl = page.url();
    }

    html = await page.content().catch(() => '');
    domResult = await extractFromDom(page).catch(() => null);
  } catch (err) {
    fetchError = err instanceof Error ? err.message : String(err);
  } finally {
    sniffer.detach();
    await page.close().catch(() => undefined);
    await context.close().catch(() => undefined);
    release();
  }

  const xhrBest = sniffer.candidates.sort((a, b) => b.score - a.score)[0] ?? null;
  const ld = html ? parseJsonLd(html) : null;

  const sources: Array<'xhr' | 'jsonld' | 'dom'> = [];
  if (xhrBest) sources.push('xhr');
  if (ld) sources.push('jsonld');
  if (domResult && (domResult.title || domResult.price !== null)) sources.push('dom');

  const title = pickFirst(xhrBest?.title, ld?.title, domResult?.title);
  const imageUrl = pickFirst(xhrBest?.imageUrl, ld?.imageUrl, domResult?.imageUrl);
  const price = pickFirst(xhrBest?.price, ld?.price, domResult?.price);
  const currency = pickFirst(xhrBest?.currency, ld?.currency, domResult?.currency);
  const stockStatus = pickStock(
    xhrBest?.stockStatus ?? 'unknown',
    ld?.stockStatus ?? 'unknown',
    domResult?.stockStatus ?? 'unknown'
  );
  const brand = pickFirst(xhrBest?.brand, ld?.brand);
  const sku = pickFirst(xhrBest?.sku, ld?.sku);

  const hit = Boolean(title) && (price !== null || imageUrl !== null);
  if (!hit && !fetchError) {
    fetchError = 'no product data extracted';
  }

  const data: ScrapeResult | null = hit
    ? {
        title,
        price,
        currency,
        imageUrl,
        stockStatus,
        brand,
        sku,
        tierUsed: FETCH_TIER.BROWSER,
      }
    : null;

  if (session && hit) {
    void markSessionUsed(session.id).catch(() => undefined);
  }

  return {
    hit,
    data,
    fetchError,
    sources,
    finalUrl,
    elapsedMs: Date.now() - start,
    sessionUsed: session ? { id: session.id, host: session.host } : null,
    challenge,
  };
}
