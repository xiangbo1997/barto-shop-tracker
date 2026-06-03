import { and, asc, eq, isNotNull, ne } from 'drizzle-orm';
import { FRESHNESS_STATUS } from '@barto/shared';
import { db } from './index.ts';
import { products, productGroups } from './schema.ts';

/**
 * 重算某商品组的「最低可用价」并写回 product_groups。
 *
 * 「可用价」严格定义（呼应 PRODUCT 第一原则：过期/缺货价不得伪装成可用低价）：
 *   - stockStatus = 'in_stock'
 *   - freshnessStatus 不为 expired / failed（数据仍可信）
 *   - currentPrice 非空
 * 取其中数值最低者，写回 lowestPrice / lowestPriceCurrency / lowestPriceProductId。
 * 若组内无任何可用价，三字段置空（前端据此显示「暂无可用报价」）。
 *
 * 货币说明：barto 海淘可能混币种。本函数按数值直接取最低、并记录该报价的币种，
 * 不做汇率换算（自用工具，避免过度工程）。混币种时由用户自行判断。
 */
export async function recomputeGroupLowestPrice(groupId: number): Promise<void> {
  const rows = await db
    .select({
      id: products.id,
      price: products.currentPrice,
      currency: products.currency,
    })
    .from(products)
    .where(
      and(
        eq(products.groupId, groupId),
        eq(products.stockStatus, 'in_stock'),
        isNotNull(products.currentPrice),
        ne(products.freshnessStatus, FRESHNESS_STATUS.EXPIRED),
        ne(products.freshnessStatus, FRESHNESS_STATUS.FAILED)
      )
    )
    .orderBy(asc(products.currentPrice));

  // numeric 列以字符串返回；按数值找最低（orderBy 已按 numeric 排序，取首条）。
  const lowest = rows[0] ?? null;

  await db
    .update(productGroups)
    .set({
      lowestPrice: lowest?.price ?? null,
      lowestPriceCurrency: lowest?.currency ?? null,
      lowestPriceProductId: lowest?.id ?? null,
      updatedAt: new Date(),
    })
    .where(eq(productGroups.id, groupId));
}

/** 组内统计：成员数 / 有货数 / 缺货数（供组卡片展示）。 */
export interface GroupStats {
  total: number;
  inStock: number;
  outOfStock: number;
}

export async function getGroupStats(groupId: number): Promise<GroupStats> {
  const rows = await db
    .select({ stockStatus: products.stockStatus })
    .from(products)
    .where(eq(products.groupId, groupId));

  const stats: GroupStats = { total: rows.length, inStock: 0, outOfStock: 0 };
  for (const r of rows) {
    if (r.stockStatus === 'in_stock') stats.inStock += 1;
    else if (r.stockStatus === 'out_of_stock') stats.outOfStock += 1;
  }
  return stats;
}
