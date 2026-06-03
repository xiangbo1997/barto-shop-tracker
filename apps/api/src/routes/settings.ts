import { Hono } from 'hono';
import { getAllSettings, getSetting, setSettings } from '@barto/db';
import { env } from '../lib/env.ts';
import { SETTING_KEYS } from '../lib/settings.ts';

export const settingsRoute = new Hono();

const SENSITIVE = new Set<string>(SETTING_KEYS.sensitive);

// 各配置项的 env 默认值（DB 未配置时的回退，用于在配置页展示"当前生效值"）。
const ENV_DEFAULTS: Record<string, string> = {
  FEATURE_LLM_ENABLED: String(env.FEATURE_LLM_ENABLED),
  LLM_BASE_URL: env.LLM_BASE_URL ?? '',
  LLM_API_KEY: env.LLM_API_KEY ?? '',
  LLM_MODEL: env.LLM_MODEL,
  FEATURE_TIER2_SCRAPE: String(env.FEATURE_TIER2_SCRAPE),
  SCRAPE_API_URL: env.SCRAPE_API_URL,
  SCRAPE_API_KEY: env.SCRAPE_API_KEY ?? '',
  SCRAPE_TIMEOUT_MS: String(env.SCRAPE_TIMEOUT_MS),
  SCRAPER_DEFAULT_TIER: String(env.SCRAPER_DEFAULT_TIER),
  SCRAPER_TIMEOUT_MS: String(env.SCRAPER_TIMEOUT_MS),
  FEATURE_SCHEDULED_REFRESH: String(env.FEATURE_SCHEDULED_REFRESH),
  SCHEDULE_REFRESH_CRON: env.SCHEDULE_REFRESH_CRON,
  SCHEDULE_REFRESH_BATCH: String(env.SCHEDULE_REFRESH_BATCH),
};

function maskTail(v: string): string {
  if (!v) return '';
  if (v.length <= 4) return '••••';
  return `••••${v.slice(-4)}`;
}

/**
 * GET /settings —— 返回所有配置项的当前生效值（DB 优先，回退 env）。
 * 敏感项不返回明文：返回 hasValue + 脱敏尾段。
 */
settingsRoute.get('/', async (c) => {
  const dbVals = await getAllSettings();
  const out: Record<string, { value: string; sensitive: boolean; hasValue: boolean; masked?: string }> = {};

  for (const key of SETTING_KEYS.all) {
    const effective = (dbVals[key] ?? undefined) || ENV_DEFAULTS[key] || '';
    if (SENSITIVE.has(key)) {
      out[key] = { value: '', sensitive: true, hasValue: Boolean(effective), masked: maskTail(effective) };
    } else {
      out[key] = { value: effective, sensitive: false, hasValue: Boolean(effective) };
    }
  }
  return c.json({ data: out });
});

/**
 * PUT /settings —— 保存配置。
 * 敏感项：空值表示"不修改"（保留原 key），非空才更新——用户无需每次重输 key。
 * 非敏感项：原样保存（含空 = 清空）。
 */
settingsRoute.put('/', async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
  const toSave: Record<string, string | null> = {};
  const errors: string[] = [];

  for (const key of SETTING_KEYS.all) {
    if (!(key in body)) continue;
    const raw = body[key];
    const value = raw == null ? '' : String(raw).trim();

    // 敏感项空值 = 保持原值，跳过
    if (SENSITIVE.has(key) && value === '') continue;

    // 简单校验
    if (key.endsWith('_URL') && value && !/^https?:\/\//.test(value)) {
      errors.push(`${key} 必须是 http(s) URL`);
      continue;
    }
    if (key === 'SCRAPER_DEFAULT_TIER' && value && ![ '0', '1', '2' ].includes(value)) {
      errors.push('SCRAPER_DEFAULT_TIER 必须是 0/1/2');
      continue;
    }
    if (key.startsWith('FEATURE_') && value && !['true', 'false'].includes(value)) {
      errors.push(`${key} 必须是 true/false`);
      continue;
    }
    if (key.endsWith('_MS') || key === 'SCHEDULE_REFRESH_BATCH') {
      if (value && !/^\d+$/.test(value)) {
        errors.push(`${key} 必须是数字`);
        continue;
      }
    }
    toSave[key] = value;
  }

  if (errors.length > 0) return c.json({ ok: false, errors }, 400);

  await setSettings(toSave);
  return c.json({ ok: true, saved: Object.keys(toSave).length });
});

/** POST /settings/test-llm —— 用当前配置测试 LLM 连通性（不存值，仅验证）。 */
settingsRoute.post('/test-llm', async (c) => {
  const baseUrl = await getSetting('LLM_BASE_URL', env.LLM_BASE_URL ?? '');
  const apiKey = await getSetting('LLM_API_KEY', env.LLM_API_KEY ?? '');
  const model = await getSetting('LLM_MODEL', env.LLM_MODEL);
  // 注意：测试结果（含失败）一律用 HTTP 200 + body.ok 表达。
  // 不能用 5xx——Cloudflare/代理会用自己的错误页替换 body，导致真实错误信息丢失。
  if (!baseUrl || !apiKey) return c.json({ ok: false, error: '未配置 LLM base_url / key' });

  try {
    const { default: OpenAI } = await import('openai');
    const client = new OpenAI({ baseURL: baseUrl, apiKey, timeout: 20_000, maxRetries: 0 });
    const r = await client.chat.completions.create({
      model: model ?? 'gpt-4o-mini',
      messages: [{ role: 'user', content: 'ping，只回 pong' }],
      max_tokens: 5,
    });
    return c.json({ ok: true, reply: r.choices[0]?.message?.content ?? '(空响应)' });
  } catch (err) {
    return c.json({ ok: false, error: err instanceof Error ? err.message : 'LLM 调用失败' });
  }
});
