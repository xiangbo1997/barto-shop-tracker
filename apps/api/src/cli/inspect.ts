import { env } from '../lib/env.ts';
import { getBrowserPool, shutdownBrowserPool } from '../crawler/browser-pool.ts';

const url = process.argv[2];
if (!url) {
  console.error('Usage: bun run src/cli/inspect.ts <url>');
  process.exit(1);
}

const pool = getBrowserPool();
const { browser, release } = await pool.acquire();
const context = await pool.newContext(browser);
const page = await context.newPage();

const xhrLog: Array<{ url: string; status: number; contentType: string; bodyPreview: string }> = [];

page.on('response', async (response) => {
  const ct = response.headers()['content-type'] ?? '';
  if (!ct.includes('json') && !ct.includes('javascript')) return;
  let preview = '';
  try {
    const text = await response.text();
    preview = text.slice(0, 800).replace(/\s+/g, ' ');
  } catch {}
  xhrLog.push({
    url: response.url(),
    status: response.status(),
    contentType: ct,
    bodyPreview: preview,
  });
});

console.log(`[inspect] navigating to ${url}`);
const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: env.SCRAPER_TIMEOUT_MS });
console.log(`[inspect] page status: ${response?.status()}`);
console.log(`[inspect] final url: ${page.url()}`);

await page.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => undefined);
await page.waitForTimeout(3000);

const title = await page.title();
const h1 = await page.locator('h1').first().textContent().catch(() => null);
const bodyPreview = ((await page.textContent('body')) ?? '').slice(0, 500).replace(/\s+/g, ' ');

console.log(`[inspect] <title>: ${title}`);
console.log(`[inspect] <h1>: ${h1}`);
console.log(`[inspect] body preview: ${bodyPreview}`);
console.log(`[inspect] captured ${xhrLog.length} JSON/JS responses:`);
for (const r of xhrLog.slice(0, 25)) {
  console.log(`  [${r.status}] ${r.url}`);
  console.log(`    ${r.bodyPreview.slice(0, 200)}`);
}

await page.screenshot({ path: '/tmp/barto-inspect.png', fullPage: true }).catch(() => undefined);
console.log('[inspect] screenshot: /tmp/barto-inspect.png');

await page.close();
await context.close();
release();
await shutdownBrowserPool();
