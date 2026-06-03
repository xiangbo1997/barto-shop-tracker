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
  test('邮箱', () => expect(classifyTitle('微软邮箱（张密）')).toBe(CATEGORY.EMAIL));
  test('ChatGPT Plus → AI 账号', () => expect(classifyTitle('ChatGPT Plus 成品号')).toBe(CATEGORY.AI_ACCOUNT));
  test('Claude 普号', () => expect(classifyTitle('Claude 普号 账密直登')).toBe(CATEGORY.AI_ACCOUNT));
  test('Gemini', () => expect(classifyTitle('Gemini Pro 一年会员')).toBe(CATEGORY.AI_ACCOUNT));
  test('订阅', () => expect(classifyTitle('Netflix 4K 独享车')).toBe(CATEGORY.SUBSCRIPTION));
  test('无标题→other', () => expect(classifyTitle(null)).toBe(CATEGORY.OTHER));
  test('海淘实物→other', () => expect(classifyTitle('日本制 保温杯')).toBe(CATEGORY.OTHER));
});
