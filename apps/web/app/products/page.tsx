'use client';

import { Suspense, useCallback, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient, type Product, type ProductSort } from '../../lib/api';
import { fmtAgo, fmtMoney, viewFreshness } from '../../lib/format';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';

const STOCK_LABELS: Record<string, { label: string; variant: 'inStock' | 'outOfStock' | 'unknown' }> = {
  in_stock: { label: '有货', variant: 'inStock' },
  out_of_stock: { label: '缺货', variant: 'outOfStock' },
  unknown: { label: '未知', variant: 'unknown' },
};

function StockBadge({ status }: { status: string }) {
  const it = STOCK_LABELS[status] ?? STOCK_LABELS.unknown!;
  return <Badge variant={it.variant}>{it.label}</Badge>;
}

const SORT_OPTIONS: Array<{ value: ProductSort; label: string }> = [
  { value: 'available', label: '有货优先 · 低价' },
  { value: 'price', label: '价格升序' },
  { value: 'updated', label: '最近更新' },
  { value: 'created', label: '导入时间' },
];

function ProductsInner() {
  const router = useRouter();
  const searchParams = useSearchParams();

  // 筛选状态持久化到 URL（刷新/分享不丢失）。借鉴 PriceAI 的 URL 状态同步。
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

  const activeFilterCount = (q ? 1 : 0) + (stock ? 1 : 0);

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
            const nextSet = new Set(s);
            nextSet.delete(id);
            return nextSet;
          });
          void queryClient.invalidateQueries({ queryKey: ['products'] });
        }, 25_000);
      }
    },
  });

  const refreshAll = useMutation({
    mutationFn: async () => apiClient.refreshAll(),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['products'] }),
  });

  const products: Product[] = data?.data ?? [];
  const summary = data?.summary;

  return (
    <div>
      <div className="row space" style={{ marginBottom: 12 }}>
        <h1 style={{ margin: 0 }}>商品列表</h1>
        <div className="row">
          <Button onClick={() => refreshAll.mutate()} disabled={refreshAll.isPending}>
            {refreshAll.isPending ? '触发中…' : '全量刷新'}
          </Button>
          <Button variant="primary" asChild>
            <a href="/import">+ 导入 URL</a>
          </Button>
        </div>
      </div>

      {/* Metric 摘要条：借鉴 PriceAI 的 4-Metric，给出全局可购买性判断 */}
      {summary ? (
        <div className="row" style={{ gap: 16, marginBottom: 16, flexWrap: 'wrap' }}>
          <Metric label="总计" value={summary.total} />
          <Metric label="有货" value={summary.inStock} tone="in" />
          <Metric label="缺货" value={summary.outOfStock} tone="out" />
          {summary.unknown > 0 ? <Metric label="未知" value={summary.unknown} /> : null}
        </div>
      ) : null}

      <div className="toolbar">
        <input
          className="grow"
          placeholder="搜索标题、品牌、备注…"
          value={qInput}
          onChange={(e) => setQInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') setParam({ q: qInput });
          }}
          onBlur={() => setParam({ q: qInput })}
        />
        <select value={stock} onChange={(e) => setParam({ stock: e.target.value })}>
          <option value="">所有库存</option>
          <option value="in_stock">有货</option>
          <option value="out_of_stock">缺货</option>
          <option value="unknown">未知</option>
        </select>
        <select value={sort} onChange={(e) => setParam({ sort: e.target.value })}>
          {SORT_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        {activeFilterCount > 0 ? (
          <Button
            variant="ghost"
            onClick={() => {
              setQInput('');
              router.replace('/products');
            }}
          >
            重置筛选 ({activeFilterCount})
          </Button>
        ) : null}
      </div>

      {isLoading ? (
        <SkeletonTable />
      ) : products.length === 0 ? (
        <div className="empty">
          没有商品。<a href="/import">立即导入第一批 URL →</a>
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
            {products.map((p) => {
              const inStock = p.stockStatus === 'in_stock';
              const fresh = viewFreshness(p);
              return (
                <tr
                  key={p.id}
                  // 缺货行淡红底：不看徽章也能瞬辨。借鉴 PriceAI ProductOffersPanel。
                  style={p.stockStatus === 'out_of_stock' ? { background: '#fbf7f6' } : undefined}
                >
                  <td>
                    {p.imageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img className="thumb" src={p.imageUrl} alt="" loading="lazy" />
                    ) : (
                      <div className="thumb" />
                    )}
                  </td>
                  <td>
                    <div>{p.title ?? <span className="muted">(无标题)</span>}</div>
                    {p.fetchError ? (
                      <div style={{ fontSize: 11, color: 'var(--red)' }}>抓取失败：{p.fetchError}</div>
                    ) : p.brand ? (
                      <div className="muted" style={{ fontSize: 11 }}>
                        {p.brand}
                        {p.sku ? ` · ${p.sku}` : ''}
                      </div>
                    ) : null}
                  </td>
                  {/* 价格语义着色：缺货/无价显示为弱化色，不伪装成可用低价 */}
                  <td
                    className="mono"
                    style={{ color: inStock && p.currentPrice ? 'var(--fg)' : 'var(--muted)' }}
                  >
                    {fmtMoney(p.currentPrice, p.currency)}
                  </td>
                  <td>
                    <StockBadge status={p.stockStatus} />
                  </td>
                  <td className="muted" style={{ fontSize: 12 }}>
                    {p.sourceSite}
                  </td>
                  <td className="muted" style={{ fontSize: 12 }}>
                    {/* 时间是客户端计算，SSR/CSR 值必然不同，抑制 hydration 警告 */}
                    <span suppressHydrationWarning>{fmtAgo(p.verifiedAt ?? p.lastFetchedAt)}</span>
                    {fresh.isDegraded && fresh.label ? (
                      <div>
                        <Badge variant="warning" style={{ marginTop: 2 }}>
                          {fresh.label}
                        </Badge>
                      </div>
                    ) : null}
                  </td>
                  <td>
                    <div className="row" style={{ gap: 4 }}>
                      <Button
                        size="icon"
                        onClick={() => refreshOne.mutate(p.id)}
                        disabled={refreshingIds.has(p.id)}
                        title="刷新"
                      >
                        {refreshingIds.has(p.id) ? <span className="spinner" /> : '↻'}
                      </Button>
                      <Button size="icon" asChild title="跳转到原站">
                        <a href={p.url} target="_blank" rel="noreferrer">
                          ↗
                        </a>
                      </Button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}

function Metric({ label, value, tone }: { label: string; value: number; tone?: 'in' | 'out' }) {
  const color = tone === 'in' ? 'var(--green)' : tone === 'out' ? 'var(--red)' : 'var(--fg)';
  return (
    <div className="col" style={{ gap: 2 }}>
      <span className="muted" style={{ fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
        {label}
      </span>
      <span style={{ fontSize: 20, fontWeight: 700, color }}>{value}</span>
    </div>
  );
}

function SkeletonTable() {
  return (
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
        {Array.from({ length: 6 }).map((_, i) => (
          <tr key={i}>
            <td>
              <Skeleton className="h-12 w-12" />
            </td>
            <td>
              <Skeleton className="h-4 w-48" />
            </td>
            <td>
              <Skeleton className="h-4 w-16" />
            </td>
            <td>
              <Skeleton className="h-5 w-12 rounded-full" />
            </td>
            <td>
              <Skeleton className="h-4 w-24" />
            </td>
            <td>
              <Skeleton className="h-4 w-16" />
            </td>
            <td>
              <Skeleton className="h-7 w-16" />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export default function ProductsPage() {
  // useSearchParams 需 Suspense 边界（Next 14 要求）
  return (
    <Suspense fallback={<div className="empty">加载中…</div>}>
      <ProductsInner />
    </Suspense>
  );
}
