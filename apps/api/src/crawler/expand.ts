import { db, products } from '@barto/db';
import { eq } from 'drizzle-orm';
import { classifyTitle, computeExpiresAt, computeFreshness, FETCH_TIER } from '@barto/shared';
import { getHostFromUrl } from './normalize.ts';
import { expandListingWithLlm, expandFailMessage } from './llm-list.ts';

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
  const { products: items, reason } = await expandListingWithLlm(shopUrl);
  if (items.length === 0) {
    // reason 必非 null（items 为空时一定带原因），回传精确错误信息便于排查。
    return { expanded: 0, error: reason ? expandFailMessage(reason) : '店铺/列表页：未提取到商品。' };
  }

  const host = getHostFromUrl(shopUrl);
  const now = new Date();

  // 去掉易变 query（如 u_atoken/u_asig 等访问令牌），得到稳定的店铺基础 URL。
  // 否则每次展开 query 不同，子商品 url（基于店铺URL拼）每次都变，去重失效→重复插入。
  let baseUrl = shopUrl;
  try {
    const u = new URL(shopUrl);
    baseUrl = `${u.origin}${u.pathname}`;
  } catch {
    /* 保持原值 */
  }

  for (const it of items) {
    const tier = FETCH_TIER.LLM;
    const expiresAt = computeExpiresAt(tier, now);
    // 子商品 url：优先购买链接；否则用稳定的 baseUrl#标题（保证重复展开幂等去重）。
    const childUrl = it.buyUrl ?? `${baseUrl}#${encodeURIComponent(it.title.slice(0, 64))}`;
    const hasPrice = it.price != null;
    const category = classifyTitle(it.title);

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
        category,
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
          category,
          lastFetchedAt: now,
          lastSuccessAt: hasPrice ? now : null,
          verifiedAt: hasPrice ? now : null,
          expiresAt,
          freshnessStatus: computeFreshness(now, expiresAt, false, now),
          updatedAt: now,
        },
      });
  }

  // 父店铺页是入口占位，展开后无价值——直接删除，避免列表里留空壳。
  await db.delete(products).where(eq(products.id, parentProductId));

  return { expanded: items.length, error: null };
}
