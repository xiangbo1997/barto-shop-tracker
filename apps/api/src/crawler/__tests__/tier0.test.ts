import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseJsonLd } from '../jsonld.ts';
import { parseOpenGraph } from '../og.ts';

function fixture(name: string): string {
  return readFileSync(resolve(import.meta.dir, '../__fixtures__', name), 'utf8');
}

describe('parseJsonLd', () => {
  test('extracts standard Product schema with InStock', () => {
    const html = fixture('jsonld-product.html');
    const result = parseJsonLd(html);
    expect(result).not.toBeNull();
    expect(result?.title).toBe('Adidas Ultra Boost 22 — Black');
    expect(result?.imageUrl).toBe('https://example.com/img/uboost.jpg');
    expect(result?.brand).toBe('Adidas');
    expect(result?.sku).toBe('GZ0127');
    expect(result?.price).toBe(189.99);
    expect(result?.currency).toBe('USD');
    expect(result?.stockStatus).toBe('in_stock');
  });

  test('handles @graph wrapper and OutOfStock', () => {
    const html = fixture('jsonld-graph-out-of-stock.html');
    const result = parseJsonLd(html);
    expect(result).not.toBeNull();
    expect(result?.title).toBe('Leica M6 复刻版');
    expect(result?.imageUrl).toBe('https://cdn.example.com/leica1.jpg');
    expect(result?.brand).toBe('Leica');
    expect(result?.price).toBe(4999);
    expect(result?.currency).toBe('CNY');
    expect(result?.stockStatus).toBe('out_of_stock');
  });

  test('returns null on empty SPA shell', () => {
    const html = fixture('empty-spa.html');
    expect(parseJsonLd(html)).toBeNull();
  });
});

describe('parseOpenGraph', () => {
  test('parses CN OG tags with full-width yen', () => {
    const html = fixture('og-only.html');
    const result = parseOpenGraph(html);
    expect(result).not.toBeNull();
    expect(result?.title).toBe('北海道生巧克力礼盒 12 颗装');
    expect(result?.imageUrl).toBe('https://example.com/choco.jpg');
    expect(result?.price).toBe(128);
    expect(result?.currency).toBe('CNY');
    expect(result?.stockStatus).toBe('in_stock');
  });

  test('detects Chinese sold-out copy', () => {
    const html = fixture('cn-soldout.html');
    const result = parseOpenGraph(html);
    expect(result?.title).toBe('日本城野医生面膜');
    expect(result?.price).toBe(299);
    expect(result?.currency).toBe('CNY');
    expect(result?.stockStatus).toBe('out_of_stock');
  });

  test('SPA shell yields title fallback but no price/image (Tier 0 should miss)', () => {
    const html = fixture('empty-spa.html');
    const result = parseOpenGraph(html);
    expect(result?.imageUrl).toBeNull();
    expect(result?.price).toBeNull();
  });
});
