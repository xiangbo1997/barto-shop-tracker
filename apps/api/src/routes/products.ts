import { Hono } from 'hono';
import { db, products, priceHistory, recomputeGroupLowestPrice } from '@barto/db';
import { and, asc, desc, eq, ilike, or, sql, type SQL } from 'drizzle-orm';
import { z } from 'zod';

export const productsRoute = new Hono();

const listQuerySchema = z.object({
  q: z.string().trim().optional(),
  stock: z.enum(['in_stock', 'out_of_stock', 'unknown']).optional(),
  source: z.string().trim().optional(),
  category: z.string().trim().optional(),
  // available：有货优先 + 低价（默认，对应 PRODUCT 第 1 原则"可用价优先"）
  // price：纯价格升序；updated：最近更新；created：导入时间
  sort: z.enum(['available', 'price', 'updated', 'created']).default('available'),
  limit: z.coerce.number().int().min(1).max(200).default(100),
  offset: z.coerce.number().int().min(0).default(0),
});

// 各排序模式对应的 ORDER BY 子句。
function orderByFor(sort: 'available' | 'price' | 'updated' | 'created'): SQL[] {
  switch (sort) {
    case 'available':
      // 有货排前（boolean DESC），再按价格升序（NULLS LAST 让无价商品沉底）。
      return [
        sql`(${products.stockStatus} = 'in_stock') desc`,
        sql`${products.currentPrice} asc nulls last`,
        desc(products.updatedAt),
      ];
    case 'price':
      return [sql`${products.currentPrice} asc nulls last`];
    case 'updated':
      return [desc(products.updatedAt)];
    case 'created':
      return [asc(products.createdAt)];
  }
}

productsRoute.get('/', async (c) => {
  const parsed = listQuerySchema.safeParse(Object.fromEntries(new URL(c.req.url).searchParams));
  if (!parsed.success) {
    return c.json({ error: parsed.error.flatten() }, 400);
  }
  const { q, stock, source, category, sort, limit, offset } = parsed.data;

  const conditions = [];
  if (q) {
    const pattern = `%${q}%`;
    conditions.push(
      or(ilike(products.title, pattern), ilike(products.userNote, pattern), ilike(products.brand, pattern))
    );
  }
  if (stock) conditions.push(eq(products.stockStatus, stock));
  if (source) conditions.push(eq(products.sourceSite, source));
  if (category) conditions.push(eq(products.category, category));

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const rows = await db
    .select()
    .from(products)
    .where(where)
    .orderBy(...orderByFor(sort))
    .limit(limit)
    .offset(offset);

  // 同时返回按库存分组的汇总计数，供前端 Metric 摘要条使用（受当前搜索/来源过滤约束，但忽略 stock 过滤）。
  const summaryConditions = [];
  if (q) {
    const pattern = `%${q}%`;
    summaryConditions.push(
      or(ilike(products.title, pattern), ilike(products.userNote, pattern), ilike(products.brand, pattern))
    );
  }
  if (source) summaryConditions.push(eq(products.sourceSite, source));
  const summaryWhere = summaryConditions.length > 0 ? and(...summaryConditions) : undefined;

  const summaryRows = await db
    .select({ stockStatus: products.stockStatus, count: sql<number>`count(*)::int` })
    .from(products)
    .where(summaryWhere)
    .groupBy(products.stockStatus);

  const summary = { total: 0, inStock: 0, outOfStock: 0, unknown: 0 };
  for (const r of summaryRows) {
    summary.total += r.count;
    if (r.stockStatus === 'in_stock') summary.inStock = r.count;
    else if (r.stockStatus === 'out_of_stock') summary.outOfStock = r.count;
    else summary.unknown = r.count;
  }

  return c.json({ data: rows, count: rows.length, summary, limit, offset, sort });
});

productsRoute.get('/:id', async (c) => {
  const id = Number(c.req.param('id'));
  if (!Number.isFinite(id)) return c.json({ error: 'invalid id' }, 400);
  const row = await db.select().from(products).where(eq(products.id, id)).limit(1);
  if (!row[0]) return c.json({ error: 'not found' }, 404);
  return c.json({ data: row[0] });
});

/** GET /products/categories —— 各分类商品计数（供顶部 tab）。 */
productsRoute.get('/categories', async (c) => {
  const rows = await db
    .select({ category: products.category, count: sql<number>`count(*)::int` })
    .from(products)
    .groupBy(products.category);
  const counts: Record<string, number> = {};
  let total = 0;
  for (const r of rows) {
    const key = r.category ?? 'other';
    counts[key] = (counts[key] ?? 0) + r.count;
    total += r.count;
  }
  return c.json({ data: counts, total });
});

/** GET /products/:id/history —— 价格历史时序（供趋势图，按时间升序）。 */
productsRoute.get('/:id/history', async (c) => {
  const id = Number(c.req.param('id'));
  if (!Number.isFinite(id)) return c.json({ error: 'invalid id' }, 400);
  const rows = await db
    .select({
      price: priceHistory.price,
      currency: priceHistory.currency,
      stockStatus: priceHistory.stockStatus,
      fetchedAt: priceHistory.fetchedAt,
    })
    .from(priceHistory)
    .where(eq(priceHistory.productId, id))
    .orderBy(asc(priceHistory.fetchedAt))
    .limit(500);
  return c.json({ data: rows, count: rows.length });
});

const updateSchema = z.object({
  title: z.string().nullable().optional(),
  userNote: z.string().nullable().optional(),
  currentPrice: z.string().nullable().optional(),
  currency: z.string().nullable().optional(),
  stockStatus: z.enum(['in_stock', 'out_of_stock', 'unknown']).optional(),
  groupId: z.number().int().positive().nullable().optional(),
});

productsRoute.patch('/:id', async (c) => {
  const id = Number(c.req.param('id'));
  if (!Number.isFinite(id)) return c.json({ error: 'invalid id' }, 400);
  const body = await c.req.json().catch(() => ({}));
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);

  // 记录改动前的旧组，便于改 groupId 后同时重算新旧两组。
  const before = await db
    .select({ groupId: products.groupId })
    .from(products)
    .where(eq(products.id, id))
    .limit(1);
  const oldGroupId = before[0]?.groupId ?? null;

  const updated = await db
    .update(products)
    .set({ ...parsed.data, manuallyEdited: true, updatedAt: new Date() })
    .where(eq(products.id, id))
    .returning();
  if (!updated[0]) return c.json({ error: 'not found' }, 404);

  // 归属组或价格/库存变化都可能影响组最低价：重算受影响的组。
  const newGroupId = updated[0].groupId ?? null;
  const affected = new Set<number>();
  if (oldGroupId != null) affected.add(oldGroupId);
  if (newGroupId != null) affected.add(newGroupId);
  for (const gid of affected) await recomputeGroupLowestPrice(gid);

  return c.json({ data: updated[0] });
});

productsRoute.delete('/:id', async (c) => {
  const id = Number(c.req.param('id'));
  if (!Number.isFinite(id)) return c.json({ error: 'invalid id' }, 400);
  const deleted = await db.delete(products).where(eq(products.id, id)).returning({ id: products.id });
  return c.json({ deleted: deleted.length });
});
