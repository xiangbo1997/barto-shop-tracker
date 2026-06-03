import PgBoss from 'pg-boss';
import { env } from '../lib/env.ts';

export const QUEUE_NAMES = {
  refreshProduct: 'barto.refresh.product',
  scheduleTick: 'barto.schedule.tick',
} as const;

export interface RefreshProductPayload {
  productId: number;
  url: string;
  triggeredBy: 'manual' | 'manual-batch' | 'scheduled';
}

let bossInstance: PgBoss | null = null;
let startPromise: Promise<PgBoss> | null = null;

async function createBoss(): Promise<PgBoss> {
  const boss = new PgBoss({
    connectionString: env.DATABASE_URL,
    retryLimit: 3,
    retryDelay: 30,
    retryBackoff: true,
    expireInHours: 1,
    archiveCompletedAfterSeconds: 60 * 60 * 24,
  });
  boss.on('error', (err) => {
    console.error('[pg-boss] error:', err);
  });
  await boss.start();
  await boss.createQueue(QUEUE_NAMES.refreshProduct);
  await boss.createQueue(QUEUE_NAMES.scheduleTick);
  return boss;
}

export async function getBoss(): Promise<PgBoss> {
  if (bossInstance) return bossInstance;
  if (!startPromise) {
    startPromise = createBoss().then((b) => {
      bossInstance = b;
      return b;
    });
  }
  return startPromise;
}

export async function shutdownBoss(): Promise<void> {
  if (bossInstance) {
    await bossInstance.stop({ graceful: true, timeout: 5_000 });
    bossInstance = null;
    startPromise = null;
  }
}

export async function enqueueRefresh(payload: RefreshProductPayload): Promise<string | null> {
  const boss = await getBoss();
  return boss.send(QUEUE_NAMES.refreshProduct, payload, {
    retryLimit: 3,
    retryDelay: 30,
    expireInHours: 1,
    singletonKey: `refresh-product-${payload.productId}`,
  });
}

export async function enqueueRefreshBatch(payloads: RefreshProductPayload[]): Promise<{
  enqueued: number;
  skipped: number;
  jobIds: string[];
}> {
  const jobIds: string[] = [];
  let skipped = 0;
  for (const payload of payloads) {
    const jobId = await enqueueRefresh(payload);
    if (jobId) jobIds.push(jobId);
    else skipped += 1;
  }
  return { enqueued: jobIds.length, skipped, jobIds };
}
