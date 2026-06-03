import type { Page } from 'playwright';
import type { StockStatus } from '@barto/shared';
import { parsePrice, parseStockStatus } from './normalize.ts';

export interface DomExtractResult {
  title: string | null;
  imageUrl: string | null;
  price: number | null;
  currency: string | null;
  stockStatus: StockStatus;
}

const PRICE_SELECTORS = [
  '[itemprop="price"]',
  '[data-testid*="price" i]',
  '[class*="price-current" i]',
  '[class*="current-price" i]',
  '[class*="sale-price" i]',
  '[class*="price" i] [class*="amount" i]',
  '.total-price',
  '.price-now',
  '.goods-price',
  '.product-price',
  '.shop-price',
  '.price',
];

const TITLE_SELECTORS = [
  '[itemprop="name"]',
  'h1[class*="product" i]',
  'h1[class*="title" i]',
  '[data-testid*="product-title" i]',
  '[class*="product-title" i]',
  '[class*="goods-title" i]',
  '.product-name',
  '.goods-name',
  '.shop-title',
  'h1',
];

const IMAGE_SELECTORS = [
  '[itemprop="image"]',
  '[class*="product-image" i] img',
  '[class*="goods-image" i] img',
  '[class*="main-image" i] img',
  'meta[property="og:image"]',
];

const STOCK_BUTTON_SELECTORS = [
  '[data-testid*="add-to-cart" i]',
  'button[class*="add-to-cart" i]',
  'button[class*="buy" i]',
  'button[class*="cart" i]',
];

async function pickText(page: Page, selectors: string[]): Promise<string | null> {
  for (const sel of selectors) {
    try {
      const el = await page.$(sel);
      if (!el) continue;
      const text = (await el.textContent())?.trim();
      if (text) return text;
    } catch {}
  }
  return null;
}

async function pickAttr(page: Page, selectors: string[], attr: string): Promise<string | null> {
  for (const sel of selectors) {
    try {
      const el = await page.$(sel);
      if (!el) continue;
      const v = await el.getAttribute(attr);
      if (v && v.trim()) return v.trim();
    } catch {}
  }
  return null;
}

async function pickImage(page: Page): Promise<string | null> {
  const meta = await pickAttr(page, ['meta[property="og:image"]'], 'content');
  if (meta) return meta;
  for (const sel of IMAGE_SELECTORS.filter((s) => !s.startsWith('meta'))) {
    try {
      const el = await page.$(sel);
      if (!el) continue;
      const src = (await el.getAttribute('src')) ?? (await el.getAttribute('data-src'));
      if (src && src.trim()) return src.trim();
    } catch {}
  }
  return null;
}

async function detectStock(page: Page): Promise<StockStatus> {
  try {
    const bodyText = (await page.textContent('body')) ?? '';
    const status = parseStockStatus(bodyText.slice(0, 5000));
    if (status !== 'unknown') return status;
  } catch {}

  for (const sel of STOCK_BUTTON_SELECTORS) {
    try {
      const el = await page.$(sel);
      if (el) {
        const disabled = await el.isDisabled().catch(() => false);
        if (!disabled) return 'in_stock';
      }
    } catch {}
  }
  return 'unknown';
}

async function pickTitleWithFallback(page: Page): Promise<string | null> {
  const fromDom = await pickText(page, TITLE_SELECTORS);
  if (fromDom) return fromDom;
  const titleTag = await page.title().catch(() => '');
  if (titleTag && titleTag.trim().length > 2) return titleTag.trim();
  return null;
}

export async function extractFromDom(page: Page): Promise<DomExtractResult> {
  const title = await pickTitleWithFallback(page);
  const priceText = await pickText(page, PRICE_SELECTORS);
  const { price, currency } = parsePrice(priceText);
  const imageUrl = await pickImage(page);
  const stockStatus = await detectStock(page);

  return { title, imageUrl, price, currency, stockStatus };
}
