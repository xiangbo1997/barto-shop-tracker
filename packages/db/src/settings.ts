import { db } from './index.ts';
import { appSettings } from './schema.ts';

/**
 * 运行时配置读写。带 5 秒内存缓存（抓取高频调用，避免每次查库）。
 * 保存时清缓存，使配置即时生效。
 */

let cache: Record<string, string | null> | null = null;
let cacheAt = 0;
const CACHE_TTL_MS = 5_000;

async function loadAll(): Promise<Record<string, string | null>> {
  const now = Date.now();
  if (cache && now - cacheAt < CACHE_TTL_MS) return cache;
  const rows = await db.select().from(appSettings);
  const map: Record<string, string | null> = {};
  for (const r of rows) map[r.key] = r.value;
  cache = map;
  cacheAt = now;
  return map;
}

/** 读单个配置；DB 无则返回 fallback（通常是 env 默认值）。 */
export async function getSetting(key: string, fallback?: string): Promise<string | undefined> {
  const all = await loadAll();
  const v = all[key];
  if (v === undefined || v === null || v === '') return fallback;
  return v;
}

/** 读全部配置（供配置页/批量读取）。 */
export async function getAllSettings(): Promise<Record<string, string | null>> {
  return loadAll();
}

/** 批量保存配置（upsert），并清缓存使即时生效。 */
export async function setSettings(entries: Record<string, string | null>): Promise<void> {
  const now = new Date();
  for (const [key, value] of Object.entries(entries)) {
    await db
      .insert(appSettings)
      .values({ key, value, updatedAt: now })
      .onConflictDoUpdate({
        target: appSettings.key,
        set: { value, updatedAt: now },
      });
  }
  cache = null; // 失效缓存，下次读取最新
}

/** 手动清缓存（如外部直接改了 DB）。 */
export function invalidateSettingsCache(): void {
  cache = null;
}
