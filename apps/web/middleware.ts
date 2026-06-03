import { NextResponse, type NextRequest } from 'next/server';
import { COOKIE_NAME, verifySession } from '@/lib/auth';

// 拦截所有页面与 /api 代理请求，未登录跳 /login。
// 放行：/login 页面、/auth/* 登录登出端点、Next 静态资源。
const PUBLIC_PATHS = ['/login', '/auth/login', '/auth/logout'];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p + '/'))) {
    return NextResponse.next();
  }

  const token = req.cookies.get(COOKIE_NAME)?.value;
  const user = await verifySession(token);
  if (user) return NextResponse.next();

  // 未登录：页面请求重定向到 /login（带 ?from 便于登录后回跳）；
  // /api 请求返回 401（前端 fetch 可据此处理）。
  if (pathname.startsWith('/api/')) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const url = req.nextUrl.clone();
  url.pathname = '/login';
  url.search = pathname !== '/' ? `?from=${encodeURIComponent(pathname)}` : '';
  return NextResponse.redirect(url);
}

export const config = {
  // 排除 Next 内部静态资源与 favicon，其余全拦。
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
