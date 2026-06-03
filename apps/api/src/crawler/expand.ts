import { db, products } from '@barto/db';
import { eq } from 'drizzle-orm';
import { computeExpiresAt, computeFreshness, FETCH_TIER } from '@barto/shared';
import { getHostFromUrl } from './normalize.ts';
import { expandListingWithLlm } from './llm-list.ts';

export interface ExpandResult {
  expanded: number;
  error: string | null;
}

/**
 * 店铺/列表页展开：LLM 提取多商品 → 各建为**独立散件** product。
 *
 * 不自动归组——店铺展开出的是不同商品（如 CDK / 成品号 / 美区号），
 * 归一组比价无意义。用户可在 UI 自行把跨店铺的「同款」归组比价。
 *
 * - 子商品 url：优先用购买链接(buyUrl)；无则 `店铺URL#标题`（保证 url unique）。
 * - 子商品数据来自 LLM 提取，视为已核验：直接写 title/price/stock + verifiedAt。
 * - 幂等：子商品 url 冲突时更新（重复展开不重复插）。
 * - 父店铺页：标记「已展开 N 个商品」，不作为普通商品（保持 groupId=null）。
 *
 * @param shopUrl 店铺页 URL
 * @param parentProductId 触发展开的父 product（店铺页本身）
 */
export async function expandShopListing(shopUrl: string, parentProductId: number): Promise<ExpandResult> {
  const items = await expandListingWithLlm(shopUrl);
  if (items.length === 0) {
    return { expanded: 0, error: 'LLM 未启用或未提取到商品' };
  }

  const host = getHostFromUrl(shopUrl);
  const now = new Date();

  for (const it of items) {
    const tier = FETCH_TIER.LLM;
    const expiresAt = computeExpiresAt(tier, now);
    const childUrl = it.buyUrl ?? `${shopUrl}#${encodeURIComponent(it.title.slice(0, 64))}`;
    const hasPrice = it.price != null;

    await db
      .insert(products)
      .values({
        url: childUrl,
        sourceSite: host,
        title: it.title,
        currentPrice: hasPrice ? String(it.price) : null,
        currency: it.currency,
        stockStatus: it.stockStatus,
        fetchTierUsed: tier,
        lastFetchedAt: now,
        lastSuccessAt: hasPrice ? now : null,
        verifiedAt: hasPrice ? now : null,
        expiresAt,
        freshnessStatus: computeFreshness(now, expiresAt, false, now),
      })
      .onConflictDoUpdate({
        target: products.url,
        set: {
          title: it.title,
          currentPrice: hasPrice ? String(it.price) : null,
          currency: it.currency,
          stockStatus: it.stockStatus,
          fetchTierUsed: tier,
          lastFetchedAt: now,
          lastSuccessAt: hasPrice ? now : null,
          verifiedAt: hasPrice ? now : null,
          expiresAt,
          freshnessStatus: computeFreshness(now, expiresAt, false, now),
          updatedAt: now,
        },
      });
  }

  // 父店铺页：标记已展开（用干净文案，不复用可能已被改过的旧 title，避免套娃）。
  await db
    .update(products)
    .set({
      title: `📦 ${host}（店铺页 · 已展开 ${items.length} 个商品）`,
      fetchError: `已展开 ${items.length} 个商品（见未归组列表，可自行归组比价）`,
      stockStatus: 'unknown',
      groupId: null,
      updatedAt: now,
    })
    .where(eq(products.id, parentProductId));

  return { expanded: items.length, error: null };
}
