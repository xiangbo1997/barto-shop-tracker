import { db, products, productGroups, recomputeGroupLowestPrice } from '@barto/db';
import { eq } from 'drizzle-orm';
import { computeExpiresAt, computeFreshness, FETCH_TIER } from '@barto/shared';
import { getHostFromUrl } from './normalize.ts';
import { expandListingWithLlm } from './llm-list.ts';

export interface ExpandResult {
  expanded: number;
  groupId: number | null;
  error: string | null;
}

/**
 * 店铺/列表页展开：LLM 提取多商品 → 各建 product → 自动归入一个商品组。
 *
 * - 子商品 url：优先用 LLM 提取的购买链接(buyUrl)；无则用 `店铺URL#标题` 保证 url unique。
 * - 子商品数据来自 LLM 提取，视为已核验：直接写 title/price/stock + verifiedAt/freshness。
 * - 自动建组（canonicalTitle = 父标题或店铺域名），N 个子商品归入，重算组最低价。
 * - 幂等：子商品 url 冲突时更新（同店铺重复展开不重复插）。
 *
 * @param shopUrl   店铺页 URL
 * @param parentProductId 触发展开的父 product（店铺页本身），展开后标记
 */
export async function expandShopListing(shopUrl: string, parentProductId: number): Promise<ExpandResult> {
  const items = await expandListingWithLlm(shopUrl);
  if (items.length === 0) {
    return { expanded: 0, groupId: null, error: 'LLM 未启用或未提取到商品' };
  }

  const host = getHostFromUrl(shopUrl);
  const now = new Date();

  // 组名：用父商品标题（若有）否则店铺域名
  const parent = await db
    .select({ title: products.title })
    .from(products)
    .where(eq(products.id, parentProductId))
    .limit(1);
  const groupTitle = parent[0]?.title?.trim() || `${host} 店铺`;

  // 建组
  const createdGroup = await db.insert(productGroups).values({ canonicalTitle: groupTitle }).returning();
  const groupId = createdGroup[0]!.id;

  // 逐个子商品 upsert，归入组
  for (const it of items) {
    const tier = FETCH_TIER.LLM;
    const expiresAt = computeExpiresAt(tier, now);
    const childUrl = it.buyUrl ?? `${shopUrl}#${encodeURIComponent(it.title.slice(0, 64))}`;

    await db
      .insert(products)
      .values({
        url: childUrl,
        sourceSite: host,
        title: it.title,
        currentPrice: it.price != null ? String(it.price) : null,
        currency: it.currency,
        stockStatus: it.stockStatus,
        fetchTierUsed: tier,
        groupId,
        lastFetchedAt: now,
        lastSuccessAt: it.price != null ? now : null,
        verifiedAt: it.price != null ? now : null,
        expiresAt,
        freshnessStatus: computeFreshness(now, expiresAt, false, now),
      })
      .onConflictDoUpdate({
        target: products.url,
        set: {
          title: it.title,
          currentPrice: it.price != null ? String(it.price) : null,
          currency: it.currency,
          stockStatus: it.stockStatus,
          fetchTierUsed: tier,
          groupId,
          lastFetchedAt: now,
          lastSuccessAt: it.price != null ? now : null,
          verifiedAt: it.price != null ? now : null,
          expiresAt,
          freshnessStatus: computeFreshness(now, expiresAt, false, now),
          updatedAt: now,
        },
      });
  }

  await recomputeGroupLowestPrice(groupId);

  // 标记父商品（店铺页占位）：记录展开结果，但不归组（避免污染比价视图）。
  await db
    .update(products)
    .set({
      fetchError: `已展开 ${items.length} 个商品到组「${groupTitle}」`,
      title: `📦 ${groupTitle}（店铺页 · 已展开 ${items.length} 个商品）`,
      groupId: null,
      stockStatus: 'unknown',
      updatedAt: now,
    })
    .where(eq(products.id, parentProductId));

  return { expanded: items.length, groupId, error: null };
}
