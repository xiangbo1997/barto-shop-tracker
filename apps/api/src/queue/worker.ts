import {
  db,
  products,
  priceHistory,
  crawlRuns,
  recordSourceHealth,
  recomputeGroupLowestPrice,
} from '@barto/db';
import { desc, eq } from 'drizzle-orm';
import {
  computeExpiresAt,
  computeFreshness,
  FRESHNESS_STATUS,
  type FetchTier,
} from '@barto/shared';
import { scrape } from '../crawler/index.ts';
import { getHostFromUrl } from '../crawler/normalize.ts';
import { env } from '../lib/env.ts';
import { jobEvents } from './events.ts';
import { getBoss, QUEUE_NAMES, type RefreshProductPayload } from './jobs.ts';

/**
 * 价格历史去重：仅在价格或库存状态相对最近一条记录发生变化时才写入。
 * 借鉴 PriceAI 的 dedupeOffers（scripts/collect-prices.mjs:948-955）思路，
 * 避免每次成功抓取都无条件追加历史，对 ≤100 URL 每日刷新场景可大幅削减写入量。
 *
 * @returns 是否实际写入了新记录
 */
async function appendPriceHistoryIfChanged(
  productId: number,
  price: number,
  currency: string | null,
  stockStatus: 'in_stock' | 'out_of_stock' | 'unknown'
): Promise<boolean> {
  const latest = await db
    .select({ price: priceHistory.price, stockStatus: priceHistory.stockStatus })
    .from(priceHistory)
    .where(eq(priceHistory.productId, productId))
    .orderBy(desc(priceHistory.fetchedAt))
    .limit(1);

  const prev = latest[0];
  // numeric 列以字符串返回，统一转 number 比较，避免 "199" vs "199.00" 误判。
  if (prev && prev.price !== null && Number(prev.price) === price && prev.stockStatus === stockStatus) {
    return false;
  }

  await db.insert(priceHistory).values({
    productId,
    price: String(price),
    currency,
    stockStatus,
  });
  return true;
}

/** 写入一条采集日志；日志失败不应影响主流程，故内部吞掉异常。 */
async function writeCrawlRun(input: {
  host: string;
  productId: number;
  triggeredBy: string;
  status: 'success' | 'failed';
  tierUsed?: number | null;
  error?: string | null;
  startedAt: Date;
  finishedAt: Date;
  details?: Record<string, unknown>;
}): Promise<void> {
  try {
    await db.insert(crawlRuns).values({
      host: input.host || null,
      productId: input.productId,
      triggeredBy: input.triggeredBy,
      status: input.status,
      tierUsed: input.tierUsed ?? null,
      elapsedMs: input.finishedAt.getTime() - input.startedAt.getTime(),
      error: input.error ?? null,
      details: input.details ?? null,
      startedAt: input.startedAt,
      finishedAt: input.finishedAt,
    });
  } catch (err) {
    console.error('[worker] failed to write crawl_run:', err);
  }
}

async function processRefresh(payload: RefreshProductPayload, jobId: string | null): Promise<void> {
  const host = getHostFromUrl(payload.url);
  const startedAt = new Date();

  jobEvents.emit({
    type: 'job.started',
    productId: payload.productId,
    jobId,
    url: payload.url,
    at: Date.now(),
  });

  try {
    const outcome = await scrape(payload.url, {
      defaultTier: env.SCRAPER_DEFAULT_TIER as 0 | 1 | 2,
      timeoutMs: env.SCRAPER_TIMEOUT_MS,
    });

    const now = new Date();

    if (outcome.data) {
      const tier = outcome.data.tierUsed as FetchTier;
      const expiresAt = computeExpiresAt(tier, now);
      // 抓取成功瞬间一定是 fresh；前端会用 verifiedAt+expiresAt 实时重算后续状态。
      const freshnessStatus = computeFreshness(now, expiresAt, false, now);

      const updated = await db
        .update(products)
        .set({
          title: outcome.data.title,
          imageUrl: outcome.data.imageUrl,
          brand: outcome.data.brand ?? null,
          sku: outcome.data.sku ?? null,
          currentPrice: outcome.data.price !== null ? String(outcome.data.price) : null,
          currency: outcome.data.currency,
          stockStatus: outcome.data.stockStatus,
          fetchTierUsed: outcome.data.tierUsed,
          fetchError: null,
          lastFetchedAt: now,
          lastSuccessAt: now,
          verifiedAt: now,
          expiresAt,
          freshnessStatus,
          updatedAt: now,
        })
        .where(eq(products.id, payload.productId))
        .returning({ groupId: products.groupId });

      // 若属于某商品组，重算组的最低可用价（比价核心）。
      const groupId = updated[0]?.groupId ?? null;
      if (groupId != null) {
        await recomputeGroupLowestPrice(groupId);
      }

      let historyWritten = false;
      if (outcome.data.price !== null) {
        historyWritten = await appendPriceHistoryIfChanged(
          payload.productId,
          outcome.data.price,
          outcome.data.currency,
          outcome.data.stockStatus
        );
      }

      await recordSourceHealth({ host, ok: true, tier: outcome.data.tierUsed });
      await writeCrawlRun({
        host,
        productId: payload.productId,
        triggeredBy: payload.triggeredBy,
        status: 'success',
        tierUsed: outcome.data.tierUsed,
        startedAt,
        finishedAt: new Date(),
        details: { historyWritten, attempts: outcome.attempts },
      });

      jobEvents.emit({
        type: 'job.completed',
        productId: payload.productId,
        jobId,
        url: payload.url,
        hit: true,
        at: Date.now(),
      });
    } else {
      // 抓取失败：保留 currentPrice/stockStatus（不让旧价消失），
      // 但按当前时刻重算 freshness——失败后 freshnessStatus 不再是 fresh，
      // 前端据此提示"数据可能已过期 / 上次抓取失败"。
      const existing = await db
        .select({
          verifiedAt: products.verifiedAt,
          expiresAt: products.expiresAt,
          groupId: products.groupId,
        })
        .from(products)
        .where(eq(products.id, payload.productId))
        .limit(1);
      const e = existing[0];
      const freshnessStatus = e
        ? computeFreshness(e.verifiedAt, e.expiresAt, true, now)
        : FRESHNESS_STATUS.FAILED;

      await db
        .update(products)
        .set({
          fetchError: outcome.fetchError ?? 'unknown error',
          freshnessStatus,
          lastFetchedAt: now,
          updatedAt: now,
        })
        .where(eq(products.id, payload.productId));

      // 失败可能使该 product 不再可用（freshness 降级），需重算组最低价。
      if (e?.groupId != null) {
        await recomputeGroupLowestPrice(e.groupId);
      }

      await recordSourceHealth({ host, ok: false, error: outcome.fetchError });
      await writeCrawlRun({
        host,
        productId: payload.productId,
        triggeredBy: payload.triggeredBy,
        status: 'failed',
        error: outcome.fetchError,
        startedAt,
        finishedAt: new Date(),
        details: { attempts: outcome.attempts },
      });

      jobEvents.emit({
        type: 'job.failed',
        productId: payload.productId,
        jobId,
        url: payload.url,
        hit: false,
        error: outcome.fetchError,
        at: Date.now(),
      });
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const now = new Date();
    await db
      .update(products)
      .set({
        fetchError: message,
        freshnessStatus: FRESHNESS_STATUS.FAILED,
        lastFetchedAt: now,
        updatedAt: now,
      })
      .where(eq(products.id, payload.productId));

    await recordSourceHealth({ host, ok: false, error: message });
    await writeCrawlRun({
      host,
      productId: payload.productId,
      triggeredBy: payload.triggeredBy,
      status: 'failed',
      error: message,
      startedAt,
      finishedAt: now,
    });

    jobEvents.emit({
      type: 'job.failed',
      productId: payload.productId,
      jobId,
      url: payload.url,
      error: message,
      at: Date.now(),
    });
    throw err;
  }
}

let workerStarted = false;

export async function startWorker(): Promise<void> {
  if (workerStarted) return;
  const boss = await getBoss();
  await boss.work<RefreshProductPayload>(
    QUEUE_NAMES.refreshProduct,
    { batchSize: env.SCRAPER_CONCURRENCY, includeMetadata: true },
    async (jobs) => {
      for (const job of jobs) {
        await processRefresh(job.data, job.id ?? null);
      }
    }
  );
  workerStarted = true;
  console.log(`[worker] processing queue ${QUEUE_NAMES.refreshProduct} (concurrency=${env.SCRAPER_CONCURRENCY})`);
}
