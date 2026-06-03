import { env } from '../lib/env.ts';
import { getBrowserPool, shutdownBrowserPool } from '../crawler/browser-pool.ts';

const url = process.argv[2];
if (!url) {
  console.error('Usage: bun run src/cli/explore-links.ts <url>');
  process.exit(1);
}

const pool = getBrowserPool();
const { browser, release } = await pool.acquire();
const context = await pool.newContext(browser);
const page = await context.newPage();

console.log(`[explore] navigating to ${url}`);
await page.goto(url, { waitUntil: 'domcontentloaded', timeout: env.SCRAPER_TIMEOUT_MS });
await page.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => undefined);

const host = new URL(url).hostname;
const links = await page.$$eval('a[href]', (els, h: string) =>
  els
    .map((el) => {
      const a = el as HTMLAnchorElement;
      return { text: (a.textContent || '').trim().slice(0, 40), href: a.href };
    })
    .filter((l) => l.href && l.href.includes(h)), host);

const unique = new Map<string, { text: string; href: string }>();
for (const l of links) if (!unique.has(l.href)) unique.set(l.href, l);
const all = [...unique.values()];

console.log(`[explore] 同站链接: ${all.length} 条`);
console.log('');
for (const l of all.slice(0, 40)) {
  console.log(`  ${l.text || '(无文字)'.padEnd(15)}  →  ${l.href}`);
}

await page.close();
await context.close();
release();
await shutdownBrowserPool();
