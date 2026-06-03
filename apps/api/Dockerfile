# barto api 镜像：Bun 运行时 + Playwright(Chromium)
# 构建上下文为仓库根（monorepo workspace 依赖需要完整上下文）：
#   docker build -f apps/api/Dockerfile -t barto-api .

FROM oven/bun:1.3.3-debian AS base
WORKDIR /app

# ── 运行层（单阶段）──
# 注：Bun workspace 不把依赖 hoisting 到根，hono/drizzle 等装在 apps/api/node_modules，
# 故整体 install 后保留完整 node_modules 结构，不做跨阶段裁剪。
FROM base AS runtime
ENV NODE_ENV=production

# 1) 先装依赖（manifest 变动才失效，利用缓存）
COPY package.json bun.lock tsconfig.base.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY packages/db/package.json packages/db/
COPY packages/shared/package.json packages/shared/
RUN bun install --frozen-lockfile

# 2) 装 Playwright Chromium + 系统依赖（独立缓存层，源码变更不重下）
RUN apt-get update \
  && bunx playwright install-deps chromium \
  && bunx playwright install chromium \
  && rm -rf /var/lib/apt/lists/*

# 3) 拷源码（最常变动，放最后）
COPY packages ./packages
COPY apps/api ./apps/api

WORKDIR /app/apps/api
# 环境变量由 docker-compose 注入，故用不带 --env-file 的启动脚本。
CMD ["bun", "run", "start:docker"]
