import { NextResponse } from 'next/server';
import { issueSession, SESSION_COOKIE_OPTIONS, verifyCredentials } from '@/lib/auth';

// 登录端点。注意：放在 /auth 而非 /api（后者被 rewrite 转发给 hono 后端）。
export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as
    | { username?: unknown; password?: unknown }
    | null;
  const username = typeof body?.username === 'string' ? body.username : '';
  const password = typeof body?.password === 'string' ? body.password : '';
  if (!username || !password || username.length > 128 || password.length > 256) {
    return NextResponse.json({ ok: false, error: '参数错误' }, { status: 400 });
  }
  if (!verifyCredentials(username, password)) {
    return NextResponse.json({ ok: false, error: '用户名或密码错误' }, { status: 401 });
  }

  const token = await issueSession(username);
  const res = NextResponse.json({ ok: true });
  res.cookies.set({ ...SESSION_COOKIE_OPTIONS, value: token });
  return res;
}
