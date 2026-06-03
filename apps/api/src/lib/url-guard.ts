import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';

/**
 * URL 安全校验 —— SSRF 防御。
 *
 * barto 本质是"接受用户粘贴 URL → 服务端发起抓取"的请求代理，是 SSRF 高危场景：
 * 攻击者可粘贴云元数据端点（169.254.169.254）窃取凭证，或探测内网服务。
 * 借鉴 PriceAI 的 ensurePublicHost（src/lib/admin.ts:521-563）：
 *   1. 仅允许 http/https，挡掉 file:// gopher:// 等协议
 *   2. DNS 解析后检查所有返回 IP 是否落在私有/保留段
 */

export interface UrlGuardResult {
  ok: boolean;
  normalized?: string;
  host?: string;
  reason?: string;
}

/** 判断单个 IP 字面量是否属于私有/保留/回环段（IPv4 + IPv6）。 */
export function isPrivateIp(ip: string): boolean {
  const family = isIP(ip);
  if (family === 4) {
    const parts = ip.split('.').map(Number);
    const [a, b] = parts;
    if (a === undefined || b === undefined) return true;
    if (a === 10) return true; // 10.0.0.0/8
    if (a === 127) return true; // 127.0.0.0/8 回环
    if (a === 0) return true; // 0.0.0.0/8
    if (a === 169 && b === 254) return true; // 169.254.0.0/16 链路本地（含云元数据）
    if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12
    if (a === 192 && b === 168) return true; // 192.168.0.0/16
    if (a === 100 && b >= 64 && b <= 127) return true; // 100.64.0.0/10 CGNAT
    if (a >= 224) return true; // 组播 + 保留
    return false;
  }
  if (family === 6) {
    const lower = ip.toLowerCase();
    if (lower === '::1' || lower === '::') return true; // 回环 / 未指定
    if (lower.startsWith('fc') || lower.startsWith('fd')) return true; // fc00::/7 唯一本地
    if (lower.startsWith('fe80')) return true; // 链路本地
    // IPv4-mapped IPv6（::ffff:a.b.c.d）：提取内嵌 IPv4 再判定
    const mapped = lower.match(/::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped && mapped[1]) return isPrivateIp(mapped[1]);
    return false;
  }
  // 非合法 IP 字面量，保守拒绝。
  return true;
}

/**
 * 校验用户提交的 URL 是否可安全抓取，并返回规范化结果。
 * 会发起一次 DNS 解析（异步）。失败/私有地址一律拒绝。
 */
export async function guardUrl(rawUrl: string): Promise<UrlGuardResult> {
  let u: URL;
  try {
    u = new URL(rawUrl);
  } catch {
    return { ok: false, reason: 'invalid url' };
  }

  if (u.protocol !== 'http:' && u.protocol !== 'https:') {
    return { ok: false, reason: `unsupported protocol: ${u.protocol}` };
  }

  const host = u.hostname;
  if (!host) return { ok: false, reason: 'empty host' };

  // host 本身就是 IP 字面量时直接判定，无需 DNS。
  if (isIP(host)) {
    if (isPrivateIp(host)) return { ok: false, reason: `private/reserved IP: ${host}` };
    return { ok: true, normalized: u.toString(), host };
  }

  // 域名：解析所有 A/AAAA 记录，任一落在私有段即拒绝（缓解 DNS rebinding）。
  try {
    const records = await lookup(host, { all: true });
    if (records.length === 0) return { ok: false, reason: 'dns: no records' };
    for (const r of records) {
      if (isPrivateIp(r.address)) {
        return { ok: false, reason: `resolves to private IP: ${r.address}` };
      }
    }
  } catch (err) {
    return { ok: false, reason: `dns lookup failed: ${err instanceof Error ? err.message : 'error'}` };
  }

  return { ok: true, normalized: u.toString(), host };
}
