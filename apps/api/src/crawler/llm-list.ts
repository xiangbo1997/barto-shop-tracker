import OpenAI from 'openai';
import type { StockStatus } from '@barto/shared';
import { resolveLlm, resolveScrape } from '../lib/settings.ts';
import { parsePrice, parseStockStatus } from './normalize.ts';

/**
 * 店铺/列表页展开：用反爬平台拿渲染后的 Markdown，再用 LLM 提取多个商品。
 * 适配任意发卡/电商列表页（不写平台专用解析器）。
 */

export interface ExpandedProduct {
  title: string;
  price: number | null;
  currency: string | null;
  stockStatus: StockStatus;
  buyUrl: string | null;
}

interface LlmProductRaw {
  title?: string;
  price?: string | number;
  currency?: string;
  stock?: string;
  url?: string;
}

/** 调反爬平台拿列表页 Markdown（正文清洗，省 token）。 */
async function fetchListingMarkdown(url: string): Promise<string | null> {
  const scrape = await resolveScrape();
  if (!scrape.apiKey) return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), scrape.timeoutMs);
  try {
    const res = await fetch(`${scrape.apiUrl}/scrape`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-API-Key': scrape.apiKey },
      body: JSON.stringify({ url, format: 'markdown', scroll: true, delay: 6 }),
      signal: controller.signal,
    });
    if (!res.ok) return null;
    const body = (await res.json()) as { markdown?: string };
    return body.markdown ?? null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

const SYSTEM_PROMPT = `你是电商页面解析器。用户给你一个店铺/列表页的 Markdown，请提取页面上**所有真实在售商品**。
严格要求：
- 只提取商品（有名称+价格的条目），忽略导航、公告、店铺简介、页脚、分类标题。
- price 必须是数字（去掉货币符号、千分位）；若有划线原价与现价，取现价。
- stock 用 "in_stock"（有货/库存充足/库存一般）或 "out_of_stock"（缺货/售罄/无货）。
- url 为该商品的购买/详情链接（若 Markdown 中有），否则置空。
- 返回 JSON：{"products":[{"title","price","currency","stock","url"}]}。不要任何额外文字。`;

/**
 * 从列表页 Markdown 用 LLM 提取多商品。失败返回空数组。
 */
export async function expandListingWithLlm(url: string): Promise<ExpandedProduct[]> {
  const llm = await resolveLlm();
  if (!llm.enabled || !llm.baseUrl || !llm.apiKey) return [];

  const markdown = await fetchListingMarkdown(url);
  if (!markdown || markdown.length < 30) return [];

  const client = new OpenAI({ baseURL: llm.baseUrl, apiKey: llm.apiKey });

  let content: string;
  try {
    const completion = await client.chat.completions.create({
      model: llm.model,
      temperature: 0,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        // 截断超长 Markdown，控制 token（列表页正文通常足够）
        { role: 'user', content: markdown.slice(0, 12000) },
      ],
    });
    content = completion.choices[0]?.message?.content ?? '';
  } catch (err) {
    console.error('[llm-list] LLM call failed:', err instanceof Error ? err.message : err);
    return [];
  }

  let parsed: { products?: LlmProductRaw[] };
  try {
    parsed = JSON.parse(content) as { products?: LlmProductRaw[] };
  } catch {
    return [];
  }

  const raw = Array.isArray(parsed.products) ? parsed.products : [];
  const out: ExpandedProduct[] = [];
  for (const r of raw) {
    const title = typeof r.title === 'string' ? r.title.trim() : '';
    if (!title) continue;
    const { price, currency } = parsePrice(r.price ?? null, r.currency ?? null);
    const stockStatus = r.stock
      ? parseStockStatus(r.stock)
      : ('unknown' as StockStatus);
    out.push({
      title,
      price,
      currency,
      stockStatus,
      buyUrl: typeof r.url === 'string' && r.url.startsWith('http') ? r.url : null,
    });
  }
  return out;
}
