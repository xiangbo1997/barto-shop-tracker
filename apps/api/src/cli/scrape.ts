import { env } from '../lib/env.ts';
import { scrape } from '../crawler/index.ts';
import { shutdownBrowserPool } from '../crawler/browser-pool.ts';

const url = process.argv[2];
if (!url) {
  console.error('Usage: bun run scrape <url>');
  process.exit(1);
}

console.log(`[scrape] target: ${url}`);
console.log(`[scrape] default tier: ${env.SCRAPER_DEFAULT_TIER}`);

const start = Date.now();
const result = await scrape(url, {
  defaultTier: env.SCRAPER_DEFAULT_TIER as 0 | 1 | 2,
  timeoutMs: env.SCRAPER_TIMEOUT_MS,
});
const elapsed = Date.now() - start;

console.log(`[scrape] elapsed=${elapsed}ms`);
console.log(`[scrape] attempts:`, JSON.stringify(result.attempts));
console.log(`[scrape] finalUrl: ${result.finalUrl}`);
if (result.fetchError) console.log(`[scrape] error: ${result.fetchError}`);
console.log(JSON.stringify(result.data, null, 2));

await shutdownBrowserPool();
process.exit(result.data ? 0 : 2);
