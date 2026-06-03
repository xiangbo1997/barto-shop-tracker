'use client';

import { Suspense, useCallback, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient, type Product, type ProductGroup, type ProductSort } from '../../lib/api';
import { fmtAgo, fmtMoney, viewFreshness } from '../../lib/format';
import { SiteIcon } from '@/components/site-icon';

const STOCK_LABELS: Record<string, { label: string; cls: string }> = {
  in_stock: { label: '有货', cls: 'badge-green' },
  out_of_stock: { label: '缺货', cls: 'badge-red' },
  unknown: { label: '未知', cls: 'badge-gray' },
};

const SORT_OPTIONS: Array<{ value: ProductSort; label: string }> = [
  { value: 'available', label: '有货优先·低价' },
  { value: 'price', label: '价格升序' },
  { value: 'updated', label: '最近更新' },
];

function ProductsInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const q = searchParams.get('q') ?? '';
  const sort = (searchParams.get('sort') as ProductSort) ?? 'available';

  const [qInput, setQInput] = useState(q);
  const [refreshingIds, setRefreshingIds] = useState<Set<number>>(new Set());
  const queryClient = useQueryClient();

  const setParam = useCallback(
    (patch: Record<string, string>) => {
      const next = new URLSearchParams(searchParams.toString());
      for (const [k, v] of Object.entries(patch)) {
        if (v) next.set(k, v);
        else next.delete(k);
      }
      router.replace(`/products?${next.toString()}`);
    },
    [router, searchParams]
  );

  const { data: groupsData } = useQuery({
    queryKey: ['groups'],
    queryFn: () => apiClient.listGroups(),
    refetchInterval: 30_000,
  });
  const { data, isLoading } = useQuery({
    queryKey: ['products', q, sort],
    queryFn: () => apiClient.listProducts({ q, sort }),
    refetchInterval: refreshingIds.size > 0 ? 2_000 : 30_000,
  });

  const refreshAll = useMutation({
    mutationFn: async () => apiClient.refreshAll(),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['products'] });
      void queryClient.invalidateQueries({ queryKey: ['groups'] });
    },
  });
  const refreshOne = useMutation({
    mutationFn: async (id: number) => {
      setRefreshingIds((s) => new Set(s).add(id));
      try {
        return await apiClient.refreshOne(id);
      } finally {
        setTimeout(() => {
          setRefreshingIds((s) => {
            const n = new Set(s);
            n.delete(id);
            return n;
          });
          void queryClient.invalidateQueries({ queryKey: ['products'] });
        }, 25_000);
      }
    },
  });

  const products: Product[] = data?.data ?? [];
  const summary = data?.summary;
  const groups: ProductGroup[] = groupsData?.data ?? [];
  const ungrouped = products.filter((p) => p.groupId == null);

  return (
    <div>
      {/* 标题 + 主操作 */}
      <div className="row space" style={{ marginBottom: 6 }}>
        <h1 style={{ margin: 0 }}>全平台比价</h1>
        <div className="row">
          <button onClick={() => refreshAll.mutate()} disabled={refreshAll.isPending}>
            {refreshAll.isPending ? '触发中…' : '全量刷新'}
          </button>
          <a className="button cta" href="/import">+ 导入 URL</a>
        </div>
      </div>
      <p className="muted" style={{ margin: '0 0 20px', fontSize: 13 }}>主价格优先取有货最低价，缺货会明显标注</p>

      {/* Metric 卡片条 */}
      {summary ? (
        <div className="metrics">
          <div className="metric"><span className="label">商品组</span><span className="value">{groups.length}</span></div>
          <div className="metric"><span className="label">总计</span><span className="value">{summary.total}</span></div>
          <div className="metric"><span className="label">有货</span><span className="value green">{summary.inStock}</span></div>
          <div className="metric"><span className="label">缺货</span><span className="value red">{summary.outOfStock}</span></div>
        </div>
      ) : null}

      {/* 工具栏 */}
      <div className="toolbar">
        <input
          className="grow"
          placeholder="🔍  搜索商品或输入 URL…"
          value={qInput}
          onChange={(e) => setQInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && setParam({ q: qInput })}
          onBlur={() => setParam({ q: qInput })}
        />
        <div className="segmented">
          {SORT_OPTIONS.map((o) => (
            <button key={o.value} className={sort === o.value ? 'active' : ''} onClick={() => setParam({ sort: o.value })}>
              {o.label}
            </button>
          ))}
        </div>
      </div>

      {/* 比价主表格（每行一个商品组）*/}
      {groups.length > 0 ? (
        <table style={{ marginBottom: 8 }}>
          <thead>
            <tr>
              <th style={{ width: 56 }}></th>
              <th>商品组</th>
              <th>最低有货价</th>
              <th>状态</th>
              <th>最近更新</th>
              <th style={{ textAlign: 'right' }}>操作</th>
            </tr>
          </thead>
          <tbody>
            {groups.map((g) => (
              <GroupRow key={g.id} group={g} />
            ))}
          </tbody>
        </table>
      ) : null}

      {/* 未归组散件 */}
      <div className="section-divider">
        <span className="label">未归组商品</span>
        <span className="count">{ungrouped.length} 个</span>
      </div>
      {isLoading ? (
        <div className="empty">加载中…</div>
      ) : ungrouped.length === 0 ? (
        <div className="empty">
          <div className="empty-title">{groups.length > 0 ? '全部已归组' : '还没有商品'}</div>
          <div>放宽筛选，或 <a href="/import">导入第一批 URL →</a></div>
        </div>
      ) : (
        <table>
          <tbody>
            {ungrouped.map((p) => (
              <ProductRow key={p.id} p={p} refreshing={refreshingIds.has(p.id)} onRefresh={() => refreshOne.mutate(p.id)} />
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function GroupRow({ group }: { group: ProductGroup }) {
  const hasPrice = group.lowestPrice != null;
  const { inStock, outOfStock, total } = group.stats;
  return (
    <tr>
      <td>
        <span className="site-icon">{group.canonicalTitle.slice(0, 1)}</span>
      </td>
      <td>
        <a href={`/groups/${group.id}`} className="group-title" style={{ color: 'var(--ink)' }}>
          {group.canonicalTitle}
        </a>
      </td>
      <td>
        {hasPrice ? (
          <span className="price available">{fmtMoney(group.lowestPrice, group.lowestPriceCurrency)}</span>
        ) : (
          <span className="price unavailable">¥ --</span>
        )}
      </td>
      <td>
        <span className="status-inline">
          {inStock > 0 ? <span className="status-chip in">有货 {inStock}</span> : null}
          {outOfStock > 0 ? <span className="status-chip out">缺货 {outOfStock}</span> : null}
          <span>· 渠道 {total}</span>
        </span>
      </td>
      <td className="muted" style={{ fontSize: 13 }}>
        <span suppressHydrationWarning>{fmtAgo(group.updatedAt)}</span>
      </td>
      <td style={{ textAlign: 'right' }}>
        <a className="btn-outline" href={`/groups/${group.id}`}>查看对比</a>
      </td>
    </tr>
  );
}

function ProductRow({ p, refreshing, onRefresh }: { p: Product; refreshing: boolean; onRefresh: () => void }) {
  const inStock = p.stockStatus === 'in_stock';
  const fresh = viewFreshness(p);
  const sl = STOCK_LABELS[p.stockStatus] ?? STOCK_LABELS.unknown!;
  return (
    <tr className={p.stockStatus === 'out_of_stock' ? 'out-of-stock' : ''}>
      <td style={{ width: 56 }}>
        <SiteIcon sourceSite={p.sourceSite} />
      </td>
      <td>
        <div className="group-title" style={{ fontWeight: 600 }}>{p.title ?? <span className="muted">(无标题)</span>}</div>
        {p.fetchError ? (
          <div style={{ fontSize: 11, color: 'var(--red)' }}>{p.fetchError}</div>
        ) : (
          <div className="muted" style={{ fontSize: 11 }}>{p.sourceSite}</div>
        )}
      </td>
      <td>
        <span className={`price ${inStock && p.currentPrice ? 'available' : 'unavailable'}`} style={{ fontSize: 15 }}>
          {fmtMoney(p.currentPrice, p.currency)}
        </span>
      </td>
      <td><span className={`badge ${sl.cls}`}>{sl.label}</span></td>
      <td className="muted" style={{ fontSize: 12 }}>
        <span suppressHydrationWarning>{fmtAgo(p.verifiedAt ?? p.lastFetchedAt)}</span>
        {fresh.isDegraded && fresh.label ? <div className="fresh-note">{fresh.label}</div> : null}
      </td>
      <td style={{ textAlign: 'right' }}>
        <div className="row" style={{ gap: 4, justifyContent: 'flex-end' }}>
          <button className="icon" onClick={onRefresh} disabled={refreshing} title="刷新">
            {refreshing ? <span className="spinner" /> : '↻'}
          </button>
          <a className="button icon" href={p.url} target="_blank" rel="noreferrer" title="跳转原站">↗</a>
        </div>
      </td>
    </tr>
  );
}

export default function ProductsPage() {
  return (
    <Suspense fallback={<div className="empty">加载中…</div>}>
      <ProductsInner />
    </Suspense>
  );
}
