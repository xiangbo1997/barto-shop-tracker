import { describe, expect, test } from 'bun:test';
import { findProductInJson } from '../xhr-sniffer.ts';

describe('findProductInJson', () => {
  test('extracts flat product object', () => {
    const payload = {
      title: 'Adidas Ultra Boost',
      price: 189.99,
      priceCurrency: 'USD',
      imageUrl: 'https://example.com/img.jpg',
      availability: 'in stock',
    };
    const result = findProductInJson(payload);
    expect(result).not.toBeNull();
    expect(result?.title).toBe('Adidas Ultra Boost');
    expect(result?.price).toBe(189.99);
    expect(result?.currency).toBe('USD');
    expect(result?.imageUrl).toBe('https://example.com/img.jpg');
    expect(result?.stockStatus).toBe('in_stock');
  });

  test('descends into nested data wrapper', () => {
    const payload = {
      code: 0,
      data: {
        product: {
          name: '皮蛋瘦肉粥',
          salePrice: '12.50',
          currency: 'CNY',
          mainImage: { url: 'https://cdn.example.com/zhou.jpg' },
          inStock: true,
        },
      },
    };
    const result = findProductInJson(payload);
    expect(result?.title).toBe('皮蛋瘦肉粥');
    expect(result?.price).toBe(12.5);
    expect(result?.currency).toBe('CNY');
    expect(result?.imageUrl).toBe('https://cdn.example.com/zhou.jpg');
  });

  test('picks highest-scoring among multiple candidates', () => {
    const payload = {
      header: { title: 'Header Title', amount: 0 },
      body: {
        product: {
          productName: '主角商品',
          currentPrice: 99,
          currency: 'CNY',
          coverImage: 'https://example.com/cover.jpg',
          stockStatus: 'in_stock',
        },
      },
    };
    const result = findProductInJson(payload);
    expect(result?.title).toBe('主角商品');
    expect(result?.price).toBe(99);
  });

  test('returns null when score below threshold', () => {
    const payload = { foo: 'bar', meta: { x: 1 } };
    expect(findProductInJson(payload)).toBeNull();
  });

  test('handles array of products', () => {
    const payload = [
      { title: 'A', price: 10, image: 'https://a.com/a.jpg' },
      { title: 'B', price: 20, image: 'https://a.com/b.jpg', currency: 'USD', availability: 'in stock' },
    ];
    const result = findProductInJson(payload);
    expect(result?.title).toBe('B');
    expect(result?.price).toBe(20);
  });
});
