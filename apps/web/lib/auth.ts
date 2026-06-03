// 轻量鉴权：HMAC 签名 cookie session，无需 DB/Redis（单用户自用工具够用）。
// 凭据与密钥来自环境变量，server-only（仅在 route handler / middleware 中使用）。

const COOKIE_NAME = 'barto_session';
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 天

export { COOKIE_NAME };

function getSecret(): string {
  const s = process.env.APP_AUTH_SECRET;
  if (!s || s.length < 16) {
    throw new Error('APP_AUTH_SECRET 未配置或过短（需 ≥16 字符）');
  }
  return s;
}

function b64url(bytes: ArrayBuffer | Uint8Array): string {
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let bin = '';
  for (const b of arr) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function b64urlToBytes(s: string): Uint8Array {
  const pad = s.length % 4 === 0 ? '' : '='.repeat(4 - (s.length % 4));
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/') + pad);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function hmac(payload: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(getSecret()),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload));
  return b64url(sig);
}

/** 恒定时间字符串比较，避免时序攻击。 */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** 校验用户名密码（与 env 凭据恒定时间比对）。 */
export function verifyCredentials(user: string, password: string): boolean {
  const expectedUser = process.env.APP_AUTH_USER ?? '';
  const expectedPass = process.env.APP_AUTH_PASSWORD ?? '';
  if (!expectedUser || !expectedPass) return false;
  // 两个比较都执行，避免因用户名先失败而泄露时序差异。
  const okUser = timingSafeEqual(user, expectedUser);
  const okPass = timingSafeEqual(password, expectedPass);
  return okUser && okPass;
}

/** 签发 session token：payload = base64url(JSON{user,exp})，附 HMAC 签名。 */
export async function issueSession(user: string): Promise<string> {
  const payload = { user, exp: Date.now() + SESSION_TTL_MS };
  const body = b64url(new TextEncoder().encode(JSON.stringify(payload)));
  const sig = await hmac(body);
  return `${body}.${sig}`;
}

/** 校验 session token：签名正确且未过期才返回 user。 */
export async function verifySession(token: string | undefined): Promise<string | null> {
  if (!token) return null;
  const dot = token.indexOf('.');
  if (dot < 0) return null;
  const body = token.slice(0, dot);
  const sig = token.slice(dot + 1);

  const expected = await hmac(body);
  if (!timingSafeEqual(sig, expected)) return null;

  try {
    const json = JSON.parse(new TextDecoder().decode(b64urlToBytes(body))) as {
      user: string;
      exp: number;
    };
    if (typeof json.exp !== 'number' || json.exp < Date.now()) return null;
    return json.user;
  } catch {
    return null;
  }
}

export const SESSION_COOKIE_OPTIONS = {
  name: COOKIE_NAME,
  httpOnly: true,
  sameSite: 'lax' as const,
  path: '/',
  maxAge: SESSION_TTL_MS / 1000,
  // secure 由部署环境决定：生产走 HTTPS（经 Cloudflare/Caddy）应为 true。
  secure: process.env.NODE_ENV === 'production',
};
