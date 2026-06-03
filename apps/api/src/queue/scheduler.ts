import { db, products, siteAdapters } from '@barto/db';
import { SOURCE_HEALTH } from '@barto/shared';
import { asc, eq, notInArray, sql } from 'drizzle-orm';
import { env } from '../lib/env.ts';
import { enqueueRefreshBatch, getBoss, QUEUE_NAMES } from './jobs.ts';

/**
 * 定时刷新调度器。
 *
 * 采用"调度触发器 + 工作队列"两级解耦：
 *   pg-boss schedule(cron) → 唤醒 scheduleTick 队列 → 选出最陈旧的一批商品
 *   → enqueue 到 refreshProduct 队列（复用既有 worker + singletonKey 去重）。
 *
 * 选取策略（让 freshness 与 health 模型在调度层闭环）：
 *   - 跳过 health=failing 的来源（避免对已知坏源浪费配额）
 *   - 按 verifiedAt 升序（最久未核验的优先），nulls first（从未抓过的最优先）
 *   - 单轮上限 SCHEDULE_REFRESH_BATCH
 */
export async function runScheduledRefresh(): Promise<{ enqueued: number; skipped: number }> {
  // 收集当前标记为 failing 的来源 host，调度时排除（避免对已知坏源浪费配额）。
  const failing = await db
    .select({ host: siteAdapters.host })
    .from(siteAdapters)
    .where(eq(siteAdapters.healthStatus, SOURCE_HEALTH.FAILING));
  const failingHosts = failing.map((r) => r.host);

  const where = failingHosts.length > 0 ? notInArray(products.sourceSite, failingHosts) : undefined;

  const rows = await db
    .select({ id: products.id, url: products.url })
    .from(products)
    .where(where)
    // nulls first：从未核验的（verifiedAt = null）排最前，其次最久未核验的优先
    .orderBy(sql`${products.verifiedAt} asc nulls first`, asc(products.id))
    .limit(env.SCHEDULE_REFRESH_BATCH);

  if (rows.length === 0) return { enqueued: 0, skipped: 0 };

  const result = await enqueueRefreshBatch(
    rows.map((r) => ({ productId: r.id, url: r.url, triggeredBy: 'scheduled' as const }))
  );
  return { enqueued: result.enqueued, skipped: result.skipped };
}

let schedulerStarted = false;

export async function startScheduler(): Promise<void> {
  if (schedulerStarted) return;
  if (!env.FEATURE_SCHEDULED_REFRESH) {
    console.log('[scheduler] disabled (FEATURE_SCHEDULED_REFRESH=false)');
    return;
  }

  const boss = await getBoss();

  // scheduleTick 队列的 worker：cron 唤醒后执行实际选取 + 入队。
  await boss.work(QUEUE_NAMES.scheduleTick, async () => {
    const { enqueued, skipped } = await runScheduledRefresh();
    console.log(`[scheduler] tick → enqueued=${enqueued} skipped=${skipped}`);
  });

  // 注册 cron。pg-boss 会按表达式周期性向 scheduleTick 队列投递任务。
  await boss.schedule(QUEUE_NAMES.scheduleTick, env.SCHEDULE_REFRESH_CRON, undefined, {
    tz: 'UTC',
  });

  schedulerStarted = true;
  console.log(`[scheduler] registered cron "${env.SCHEDULE_REFRESH_CRON}" (batch=${env.SCHEDULE_REFRESH_BATCH})`);
}
