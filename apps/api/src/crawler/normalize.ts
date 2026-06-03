import type { StockStatus } from '@barto/shared';

const CURRENCY_SYMBOLS: Record<string, string> = {
  '¥': 'CNY',
  '￥': 'CNY',
  '$': 'USD',
  'US$': 'USD',
  '€': 'EUR',
  '£': 'GBP',
  'HK$': 'HKD',
  'JP¥': 'JPY',
  '₩': 'KRW',
};

export interface ParsedPrice {
  price: number | null;
  currency: string | null;
}

export function parsePrice(raw: string | number | null | undefined, currencyHint?: string | null): ParsedPrice {
  if (raw === null || raw === undefined || raw === '') return { price: null, currency: currencyHint ?? null };

  if (typeof raw === 'number' && Number.isFinite(raw)) {
    return { price: raw, currency: currencyHint ?? null };
  }

  const str = String(raw).trim();

  let detected: string | null = currencyHint ?? null;
  for (const [sym, code] of Object.entries(CURRENCY_SYMBOLS)) {
    if (str.includes(sym)) {
      detected = code;
      break;
    }
  }

  const codeMatch = str.match(/\b(USD|EUR|CNY|RMB|GBP|HKD|JPY|KRW|AUD|CAD)\b/i);
  if (codeMatch) {
    const code = codeMatch[1]!.toUpperCase();
    detected = code === 'RMB' ? 'CNY' : code;
  }

  const numMatch = str.match(/[\d,]+(?:\.\d+)?/);
  if (!numMatch) return { price: null, currency: detected };

  const numeric = Number(numMatch[0].replace(/,/g, ''));
  if (!Number.isFinite(numeric)) return { price: null, currency: detected };

  return { price: numeric, currency: detected };
}

const IN_STOCK_KEYWORDS = [
  'instock',
  'in_stock',
  'in stock',
  'available',
  'http://schema.org/instock',
  'https://schema.org/instock',
  '现货',
  '有货',
  'add to cart',
  '加入购物车',
  '立即购买',
  '加入購物車',
];

const OUT_OF_STOCK_KEYWORDS = [
  'outofstock',
  'out_of_stock',
  'out of stock',
  'soldout',
  'sold_out',
  'sold out',
  'http://schema.org/outofstock',
  'https://schema.org/outofstock',
  'discontinued',
  '缺货',
  '無貨',
  '已售罄',
  '售罄',
  '到货通知',
  '下架',
];

export function parseStockStatus(raw: string | null | undefined): StockStatus {
  if (!raw) return 'unknown';
  const lower = String(raw).toLowerCase().trim();
  if (OUT_OF_STOCK_KEYWORDS.some((k) => lower.includes(k))) return 'out_of_stock';
  if (IN_STOCK_KEYWORDS.some((k) => lower.includes(k))) return 'in_stock';
  return 'unknown';
}

export function getHostFromUrl(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return '';
  }
}
