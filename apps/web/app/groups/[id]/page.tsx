'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient, type Product } from '../../../lib/api';
import { fmtAgo, fmtMoney, viewFreshness } from '../../../lib/format';
import { SiteIcon } from '@/components/site-icon';
import { PriceSparkline } from '@/components/sparkline';

const STOCK_LABELS: Record<string, { label: string; cls: string }> = {
  in_stock: { label: '有货', cls: 'badge-green' },
  out_of_stock: { label: '缺货', cls: 'badge-red' },
  unknown: { label: '未知', cls: 'badge-gray' },
};

export default function GroupDetailPage({ params }: { params: { id: string } }) {
  const groupId = Number(params.id);
  const queryClient = useQueryClient();
  const [refreshingIds, setRefreshingIds] = useState<Set<number>>(new Set());

  const { data, isLoading } = useQuery({
    queryKey: ['group', groupId],
    queryFn: () => apiClient.getGroup(groupId),
    refetchInterval: refreshingIds.size > 0 ? 2_000 : 30_000,
  });

  const refreshOne = useMutation({
    mutationFn: async (pid: number) => {
      setRefreshingIds((s) => new Set(s).add(pid));
      try {
        return await apiClient.refreshOne(pid);
      } finally {
        setTimeout(() => {
          setRefreshingIds((s) => {
            const n = new Set(s);
            n.delete(pid);
            return n;
          });
          void queryClient.invalidateQueries({ queryKey: ['group', groupId] });
        }, 25_000);
      }
    },
  });

  const removeMember = useMutation({
    mutationFn: (pid: number) => apiClient.removeGroupMember(groupId, pid),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['group', groupId] }),
  });

  if (isLoading) return <div className="empty">加载中…</div>;
  const group = data?.data;
  if (!group) return <div className="empty"><div className="empty-title">组不存在</div><a href="/products">返回首页 →</a></div>;

  const members: Product[] = group.members ?? [];
  const lowestId = group.lowestPriceProductId;

  return (
    <div>
      <a href="/products" className="muted" style={{ fontSize: 13 }}>← 返回比价列表</a>
      <h1 style={{ marginTop: 12 }}>{group.canonicalTitle}</h1>

      <div className="metrics">
        <div className="metric">
          <span className="label">最低价</span>
          <span className="value green">
            {group.lowestPrice ? fmtMoney(group.lowestPrice, group.lowestPriceCurrency) : '—'}
          </span>
        </div>
        <div className="metric"><span className="label">有货</span><span className="value green">{group.stats.inStock}</span></div>
        <div className="metric"><span className="label">缺货</span><span className="value red">{group.stats.outOfStock}</span></div>
        <div className="metric"><span className="label">渠道</span><span className="value">{group.stats.total}</span></div>
      </div>

      <h2>渠道报价表</h2>
      <p className="muted" style={{ fontSize: 12, margin: '0 0 12px' }}>
        {group.stats.total} 条报价 · 有货优先、价格从低到高
      </p>

      <table>
        <thead>
          <tr>
            <th>状态</th>
            <th>来源</th>
            <th>原始商品名</th>
            <th>价格</th>
            <th>更新</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          {members.map((p) => {
            const inStock = p.stockStatus === 'in_stock';
            const fresh = viewFreshness(p);
            const sl = STOCK_LABELS[p.stockStatus] ?? STOCK_LABELS.unknown!;
            const isLowest = p.id === lowestId;
            return (
              <tr key={p.id} className={p.stockStatus === 'out_of_stock' ? 'out-of-stock' : ''}>
                <td><span className={`badge ${sl.cls}`}>{sl.label}</span></td>
                <td>
                  <div className="row" style={{ gap: 8 }}>
                    <SiteIcon sourceSite={p.sourceSite} />
                    <span className="muted" style={{ fontSize: 12 }}>{p.sourceSite}</span>
                  </div>
                </td>
                <td>
                  <div style={{ maxWidth: 360 }}>{p.title ?? <span className="muted">(无标题)</span>}</div>
                  {p.fetchError ? <div style={{ fontSize: 11, color: 'var(--red)' }}>抓取失败：{p.fetchError}</div> : null}
                </td>
                <td>
                  <span className={`price ${inStock && p.currentPrice ? 'available' : 'unavailable'}`} style={{ fontSize: 14 }}>
                    {fmtMoney(p.currentPrice, p.currency)}
                  </span>
                  {isLowest ? <span className="badge badge-green" style={{ marginLeft: 6 }}>最低</span> : null}
                </td>
                <td className="muted" style={{ fontSize: 12 }}>
                  <span suppressHydrationWarning>{fmtAgo(p.verifiedAt ?? p.lastFetchedAt)}</span>
                  {fresh.isDegraded && fresh.label ? <div className="fresh-note">{fresh.label}</div> : null}
                </td>
                <td>
                  <div className="row" style={{ gap: 4 }}>
                    <button className="icon" onClick={() => refreshOne.mutate(p.id)} disabled={refreshingIds.has(p.id)} title="刷新">
                      {refreshingIds.has(p.id) ? <span className="spinner" /> : '↻'}
                    </button>
                    <a className="button icon" href={p.url} target="_blank" rel="noreferrer" title="前往购买">↗</a>
                    <button className="icon" onClick={() => { if (confirm('从组中移出该商品？')) removeMember.mutate(p.id); }} title="移出组">✕</button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {/* 价格趋势：用当前最低价商品的历史 */}
      {lowestId ? (
        <>
          <h2>最低价渠道趋势</h2>
          <div className="panel" style={{ padding: 20 }}>
            <PriceSparkline productId={lowestId} />
          </div>
        </>
      ) : null}
    </div>
  );
}
