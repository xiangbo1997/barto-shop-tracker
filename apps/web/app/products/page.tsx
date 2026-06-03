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

function StockBadge({ status }: { status: string }) {
  const it = STOCK_LABELS[status] ?? STOCK_LABELS.unknown!;
  return <span className={`badge ${it.cls}`}>{it.label}</span>;
}

const SORT_OPTIONS: Array<{ value: ProductSort; label: string }> = [
  { value: 'available', label: '有货优先 · 低价' },
  { value: 'price', label: '价格升序' },
  { value: 'updated', label: '最近更新' },
];

function ProductsInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const q = searchParams.get('q') ?? '';
  const stock = searchParams.get('stock') ?? '';
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
    queryKey: ['products', q, stock, sort],
    queryFn: () => apiClient.listProducts({ q, stock: stock || undefined, sort }),
    refetchInterval: refreshingIds.size > 0 ? 2_000 : 30_000,
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
          void queryClient.invalidateQueries({ queryKey: ['groups'] });
        }, 25_000);
      }
    },
  });

  const refreshAll = useMutation({
    mutationFn: async () => apiClient.refreshAll(),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['products'] });
      void queryClient.invalidateQueries({ queryKey: ['groups'] });
    },
  });

  const products: Product[] = data?.data ?? [];
  const summary = data?.summary;
  const groups: ProductGroup[] = groupsData?.data ?? [];
  // 未归组散件（home 已按 sort 排序返回；过滤掉已归组的）
  const ungrouped = products.filter((p) => p.groupId == null);
  const activeFilterCount = (q ? 1 : 0) + (stock ? 1 : 0);

  return (
    <div>
      <div className="row space" style={{ marginBottom: 8 }}>
        <h1 style={{ margin: 0 }}>全平台比价</h1>
        <div className="row">
          <button onClick={() => refreshAll.mutate()} disabled={refreshAll.isPending}>
            {refreshAll.isPending ? '触发中…' : '全量刷新'}
          </button>
          <a className="button cta" href="/import">+ 导入 URL</a>
        </div>
      </div>
      <p className="muted" style={{ margin: '0 0 16px', fontSize: 13 }}>
        主价格优先取有货最低价，缺货会明显标注
      </p>

      {summary ? (
        <div className="metrics">
          <Metric label="商品组" value={groups.length} />
          <Metric label="总计" value={summary.total} />
          <Metric label="有货" value={summary.inStock} tone="green" />
          <Metric label="缺货" value={summary.outOfStock} tone="red" />
        </div>
      ) : null}

      <div className="toolbar">
        <input
          className="grow"
          placeholder="搜索标题、品牌、备注…"
          value={qInput}
          onChange={(e) => setQInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && setParam({ q: qInput })}
          onBlur={() => setParam({ q: qInput })}
        />
        <div className="segmented">
          {SORT_OPTIONS.map((o) => (
            <button
              key={o.value}
              className={sort === o.value ? 'active' : ''}
              onClick={() => setParam({ sort: o.value })}
            >
              {o.label}
            </button>
          ))}
        </div>
        <select value={stock} onChange={(e) => setParam({ stock: e.target.value })}>
          <option value="">所有库存</option>
          <option value="in_stock">有货</option>
          <option value="out_of_stock">缺货</option>
        </select>
        {activeFilterCount > 0 ? (
          <button onClick={() => { setQInput(''); router.replace('/products'); }}>
            重置 ({activeFilterCount})
          </button>
        ) : null}
      </div>

      {/* 商品组区 */}
      {groups.length > 0 ? (
        <>
          <h2>商品组比价</h2>
          <div className="panel" style={{ marginBottom: 28 }}>
            {groups.map((g) => (
              <GroupCard key={g.id} group={g} />
            ))}
          </div>
        </>
      ) : null}

      {/* 未归组散件 */}
      <h2>{groups.length > 0 ? '未归组商品' : '商品列表'}</h2>
      {isLoading ? (
        <div className="empty">加载中…</div>
      ) : ungrouped.length === 0 ? (
        <div className="empty">
          <div className="empty-title">{groups.length > 0 ? '全部已归组' : '还没有商品'}</div>
          <div>放宽筛选条件，或 <a href="/import">导入第一批 URL →</a></div>
        </div>
      ) : (
        <table>
          <thead>
            <tr>
              <th></th>
              <th>商品</th>
              <th>价格</th>
              <th>库存</th>
              <th>来源</th>
              <th>更新</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {ungrouped.map((p) => (
              <ProductRow
                key={p.id}
                p={p}
                refreshing={refreshingIds.has(p.id)}
                onRefresh={() => refreshOne.mutate(p.id)}
              />
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function Metric({ label, value, tone }: { label: string; value: number; tone?: 'green' | 'red' }) {
  return (
    <div className="metric">
      <span className="label">{label}</span>
      <span className={`value ${tone ?? ''}`}>{value}</span>
    </div>
  );
}

function GroupCard({ group }: { group: ProductGroup }) {
  const hasPrice = group.lowestPrice != null;
  return (
    <a className="group-card" href={`/groups/${group.id}`} style={{ textDecoration: 'none' }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="group-title">{group.canonicalTitle}</div>
        <div className="group-counts">
          有货 {group.stats.inStock} · 缺货 {group.stats.outOfStock} · 渠道 {group.stats.total}
        </div>
      </div>
      <div style={{ textAlign: 'right' }}>
        {hasPrice ? (
          <div className="price available">{fmtMoney(group.lowestPrice, group.lowestPriceCurrency)}</div>
        ) : (
          <div className="price unavailable">暂无可用报价</div>
        )}
        <div style={{ marginTop: 2 }}>
          <span className={`badge ${hasPrice ? 'badge-green' : 'badge-gray'}`}>
            {hasPrice ? '有货' : '缺货'}
          </span>
        </div>
      </div>
      <span className="button" style={{ pointerEvents: 'none' }}>查看对比 →</span>
    </a>
  );
}

function ProductRow({ p, refreshing, onRefresh }: { p: Product; refreshing: boolean; onRefresh: () => void }) {
  const inStock = p.stockStatus === 'in_stock';
  const fresh = viewFreshness(p);
  return (
    <tr className={p.stockStatus === 'out_of_stock' ? 'out-of-stock' : ''}>
      <td>
        <SiteIcon sourceSite={p.sourceSite} />
      </td>
      <td>
        <div>{p.title ?? <span className="muted">(无标题)</span>}</div>
        {p.fetchError ? (
          <div style={{ fontSize: 11, color: 'var(--red)' }}>抓取失败：{p.fetchError}</div>
        ) : p.brand ? (
          <div className="muted" style={{ fontSize: 11 }}>{p.brand}{p.sku ? ` · ${p.sku}` : ''}</div>
        ) : null}
      </td>
      <td>
        <span className={`price ${inStock && p.currentPrice ? 'available' : 'unavailable'}`} style={{ fontSize: 14 }}>
          {fmtMoney(p.currentPrice, p.currency)}
        </span>
      </td>
      <td><StockBadge status={p.stockStatus} /></td>
      <td className="muted" style={{ fontSize: 12 }}>{p.sourceSite}</td>
      <td className="muted" style={{ fontSize: 12 }}>
        <span suppressHydrationWarning>{fmtAgo(p.verifiedAt ?? p.lastFetchedAt)}</span>
        {fresh.isDegraded && fresh.label ? <div className="fresh-note">{fresh.label}</div> : null}
      </td>
      <td>
        <div className="row" style={{ gap: 4 }}>
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
