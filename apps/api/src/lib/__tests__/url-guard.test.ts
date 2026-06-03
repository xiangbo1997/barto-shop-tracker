import { describe, expect, test } from 'bun:test';
import { isPrivateIp, guardUrl } from '../url-guard.ts';

describe('isPrivateIp (IPv4)', () => {
  test('blocks cloud metadata 169.254.169.254', () => {
    expect(isPrivateIp('169.254.169.254')).toBe(true);
  });
  test('blocks 10.x', () => expect(isPrivateIp('10.1.2.3')).toBe(true));
  test('blocks 192.168.x', () => expect(isPrivateIp('192.168.0.1')).toBe(true));
  test('blocks 172.16-31.x', () => {
    expect(isPrivateIp('172.16.0.1')).toBe(true);
    expect(isPrivateIp('172.31.255.255')).toBe(true);
  });
  test('allows 172.32.x (public)', () => expect(isPrivateIp('172.32.0.1')).toBe(false));
  test('blocks loopback 127.x', () => expect(isPrivateIp('127.0.0.1')).toBe(true));
  test('blocks CGNAT 100.64.x', () => expect(isPrivateIp('100.64.0.1')).toBe(true));
  test('allows public 8.8.8.8', () => expect(isPrivateIp('8.8.8.8')).toBe(false));
  test('allows public 1.1.1.1', () => expect(isPrivateIp('1.1.1.1')).toBe(false));
});

describe('isPrivateIp (IPv6)', () => {
  test('blocks ::1 loopback', () => expect(isPrivateIp('::1')).toBe(true));
  test('blocks fc00::/7 ULA', () => expect(isPrivateIp('fd12:3456::1')).toBe(true));
  test('blocks fe80 link-local', () => expect(isPrivateIp('fe80::1')).toBe(true));
  test('blocks IPv4-mapped private', () => expect(isPrivateIp('::ffff:192.168.0.1')).toBe(true));
  test('allows public IPv6', () => expect(isPrivateIp('2606:4700:4700::1111')).toBe(false));
});

describe('guardUrl protocol & IP-literal checks', () => {
  test('rejects file://', async () => {
    const r = await guardUrl('file:///etc/passwd');
    expect(r.ok).toBe(false);
  });
  test('rejects gopher://', async () => {
    const r = await guardUrl('gopher://evil/');
    expect(r.ok).toBe(false);
  });
  test('rejects http to private IP literal', async () => {
    const r = await guardUrl('http://169.254.169.254/latest/meta-data/');
    expect(r.ok).toBe(false);
    expect(r.reason).toContain('private');
  });
  test('rejects garbage', async () => {
    const r = await guardUrl('not a url');
    expect(r.ok).toBe(false);
  });
});
