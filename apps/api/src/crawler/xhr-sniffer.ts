import type { StockStatus } from '@barto/shared';
import { parsePrice, parseStockStatus } from './normalize.ts';

const PRICE_FIELDS = ['price', 'salePrice', 'sale_price', 'currentPrice', 'current_price', 'amount', 'finalPrice'];
const TITLE_FIELDS = ['title', 'name', 'productName', 'product_name', 'goodsName', 'goods_name'];
const IMAGE_FIELDS = ['image', 'imageUrl', 'image_url', 'cover', 'coverImage', 'pic', 'picUrl', 'mainImage', 'main_image'];
const STOCK_FIELDS = ['stock', 'stockStatus', 'stock_status', 'inventory', 'inStock', 'in_stock', 'available', 'availability', 'soldOut', 'sold_out'];
const CURRENCY_FIELDS = ['currency', 'priceCurrency', 'currencyCode', 'currency_code'];
const BRAND_FIELDS = ['brand', 'brandName', 'brand_name'];
const SKU_FIELDS = ['sku', 'skuId', 'sku_id', 'productId', 'product_id', 'goodsId', 'goods_id'];

export interface XhrCandidate {
  title: string | null;
  imageUrl: string | null;
  price: number | null;
  currency: string | null;
  stockStatus: StockStatus;
  brand: string | null;
  sku: string | null;
  score: number;
}

function pickByKeys(node: Record<string, unknown>, keys: string[]): unknown {
  for (const key of Object.keys(node)) {
    if (keys.some((k) => k.toLowerCase() === key.toLowerCase())) {
      return node[key];
    }
  }
  return undefined;
}

function asString(v: unknown): string | null {
  if (typeof v === 'string' && v.trim()) return v.trim();
  if (typeof v === 'number') return String(v);
  return null;
}

function asImageUrl(v: unknown): string | null {
  if (typeof v === 'string' && /^https?:\/\//.test(v.trim())) return v.trim();
  if (Array.isArray(v)) {
    for (const item of v) {
      const url = asImageUrl(item);
      if (url) return url;
    }
  }
  if (v && typeof v === 'object') {
    const obj = v as Record<string, unknown>;
    if (typeof obj.url === 'string') return obj.url;
    if (typeof obj.src === 'string') return obj.src;
  }
  return null;
}

function evaluateNode(node: Record<string, unknown>): XhrCandidate | null {
  const titleRaw = pickByKeys(node, TITLE_FIELDS);
  const priceRaw = pickByKeys(node, PRICE_FIELDS);
  const imageRaw = pickByKeys(node, IMAGE_FIELDS);
  const stockRaw = pickByKeys(node, STOCK_FIELDS);
  const currencyRaw = pickByKeys(node, CURRENCY_FIELDS);
  const brandRaw = pickByKeys(node, BRAND_FIELDS);
  const skuRaw = pickByKeys(node, SKU_FIELDS);

  const title = asString(titleRaw);
  const imageUrl = asImageUrl(imageRaw);
  const currencyHint = asString(currencyRaw);
  const { price, currency } = parsePrice(priceRaw as string | number | null, currencyHint);
  const stockStatus = parseStockStatus(asString(stockRaw));

  if (!title || price === null) return null;
  if (price === 0) return null;

  let score = 5;
  if (imageUrl) score += 2;
  if (currency) score += 1;
  if (stockStatus !== 'unknown') score += 1;
  if (brandRaw) score += 0.5;
  if (skuRaw) score += 0.5;
  if (title.length >= 5) score += 0.5;

  return {
    title,
    imageUrl,
    price,
    currency,
    stockStatus,
    brand: asString(brandRaw),
    sku: asString(skuRaw),
    score,
  };
}

export function findProductInJson(payload: unknown, depth = 0): XhrCandidate | null {
  if (depth > 6 || payload === null || typeof payload !== 'object') return null;

  if (Array.isArray(payload)) {
    let best: XhrCandidate | null = null;
    for (const item of payload) {
      const found = findProductInJson(item, depth + 1);
      if (found && (!best || found.score > best.score)) best = found;
    }
    return best;
  }

  const node = payload as Record<string, unknown>;
  const direct = evaluateNode(node);
  let best = direct;

  for (const value of Object.values(node)) {
    if (value && typeof value === 'object') {
      const nested = findProductInJson(value, depth + 1);
      if (nested && (!best || nested.score > best.score)) best = nested;
    }
  }

  return best;
}
