import { Hono } from 'hono';
import {
  db,
  products,
  productGroups,
  recomputeGroupLowestPrice,
  getGroupStats,
} from '@barto/db';
import { and, asc, desc, eq, isNull, sql } from 'drizzle-orm';
import Fuse from 'fuse.js';

export const groupsRoute = new Hono();

/** GET /groups —— 列出所有商品组（含成员统计、最低可用价、最低渠道信息）。 */
groupsRoute.get('/', async (c) => {
  const groups = await db
    .select()
    .from(productGroups)
    .orderBy(desc(productGroups.updatedAt));

  const withStats = await Promise.all(
    groups.map(async (g) => {
      const stats = await getGroupStats(g.id);
      // 最低渠道：lowestPriceProductId 指向的 product 的来源 + 原始标题
      let lowestChannel: { sourceSite: string; title: string | null } | null = null;
      if (g.lowestPriceProductId != null) {
        const lp = await db
          .select({ sourceSite: products.sourceSite, title: products.title })
          .from(products)
          .where(eq(products.id, g.lowestPriceProductId))
          .limit(1);
        if (lp[0]) lowestChannel = lp[0];
      }
      return { ...g, stats, lowestChannel };
    })
  );
  return c.json({ data: withStats, count: withStats.length });
});

/**
 * GET /groups/suggest —— 对未归组商品按标题相似度建议分组。
 * 注意：必须在 /:id 之前注册，否则 "suggest" 被当作 id 拦截。
 * 用 fuse.js 两两模糊匹配做简单聚类：每个未归组项搜其余未归组项，
 * 相似度高于阈值的聚为一簇（≥2 个才算建议）。
 */
groupsRoute.get('/suggest', async (c) => {
  const ungrouped = await db
    .select({ id: products.id, title: products.title, sourceSite: products.sourceSite })
    .from(products)
    .where(and(isNull(products.groupId)));

  const items = ungrouped.filter((p) => p.title && p.title.trim().length > 0);
  if (items.length < 2) return c.json({ data: [] });

  const fuse = new Fuse(items, {
    keys: ['title'],
    threshold: 0.4,
    includeScore: true,
    ignoreLocation: true,
  });

  const seen = new Set<number>();
  const clusters: Array<{ suggestedTitle: string; members: typeof items }> = [];

  for (const item of items) {
    if (seen.has(item.id)) continue;
    const matches = fuse
      .search(item.title!)
      .filter((m) => (m.score ?? 1) <= 0.4 && !seen.has(m.item.id))
      .map((m) => m.item);

    if (matches.length >= 2) {
      for (const m of matches) seen.add(m.id);
      clusters.push({ suggestedTitle: item.title!, members: matches });
    }
  }

  return c.json({ data: clusters });
});

/** GET /groups/:id —— 组详情：组信息 + 成员报价（有货优先、价格升序）。 */
groupsRoute.get('/:id', async (c) => {
  const id = Number(c.req.param('id'));
  if (!Number.isFinite(id)) return c.json({ error: 'invalid id' }, 400);

  const group = await db.select().from(productGroups).where(eq(productGroups.id, id)).limit(1);
  if (!group[0]) return c.json({ error: 'not found' }, 404);

  const members = await db
    .select()
    .from(products)
    .where(eq(products.groupId, id))
    // 有货优先，再价格升序（无价沉底）
    .orderBy(
      sql`(${products.stockStatus} = 'in_stock') desc`,
      sql`${products.currentPrice} asc nulls last`
    );

  const stats = await getGroupStats(id);
  return c.json({ data: { ...group[0], stats, members } });
});

/** POST /groups —— 建组。可选 fromProductId：用该商品标题作组名并直接纳入。 */
groupsRoute.post('/', async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as {
    title?: unknown;
    fromProductId?: unknown;
  };
  const fromId = typeof body.fromProductId === 'number' ? body.fromProductId : null;
  let title = typeof body.title === 'string' ? body.title.trim() : '';

  if (!title && fromId != null) {
    const p = await db
      .select({ title: products.title })
      .from(products)
      .where(eq(products.id, fromId))
      .limit(1);
    title = p[0]?.title ?? '新商品组';
  }
  if (!title) return c.json({ error: 'title 或 fromProductId 必填' }, 400);

  const created = await db.insert(productGroups).values({ canonicalTitle: title }).returning();
  const group = created[0]!;

  if (fromId != null) {
    await db.update(products).set({ groupId: group.id, updatedAt: new Date() }).where(eq(products.id, fromId));
    await recomputeGroupLowestPrice(group.id);
  }
  return c.json({ data: group });
});

/** PATCH /groups/:id —— 改组名。 */
groupsRoute.patch('/:id', async (c) => {
  const id = Number(c.req.param('id'));
  if (!Number.isFinite(id)) return c.json({ error: 'invalid id' }, 400);
  const body = (await c.req.json().catch(() => ({}))) as { title?: unknown };
  const title = typeof body.title === 'string' ? body.title.trim() : '';
  if (!title) return c.json({ error: 'title 必填' }, 400);

  const updated = await db
    .update(productGroups)
    .set({ canonicalTitle: title, updatedAt: new Date() })
    .where(eq(productGroups.id, id))
    .returning();
  if (!updated[0]) return c.json({ error: 'not found' }, 404);
  return c.json({ data: updated[0] });
});

/** DELETE /groups/:id —— 解散组（成员的 groupId 置空，不删商品）。 */
groupsRoute.delete('/:id', async (c) => {
  const id = Number(c.req.param('id'));
  if (!Number.isFinite(id)) return c.json({ error: 'invalid id' }, 400);
  await db.update(products).set({ groupId: null, updatedAt: new Date() }).where(eq(products.groupId, id));
  const deleted = await db.delete(productGroups).where(eq(productGroups.id, id)).returning({ id: productGroups.id });
  return c.json({ deleted: deleted.length });
});

/** POST /groups/:id/members —— 把若干商品加入组，并重算最低价。 */
groupsRoute.post('/:id/members', async (c) => {
  const id = Number(c.req.param('id'));
  if (!Number.isFinite(id)) return c.json({ error: 'invalid id' }, 400);
  const body = (await c.req.json().catch(() => ({}))) as { productIds?: unknown };
  const ids = Array.isArray(body.productIds) ? body.productIds.filter((x): x is number => typeof x === 'number') : [];
  if (ids.length === 0) return c.json({ error: 'productIds 必填' }, 400);

  for (const pid of ids) {
    await db.update(products).set({ groupId: id, updatedAt: new Date() }).where(eq(products.id, pid));
  }
  await recomputeGroupLowestPrice(id);
  return c.json({ added: ids.length });
});

/** DELETE /groups/:id/members/:productId —— 从组移出一个商品，重算最低价。 */
groupsRoute.delete('/:id/members/:productId', async (c) => {
  const id = Number(c.req.param('id'));
  const pid = Number(c.req.param('productId'));
  if (!Number.isFinite(id) || !Number.isFinite(pid)) return c.json({ error: 'invalid id' }, 400);

  await db.update(products).set({ groupId: null, updatedAt: new Date() }).where(eq(products.id, pid));
  await recomputeGroupLowestPrice(id);
  return c.json({ removed: true });
});
