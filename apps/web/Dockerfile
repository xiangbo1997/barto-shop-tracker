# barto web 镜像：Next.js 14（常规 next start，非 standalone）
# 构建上下文为仓库根（monorepo workspace 依赖）：
#   docker build -f apps/web/Dockerfile -t barto-web .
#
# 注：放弃 output:'standalone'——Bun workspace 的 symlink node_modules 让
# standalone 依赖 tracing 失效（next 模块物化不全）。改用 next start + 完整
# node_modules（builder 层用 bun install 装齐，依赖完整），可靠优先。

FROM oven/bun:1.3.3-debian AS base
WORKDIR /app

# ── 构建层：整体 install + build，得到完整 .next 与 node_modules ──
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
# Next 在 build 时求值并固化 rewrites 的 destination，故必须 build 前注入容器内 API 地址。
# barto 容器拓扑固定（compose 服务名恒为 api），烤进产物可接受。
ENV API_INTERNAL_URL=http://api:3001
RUN bun run --cwd apps/web build

# ── 运行层：复用 builder 的完整产物，用 next start ──
# 直接基于 builder（含完整 node_modules + .next + 源码），避免跨层拷贝 symlink 断裂。
FROM builder AS runtime
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1
WORKDIR /app/apps/web
# 绑 0.0.0.0 由 compose 端口映射限制到 127.0.0.1
ENV PORT=3000 HOSTNAME=0.0.0.0
CMD ["bun", "run", "start"]
