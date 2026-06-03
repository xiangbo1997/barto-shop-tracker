# barto web 镜像：Next.js 14 standalone 产物
# 构建上下文为仓库根（monorepo workspace 依赖）：
#   docker build -f apps/web/Dockerfile -t barto-web .

FROM oven/bun:1.3.3-debian AS base
WORKDIR /app

# ── 依赖层 ──
FROM base AS deps
COPY package.json bun.lock tsconfig.base.json ./
COPY apps/web/package.json apps/web/
COPY apps/api/package.json apps/api/
COPY packages/db/package.json packages/db/
COPY packages/shared/package.json packages/shared/
RUN bun install --frozen-lockfile

# ── 构建层 ──
FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY package.json bun.lock tsconfig.base.json ./
COPY packages ./packages
COPY apps/web ./apps/web
WORKDIR /app/apps/web
ENV NEXT_TELEMETRY_DISABLED=1
RUN bun run build

# ── 运行层：仅拷 standalone 产物 ──
FROM oven/bun:1.3.3-debian AS runtime
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1
# Next standalone 把 server.js 放在 apps/web 路径下（monorepo 结构保留）
COPY --from=builder /app/apps/web/.next/standalone ./
COPY --from=builder /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=builder /app/apps/web/public ./apps/web/public
WORKDIR /app/apps/web
# standalone server.js 用 node 运行（Next 产物面向 node）；绑 0.0.0.0 由 compose 端口映射限制到 127.0.0.1
ENV PORT=3000 HOSTNAME=0.0.0.0
CMD ["bun", "server.js"]
