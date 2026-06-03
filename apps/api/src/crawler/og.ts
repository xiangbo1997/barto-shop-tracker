import * as cheerio from 'cheerio';
import { parsePrice, parseStockStatus } from './normalize.ts';
import type { StockStatus } from '@barto/shared';

interface OgProduct {
  title: string | null;
  imageUrl: string | null;
  price: number | null;
  currency: string | null;
  stockStatus: StockStatus;
}

function meta($: cheerio.CheerioAPI, names: string[]): string | null {
  for (const name of names) {
    const v =
      $(`meta[property="${name}"]`).attr('content') ??
      $(`meta[name="${name}"]`).attr('content') ??
      $(`meta[itemprop="${name}"]`).attr('content');
    if (v && v.trim()) return v.trim();
  }
  return null;
}

export function parseOpenGraph(html: string): OgProduct | null {
  const $ = cheerio.load(html);

  const titleMeta = meta($, ['og:title', 'twitter:title']);
  const titleTag = $('title').first().text().trim();
  const title = titleMeta ?? (titleTag.length > 0 ? titleTag : null);

  const imageUrl = meta($, ['og:image', 'og:image:secure_url', 'twitter:image']);

  const priceRaw =
    meta($, ['product:price:amount', 'og:price:amount', 'twitter:data1', 'price']) ?? null;
  const currencyHint = meta($, ['product:price:currency', 'og:price:currency']) ?? null;
  const { price, currency } = parsePrice(priceRaw, currencyHint);

  const availabilityRaw = meta($, ['product:availability', 'og:availability']);
  const stockStatus = parseStockStatus(availabilityRaw);

  if (!title && !imageUrl && price === null) return null;

  return { title, imageUrl, price, currency, stockStatus };
}
