/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@barto/shared'],
  experimental: {
    typedRoutes: false,
  },
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: `http://localhost:${process.env.API_PORT ?? 3001}/:path*`,
      },
    ];
  },
};

export default nextConfig;
