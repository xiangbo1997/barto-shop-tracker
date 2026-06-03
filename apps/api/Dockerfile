# barto api 镜像：Bun 运行时 + Playwright(Chromium)
# 构建上下文为仓库根（monorepo workspace 依赖需要完整上下文）：
#   docker build -f apps/api/Dockerfile -t barto-api .

FROM oven/bun:1.3.3-debian AS base
WORKDIR /app

# ── 依赖层：先拷 manifest，利用 Docker 缓存 ──
FROM base AS deps
COPY package.json bun.lock tsconfig.base.json ./
COPY apps/api/package.json apps/api/
COPY packages/db/package.json packages/db/
COPY packages/shared/package.json packages/shared/
# web 的 package.json 也需在（workspace 解析完整性），但不装其依赖到 api 运行时
COPY apps/web/package.json apps/web/
RUN bun install --frozen-lockfile

# ── 运行层 ──
FROM base AS runtime
ENV NODE_ENV=production

# Playwright Chromium 系统依赖（libnss3/libatk/libgbm 等）。
# 用 playwright 自带的 install-deps 拉齐，再装 chromium 浏览器二进制。
COPY --from=deps /app/node_modules ./node_modules
COPY package.json bun.lock tsconfig.base.json ./
COPY packages ./packages
COPY apps/api ./apps/api

RUN apt-get update \
  && bunx playwright install-deps chromium \
  && bunx playwright install chromium \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app/apps/api
# 环境变量由 docker-compose 注入，故用不带 --env-file 的启动脚本。
CMD ["bun", "run", "start:docker"]
