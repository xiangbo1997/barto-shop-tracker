# barto web 镜像：Next.js 14 standalone 产物
# 构建上下文为仓库根（monorepo workspace 依赖）：
#   docker build -f apps/web/Dockerfile -t barto-web .

FROM oven/bun:1.3.3-debian AS base
WORKDIR /app

# ── 构建层：拷全部源码后 install，确保各 workspace 子包的 node_modules（含 next bin）齐全 ──
# 注：Bun workspace 不一定把 next hoisting 到根，bin 在 apps/web/node_modules/.bin，
# 故不做 deps 分层裁剪，整体 install 后构建，保证 bin 解析正确。
FROM base AS builder
COPY package.json bun.lock tsconfig.base.json ./
COPY apps/web/package.json apps/web/
COPY apps/api/package.json apps/api/
COPY packages/db/package.json packages/db/
COPY packages/shared/package.json packages/shared/
RUN bun install --frozen-lockfile
COPY packages ./packages
COPY apps/web ./apps/web
ENV NEXT_TELEMETRY_DISABLED=1
RUN bun run --cwd apps/web build

# ── 运行层：仅拷 standalone 产物 ──
FROM oven/bun:1.3.3-debian AS runtime
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1
# Next standalone 把 server.js 放在 apps/web 路径下（monorepo 结构保留）
COPY --from=builder /app/apps/web/.next/standalone ./
COPY --from=builder /app/apps/web/.next/static ./apps/web/.next/static
# 本项目无 public/ 目录，故不拷贝（Next standalone 不强制需要）
WORKDIR /app/apps/web
# standalone server.js 用 node 运行（Next 产物面向 node）；绑 0.0.0.0 由 compose 端口映射限制到 127.0.0.1
ENV PORT=3000 HOSTNAME=0.0.0.0
CMD ["bun", "server.js"]
