/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@barto/shared'],
  // Docker 部署需要 standalone 产物（自带最小 node_modules，镜像更小）。
  output: 'standalone',
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
