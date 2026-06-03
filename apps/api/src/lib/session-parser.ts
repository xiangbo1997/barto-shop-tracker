import type { SessionCookie } from '@barto/db';

export interface ParseOutcome<T> {
  ok: boolean;
  data: T | null;
  errors: string[];
  warnings: string[];
}

export type CookieFormat = 'header' | 'json' | 'unknown';

export function detectCookieFormat(input: string): CookieFormat {
  const trimmed = input.trim();
  if (!trimmed) return 'unknown';
  if (trimmed.startsWith('[') || trimmed.startsWith('{')) return 'json';
  if (/[A-Za-z0-9_-]+=/.test(trimmed)) return 'header';
  return 'unknown';
}

function parseHeaderFormat(input: string): ParseOutcome<SessionCookie[]> {
  const cookies: SessionCookie[] = [];
  const errors: string[] = [];

  for (const segment of input.split(/[;\n]/)) {
    const trimmed = segment.trim();
    if (!trimmed) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx <= 0) {
      errors.push(`无法解析片段：${trimmed.slice(0, 40)}`);
      continue;
    }
    const name = trimmed.slice(0, eqIdx).trim();
    const value = trimmed.slice(eqIdx + 1).trim();
    if (!name) {
      errors.push(`空 cookie 名称：${trimmed.slice(0, 40)}`);
      continue;
    }
    cookies.push({ name, value });
  }

  return {
    ok: cookies.length > 0,
    data: cookies.length > 0 ? cookies : null,
    errors,
    warnings: cookies.length > 0 && errors.length === 0
      ? ['header 格式不含 domain/path/expires，注入时会用 host 默认值']
      : [],
  };
}

function normalizeJsonCookie(raw: unknown, idx: number): { ok: boolean; cookie?: SessionCookie; error?: string } {
  if (!raw || typeof raw !== 'object') {
    return { ok: false, error: `第 ${idx + 1} 项不是对象` };
  }
  const obj = raw as Record<string, unknown>;
  const name = typeof obj.name === 'string' ? obj.name : null;
  const value = typeof obj.value === 'string' ? obj.value : typeof obj.value === 'number' ? String(obj.value) : null;
  if (!name) return { ok: false, error: `第 ${idx + 1} 项缺少 name` };
  if (value === null) return { ok: false, error: `第 ${idx + 1} 项缺少 value` };

  const cookie: SessionCookie = { name, value };
  if (typeof obj.domain === 'string') cookie.domain = obj.domain;
  if (typeof obj.path === 'string') cookie.path = obj.path;
  if (typeof obj.expires === 'number' && Number.isFinite(obj.expires)) cookie.expires = obj.expires;
  if (typeof obj.expirationDate === 'number' && Number.isFinite(obj.expirationDate) && cookie.expires === undefined) {
    cookie.expires = obj.expirationDate;
  }
  if (typeof obj.httpOnly === 'boolean') cookie.httpOnly = obj.httpOnly;
  if (typeof obj.secure === 'boolean') cookie.secure = obj.secure;
  if (typeof obj.sameSite === 'string') {
    const lower = obj.sameSite.toLowerCase();
    if (lower === 'strict') cookie.sameSite = 'Strict';
    else if (lower === 'lax') cookie.sameSite = 'Lax';
    else if (lower === 'none' || lower === 'no_restriction') cookie.sameSite = 'None';
  }
  return { ok: true, cookie };
}

function parseJsonFormat(input: string): ParseOutcome<SessionCookie[]> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(input);
  } catch (err) {
    return {
      ok: false,
      data: null,
      errors: [`JSON 解析失败：${err instanceof Error ? err.message : String(err)}`],
      warnings: [],
    };
  }

  const items = Array.isArray(parsed) ? parsed : [parsed];
  const cookies: SessionCookie[] = [];
  const errors: string[] = [];

  for (let i = 0; i < items.length; i++) {
    const result = normalizeJsonCookie(items[i], i);
    if (result.ok && result.cookie) {
      cookies.push(result.cookie);
    } else if (result.error) {
      errors.push(result.error);
    }
  }

  return {
    ok: cookies.length > 0,
    data: cookies.length > 0 ? cookies : null,
    errors,
    warnings: [],
  };
}

export function parseCookies(input: string): ParseOutcome<SessionCookie[]> {
  const trimmed = input.trim();
  if (!trimmed) {
    return { ok: false, data: null, errors: ['cookies 输入为空'], warnings: [] };
  }
  const format = detectCookieFormat(trimmed);
  if (format === 'json') return parseJsonFormat(trimmed);
  if (format === 'header') return parseHeaderFormat(trimmed);
  return {
    ok: false,
    data: null,
    errors: ['无法识别 cookie 格式（不是 JSON 也不是 "k=v; k=v" 形式）'],
    warnings: [],
  };
}

export function parseLocalStorage(input: string | null | undefined): ParseOutcome<Record<string, string>> {
  if (!input || !input.trim()) {
    return { ok: true, data: {}, errors: [], warnings: [] };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(input);
  } catch (err) {
    return {
      ok: false,
      data: null,
      errors: [`localStorage 必须是 JSON 对象：${err instanceof Error ? err.message : String(err)}`],
      warnings: [],
    };
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { ok: false, data: null, errors: ['localStorage 必须是 JSON 对象（不是数组）'], warnings: [] };
  }
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
    if (typeof value === 'string') out[key] = value;
    else if (value === null || value === undefined) continue;
    else out[key] = JSON.stringify(value);
  }
  return { ok: true, data: out, errors: [], warnings: [] };
}

export function maskCookieValue(value: string): string {
  if (value.length <= 4) return '****';
  if (value.length <= 12) return `${value.slice(0, 2)}…${value.slice(-2)}`;
  return `${value.slice(0, 4)}…${value.slice(-4)} (len=${value.length})`;
}

export function maskCookies(cookies: SessionCookie[]): Array<{ name: string; preview: string; httpOnly?: boolean; secure?: boolean }> {
  return cookies.map((c) => ({
    name: c.name,
    preview: maskCookieValue(c.value),
    httpOnly: c.httpOnly,
    secure: c.secure,
  }));
}
