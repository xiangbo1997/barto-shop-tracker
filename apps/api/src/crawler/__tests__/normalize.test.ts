import { describe, expect, test } from 'bun:test';
import { parsePrice, parseStockStatus } from '../normalize.ts';

describe('parsePrice', () => {
  test('CNY symbol with comma', () => {
    expect(parsePrice('¥1,299.00')).toEqual({ price: 1299, currency: 'CNY' });
  });

  test('USD symbol', () => {
    expect(parsePrice('$19.99')).toEqual({ price: 19.99, currency: 'USD' });
  });

  test('explicit currency code overrides hint', () => {
    expect(parsePrice('USD 50', 'CNY')).toEqual({ price: 50, currency: 'USD' });
  });

  test('Chinese yuan full-width', () => {
    expect(parsePrice('￥299起')).toEqual({ price: 299, currency: 'CNY' });
  });

  test('hint when no currency in string', () => {
    expect(parsePrice('189.99', 'USD')).toEqual({ price: 189.99, currency: 'USD' });
  });

  test('numeric input', () => {
    expect(parsePrice(4999, 'CNY')).toEqual({ price: 4999, currency: 'CNY' });
  });

  test('null input', () => {
    expect(parsePrice(null)).toEqual({ price: null, currency: null });
  });

  test('non-price string', () => {
    expect(parsePrice('contact us')).toEqual({ price: null, currency: null });
  });

  test('RMB normalized to CNY', () => {
    expect(parsePrice('RMB 99')).toEqual({ price: 99, currency: 'CNY' });
  });
});

describe('parseStockStatus', () => {
  test('schema.org InStock URL', () => {
    expect(parseStockStatus('https://schema.org/InStock')).toBe('in_stock');
  });

  test('schema.org OutOfStock URL', () => {
    expect(parseStockStatus('http://schema.org/OutOfStock')).toBe('out_of_stock');
  });

  test('plain English in stock', () => {
    expect(parseStockStatus('in stock')).toBe('in_stock');
  });

  test('Chinese 已售罄', () => {
    expect(parseStockStatus('已售罄')).toBe('out_of_stock');
  });

  test('Chinese 现货', () => {
    expect(parseStockStatus('现货')).toBe('in_stock');
  });

  test('null returns unknown', () => {
    expect(parseStockStatus(null)).toBe('unknown');
  });

  test('garbage returns unknown', () => {
    expect(parseStockStatus('foo bar baz')).toBe('unknown');
  });

  test('库存：608 → in_stock（发卡站格式）', () => {
    expect(parseStockStatus('¥3.99 库存：608已售：1499')).toBe('in_stock');
  });

  test('库存：0 → out_of_stock', () => {
    expect(parseStockStatus('库存：0已售：6813')).toBe('out_of_stock');
  });

  test('剩余 5 → in_stock', () => {
    expect(parseStockStatus('剩余 5 件')).toBe('in_stock');
  });

  test('明确售罄优先于库存数字', () => {
    expect(parseStockStatus('库存：0 售罄')).toBe('out_of_stock');
  });
});
