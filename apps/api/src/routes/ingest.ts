import { Hono } from 'hono';
import { db, products } from '@barto/db';
import { z } from 'zod';
import { sql } from 'drizzle-orm';
import { guardUrl } from '../lib/url-guard.ts';
import { enqueueRefresh } from '../queue/jobs.ts';

export const ingestRoute = new Hono();

const ingestSchema = z.object({
  urls: z.array(z.string().trim().min(1)).min(1).max(200),
  triggerRefresh: z.boolean().default(true),
});

ingestRoute.post('/', async (c) => {
  const body = await c.req.json().catch(() => null);
  const parsed = ingestSchema.safeParse(body);
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);

  const inserted: Array<{ id: number; url: string; isNew: boolean }> = [];
  const failed: Array<{ url: string; reason: string }> = [];

  for (const rawUrl of parsed.data.urls) {
    // SSRF 防御 + 规范化：拒绝非 http(s)、解析到私有/保留 IP 的 URL。
    const guard = await guardUrl(rawUrl);
    if (!guard.ok || !guard.normalized || !guard.host) {
      failed.push({ url: rawUrl, reason: guard.reason ?? 'invalid url' });
      continue;
    }
    const normalized = guard.normalized;
    const host = guard.host;

    const result = await db
      .insert(products)
      .values({ url: normalized, sourceSite: host, stockStatus: 'unknown' })
      .onConflictDoUpdate({
        target: products.url,
        set: { updatedAt: new Date() },
      })
      .returning({ id: products.id, url: products.url, createdAt: products.createdAt, updatedAt: products.updatedAt });

    const row = result[0];
    if (row) {
      const isNew = row.createdAt && row.updatedAt && row.createdAt.getTime() === row.updatedAt.getTime();
      inserted.push({ id: row.id, url: row.url, isNew: Boolean(isNew) });
    }
  }

  if (parsed.data.triggerRefresh && inserted.length > 0) {
    for (const item of inserted) {
      await enqueueRefresh({
        productId: item.id,
        url: item.url,
        triggeredBy: 'manual-batch',
      });
    }
  }

  return c.json({
    accepted: inserted.length,
    rejected: failed.length,
    items: inserted,
    failed,
  });
});

ingestRoute.get('/sources', async (c) => {
  const rows = await db
    .select({
      sourceSite: products.sourceSite,
      count: sql<number>`count(*)::int`,
    })
    .from(products)
    .groupBy(products.sourceSite)
    .orderBy(sql`count(*) desc`);
  return c.json({ data: rows });
});
