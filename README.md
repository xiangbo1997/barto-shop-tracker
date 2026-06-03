# barto-shop-tracker

海淘商品聚合比价工具（自用、单机、≤100 URL）

## 快速开始

```bash
# 1. 复制环境变量模板，填入实际值
cp .env.example .env
# 编辑 .env，至少填入 LLM_API_KEY

# 2. 启动 PostgreSQL
bun run docker:up

# 3. 安装依赖
bun install

# 4. 初始化数据库
bun run db:push

# 5. 启动开发模式（同时起 web + api）
bun run dev
```

## 目录结构

```
apps/
  web/        Next.js 14 (App Router) + shadcn/ui + TanStack Query
  api/        Bun + Hono + Drizzle + Playwright + pg-boss
packages/
  db/         Drizzle schema + migrations
  shared/     共享类型与常量
docker-compose.yml    PostgreSQL 16
.env.example          环境变量模板（LLM、DB、抓取参数）
```

## 抓取分级

- **Tier 0**：Bun fetch + OG/JSON-LD 静态提取（最快）
- **Tier 1**：Playwright + stealth + XHR sniffer（默认层，处理 SPA + WAF）
- **Tier 2**：LLM 视觉提取（规划中，env 开关 `FEATURE_LLM_ENABLED` 预留）

详见 `/Users/shamoyulvren/.claude/plans/ux-web-abstract-barto.md`。

## 数据新鲜度与定时刷新

- 抓取成功写入 `verifiedAt` / `expiresAt`（按 tier 设 TTL）/ `freshnessStatus`
- 前端用 `computeFreshness()` 实时重算，过期数据标注「数据偏旧 / 已过期」，不伪装成可用价
- `site_adapters` 维护来源健康状态机：连续失败 ≥3 次标记 `failing`，定时刷新自动跳过
- `pg-boss schedule` 按 `SCHEDULE_REFRESH_CRON` 定时刷新最陈旧的一批（手动触发：`POST /refresh/scheduled`）
- 每次抓取写入 `crawl_runs` 审计日志

## 安全约定

- **`.env` 永不提交**（已在 `.gitignore` 第一行）
- API Key 仅环境变量传入，启动时 fail-fast 校验
- **SSRF 防御**：`/ingest` 校验 URL 协议（仅 http/https）并解析 DNS，拒绝私有/保留 IP（防云元数据端点注入）
- 所有 LLM 调用记录 token usage，UI 显示当月累计
