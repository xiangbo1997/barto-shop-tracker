import * as cheerio from 'cheerio';
import { parsePrice, parseStockStatus } from './normalize.ts';
import type { StockStatus } from '@barto/shared';

interface JsonLdProduct {
  title: string | null;
  imageUrl: string | null;
  brand: string | null;
  sku: string | null;
  price: number | null;
  currency: string | null;
  stockStatus: StockStatus;
}

function unwrap(node: unknown): Record<string, unknown> | null {
  if (!node || typeof node !== 'object') return null;
  if (Array.isArray(node)) {
    for (const item of node) {
      const found = unwrap(item);
      if (found) return found;
    }
    return null;
  }
  return node as Record<string, unknown>;
}

function pickProduct(node: unknown): Record<string, unknown> | null {
  const obj = unwrap(node);
  if (!obj) return null;

  const type = obj['@type'];
  const types = Array.isArray(type) ? type : [type];
  if (types.some((t) => typeof t === 'string' && t.toLowerCase() === 'product')) {
    return obj;
  }

  if (Array.isArray(obj['@graph'])) {
    for (const item of obj['@graph']) {
      const found = pickProduct(item);
      if (found) return found;
    }
  }
  return null;
}

function pickFirstString(value: unknown): string | null {
  if (typeof value === 'string' && value.trim()) return value.trim();
  if (Array.isArray(value)) {
    for (const item of value) {
      const v = pickFirstString(item);
      if (v) return v;
    }
  }
  if (value && typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    if (typeof obj.url === 'string') return obj.url;
    if (typeof obj.name === 'string') return obj.name;
    if (typeof obj['@id'] === 'string') return obj['@id'];
  }
  return null;
}

function extractOffer(product: Record<string, unknown>): {
  price: number | null;
  currency: string | null;
  stockStatus: StockStatus;
} {
  const offers = product.offers;
  const offer = unwrap(offers);
  if (!offer) return { price: null, currency: null, stockStatus: 'unknown' };

  const rawPrice = offer.price ?? offer.lowPrice ?? offer.highPrice;
  const currency = pickFirstString(offer.priceCurrency);
  const { price, currency: detectedCurrency } = parsePrice(rawPrice as string | number | null, currency);

  const availability = pickFirstString(offer.availability);
  const stockStatus = parseStockStatus(availability);

  return { price, currency: detectedCurrency, stockStatus };
}

export function parseJsonLd(html: string): JsonLdProduct | null {
  const $ = cheerio.load(html);
  const scripts = $('script[type="application/ld+json"]').toArray();

  for (const script of scripts) {
    const text = $(script).text().trim();
    if (!text) continue;
    let data: unknown;
    try {
      data = JSON.parse(text);
    } catch {
      continue;
    }
    const product = pickProduct(data);
    if (!product) continue;

    const offer = extractOffer(product);
    return {
      title: pickFirstString(product.name),
      imageUrl: pickFirstString(product.image),
      brand: pickFirstString(product.brand),
      sku: pickFirstString(product.sku) ?? pickFirstString(product.mpn),
      price: offer.price,
      currency: offer.currency,
      stockStatus: offer.stockStatus,
    };
  }

  return null;
}
