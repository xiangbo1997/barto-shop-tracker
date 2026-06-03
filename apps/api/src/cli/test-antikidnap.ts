import { env } from '../lib/env.ts';
import { getBrowserPool, shutdownBrowserPool } from '../crawler/browser-pool.ts';

const url = process.argv[2];
if (!url) {
  console.error('Usage: bun run src/cli/test-antikidnap.ts <url>');
  process.exit(1);
}

const pool = getBrowserPool();
const { browser, release } = await pool.acquire();
const context = await pool.newContext(browser);
const page = await context.newPage();

console.log(`[test] navigate to ${url}`);
await page.goto(url, { waitUntil: 'domcontentloaded', timeout: env.SCRAPER_TIMEOUT_MS });
await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => undefined);

const title1 = await page.title();
console.log(`[test] title before: ${title1}`);

if (title1.includes('人机验证') || title1.includes('Verification')) {
  console.log('[test] challenge detected, looking for button…');
  const btn = await page.$('.button, button, a.button');
  if (btn) {
    const btnText = (await btn.textContent())?.trim();
    console.log(`[test] clicking "${btnText}"`);
    await btn.click().catch((e) => console.log('[test] click err:', e instanceof Error ? e.message : e));
    await page.waitForLoadState('networkidle', { timeout: 12000 }).catch(() => undefined);
    await page.waitForTimeout(4000);
    await page.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => undefined);
  } else {
    console.log('[test] no button found');
  }
}

const title2 = await page.title();
const bodyPreview = ((await page.textContent('body')) ?? '').slice(0, 300).replace(/\s+/g, ' ');
const url2 = page.url();

console.log(`[test] title after:  ${title2}`);
console.log(`[test] url after:    ${url2}`);
console.log(`[test] body preview: ${bodyPreview}`);

const cookies = await context.cookies();
console.log(`[test] cookies set: ${cookies.length}`);
for (const c of cookies.slice(0, 5)) console.log(`  - ${c.name}: len=${c.value.length}`);

await page.screenshot({ path: '/tmp/barto-antikidnap.png', fullPage: false }).catch(() => undefined);
console.log('[test] screenshot: /tmp/barto-antikidnap.png');

const links = await page.$$eval('a[href]', (els) =>
  Array.from(new Set(
    els.map((el) => (el as HTMLAnchorElement).href).filter((h) => h && !h.startsWith('javascript:') && !h.startsWith('#'))
  ))
);
const internal = links.filter((l) => l.includes('mamabt.top'));
console.log(`[test] internal links: ${internal.length}`);
for (const l of internal.slice(0, 20)) console.log(`  ${l}`);

await page.close();
await context.close();
release();
await shutdownBrowserPool();
