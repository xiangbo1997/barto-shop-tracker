import { computeFreshness, FRESHNESS_STATUS, type FreshnessStatus } from '@barto/shared';

/** 来源站点 favicon（Google s2 服务）。任意海淘域名通用，替代 PriceAI 的固定平台 icon。 */
export function faviconUrl(sourceSite: string): string {
  return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(sourceSite)}&sz=64`;
}

/** 域名首字母（favicon 加载失败时的兜底标识）。 */
export function siteInitial(sourceSite: string): string {
  const cleaned = sourceSite.replace(/^www\./, '');
  return (cleaned[0] ?? '?').toUpperCase();
}

/** 金额格式化：null/非数返回占位符。 */
export function fmtMoney(price: string | null, currency: string | null): string {
  if (!price) return '—';
  const n = Number(price);
  if (!Number.isFinite(n)) return '—';
  return `${currency ?? ''} ${n.toLocaleString()}`.trim();
}

/**
 * 相对时间。借鉴 PriceAI 的 formatRelativeTime（lib/utils.ts:62-86），
 * 补齐 barto 原 fmtAgo 缺失的 30 天以上降级（显示具体日期）。
 */
export function fmtAgo(iso: string | null): string {
  if (!iso) return '未记录';
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return '未记录';
  const ms = Date.now() - t;
  const min = Math.floor(ms / 60_000);
  if (min < 1) return '刚刚';
  if (min < 60) return `${min} 分钟前`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h} 小时前`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d} 天前`;
  // 超过 30 天：显示绝对日期，避免"99 天前"这种低信息量表达。
  return new Date(iso).toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' });
}

export interface FreshnessView {
  status: FreshnessStatus;
  /** 是否应提示用户数据可能不可信（stale/expired/failed）。 */
  isDegraded: boolean;
  label: string | null;
}

/**
 * 客户端实时重算新鲜度（不依赖后端写入的快照，避免快照漂移）。
 * 返回展示用的降级提示，供列表在"更新时间"旁标注。
 */
export function viewFreshness(p: {
  verifiedAt: string | null;
  expiresAt: string | null;
  fetchError: string | null;
}): FreshnessView {
  const status = computeFreshness(p.verifiedAt, p.expiresAt, Boolean(p.fetchError));
  switch (status) {
    case FRESHNESS_STATUS.FRESH:
      return { status, isDegraded: false, label: null };
    case FRESHNESS_STATUS.AGING:
      return { status, isDegraded: false, label: null };
    case FRESHNESS_STATUS.STALE:
      return { status, isDegraded: true, label: '数据偏旧' };
    case FRESHNESS_STATUS.EXPIRED:
      return { status, isDegraded: true, label: '已过期' };
    case FRESHNESS_STATUS.FAILED:
      return { status, isDegraded: true, label: '抓取失败' };
    default:
      return { status, isDegraded: false, label: null };
  }
}
