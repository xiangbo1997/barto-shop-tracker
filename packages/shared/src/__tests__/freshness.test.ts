import { describe, expect, test } from 'bun:test';
import {
  FETCH_TIER,
  FRESHNESS_STATUS,
  FRESHNESS_STALE_GRACE_MS,
  computeExpiresAt,
  computeFreshness,
} from '../index.ts';

const HOUR = 60 * 60 * 1000;

describe('computeExpiresAt', () => {
  test('static tier → 24h TTL', () => {
    const from = new Date('2026-06-03T00:00:00Z');
    const exp = computeExpiresAt(FETCH_TIER.STATIC, from);
    expect(exp.getTime() - from.getTime()).toBe(24 * HOUR);
  });

  test('browser tier → 12h TTL', () => {
    const from = new Date('2026-06-03T00:00:00Z');
    const exp = computeExpiresAt(FETCH_TIER.BROWSER, from);
    expect(exp.getTime() - from.getTime()).toBe(12 * HOUR);
  });

  test('llm tier → 48h TTL', () => {
    const from = new Date('2026-06-03T00:00:00Z');
    const exp = computeExpiresAt(FETCH_TIER.LLM, from);
    expect(exp.getTime() - from.getTime()).toBe(48 * HOUR);
  });
});

describe('computeFreshness', () => {
  const verified = new Date('2026-06-03T00:00:00Z');
  const expires = new Date('2026-06-03T12:00:00Z'); // 12h TTL

  test('error → failed', () => {
    expect(computeFreshness(verified, expires, true, verified)).toBe(FRESHNESS_STATUS.FAILED);
  });

  test('never fetched → expired', () => {
    expect(computeFreshness(null, null, false, verified)).toBe(FRESHNESS_STATUS.EXPIRED);
  });

  test('just verified → fresh', () => {
    const now = new Date(verified.getTime() + 1 * HOUR);
    expect(computeFreshness(verified, expires, false, now)).toBe(FRESHNESS_STATUS.FRESH);
  });

  test('past half-TTL → aging', () => {
    const now = new Date(verified.getTime() + 7 * HOUR); // >6h (half of 12h)
    expect(computeFreshness(verified, expires, false, now)).toBe(FRESHNESS_STATUS.AGING);
  });

  test('just past expiry, within grace → stale', () => {
    const now = new Date(expires.getTime() + 1 * HOUR);
    expect(computeFreshness(verified, expires, false, now)).toBe(FRESHNESS_STATUS.STALE);
  });

  test('past expiry beyond grace → expired', () => {
    const now = new Date(expires.getTime() + FRESHNESS_STALE_GRACE_MS + 1 * HOUR);
    expect(computeFreshness(verified, expires, false, now)).toBe(FRESHNESS_STATUS.EXPIRED);
  });

  test('accepts ISO strings', () => {
    const now = new Date(verified.getTime() + 1 * HOUR);
    expect(
      computeFreshness(verified.toISOString(), expires.toISOString(), false, now)
    ).toBe(FRESHNESS_STATUS.FRESH);
  });

  test('invalid date strings → expired', () => {
    expect(computeFreshness('not-a-date', 'nope', false, verified)).toBe(FRESHNESS_STATUS.EXPIRED);
  });
});

import { classifyTitle, CATEGORY } from '../index.ts';

describe('classifyTitle', () => {
  test('API/CDK', () => expect(classifyTitle('中转1刀 API额度')).toBe(CATEGORY.API_CREDIT));
  test('接码', () => expect(classifyTitle('美国接码 短信验证码')).toBe(CATEGORY.SMS));
  test('邮箱', () => expect(classifyTitle('微软邮箱（张密）')).toBe(CATEGORY.EMAIL));
  test('ChatGPT', () => expect(classifyTitle('ChatGPT Plus 成品号')).toBe(CATEGORY.CHATGPT));
  test('Claude', () => expect(classifyTitle('Claude 普号 账密直登')).toBe(CATEGORY.CLAUDE));
  test('Gemini', () => expect(classifyTitle('Gemini Pro 一年会员')).toBe(CATEGORY.GEMINI));
  test('Grok', () => expect(classifyTitle('Super Grok 月卡')).toBe(CATEGORY.GROK));
  test('订阅', () => expect(classifyTitle('Netflix 4K 独享车')).toBe(CATEGORY.SUBSCRIPTION));
  test('其他账号', () => expect(classifyTitle('TikTok 直登成品号')).toBe(CATEGORY.ACCOUNT));
  test('无标题→other', () => expect(classifyTitle(null)).toBe(CATEGORY.OTHER));
  test('海淘实物→other', () => expect(classifyTitle('日本制 保温杯')).toBe(CATEGORY.OTHER));
  // 新增分类
  test('虚拟卡', () => expect(classifyTitle('美区 Visa 虚拟卡 自动发卡')).toBe(CATEGORY.VIRTUAL_CARD));
  test('万事达虚拟卡', () => expect(classifyTitle('万事达虚拟信用卡 充值')).toBe(CATEGORY.VIRTUAL_CARD));
  test('Apple ID', () => expect(classifyTitle('美区 Apple ID 全新成品')).toBe(CATEGORY.APPLE_ID));
  test('苹果账号→Apple ID', () => expect(classifyTitle('iCloud 苹果账号 带密保')).toBe(CATEGORY.APPLE_ID));
  // 平台优先于「接码/账号」修饰词（修复 GPT普号被误归接码的 bug）
  test('GPT普号含"接码登录"→ChatGPT', () =>
    expect(classifyTitle('GPT普号|Free Plan成品|rt 格式|不支持接码登录')).toBe(CATEGORY.CHATGPT));
  test('Codex普号含"手机接码解锁"→ChatGPT', () =>
    expect(classifyTitle('Codex普号|账密直登+RT|Codex已经过手机接码解锁|长效邮箱')).toBe(CATEGORY.CHATGPT));
  test('纯接码商品仍归 SMS', () =>
    expect(classifyTitle('自动发货 Codex接码（美区）单次接码')).toBe(CATEGORY.SMS));
});
