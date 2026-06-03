import { env } from '../lib/env.ts';
import { getBrowserPool, shutdownBrowserPool } from '../crawler/browser-pool.ts';

const url = process.argv[2];
if (!url) {
  console.error('Usage: bun run src/cli/dump-html.ts <url>');
  process.exit(1);
}

const pool = getBrowserPool();
const { browser, release } = await pool.acquire();
const context = await pool.newContext(browser);
const page = await context.newPage();

await page.goto(url, { waitUntil: 'domcontentloaded', timeout: env.SCRAPER_TIMEOUT_MS });
await page.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => undefined);
await page.waitForTimeout(2000);

const html = await page.content();
const bodyText = await page.textContent('body');

// 找包含"价"或货币符号的行
const lines = (bodyText || '').split('\n').map((l) => l.trim()).filter(Boolean);
const priceLines = lines.filter((l) => /[¥￥$元价]/.test(l) && l.length < 200);

console.log('=== 含价格特征的文本行 ===');
for (const l of priceLines.slice(0, 20)) console.log('  ', l);

// 找含数字+￥/元的具体 DOM 元素
const priceElements = await page.$$eval('body *', (els) => {
  return els
    .map((el) => {
      const text = (el.textContent || '').trim();
      if (text.length > 100 || text.length < 1) return null;
      if (!/[¥￥$元][\s]*\d|[\d][\s]*[¥￥$元]/.test(text)) return null;
      const tag = el.tagName.toLowerCase();
      const cls = el.getAttribute('class') ?? '';
      const id = el.getAttribute('id') ?? '';
      return { tag, cls, id, text: text.slice(0, 80) };
    })
    .filter(Boolean)
    .slice(0, 10);
});

console.log('\n=== 含价格的 DOM 元素 ===');
for (const e of priceElements) {
  console.log(`  <${e!.tag} class="${e!.cls}" id="${e!.id}"> ${e!.text}`);
}

await page.close();
await context.close();
release();
await shutdownBrowserPool();
