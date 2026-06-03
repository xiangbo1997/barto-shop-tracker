import { Hono } from 'hono';
import { db, products } from '@barto/db';
import { eq, inArray } from 'drizzle-orm';
import { z } from 'zod';
import { enqueueRefresh, enqueueRefreshBatch } from '../queue/jobs.ts';
import { runScheduledRefresh } from '../queue/scheduler.ts';

export const refreshRoute = new Hono();

// 手动触发"定时刷新"逻辑（选取最陈旧的一批），便于测试与即时补刷，无需等 cron。
refreshRoute.post('/scheduled', async (c) => {
  const result = await runScheduledRefresh();
  return c.json(result);
});

const refreshOneSchema = z.object({
  productId: z.coerce.number().int().positive(),
});

const refreshBatchSchema = z.object({
  productIds: z.array(z.coerce.number().int().positive()).optional(),
  all: z.boolean().default(false),
});

refreshRoute.post('/:id', async (c) => {
  const parsed = refreshOneSchema.safeParse({ productId: c.req.param('id') });
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);

  const row = await db
    .select({ id: products.id, url: products.url })
    .from(products)
    .where(eq(products.id, parsed.data.productId))
    .limit(1);
  if (!row[0]) return c.json({ error: 'not found' }, 404);

  const jobId = await enqueueRefresh({
    productId: row[0].id,
    url: row[0].url,
    triggeredBy: 'manual',
  });

  return c.json({ enqueued: Boolean(jobId), jobId });
});

refreshRoute.post('/', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const parsed = refreshBatchSchema.safeParse(body);
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);

  let rows: Array<{ id: number; url: string }> = [];
  if (parsed.data.all) {
    rows = await db.select({ id: products.id, url: products.url }).from(products);
  } else if (parsed.data.productIds && parsed.data.productIds.length > 0) {
    rows = await db
      .select({ id: products.id, url: products.url })
      .from(products)
      .where(inArray(products.id, parsed.data.productIds));
  } else {
    return c.json({ error: 'either all=true or productIds[] required' }, 400);
  }

  const result = await enqueueRefreshBatch(
    rows.map((r) => ({ productId: r.id, url: r.url, triggeredBy: 'manual-batch' }))
  );

  return c.json({ total: rows.length, ...result });
});
