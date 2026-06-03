import type { ReactNode } from 'react';
import { Providers } from './providers';
import { LogoutButton } from './logout-button';
import './globals.css';

export const metadata = {
  title: 'barto-shop-tracker',
  description: '海淘商品聚合比价工具',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="zh-CN">
      <body>
        <Providers>
          <nav className="topbar">
            <a href="/" className="brand">barto</a>
            <a href="/products">比价</a>
            <a href="/import">导入</a>
            <a href="/jobs">任务</a>
            <a href="/health">健康</a>
            <a href="/sessions">会话</a>
            <LogoutButton />
          </nav>
          <main className="container">{children}</main>
        </Providers>
      </body>
    </html>
  );
}
