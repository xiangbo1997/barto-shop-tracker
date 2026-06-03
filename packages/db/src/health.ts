import { eq, sql } from 'drizzle-orm';
import { SOURCE_FAILING_THRESHOLD, SOURCE_HEALTH } from '@barto/shared';
import { db } from './index.ts';
import { siteAdapters } from './schema.ts';

/**
 * 记录某来源（host）一次抓取的成功/失败，维护其健康状态机。
 *
 * 借鉴 PriceAI 的 consecutive_failures 降级策略（src/lib/admin.ts:278-336）：
 * - 成功：清零连续失败计数，healthStatus → healthy
 * - 失败：连续失败 +1，达到阈值后 healthStatus → failing
 *
 * 采用 upsert：site_adapters 此前可能没有该 host 的记录（barto 原 worker 从不写入此表）。
 * successfulTier 在新建时用本次抓取层级填充，已存在时不覆盖（保留历史学习结果）。
 */
export async function recordSourceHealth(input: {
  host: string;
  ok: boolean;
  tier?: number | null;
  error?: string | null;
}): Promise<void> {
  if (!input.host) return;

  const now = new Date();
  const tier = input.tier ?? 1;

  if (input.ok) {
    await db
      .insert(siteAdapters)
      .values({
        host: input.host,
        successfulTier: tier,
        successCount: 1,
        failureCount: 0,
        consecutiveFailures: 0,
        healthStatus: SOURCE_HEALTH.HEALTHY,
        lastError: null,
        lastSuccessAt: now,
        lastUsedAt: now,
      })
      .onConflictDoUpdate({
        target: siteAdapters.host,
        set: {
          successCount: sql`${siteAdapters.successCount} + 1`,
          consecutiveFailures: 0,
          healthStatus: SOURCE_HEALTH.HEALTHY,
          lastError: null,
          lastSuccessAt: now,
          lastUsedAt: now,
        },
      });
    return;
  }

  // 失败分支：先 upsert 基础行（failureCount=1, consecutiveFailures=1），
  // 已存在则累加，再根据累加后的连续失败数决定是否降级为 failing。
  await db
    .insert(siteAdapters)
    .values({
      host: input.host,
      successfulTier: tier,
      successCount: 0,
      failureCount: 1,
      consecutiveFailures: 1,
      healthStatus: SOURCE_HEALTH.UNKNOWN,
      lastError: input.error ?? 'unknown error',
      lastUsedAt: now,
    })
    .onConflictDoUpdate({
      target: siteAdapters.host,
      set: {
        failureCount: sql`${siteAdapters.failureCount} + 1`,
        consecutiveFailures: sql`${siteAdapters.consecutiveFailures} + 1`,
        lastError: input.error ?? 'unknown error',
        lastUsedAt: now,
      },
    });

  // 达到阈值则降级。单独一条 UPDATE，依据累加后的真实连续失败数判定。
  await db
    .update(siteAdapters)
    .set({ healthStatus: SOURCE_HEALTH.FAILING })
    .where(
      sql`${siteAdapters.host} = ${input.host} AND ${siteAdapters.consecutiveFailures} >= ${SOURCE_FAILING_THRESHOLD}`
    );
}

/** 读取某 host 的当前健康状态（供调度器决定是否跳过/降频）。 */
export async function getSourceHealth(host: string) {
  const row = await db
    .select({
      host: siteAdapters.host,
      healthStatus: siteAdapters.healthStatus,
      consecutiveFailures: siteAdapters.consecutiveFailures,
      lastSuccessAt: siteAdapters.lastSuccessAt,
      lastError: siteAdapters.lastError,
    })
    .from(siteAdapters)
    .where(eq(siteAdapters.host, host))
    .limit(1);
  return row[0] ?? null;
}
