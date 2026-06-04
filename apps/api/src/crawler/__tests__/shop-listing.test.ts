import { describe, expect, test } from 'bun:test';
import { looksLikeShopListing } from '../index.ts';

describe('looksLikeShopListing', () => {
  // 列表页 → true
  test('/products（复数）', () => expect(looksLikeShopListing('https://wmemail.com/products')).toBe(true));
  test('/shop/x', () => expect(looksLikeShopListing('https://pay.ldxp.cn/shop/pixelshop')).toBe(true));
  test('/cat/11', () => expect(looksLikeShopListing('https://caowo.store/cat/11')).toBe(true));
  test('根路径 /', () => expect(looksLikeShopListing('https://mamabt.top/')).toBe(true));
  test('/goods', () => expect(looksLikeShopListing('https://x.com/goods')).toBe(true));
  test('/category/ai', () => expect(looksLikeShopListing('https://x.com/category/ai')).toBe(true));

  // 单品页 → false（单数 + id 不应被误判为列表）
  test('/product/123（单数）', () => expect(looksLikeShopListing('https://x.com/product/123')).toBe(false));
  test('/item/456（单数）', () => expect(looksLikeShopListing('https://x.com/item/456')).toBe(false));
  test('/buy/789', () => expect(looksLikeShopListing('https://x.com/buy/789')).toBe(false));
  test('invalid url', () => expect(looksLikeShopListing('not a url')).toBe(false));
});
