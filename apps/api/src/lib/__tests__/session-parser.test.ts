import { describe, expect, test } from 'bun:test';
import {
  detectCookieFormat,
  maskCookieValue,
  parseCookies,
  parseLocalStorage,
} from '../session-parser.ts';

describe('detectCookieFormat', () => {
  test('detects header format', () => {
    expect(detectCookieFormat('a=1; b=2')).toBe('header');
  });
  test('detects JSON array', () => {
    expect(detectCookieFormat('[{"name":"a","value":"1"}]')).toBe('json');
  });
  test('detects JSON object', () => {
    expect(detectCookieFormat('{"a":"1"}')).toBe('json');
  });
  test('unknown for empty', () => {
    expect(detectCookieFormat('')).toBe('unknown');
  });
  test('unknown for garbage', () => {
    expect(detectCookieFormat('hello world')).toBe('unknown');
  });
});

describe('parseCookies header format', () => {
  test('parses standard "k=v; k=v"', () => {
    const r = parseCookies('sid=abc; uid=42');
    expect(r.ok).toBe(true);
    expect(r.data).toEqual([
      { name: 'sid', value: 'abc' },
      { name: 'uid', value: '42' },
    ]);
  });

  test('handles whitespace and newlines', () => {
    const r = parseCookies('  a=1\nb=2 ; c=3\n');
    expect(r.ok).toBe(true);
    expect(r.data?.map((c) => c.name)).toEqual(['a', 'b', 'c']);
  });

  test('preserves = inside value', () => {
    const r = parseCookies('token=abc=def=ghi');
    expect(r.data?.[0]).toEqual({ name: 'token', value: 'abc=def=ghi' });
  });

  test('warns about missing domain in header format', () => {
    const r = parseCookies('a=1');
    expect(r.warnings.length).toBeGreaterThan(0);
  });

  test('rejects empty input', () => {
    const r = parseCookies('   ');
    expect(r.ok).toBe(false);
  });
});

describe('parseCookies JSON format', () => {
  test('parses DevTools cookie array', () => {
    const json = JSON.stringify([
      { name: 'sid', value: 'xxx', domain: '.example.com', path: '/', httpOnly: true, secure: true },
      { name: 'uid', value: '42', domain: 'example.com', sameSite: 'Lax' },
    ]);
    const r = parseCookies(json);
    expect(r.ok).toBe(true);
    expect(r.data?.[0]).toMatchObject({ name: 'sid', value: 'xxx', domain: '.example.com', httpOnly: true });
    expect(r.data?.[1]?.sameSite).toBe('Lax');
  });

  test('handles expirationDate alias from EditThisCookie', () => {
    const json = JSON.stringify([{ name: 'a', value: '1', expirationDate: 1700000000 }]);
    const r = parseCookies(json);
    expect(r.data?.[0]?.expires).toBe(1700000000);
  });

  test('skips invalid items but keeps valid ones', () => {
    const json = JSON.stringify([
      { name: 'good', value: '1' },
      { value: 'no-name' },
      'string-not-object',
    ]);
    const r = parseCookies(json);
    expect(r.ok).toBe(true);
    expect(r.data?.length).toBe(1);
    expect(r.errors.length).toBe(2);
  });

  test('rejects malformed JSON', () => {
    const r = parseCookies('[{name:noquote}]');
    expect(r.ok).toBe(false);
    expect(r.errors[0]).toContain('JSON');
  });
});

describe('parseLocalStorage', () => {
  test('empty input returns ok with empty object', () => {
    expect(parseLocalStorage('')).toEqual({ ok: true, data: {}, errors: [], warnings: [] });
  });

  test('parses string values', () => {
    const r = parseLocalStorage('{"theme":"dark","lang":"zh"}');
    expect(r.data).toEqual({ theme: 'dark', lang: 'zh' });
  });

  test('serializes object/number values to string', () => {
    const r = parseLocalStorage('{"cart":{"items":[1,2]},"count":3}');
    expect(r.data?.cart).toBe('{"items":[1,2]}');
    expect(r.data?.count).toBe('3');
  });

  test('rejects array', () => {
    const r = parseLocalStorage('[1,2]');
    expect(r.ok).toBe(false);
  });
});

describe('maskCookieValue', () => {
  test('short value', () => {
    expect(maskCookieValue('ab')).toBe('****');
  });
  test('medium value', () => {
    expect(maskCookieValue('abcdef')).toBe('ab…ef');
  });
  test('long value', () => {
    const v = 'a'.repeat(20);
    expect(maskCookieValue(v)).toContain('len=20');
  });
});
