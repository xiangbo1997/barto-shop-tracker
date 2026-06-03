/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@barto/shared'],
  // 注：曾尝试 output:'standalone'，但 Bun workspace 的 symlink node_modules
  // 导致 standalone 依赖 tracing 失效（next 模块物化不全）。改用常规 next start
  // + 完整 node_modules，可靠优先。
  experimental: {
    typedRoutes: false,
  },
  async rewrites() {
    // 本地开发指向 localhost；容器内通过 API_INTERNAL_URL 指向 compose 服务名（http://api:3001）。
    const apiBase =
      process.env.API_INTERNAL_URL ?? `http://localhost:${process.env.API_PORT ?? 3001}`;
    return [
      {
        source: '/api/:path*',
        destination: `${apiBase}/:path*`,
      },
    ];
  },
};

export default nextConfig;
