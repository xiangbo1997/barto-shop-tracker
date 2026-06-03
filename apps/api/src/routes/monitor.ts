import { Hono } from 'hono';
import { db, siteAdapters, crawlRuns } from '@barto/db';
import { and, desc, eq } from 'drizzle-orm';

export const monitorRoute = new Hono();

/** GET /monitor/adapters —— 来源健康状态列表（failing 排前，便于排查）。 */
monitorRoute.get('/adapters', async (c) => {
  const rows = await db
    .select({
      host: siteAdapters.host,
      healthStatus: siteAdapters.healthStatus,
      successCount: siteAdapters.successCount,
      failureCount: siteAdapters.failureCount,
      consecutiveFailures: siteAdapters.consecutiveFailures,
      successfulTier: siteAdapters.successfulTier,
      lastError: siteAdapters.lastError,
      lastSuccessAt: siteAdapters.lastSuccessAt,
      lastUsedAt: siteAdapters.lastUsedAt,
    })
    .from(siteAdapters)
    // failing 优先（healthStatus 字典序：failing < healthy < unknown，故用自定义排序）
    .orderBy(desc(siteAdapters.consecutiveFailures), desc(siteAdapters.lastUsedAt));
  return c.json({ data: rows, count: rows.length });
});

/** GET /monitor/crawl-runs —— 最近采集日志，可选 ?host= / ?status= 过滤。 */
monitorRoute.get('/crawl-runs', async (c) => {
  const url = new URL(c.req.url);
  const host = url.searchParams.get('host')?.trim();
  const status = url.searchParams.get('status')?.trim();

  const conditions = [];
  if (host) conditions.push(eq(crawlRuns.host, host));
  if (status === 'success' || status === 'failed') conditions.push(eq(crawlRuns.status, status));

  const rows = await db
    .select({
      id: crawlRuns.id,
      host: crawlRuns.host,
      productId: crawlRuns.productId,
      triggeredBy: crawlRuns.triggeredBy,
      status: crawlRuns.status,
      tierUsed: crawlRuns.tierUsed,
      elapsedMs: crawlRuns.elapsedMs,
      error: crawlRuns.error,
      startedAt: crawlRuns.startedAt,
      finishedAt: crawlRuns.finishedAt,
    })
    .from(crawlRuns)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(crawlRuns.startedAt))
    .limit(100);
  return c.json({ data: rows, count: rows.length });
});
